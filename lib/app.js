// Roy Envanter — iş mantığı ve API yönlendirici.
// Hem yerel sunucu (server.js) hem Vercel fonksiyonu (api/index.js) bu dosyayı kullanır.
import crypto from 'node:crypto';
import { COLUMNS } from './schema.js';

const KINDS = { drone: 'DR', parca: 'PR', aksesuar: 'AK', sarf: 'SR' };
const MOVE_KINDS = ['olusturma', 'giris', 'satis', 'cikis', 'duzeltme', 'tamir', 'iade'];
const UNDOABLE = ['giris', 'satis', 'cikis', 'duzeltme', 'iade'];
const SETTING_KEYS = ['shop_name', 'shop_phone', 'shop_address', 'receipt_note'];
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;

const ITEM_FIELDS = {
  name: 's', kind: 's', category: 's', brand: 's', model: 's', compatible: 's',
  serial: 's', condition: 's', status: 's', quantity: 'n', unit: 's',
  min_quantity: 'n', location: 's', purchase_price: 'n', sale_price: 'n',
  source: 's', parent_id: 'id', notes: 's',
};
const REPAIR_FIELDS = {
  customer: 's', phone: 's', device: 's', serial: 's', problem: 's', diagnosis: 's',
  status: 's', fee: 'n', deposit: 'n', paid: 'b', notes: 's', received_at: 's', delivered_at: 's',
};
const LIST_COLUMNS = `id, sku, name, kind, category, brand, model, compatible, serial, condition, status, quantity, unit,
  min_quantity, location, purchase_price, sale_price, source, parent_id, photo, updated_at`;

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

// ---------------------------------------------------------------- zaman (varsayılan İstanbul)
const TZ = process.env.APP_TZ || 'Europe/Istanbul';
export const now = () => new Date().toISOString();
export const localDate = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
// "2026-09-30-14-05-09" — elle alınan yedeklerin adı için
const localStamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' })
  .format(new Date()).replace(/[ :]/g, '-');
function tzOffset(d) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(part);
  return m ? `${m[1]}:${m[2] || '00'}` : '+00:00';
}
// Yerel "YYYY-MM-DD" gününün başlangıcı, UTC ISO olarak (created_at ile karşılaştırmak için)
const dayStartIso = (ymd) => new Date(`${ymd}T00:00:00${tzOffset(new Date(`${ymd}T12:00:00Z`))}`).toISOString();
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function clean(body, fields) {
  const out = {};
  for (const [k, t] of Object.entries(fields)) {
    if (!(k in body)) continue;
    const v = body[k];
    if (t === 's') out[k] = String(v ?? '').trim().slice(0, 4000);
    else if (t === 'n') out[k] = Number.isFinite(Number(v)) ? Number(v) : 0;
    else if (t === 'id') out[k] = v ? (Number(v) || null) : null;
    else if (t === 'b') out[k] = v ? 1 : 0;
  }
  return out;
}

const insertSql = (table, d) => {
  const keys = Object.keys(d);
  return [`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map((k) => d[k])];
};
const updateSql = (table, d, id) => {
  const keys = Object.keys(d);
  return [`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => d[k]), id]];
};

// ================================================================ uygulama
export function createApp({ db, storage, mode, hooks = {} }) {
  const onVercel = mode === 'vercel';
  const PIN = (process.env.ROY_PIN || '').trim();
  const TOKEN = PIN
    ? crypto.createHmac('sha256', process.env.SESSION_SECRET || PIN).update('roy-envanter:' + PIN).digest('hex')
    : '';

  // ---------------------------------------------------------- ürünler
  const itemRow = (q, id) => q.get('SELECT * FROM items WHERE id = ?', [id]);

  async function getItem(id, q = db) {
    const item = await itemRow(q, id);
    if (!item) throw new HttpError(404, 'Ürün bulunamadı');
    // Bağımsız sorgular paralel (işlem içindeyken tek bağlantı olduğu için sırayla)
    const run = q === db ? (fns) => Promise.all(fns.map((f) => f())) : async (fns) => { const o = []; for (const f of fns) o.push(await f()); return o; };
    [item.movements, item.children, item.parent] = await run([
      () => q.all('SELECT * FROM movements WHERE item_id = ? ORDER BY id DESC LIMIT 200', [id]),
      () => q.all(`SELECT id, sku, name, category, quantity, unit, status, photo, location, kind
        FROM items WHERE parent_id = ? ORDER BY name`, [id]),
      async () => (item.parent_id ? q.get('SELECT id, sku, name FROM items WHERE id = ?', [item.parent_id]) : null),
    ]);
    return item;
  }

  async function addMovement(q, item, m) {
    return q.insert(`INSERT INTO movements (item_id, item_name, item_sku, kind, qty, unit_price, unit_cost, note, repair_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      item.id, item.name, item.sku ?? '', m.kind, m.qty, m.unit_price ?? 0, m.unit_cost ?? item.purchase_price ?? 0,
      m.note ?? '', m.repair_id ?? null, now()]);
  }

  async function checkParent(q, id, parentId) {
    if (!parentId) return;
    if (parentId === id) throw new HttpError(400, 'Ürün kendi kendisinin parçası olamaz');
    if (!(await itemRow(q, parentId))) throw new HttpError(400, 'Bağlı olduğu drone bulunamadı');
  }

  async function createItemTx(q, body) {
    const d = clean(body, ITEM_FIELDS);
    if (!d.name) throw new HttpError(400, 'Ürün adı gerekli');
    if (!KINDS[d.kind]) d.kind = 'parca';
    if (d.quantity == null) d.quantity = 1;
    await checkParent(q, null, d.parent_id);
    d.created_at = d.updated_at = now();
    const id = await q.insert(...insertSql('items', d));
    const sku = `${KINDS[d.kind]}-${String(id).padStart(4, '0')}`;
    await q.run('UPDATE items SET sku = ? WHERE id = ?', [sku, id]);
    const item = { ...d, id, sku };
    if (item.quantity) await addMovement(q, item, { kind: 'olusturma', qty: item.quantity, unit_price: item.purchase_price || 0 });
    return id;
  }

  async function updateItem(id, body) {
    return db.tx(async (q) => {
      const old = await itemRow(q, id);
      if (!old) throw new HttpError(404, 'Ürün bulunamadı');
      const d = clean(body, ITEM_FIELDS);
      if ('name' in d && !d.name) throw new HttpError(400, 'Ürün adı gerekli');
      if ('kind' in d && !KINDS[d.kind]) delete d.kind;
      if ('parent_id' in d) await checkParent(q, id, d.parent_id);
      d.updated_at = now();
      await q.run(...updateSql('items', d, id));
      if ('quantity' in d && d.quantity !== old.quantity) {
        await addMovement(q, { ...old, ...d }, { kind: 'duzeltme', qty: d.quantity - old.quantity, note: 'Düzenleme ekranından' });
      }
      return getItem(id, q);
    });
  }

  async function deleteItem(id) {
    const item = await itemRow(db, id);
    if (!item) throw new HttpError(404, 'Ürün bulunamadı');
    await db.run('DELETE FROM items WHERE id = ?', [id]);
    await storage.removePhoto(item.photo).catch(() => {});
    return { ok: true };
  }

  // Stok hareketi: giriş / satış / çıkış / sayım (duzeltme = yeni miktar) / iade
  async function moveItem(id, body) {
    const kind = String(body.kind || '');
    if (!UNDOABLE.includes(kind)) throw new HttpError(400, 'Geçersiz hareket türü');
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty < 0 || (kind !== 'duzeltme' && qty === 0)) throw new HttpError(400, 'Geçerli bir miktar girin');
    const price = Number(body.unit_price) || 0;
    const note = String(body.note ?? '').trim().slice(0, 1000);

    return db.tx(async (q) => {
      const item = await itemRow(q, id);
      if (!item) throw new HttpError(404, 'Ürün bulunamadı');
      let delta;
      if (kind === 'giris' || kind === 'iade') delta = qty;
      else if (kind === 'duzeltme') delta = qty - item.quantity;
      else {
        if (qty > item.quantity) throw new HttpError(400, `Stokta yalnızca ${item.quantity} ${item.unit} var`);
        delta = -qty;
      }
      if (delta === 0) return getItem(id, q);

      const newQty = item.quantity + delta;
      let status = item.status;
      if (kind === 'satis' && newQty <= 0 && ['stokta', 'satista', 'rezerve'].includes(status)) status = 'satildi';
      if ((kind === 'giris' || kind === 'iade') && status === 'satildi') status = 'stokta';
      let purchase = item.purchase_price;
      if (kind === 'giris' && price > 0) { // ağırlıklı ortalama maliyet
        const base = Math.max(item.quantity, 0);
        purchase = Math.round(((base * item.purchase_price + qty * price) / (base + qty)) * 100) / 100;
      }
      await q.run('UPDATE items SET quantity = ?, status = ?, purchase_price = ?, updated_at = ? WHERE id = ?',
        [newQty, status, purchase, now(), id]);
      await addMovement(q, item, {
        kind, qty: delta, note,
        unit_price: kind === 'giris' ? (price || item.purchase_price) : price,
        unit_cost: kind === 'giris' ? (price || item.purchase_price) : item.purchase_price,
      });
      return getItem(id, q);
    });
  }

  // Yanlış girilen hareketi geri al: miktar eski haline döner, kayıt silinir
  async function undoMovement(id) {
    return db.tx(async (q) => {
      const m = await q.get('SELECT * FROM movements WHERE id = ?', [id]);
      if (!m) throw new HttpError(404, 'Hareket bulunamadı');
      if (!UNDOABLE.includes(m.kind)) {
        throw new HttpError(400, m.kind === 'tamir' ? 'Bu hareket tamir kaydından geri alınır (parçayı kaldırın)' : 'Bu hareket geri alınamaz');
      }
      const item = m.item_id ? await itemRow(q, m.item_id) : null;
      if (item) {
        const newQty = item.quantity - m.qty;
        if (newQty < 0) throw new HttpError(400, 'Geri alınırsa stok eksiye düşer');
        const status = m.kind === 'satis' && item.status === 'satildi' && newQty > 0 ? 'stokta' : item.status;
        await q.run('UPDATE items SET quantity = ?, status = ?, updated_at = ? WHERE id = ?', [newQty, status, now(), item.id]);
      }
      await q.run('DELETE FROM movements WHERE id = ?', [id]);
      return { ok: true, item_id: m.item_id };
    });
  }

  async function bulkCreate(body) {
    const list = Array.isArray(body.items) ? body.items : [];
    if (!list.length) throw new HttpError(400, 'İçe aktarılacak ürün yok');
    if (list.length > 5000) throw new HttpError(400, 'Tek seferde en fazla 5000 ürün');
    const count = await db.tx(async (q) => {
      let n = 0;
      for (const [i, raw] of list.entries()) {
        try { await createItemTx(q, { ...raw, parent_id: null }); n++; }
        catch (e) { throw new HttpError(400, `${i + 2}. satır: ${e.message}`); }
      }
      return n;
    });
    return { ok: true, count };
  }

  async function savePhoto(id, body) {
    const item = await itemRow(db, id);
    if (!item) throw new HttpError(404, 'Ürün bulunamadı');
    if (body.remove) {
      await db.run("UPDATE items SET photo = '', updated_at = ? WHERE id = ?", [now(), id]);
      await storage.removePhoto(item.photo).catch(() => {});
      return getItem(id);
    }
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(body.dataUrl || ''));
    if (!m) throw new HttpError(400, 'Geçersiz fotoğraf');
    const name = `${id}-${crypto.randomBytes(6).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    await storage.savePhoto(name, Buffer.from(m[2], 'base64'));
    await db.run('UPDATE items SET photo = ?, updated_at = ? WHERE id = ?', [name, now(), id]);
    await storage.removePhoto(item.photo).catch(() => {});
    return getItem(id);
  }

  // ---------------------------------------------------------- tamirler
  async function getRepair(id, q = db) {
    const r = await q.get('SELECT * FROM repairs WHERE id = ?', [id]);
    if (!r) throw new HttpError(404, 'Tamir kaydı bulunamadı');
    r.parts = await q.all(`SELECT rp.*, i.sku, i.quantity AS stock, i.unit FROM repair_parts rp
      LEFT JOIN items i ON i.id = rp.item_id WHERE rp.repair_id = ? ORDER BY rp.id`, [id]);
    return r;
  }

  const listRepairs = () => db.all(`SELECT r.*,
      COALESCE((SELECT SUM(qty * unit_price) FROM repair_parts WHERE repair_id = r.id), 0) AS parts_total,
      COALESCE((SELECT SUM(qty * unit_cost) FROM repair_parts WHERE repair_id = r.id), 0) AS parts_cost
    FROM repairs r ORDER BY r.id DESC`);

  async function createRepair(body) {
    const d = clean(body, REPAIR_FIELDS);
    if (!d.customer && !d.device) throw new HttpError(400, 'Müşteri veya cihaz bilgisi gerekli');
    d.received_at ||= localDate();
    if (d.status === 'teslim' && !d.delivered_at) d.delivered_at = localDate();
    d.created_at = d.updated_at = now();
    const id = await db.insert(...insertSql('repairs', d));
    await db.run('UPDATE repairs SET code = ? WHERE id = ?', [`TM-${String(id).padStart(4, '0')}`, id]);
    return getRepair(id);
  }

  async function updateRepair(id, body) {
    const old = await db.get('SELECT * FROM repairs WHERE id = ?', [id]);
    if (!old) throw new HttpError(404, 'Tamir kaydı bulunamadı');
    const d = clean(body, REPAIR_FIELDS);
    if (d.status === 'teslim' && !old.delivered_at && !d.delivered_at) d.delivered_at = localDate();
    d.updated_at = now();
    await db.run(...updateSql('repairs', d, id));
    return getRepair(id);
  }

  async function removeRepairPartTx(q, repairId, partId) {
    const p = await q.get('SELECT * FROM repair_parts WHERE id = ? AND repair_id = ?', [partId, repairId]);
    if (!p) throw new HttpError(404, 'Parça kaydı bulunamadı');
    if (p.item_id) await q.run('UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?', [p.qty, now(), p.item_id]);
    if (p.movement_id) await q.run('DELETE FROM movements WHERE id = ?', [p.movement_id]);
    await q.run('DELETE FROM repair_parts WHERE id = ?', [partId]);
  }

  async function deleteRepair(id) {
    await db.tx(async (q) => { // kullanılan parçalar stoğa geri döner
      for (const p of await q.all('SELECT id FROM repair_parts WHERE repair_id = ?', [id])) await removeRepairPartTx(q, id, p.id);
      await q.run('DELETE FROM repairs WHERE id = ?', [id]);
    });
    return { ok: true };
  }

  async function addRepairPart(repairId, body) {
    const qty = Number(body.qty) || 1;
    if (qty <= 0) throw new HttpError(400, 'Geçerli bir miktar girin');
    return db.tx(async (q) => {
      const repair = await q.get('SELECT id, code FROM repairs WHERE id = ?', [repairId]);
      if (!repair) throw new HttpError(404, 'Tamir kaydı bulunamadı');
      const item = await itemRow(q, Number(body.item_id));
      if (!item) throw new HttpError(404, 'Ürün bulunamadı');
      if (qty > item.quantity) throw new HttpError(400, `Stokta yalnızca ${item.quantity} ${item.unit} var`);
      const unitPrice = body.unit_price === '' || body.unit_price == null ? item.sale_price : Number(body.unit_price) || 0;
      await q.run('UPDATE items SET quantity = quantity - ?, updated_at = ? WHERE id = ?', [qty, now(), item.id]);
      const mid = await addMovement(q, item, { kind: 'tamir', qty: -qty, unit_price: unitPrice, note: repair.code, repair_id: repairId });
      await q.run(`INSERT INTO repair_parts (repair_id, item_id, item_name, qty, unit_cost, unit_price, movement_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [repairId, item.id, item.name, qty, item.purchase_price, unitPrice, mid]);
      return getRepair(repairId, q);
    });
  }

  // ---------------------------------------------------------- panel & raporlar
  async function dashboard() {
    const month = localDate().slice(0, 7);
    const from = dayStartIso(`${month}-01`), to = dayStartIso(`${addMonths(month, 1)}-01`);
    const [stock, sales, repairs, activeRepairs, low, recent] = await Promise.all([
      db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS items,
          COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity END), 0) AS units,
          COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity * purchase_price END), 0) AS cost_value,
          COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity * sale_price END), 0) AS sale_value,
          COALESCE(SUM(CASE WHEN kind = 'drone' AND quantity > 0 AND status <> 'satildi' THEN quantity END), 0) AS drones,
          CAST(COALESCE(SUM(CASE WHEN min_quantity > 0 AND quantity <= min_quantity THEN 1 ELSE 0 END), 0) AS INTEGER) AS low
        FROM items`),
      db.get(`SELECT COALESCE(SUM(-qty * unit_price), 0) AS revenue,
          COALESCE(SUM(-qty * (unit_price - unit_cost)), 0) AS profit, CAST(COUNT(*) AS INTEGER) AS count
        FROM movements WHERE kind = 'satis' AND created_at >= ? AND created_at < ?`, [from, to]),
      db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS count,
          COALESCE(SUM(r.fee + COALESCE((SELECT SUM(qty * unit_price) FROM repair_parts WHERE repair_id = r.id), 0)), 0) AS revenue,
          COALESCE(SUM(r.fee + COALESCE((SELECT SUM(qty * (unit_price - unit_cost)) FROM repair_parts WHERE repair_id = r.id), 0)), 0) AS profit
        FROM repairs r WHERE r.status = 'teslim' AND substr(r.delivered_at, 1, 7) = ?`, [month]),
      db.all(`SELECT id, code, customer, device, status, received_at FROM repairs
        WHERE status NOT IN ('teslim', 'iptal') ORDER BY id DESC LIMIT 8`),
      db.all(`SELECT id, sku, name, quantity, min_quantity, unit, location FROM items
        WHERE min_quantity > 0 AND quantity <= min_quantity ORDER BY quantity - min_quantity LIMIT 12`),
      db.all('SELECT * FROM movements ORDER BY id DESC LIMIT 10'),
    ]);
    return { month, stock, sales, repairs, activeRepairs, low, recent, trend: await monthlyTrend(6) };
  }

  // Son N ayın satış ve tamir kârı/cirosu
  async function monthlyTrend(n) {
    const cur = localDate().slice(0, 7);
    const months = Array.from({ length: n }, (_, i) => addMonths(cur, i - n + 1));
    const from = dayStartIso(`${months[0]}-01`);
    const [sales, repairs] = await Promise.all([
      db.all(`SELECT created_at, qty, unit_price, unit_cost FROM movements WHERE kind = 'satis' AND created_at >= ?`, [from]),
      db.all(`SELECT r.delivered_at, r.fee,
          COALESCE((SELECT SUM(qty * unit_price) FROM repair_parts WHERE repair_id = r.id), 0) AS parts_total,
          COALESCE((SELECT SUM(qty * unit_cost) FROM repair_parts WHERE repair_id = r.id), 0) AS parts_cost
        FROM repairs r WHERE r.status = 'teslim' AND r.delivered_at >= ?`, [`${months[0]}-01`]),
    ]);
    const map = Object.fromEntries(months.map((m) => [m, { month: m, sales_revenue: 0, sales_profit: 0, repair_revenue: 0, repair_profit: 0 }]));
    for (const s of sales) {
      const b = map[localDate(new Date(s.created_at)).slice(0, 7)];
      if (b) { b.sales_revenue += -s.qty * s.unit_price; b.sales_profit += -s.qty * (s.unit_price - s.unit_cost); }
    }
    for (const r of repairs) {
      const b = map[String(r.delivered_at).slice(0, 7)];
      if (b) { b.repair_revenue += r.fee + r.parts_total; b.repair_profit += r.fee + r.parts_total - r.parts_cost; }
    }
    return months.map((m) => map[m]);
  }

  async function getSettings() {
    const rows = await db.all('SELECT key, value FROM settings');
    const all = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(SETTING_KEYS.map((k) => [k, all[k] ?? '']));
  }

  async function saveSettings(body) {
    for (const k of SETTING_KEYS) {
      if (!(k in body)) continue;
      await db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [k, String(body[k] ?? '').trim().slice(0, 2000)]);
    }
    return getSettings();
  }

  // ---------------------------------------------------------- dışa/içe aktarma
  async function exportJson() {
    const [items, movements, repairs, repair_parts, settings] = await Promise.all([
      db.all('SELECT * FROM items ORDER BY id'), db.all('SELECT * FROM movements ORDER BY id'),
      db.all('SELECT * FROM repairs ORDER BY id'), db.all('SELECT * FROM repair_parts ORDER BY id'),
      db.all(`SELECT * FROM settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(', ')})`, SETTING_KEYS),
    ]);
    return { app: 'roy-envanter', version: 2, exported_at: now(), items, movements, repairs, repair_parts, settings };
  }

  async function importJson(body) {
    if (body?.app !== 'roy-envanter' || !Array.isArray(body.items)) throw new HttpError(400, 'Bu dosya Roy Envanter yedeği değil');
    await backup('ice-aktarma-oncesi').catch(() => {});
    await db.tx(async (q) => {
      for (const t of ['repair_parts', 'repairs', 'movements', 'items']) await q.run(`DELETE FROM ${t}`);
      const insertAll = async (table, rows, patch = (r) => r) => {
        for (const row of rows || []) {
          const r = patch(row);
          const d = Object.fromEntries(COLUMNS[table].filter((c) => c in r).map((c) => [c, r[c] ?? null]));
          await q.run(...insertSql(table, d));
        }
      };
      // Önce üst drone bağlantısı olmadan ekle, sonra bağla (yabancı anahtar sırası için)
      await insertAll('items', body.items, (r) => ({ ...r, parent_id: null }));
      for (const r of body.items) if (r.parent_id) await q.run('UPDATE items SET parent_id = ? WHERE id = ?', [r.parent_id, r.id]);
      await insertAll('movements', body.movements);
      await insertAll('repairs', body.repairs);
      await insertAll('repair_parts', body.repair_parts);
      for (const s of body.settings || []) {
        if (SETTING_KEYS.includes(s.key)) {
          await q.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [s.key, s.value ?? '']);
        }
      }
      if (db.dialect === 'pg') { // kimlik sayaçlarını en büyük id'nin ardına al
        for (const t of ['items', 'movements', 'repairs', 'repair_parts']) {
          await q.run(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT COALESCE(MAX(id), 0) + 1 FROM ${t}), false)`);
        }
      }
    });
    return { ok: true, items: body.items.length };
  }

  async function exportCsv() {
    const rows = await db.all('SELECT * FROM items ORDER BY sku');
    const cols = [['sku', 'Kod'], ['name', 'Ad'], ['kind', 'Tür'], ['category', 'Kategori'], ['brand', 'Marka'],
      ['model', 'Model'], ['compatible', 'Uyumlu'], ['serial', 'Seri No'], ['condition', 'Durum'], ['status', 'Statü'],
      ['quantity', 'Miktar'], ['unit', 'Birim'], ['min_quantity', 'Min. Stok'], ['location', 'Konum'],
      ['purchase_price', 'Alış'], ['sale_price', 'Satış'], ['source', 'Kaynak'], ['notes', 'Not']];
    const esc = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const num = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
    return '﻿' + [cols.map((c) => c[1]).join(';'), ...rows.map((r) => cols.map(([k]) => esc(num(r[k]))).join(';'))].join('\r\n');
  }

  async function backup(tag) {
    if (hooks.backup) return hooks.backup(tag);
    const name = `roy-envanter-${tag || localDate()}.json`;
    await storage.saveBackup(name, JSON.stringify(await exportJson()));
    return { ok: true, name };
  }

  // ---------------------------------------------------------- oturum
  function authed(req) {
    if (!PIN) return true;
    const c = /(?:^|;\s*)roy=([a-f0-9]+)/.exec(req.headers.cookie || '');
    return !!c && c[1].length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(c[1]), Buffer.from(TOKEN));
  }
  const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '?';
  const cookie = (req, value, maxAge) => {
    const secure = req.headers['x-forwarded-proto'] === 'https' || onVercel ? '; Secure' : '';
    return `roy=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  };

  async function login(req, body) {
    if (!PIN) return { status: 200, body: { ok: true } };
    const ip = clientIp(req);
    const f = await db.get('SELECT count, until FROM auth_fails WHERE ip = ?', [ip]);
    if (f?.until && f.until > now()) throw new HttpError(429, `Çok fazla hatalı deneme. ${LOCK_MINUTES} dakika sonra tekrar deneyin.`);
    const a = crypto.createHash('sha256').update(String(body.pin ?? '')).digest();
    const b = crypto.createHash('sha256').update(PIN).digest();
    if (crypto.timingSafeEqual(a, b)) {
      await db.run('DELETE FROM auth_fails WHERE ip = ?', [ip]);
      return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': cookie(req, TOKEN, 31536000) } };
    }
    const count = (f && !f.until ? f.count : 0) + 1;
    const until = count >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : '';
    await db.run(`INSERT INTO auth_fails (ip, count, until) VALUES (?, ?, ?)
      ON CONFLICT (ip) DO UPDATE SET count = excluded.count, until = excluded.until`, [ip, until ? 0 : count, until]);
    throw new HttpError(401, until ? `PIN hatalı. ${LOCK_MINUTES} dakika bekleyin.` : `PIN hatalı (${MAX_FAILS - count} deneme hakkı kaldı)`);
  }

  // ---------------------------------------------------------- yönlendirme
  const routes = [];
  const route = (method, pattern, handler) =>
    routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$'), handler });

  route('GET', '/api/info', () => ({
    mode, pin: !!PIN, storage: storage.kind, db: db.dialect, lan: hooks.lanUrls?.() ?? [], data: hooks.dataDir ?? null,
  }));
  route('GET', '/api/items', () => db.all(`SELECT ${LIST_COLUMNS} FROM items ORDER BY updated_at DESC`));
  route('POST', '/api/items', async (_, body) => getItem(await db.tx((q) => createItemTx(q, body))));
  route('POST', '/api/items/bulk', (_, body) => bulkCreate(body));
  route('GET', '/api/items/:id', (p) => getItem(+p.id));
  route('PUT', '/api/items/:id', (p, body) => updateItem(+p.id, body));
  route('DELETE', '/api/items/:id', (p) => deleteItem(+p.id));
  route('POST', '/api/items/:id/move', (p, body) => moveItem(+p.id, body));
  route('POST', '/api/items/:id/photo', (p, body) => savePhoto(+p.id, body));
  route('GET', '/api/movements', (_, __, q) => {
    const limit = Math.min(Number(q.get('limit')) || 300, 2000);
    const kind = q.get('kind');
    return kind && MOVE_KINDS.includes(kind)
      ? db.all('SELECT * FROM movements WHERE kind = ? ORDER BY id DESC LIMIT ?', [kind, limit])
      : db.all('SELECT * FROM movements ORDER BY id DESC LIMIT ?', [limit]);
  });
  route('DELETE', '/api/movements/:id', (p) => undoMovement(+p.id));
  route('GET', '/api/dashboard', () => dashboard());
  route('GET', '/api/stats/monthly', (_, __, q) => monthlyTrend(Math.min(Math.max(Number(q.get('months')) || 12, 1), 36)));
  route('GET', '/api/repairs', () => listRepairs());
  route('POST', '/api/repairs', (_, body) => createRepair(body));
  route('GET', '/api/repairs/:id', (p) => getRepair(+p.id));
  route('PUT', '/api/repairs/:id', (p, body) => updateRepair(+p.id, body));
  route('DELETE', '/api/repairs/:id', (p) => deleteRepair(+p.id));
  route('POST', '/api/repairs/:id/parts', (p, body) => addRepairPart(+p.id, body));
  route('DELETE', '/api/repairs/:id/parts/:pid', async (p) => {
    await db.tx((q) => removeRepairPartTx(q, +p.id, +p.pid));
    return getRepair(+p.id);
  });
  route('GET', '/api/settings', () => getSettings());
  route('PUT', '/api/settings', (_, body) => saveSettings(body));
  route('POST', '/api/import', (_, body) => importJson(body));
  route('POST', '/api/backup', () => backup(localStamp()));
  route('GET', '/api/backups', () => storage.listBackups());

  // ---------------------------------------------------------- HTTP
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (!p.startsWith('/api/') && !p.startsWith('/uploads/')) return false;
    if (db.stats) { // yanıta veritabanı süresini ekle (tarayıcı geliştirici araçlarında görünür)
      const s0 = { ...db.stats }, t0 = performance.now(), writeHead = res.writeHead.bind(res);
      res.writeHead = (status, headers = {}) => writeHead(status, {
        ...headers,
        'Server-Timing': `db;dur=${(db.stats.ms - s0.ms).toFixed(0)};desc="${db.stats.n - s0.n} sorgu", `
          + `connect;dur=${(db.stats.connect - s0.connect).toFixed(0)}, total;dur=${(performance.now() - t0).toFixed(0)}`,
      });
    }
    try {
      // Vercel cron: günlük bulut yedeği
      if (p === '/api/cron/backup') {
        const secret = process.env.CRON_SECRET;
        if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'Yetkisiz');
        return send(res, 200, await backup());
      }
      if (onVercel && PIN.length < 6) {
        throw new HttpError(503, PIN
          ? 'ROY_PIN en az 6 karakter olmalı (site internete açık). Vercel proje ayarlarından uzatın.'
          : 'Kurulum tamamlanmadı: Vercel proje ayarlarında ROY_PIN ortam değişkenini (en az 6 karakter) tanımlayın.', { setup: true });
      }
      if (p === '/api/login' && req.method === 'POST') {
        const r = await login(req, await readBody(req));
        return send(res, r.status, r.body, r.headers);
      }
      if (p === '/api/logout' && req.method === 'POST') {
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
      }
      if (!authed(req)) throw new HttpError(401, 'Giriş gerekli');

      if (p.startsWith('/uploads/')) {
        const f = await storage.readPhoto(p.slice('/uploads/'.length));
        if (!f) throw new HttpError(404, 'Fotoğraf bulunamadı');
        return pipe(res, f, 'private, max-age=31536000, immutable');
      }
      if (p === '/api/backups/file') {
        const name = url.searchParams.get('name') || '';
        const f = await storage.readBackup(name);
        if (!f) throw new HttpError(404, 'Yedek bulunamadı');
        return pipe(res, f, 'no-store', { 'Content-Disposition': `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"` });
      }
      if (p === '/api/qr.svg') {
        const text = url.searchParams.get('text') || '';
        if (!text || text.length > 500) throw new HttpError(400, 'Geçersiz QR metni');
        const QR = (await import('qrcode')).default;
        const svg = await QR.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
        return send(res, 200, svg, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=86400' });
      }
      if (p === '/api/export.json') {
        return send(res, 200, JSON.stringify(await exportJson(), null, 1), {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="roy-envanter-${localDate()}.json"`,
        });
      }
      if (p === '/api/export.csv') {
        return send(res, 200, await exportCsv(), {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="roy-envanter-${localDate()}.csv"`,
        });
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(p);
        if (!m) continue;
        const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
        return send(res, 200, await r.handler(m.groups || {}, body, url.searchParams));
      }
      throw new HttpError(404, 'Bulunamadı');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra });
      if (/UNIQUE constraint|duplicate key/i.test(e.message)) return send(res, 409, { error: 'Bu kayıt zaten var' });
      console.error(e);
      return send(res, 500, { error: 'Sunucu hatası: ' + e.message });
    }
  };
}

// ---------------------------------------------------------------- HTTP yardımcıları
export function send(res, status, body, headers = {}) {
  const text = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': text ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(text ? body : JSON.stringify(body));
  return true;
}

function pipe(res, file, cache, headers = {}) {
  res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': cache, ...headers });
  file.stream.on('error', () => res.destroy());
  file.stream.pipe(res);
  return true;
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 60 * 1024 * 1024) { reject(new HttpError(413, 'Dosya çok büyük')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Geçersiz JSON')); }
    });
    req.on('error', reject);
  });
}
