// Roy Envanter — drone tamir & al-sat envanter sunucusu
// Bağımlılık yok: Node 22.5+ yerleşik node:sqlite kullanılır.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.ROY_DATA || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const BACKUPS = path.join(DATA, 'backups');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const PIN = (process.env.ROY_PIN || '').trim();
const KEEP_BACKUPS = 30;

for (const d of [DATA, UPLOADS, BACKUPS]) fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------- veritabanı
const db = new DatabaseSync(path.join(DATA, 'envanter.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'parca',
  category TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  compatible TEXT NOT NULL DEFAULT '',
  serial TEXT NOT NULL DEFAULT '',
  condition TEXT NOT NULL DEFAULT 'yeni',
  status TEXT NOT NULL DEFAULT 'stokta',
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'adet',
  min_quantity REAL NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT '',
  purchase_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  parent_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  photo TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL DEFAULT '',
  item_sku TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  repair_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  customer TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  serial TEXT NOT NULL DEFAULT '',
  problem TEXT NOT NULL DEFAULT '',
  diagnosis TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'bekliyor',
  fee REAL NOT NULL DEFAULT 0,
  deposit REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT '',
  delivered_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repair_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repair_id INTEGER NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  movement_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_mov_item ON movements(item_id);
CREATE INDEX IF NOT EXISTS idx_mov_date ON movements(created_at);
CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id);
CREATE INDEX IF NOT EXISTS idx_rp_repair ON repair_parts(repair_id);
`);

const KINDS = { drone: 'DR', parca: 'PR', aksesuar: 'AK', sarf: 'SR' };
const MOVE_KINDS = ['olusturma', 'giris', 'satis', 'cikis', 'duzeltme', 'tamir', 'iade'];

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

const now = () => new Date().toISOString();
// Yerel tarih (YYYY-MM-DD) — UTC değil, bilgisayarın saat dilimi
const localDate = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
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

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------------------------------------------------------------- ürünler
const getItemRow = (id) => db.prepare('SELECT * FROM items WHERE id = ?').get(id);

function getItem(id) {
  const item = getItemRow(id);
  if (!item) throw new HttpError(404, 'Ürün bulunamadı');
  item.movements = db.prepare('SELECT * FROM movements WHERE item_id = ? ORDER BY id DESC LIMIT 200').all(id);
  item.children = db.prepare('SELECT id, sku, name, category, quantity, unit, status, photo, location FROM items WHERE parent_id = ? ORDER BY name').all(id);
  item.parent = item.parent_id ? db.prepare('SELECT id, sku, name FROM items WHERE id = ?').get(item.parent_id) ?? null : null;
  return item;
}

function addMovement(item, m) {
  const r = db.prepare(`INSERT INTO movements (item_id, item_name, item_sku, kind, qty, unit_price, unit_cost, note, repair_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    item.id, item.name, item.sku ?? '', m.kind, m.qty, m.unit_price ?? 0, m.unit_cost ?? item.purchase_price ?? 0,
    m.note ?? '', m.repair_id ?? null, now());
  return Number(r.lastInsertRowid);
}

function checkParent(id, parentId) {
  if (!parentId) return;
  if (parentId === id) throw new HttpError(400, 'Ürün kendi kendisinin parçası olamaz');
  if (!getItemRow(parentId)) throw new HttpError(400, 'Bağlı olduğu drone bulunamadı');
}

function createItem(body) {
  const d = clean(body, ITEM_FIELDS);
  if (!d.name) throw new HttpError(400, 'Ürün adı gerekli');
  if (!KINDS[d.kind]) d.kind = 'parca';
  if (d.quantity == null) d.quantity = 1;
  checkParent(null, d.parent_id);
  d.created_at = d.updated_at = now();
  return tx(() => {
    const keys = Object.keys(d);
    const r = db.prepare(`INSERT INTO items (${keys.join(',')}) VALUES (${keys.map((k) => '$' + k).join(',')})`).run(d);
    const id = Number(r.lastInsertRowid);
    db.prepare('UPDATE items SET sku = ? WHERE id = ?').run(`${KINDS[d.kind]}-${String(id).padStart(4, '0')}`, id);
    const item = getItemRow(id);
    if (item.quantity) addMovement(item, { kind: 'olusturma', qty: item.quantity, unit_price: item.purchase_price, note: '' });
    return getItem(id);
  });
}

function updateItem(id, body) {
  const old = getItemRow(id);
  if (!old) throw new HttpError(404, 'Ürün bulunamadı');
  const d = clean(body, ITEM_FIELDS);
  if ('name' in d && !d.name) throw new HttpError(400, 'Ürün adı gerekli');
  if ('kind' in d && !KINDS[d.kind]) delete d.kind;
  if ('parent_id' in d) checkParent(id, d.parent_id);
  d.updated_at = now();
  return tx(() => {
    const keys = Object.keys(d);
    db.prepare(`UPDATE items SET ${keys.map((k) => `${k} = $${k}`).join(', ')} WHERE id = $id`).run({ ...d, id });
    if ('quantity' in d && d.quantity !== old.quantity) {
      addMovement(getItemRow(id), { kind: 'duzeltme', qty: d.quantity - old.quantity, note: 'Düzenleme ekranından' });
    }
    return getItem(id);
  });
}

function deleteItem(id) {
  const item = getItemRow(id);
  if (!item) throw new HttpError(404, 'Ürün bulunamadı');
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  removePhotoFile(item.photo);
  return { ok: true };
}

// Stok hareketi: giriş / satış / çıkış / sayım (duzeltme = yeni miktar) / iade
function moveItem(id, body) {
  const item = getItemRow(id);
  if (!item) throw new HttpError(404, 'Ürün bulunamadı');
  const kind = String(body.kind || '');
  if (!['giris', 'satis', 'cikis', 'duzeltme', 'iade'].includes(kind)) throw new HttpError(400, 'Geçersiz hareket türü');
  const qty = Number(body.qty);
  if (!Number.isFinite(qty) || qty < 0 || (kind !== 'duzeltme' && qty === 0)) throw new HttpError(400, 'Geçerli bir miktar girin');
  const price = Number(body.unit_price) || 0;
  const note = String(body.note ?? '').trim().slice(0, 1000);

  let delta;
  if (kind === 'giris' || kind === 'iade') delta = qty;
  else if (kind === 'duzeltme') delta = qty - item.quantity;
  else {
    if (qty > item.quantity) throw new HttpError(400, `Stokta yalnızca ${item.quantity} ${item.unit} var`);
    delta = -qty;
  }
  if (delta === 0 && kind === 'duzeltme') return getItem(id);

  return tx(() => {
    const newQty = item.quantity + delta;
    let status = item.status;
    if (kind === 'satis' && newQty <= 0 && ['stokta', 'satista', 'rezerve'].includes(status)) status = 'satildi';
    if ((kind === 'giris' || kind === 'iade') && status === 'satildi') status = 'stokta';
    let purchase = item.purchase_price;
    // Yeni alışta ağırlıklı ortalama maliyet
    if (kind === 'giris' && price > 0) {
      const base = Math.max(item.quantity, 0);
      purchase = base + qty > 0 ? (base * item.purchase_price + qty * price) / (base + qty) : price;
      purchase = Math.round(purchase * 100) / 100;
    }
    db.prepare('UPDATE items SET quantity = ?, status = ?, purchase_price = ?, updated_at = ? WHERE id = ?')
      .run(newQty, status, purchase, now(), id);
    addMovement(item, {
      kind, qty: delta, note,
      unit_price: kind === 'giris' ? (price || item.purchase_price) : price,
      unit_cost: kind === 'giris' ? (price || item.purchase_price) : item.purchase_price,
    });
    return getItem(id);
  });
}

function removePhotoFile(name) {
  if (!name) return;
  const p = path.join(UPLOADS, path.basename(name));
  fs.rm(p, { force: true }, () => {});
}

function savePhoto(id, body) {
  const item = getItemRow(id);
  if (!item) throw new HttpError(404, 'Ürün bulunamadı');
  if (body.remove) {
    removePhotoFile(item.photo);
    db.prepare("UPDATE items SET photo = '', updated_at = ? WHERE id = ?").run(now(), id);
    return getItem(id);
  }
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(body.dataUrl || ''));
  if (!m) throw new HttpError(400, 'Geçersiz fotoğraf');
  const name = `${id}-${crypto.randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(UPLOADS, name), Buffer.from(m[2], 'base64'));
  removePhotoFile(item.photo);
  db.prepare('UPDATE items SET photo = ?, updated_at = ? WHERE id = ?').run(name, now(), id);
  return getItem(id);
}

// ---------------------------------------------------------------- tamirler
function getRepair(id) {
  const r = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id);
  if (!r) throw new HttpError(404, 'Tamir kaydı bulunamadı');
  r.parts = db.prepare(`SELECT rp.*, i.sku, i.quantity AS stock, i.unit FROM repair_parts rp
    LEFT JOIN items i ON i.id = rp.item_id WHERE rp.repair_id = ? ORDER BY rp.id`).all(id);
  return r;
}

function listRepairs() {
  return db.prepare(`SELECT r.*,
      COALESCE((SELECT SUM(qty * unit_price) FROM repair_parts WHERE repair_id = r.id), 0) AS parts_total,
      COALESCE((SELECT SUM(qty * unit_cost) FROM repair_parts WHERE repair_id = r.id), 0) AS parts_cost
    FROM repairs r ORDER BY r.id DESC`).all();
}

function createRepair(body) {
  const d = clean(body, REPAIR_FIELDS);
  if (!d.customer && !d.device) throw new HttpError(400, 'Müşteri veya cihaz bilgisi gerekli');
  d.received_at ||= localDate();
  d.created_at = d.updated_at = now();
  const keys = Object.keys(d);
  const r = db.prepare(`INSERT INTO repairs (${keys.join(',')}) VALUES (${keys.map((k) => '$' + k).join(',')})`).run(d);
  const id = Number(r.lastInsertRowid);
  db.prepare('UPDATE repairs SET code = ? WHERE id = ?').run(`TM-${String(id).padStart(4, '0')}`, id);
  return getRepair(id);
}

function updateRepair(id, body) {
  const old = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id);
  if (!old) throw new HttpError(404, 'Tamir kaydı bulunamadı');
  const d = clean(body, REPAIR_FIELDS);
  if (d.status === 'teslim' && !old.delivered_at && !d.delivered_at) d.delivered_at = localDate();
  d.updated_at = now();
  const keys = Object.keys(d);
  db.prepare(`UPDATE repairs SET ${keys.map((k) => `${k} = $${k}`).join(', ')} WHERE id = $id`).run({ ...d, id });
  return getRepair(id);
}

function deleteRepair(id) {
  // Kullanılan parçalar stoğa geri döner
  tx(() => {
    const parts = db.prepare('SELECT id FROM repair_parts WHERE repair_id = ?').all(id);
    for (const p of parts) removeRepairPartTx(id, p.id);
    db.prepare('DELETE FROM repairs WHERE id = ?').run(id);
  });
  return { ok: true };
}

function addRepairPart(repairId, body) {
  if (!db.prepare('SELECT id FROM repairs WHERE id = ?').get(repairId)) throw new HttpError(404, 'Tamir kaydı bulunamadı');
  const item = getItemRow(Number(body.item_id));
  if (!item) throw new HttpError(404, 'Ürün bulunamadı');
  const qty = Number(body.qty) || 1;
  if (qty <= 0) throw new HttpError(400, 'Geçerli bir miktar girin');
  if (qty > item.quantity) throw new HttpError(400, `Stokta yalnızca ${item.quantity} ${item.unit} var`);
  const unitPrice = body.unit_price === '' || body.unit_price == null ? item.sale_price : Number(body.unit_price) || 0;
  return tx(() => {
    db.prepare('UPDATE items SET quantity = quantity - ?, updated_at = ? WHERE id = ?').run(qty, now(), item.id);
    const code = db.prepare('SELECT code FROM repairs WHERE id = ?').get(repairId).code;
    const mid = addMovement(item, { kind: 'tamir', qty: -qty, unit_price: unitPrice, note: code, repair_id: repairId });
    db.prepare(`INSERT INTO repair_parts (repair_id, item_id, item_name, qty, unit_cost, unit_price, movement_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(repairId, item.id, item.name, qty, item.purchase_price, unitPrice, mid);
    return getRepair(repairId);
  });
}

function removeRepairPartTx(repairId, partId) {
  const p = db.prepare('SELECT * FROM repair_parts WHERE id = ? AND repair_id = ?').get(partId, repairId);
  if (!p) throw new HttpError(404, 'Parça kaydı bulunamadı');
  if (p.item_id && getItemRow(p.item_id)) {
    db.prepare('UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(p.qty, now(), p.item_id);
  }
  if (p.movement_id) db.prepare('DELETE FROM movements WHERE id = ?').run(p.movement_id);
  db.prepare('DELETE FROM repair_parts WHERE id = ?').run(partId);
}

// ---------------------------------------------------------------- panel & raporlar
function dashboard() {
  const month = localDate().slice(0, 7);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const stock = one(`SELECT COUNT(*) AS items,
      COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity END), 0) AS units,
      COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity * purchase_price END), 0) AS cost_value,
      COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity * sale_price END), 0) AS sale_value,
      COALESCE(SUM(CASE WHEN kind = 'drone' AND quantity > 0 AND status != 'satildi' THEN quantity END), 0) AS drones,
      COALESCE(SUM(CASE WHEN min_quantity > 0 AND quantity <= min_quantity THEN 1 END), 0) AS low
    FROM items`);
  const sales = one(`SELECT COALESCE(SUM(-qty * unit_price), 0) AS revenue,
      COALESCE(SUM(-qty * (unit_price - unit_cost)), 0) AS profit, COUNT(*) AS count
    FROM movements WHERE kind = 'satis' AND substr(datetime(created_at, 'localtime'), 1, 7) = ?`, month);
  const repairs = one(`SELECT COUNT(*) AS count,
      COALESCE(SUM(r.fee + COALESCE((SELECT SUM(qty * unit_price) FROM repair_parts WHERE repair_id = r.id), 0)), 0) AS revenue,
      COALESCE(SUM(r.fee + COALESCE((SELECT SUM(qty * (unit_price - unit_cost)) FROM repair_parts WHERE repair_id = r.id), 0)), 0) AS profit
    FROM repairs r WHERE r.status = 'teslim' AND substr(r.delivered_at, 1, 7) = ?`, month);
  const activeRepairs = db.prepare(`SELECT id, code, customer, device, status, received_at FROM repairs
    WHERE status NOT IN ('teslim', 'iptal') ORDER BY id DESC LIMIT 8`).all();
  const low = db.prepare(`SELECT id, sku, name, quantity, min_quantity, unit, location FROM items
    WHERE min_quantity > 0 AND quantity <= min_quantity ORDER BY quantity - min_quantity LIMIT 12`).all();
  const recent = db.prepare('SELECT * FROM movements ORDER BY id DESC LIMIT 10').all();
  return { month, stock, sales, repairs, activeRepairs, low, recent };
}

function exportJson() {
  return {
    app: 'roy-envanter', version: 1, exported_at: now(),
    items: db.prepare('SELECT * FROM items ORDER BY id').all(),
    movements: db.prepare('SELECT * FROM movements ORDER BY id').all(),
    repairs: db.prepare('SELECT * FROM repairs ORDER BY id').all(),
    repair_parts: db.prepare('SELECT * FROM repair_parts ORDER BY id').all(),
  };
}

function importJson(body) {
  if (body?.app !== 'roy-envanter' || !Array.isArray(body.items)) throw new HttpError(400, 'Bu dosya Roy Envanter yedeği değil');
  backup('ice-aktarma-oncesi');
  tx(() => {
    db.exec('PRAGMA defer_foreign_keys = ON');
    for (const t of ['repair_parts', 'repairs', 'movements', 'items']) db.exec(`DELETE FROM ${t}`);
    const insertAll = (table, rows) => {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      for (const row of rows || []) {
        const keys = cols.filter((c) => c in row);
        const vals = Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
        db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => '$' + k).join(',')})`).run(vals);
      }
    };
    insertAll('items', body.items);
    insertAll('movements', body.movements);
    insertAll('repairs', body.repairs);
    insertAll('repair_parts', body.repair_parts);
  });
  return { ok: true, items: body.items.length };
}

function exportCsv() {
  const rows = db.prepare('SELECT * FROM items ORDER BY sku').all();
  const cols = [['sku', 'Kod'], ['name', 'Ad'], ['kind', 'Tür'], ['category', 'Kategori'], ['brand', 'Marka'],
    ['model', 'Model'], ['compatible', 'Uyumlu'], ['serial', 'Seri No'], ['condition', 'Durum'], ['status', 'Statü'],
    ['quantity', 'Miktar'], ['unit', 'Birim'], ['min_quantity', 'Min. Stok'], ['location', 'Konum'],
    ['purchase_price', 'Alış'], ['sale_price', 'Satış'], ['source', 'Kaynak'], ['notes', 'Not']];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
  return '﻿' + [cols.map((c) => c[1]).join(';'),
    ...rows.map((r) => cols.map(([k]) => esc(num(r[k]))).join(';'))].join('\r\n');
}

// ---------------------------------------------------------------- yedekleme
function backup(tag) {
  const name = `envanter-${tag || localDate()}.db`;
  const file = path.join(BACKUPS, name);
  if (!tag && fs.existsSync(file)) return;
  fs.rmSync(file, { force: true });
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(BACKUPS).filter((f) => /^envanter-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) fs.rmSync(path.join(BACKUPS, f), { force: true });
}
backup();
setInterval(() => { try { backup(); } catch (e) { console.error('Yedekleme hatası:', e.message); } }, 60 * 60 * 1000).unref();

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}`);
  }
  return urls;
}

// ---------------------------------------------------------------- PIN koruması (isteğe bağlı)
const TOKEN = PIN ? crypto.createHmac('sha256', PIN).update('roy-envanter').digest('hex') : '';
function authed(req) {
  if (!PIN) return true;
  const c = /(?:^|;\s*)roy=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return !!c && c[1].length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(c[1]), Buffer.from(TOKEN));
}

// ---------------------------------------------------------------- HTTP
const routes = [];
const route = (method, pattern, handler) =>
  routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$'), handler });

route('GET', '/api/info', () => ({ lan: lanUrls(), pin: !!PIN, data: DATA }));
route('GET', '/api/items', () => db.prepare(`SELECT id, sku, name, kind, category, brand, model, compatible, serial,
  condition, status, quantity, unit, min_quantity, location, purchase_price, sale_price, source, parent_id, photo, updated_at
  FROM items ORDER BY updated_at DESC`).all());
route('POST', '/api/items', (_, body) => createItem(body));
route('GET', '/api/items/:id', (p) => getItem(+p.id));
route('PUT', '/api/items/:id', (p, body) => updateItem(+p.id, body));
route('DELETE', '/api/items/:id', (p) => deleteItem(+p.id));
route('POST', '/api/items/:id/move', (p, body) => moveItem(+p.id, body));
route('POST', '/api/items/:id/photo', (p, body) => savePhoto(+p.id, body));
route('GET', '/api/movements', (_, __, q) => {
  const limit = Math.min(Number(q.get('limit')) || 300, 2000);
  const kind = q.get('kind');
  return kind && MOVE_KINDS.includes(kind)
    ? db.prepare('SELECT * FROM movements WHERE kind = ? ORDER BY id DESC LIMIT ?').all(kind, limit)
    : db.prepare('SELECT * FROM movements ORDER BY id DESC LIMIT ?').all(limit);
});
route('GET', '/api/dashboard', () => dashboard());
route('GET', '/api/repairs', () => listRepairs());
route('POST', '/api/repairs', (_, body) => createRepair(body));
route('GET', '/api/repairs/:id', (p) => getRepair(+p.id));
route('PUT', '/api/repairs/:id', (p, body) => updateRepair(+p.id, body));
route('DELETE', '/api/repairs/:id', (p) => deleteRepair(+p.id));
route('POST', '/api/repairs/:id/parts', (p, body) => addRepairPart(+p.id, body));
route('DELETE', '/api/repairs/:id/parts/:pid', (p) => { tx(() => removeRepairPartTx(+p.id, +p.pid)); return getRepair(+p.id); });
route('POST', '/api/import', (_, body) => importJson(body));
route('POST', '/api/backup', () => { backup(now().slice(0, 19).replace(/[:T]/g, '-')); return { ok: true }; });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body) || typeof body === 'string';
  res.writeHead(status, { 'Content-Type': isBuf ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
}

function serveFile(res, file, cache) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Bulunamadı');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 60 * 1024 * 1024) { reject(new HttpError(413, 'Dosya çok büyük')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Geçersiz JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (!PIN || String(body.pin) === PIN) {
        return send(res, 200, { ok: true }, { 'Set-Cookie': `roy=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` });
      }
      return send(res, 401, { error: 'PIN hatalı' });
    }
    if ((p.startsWith('/api/') || p.startsWith('/uploads/')) && !authed(req)) return send(res, 401, { error: 'Giriş gerekli' });

    if (p.startsWith('/uploads/')) return serveFile(res, path.join(UPLOADS, path.basename(p)), 'private, max-age=31536000, immutable');
    if (p === '/api/export.json') {
      return send(res, 200, JSON.stringify(exportJson(), null, 1), {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="roy-envanter-${localDate()}.json"`,
      });
    }
    if (p === '/api/export.csv') {
      return send(res, 200, exportCsv(), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="roy-envanter-${localDate()}.csv"`,
      });
    }
    if (p.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(p);
        if (!m) continue;
        const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
        return send(res, 200, r.handler(m.groups || {}, body, url.searchParams));
      }
      return send(res, 404, { error: 'Bulunamadı' });
    }

    // statik dosyalar — bilinmeyen yollar uygulamaya düşer
    const file = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file, 'no-cache');
    return serveFile(res, path.join(PUBLIC, 'index.html'), 'no-cache');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    if (/UNIQUE constraint/.test(e.message)) return send(res, 409, { error: 'Bu kayıt zaten var' });
    console.error(e);
    return send(res, 500, { error: 'Sunucu hatası: ' + e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Roy Envanter çalışıyor 🚁\n');
  console.log(`  Bu bilgisayarda:  http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Telefondan:       ${u}`);
  console.log(`\n  Veriler: ${DATA}`);
  if (PIN) console.log('  PIN koruması: açık');
  console.log('\n  Kapatmak için bu pencereyi kapatın veya Ctrl+C.\n');
});
