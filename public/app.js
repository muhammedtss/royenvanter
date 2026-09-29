// Roy Envanter — istemci uygulaması (framework'süz, hash tabanlı yönlendirme)

// ============================================================ yardımcılar
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v));
function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
  return raw(out);
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');

const store_ = {
  get(k, d) { try { const v = localStorage.getItem('roy-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('roy-' + k, JSON.stringify(v)); } catch {} },
};

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtMoney = (n) => money.format(Number(n) || 0);
const fmtNum = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtDate = (s, time = true) => {
  if (!s) return '';
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  if (isNaN(d)) return s;
  return d.toLocaleString('tr-TR', time && s.length > 10
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
};
const parseNum = (s) => {
  const t = String(s ?? '').trim().replace(/\s|₺/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
const norm = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
const localDay = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => localDay();

// ============================================================ simgeler
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  drone: '<circle cx="5" cy="5" r="2.6"/><circle cx="19" cy="5" r="2.6"/><circle cx="5" cy="19" r="2.6"/><circle cx="19" cy="19" r="2.6"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/>',
  part: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  bag: '<path d="M6 7h12l1 14H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  drop: '<path d="M12 2.7s6 6.3 6 10.8a6 6 0 0 1-12 0C6 9 12 2.7 12 2.7z"/>',
  in: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  out: '<path d="M12 17V5M7 10l5-5 5 5M4 21h16"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  count: '<path d="M9 3h6v3H9z"/><path d="M15 4.5h3a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h3"/><path d="m9 14 2 2 4-4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
};
const icon = (n) => raw(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`);

// ============================================================ sözlükler
const KIND = {
  drone: { label: 'Drone', icon: 'drone' },
  parca: { label: 'Parça', icon: 'part' },
  aksesuar: { label: 'Aksesuar', icon: 'bag' },
  sarf: { label: 'Sarf', icon: 'drop' },
};
const CONDITION = {
  yeni: { label: 'Sıfır', cls: 'ok' },
  iyi: { label: 'Az kullanılmış', cls: 'info' },
  kullanilmis: { label: 'Kullanılmış', cls: '' },
  arizali: { label: 'Arızalı', cls: 'danger' },
  hurda: { label: 'Parça için / hurda', cls: 'warn' },
};
const STATUS = {
  stokta: { label: 'Stokta', cls: 'ok' },
  satista: { label: 'Satışta (ilanda)', cls: 'accent' },
  rezerve: { label: 'Rezerve', cls: 'info' },
  tamirde: { label: 'Tamirde', cls: 'warn' },
  kullanimda: { label: 'Kendi kullanımda', cls: '' },
  satildi: { label: 'Satıldı', cls: '' },
};
const REPAIR_STATUS = {
  bekliyor: { label: 'Sırada', cls: '' },
  inceleniyor: { label: 'İnceleniyor', cls: 'info' },
  parca_bekliyor: { label: 'Parça bekliyor', cls: 'warn' },
  tamirde: { label: 'Tamirde', cls: 'accent' },
  hazir: { label: 'Hazır', cls: 'ok' },
  teslim: { label: 'Teslim edildi', cls: '' },
  iptal: { label: 'İptal', cls: 'danger' },
};
const MOVE = {
  olusturma: { label: 'İlk kayıt', icon: 'plus', cls: 'info' },
  giris: { label: 'Stok girişi', icon: 'in', cls: 'ok' },
  satis: { label: 'Satış', icon: 'tag', cls: 'accent' },
  cikis: { label: 'Çıkış', icon: 'out', cls: 'danger' },
  duzeltme: { label: 'Sayım / düzeltme', icon: 'count', cls: '' },
  tamir: { label: 'Tamirde kullanıldı', icon: 'wrench', cls: 'warn' },
  iade: { label: 'İade', icon: 'undo', cls: 'info' },
};
const DEFAULT_CATEGORIES = [
  'Drone', 'Motor', 'ESC', 'Uçuş kontrolcü (FC)', 'Pervane', 'Batarya', 'Şarj cihazı', 'Kamera', 'Gimbal',
  'Gimbal kablosu / flex', 'GPS / pusula', 'Alıcı (RX)', 'Kumanda / verici', 'Video verici (VTX)', 'Anten',
  'Gövde / şase', 'Kol / iniş takımı', 'Sensör', 'Anakart', 'Kablo / konnektör', 'Vida / somun', 'Rulman',
  'Gözlük / FPV ekran', 'Çanta / kutu', 'Lehim / sarf', 'Takım / alet', 'Diğer',
];
const DEFAULT_BRANDS = [
  'DJI', 'Autel', 'Parrot', 'FIMI', 'Hubsan', 'Holy Stone', 'Potensic', 'Skydio', 'BetaFPV', 'iFlight', 'GEPRC',
  'EMAX', 'Diatone', 'T-Motor', 'SpeedyBee', 'Foxeer', 'Caddx', 'RunCam', 'Walksnail', 'HDZero', 'TBS',
  'RadioMaster', 'FrSky', 'ExpressLRS', 'Tattu', 'CNHL', 'GNB', 'Gemfan', 'HQProp', 'Matek', 'Holybro',
];
const badge = (map, key) => { const m = map[key]; return m ? html`<span class="badge ${m.cls}">${m.label}</span>` : ''; };
const options = (map, sel) => Object.entries(map).map(([k, v]) => html`<option value="${k}" ${k === sel ? 'selected' : ''}>${v.label ?? v}</option>`);

// ============================================================ API
class LoginRequired extends Error {}
async function api(url, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch(url, init); }
  catch { throw new Error('Sunucuya ulaşılamadı. Bilgisayardaki programın açık olduğundan emin olun.'); }
  if (res.status === 401 && url !== '/api/login') throw new LoginRequired();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Hata (${res.status})`);
  return data;
}

const cache = { items: null };
async function getItems(force = false) {
  if (!cache.items || force) {
    cache.items = await api('/api/items');
    for (const it of cache.items) it._s = norm([it.sku, it.name, it.category, it.brand, it.model, it.compatible, it.serial, it.location].join(' '));
  }
  return cache.items;
}
const invalidate = () => { cache.items = null; };

// ============================================================ arayüz parçaları
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), err ? 4500 : 2400);
}
const fail = (e) => { if (e instanceof LoginRequired) return viewLogin(); console.error(e); toast(e.message, true); };

function openModal({ title, body, foot, wide, onMount }) {
  const root = $('#modal-root');
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = String(html`<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="modal-head"><h2>${title}</h2><button class="btn ghost icon sm" data-close aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? html`<div class="modal-foot">${foot}</div>` : ''}
  </div>`);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  $$('[data-close]', bg).forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  root.append(bg);
  const m = { el: bg, close };
  onMount?.(m);
  const first = $('input:not([type=hidden]), select, textarea', bg);
  if (first && matchMedia('(min-width: 821px)').matches) first.focus();
  return m;
}

function confirmModal(title, message, okText = 'Sil', danger = true) {
  return new Promise((resolve) => {
    const m = openModal({
      title, body: html`<p style="margin:0">${message}</p>`,
      foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okText}</button>`,
      onMount: (m) => $('[data-ok]', m.el).addEventListener('click', () => { m.close(); resolve(true); }),
    });
    $$('[data-close]', m.el).forEach((b) => b.addEventListener('click', () => resolve(false)));
  });
}

function thumb(item, size) {
  const k = KIND[item.kind] || KIND.parca;
  return html`<div class="thumb" ${size ? raw(`style="width:${size}px;height:${size}px"`) : ''}>${item.photo
    ? html`<img src="/uploads/${item.photo}" alt="" loading="lazy">` : icon(k.icon)}</div>`;
}

const empty = (ic, text, action = '') => html`<div class="empty">${icon(ic)}<div>${text}</div>${action ? html`<div style="margin-top:14px">${action}</div>` : ''}</div>`;

function mvRow(m, showItem = true) {
  const k = MOVE[m.kind] || { label: m.kind, icon: 'history', cls: '' };
  const style = k.cls ? `background:var(--${k.cls}-soft);color:var(--${k.cls})` : 'background:var(--surface-2);color:var(--text-2)';
  const amount = m.kind === 'satis' || m.kind === 'tamir' ? Math.abs(m.qty) * m.unit_price : (m.kind === 'giris' || m.kind === 'olusturma') ? m.qty * m.unit_price : 0;
  const title = showItem ? (m.item_name || 'Silinmiş ürün') : k.label;
  const meta = [showItem ? k.label : '', m.note, fmtDate(m.created_at)].filter(Boolean).join(' · ');
  const inner = html`<div class="mv-icon" style="${style}">${icon(k.icon)}</div>
    <div class="grow"><div class="title">${title}</div><div class="meta">${meta}</div></div>
    <div class="right"><div class="mv-qty ${m.qty > 0 ? 'pos' : m.qty < 0 ? 'neg' : ''}">${m.qty > 0 ? '+' : ''}${fmtNum(m.qty)}</div>
    ${amount ? html`<div class="small muted nowrap">${fmtMoney(amount)}</div>` : ''}</div>`;
  if (m.kind === 'tamir' && m.repair_id) return html`<a class="row" href="#/tamir/${m.repair_id}">${inner}</a>`;
  return showItem && m.item_id ? html`<a class="row" href="#/urun/${m.item_id}">${inner}</a>` : html`<div class="row">${inner}</div>`;
}

async function resizeImage(file, max = 1400) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Fotoğraf okunamadı')); i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try { resolve(await resizeImage(f)); } catch (e) { toast(e.message, true); resolve(null); }
    };
    input.click();
  });
}

// ============================================================ yönlendirme
const NAV = [
  ['#/', 'Panel', 'home', /^\/$/],
  ['#/envanter', 'Envanter', 'box', /^\/(envanter|urun|etiket)/],
  ['#/tamir', 'Tamir', 'wrench', /^\/tamir/],
  ['#/hareketler', 'Hareketler', 'history', /^\/hareketler/],
  ['#/ayarlar', 'Ayarlar', 'sliders', /^\/ayarlar/],
];
const ROUTES = [
  [/^\/$/, viewDashboard],
  [/^\/envanter$/, viewInventory],
  [/^\/urun\/yeni$/, viewItemForm],
  [/^\/urun\/(\d+)$/, viewItem],
  [/^\/urun\/(\d+)\/duzenle$/, viewItemForm],
  [/^\/tamir$/, viewRepairs],
  [/^\/tamir\/yeni$/, viewRepairForm],
  [/^\/tamir\/(\d+)$/, viewRepair],
  [/^\/tamir\/(\d+)\/duzenle$/, viewRepairForm],
  [/^\/hareketler$/, viewMovements],
  [/^\/ayarlar$/, viewSettings],
  [/^\/etiket$/, viewLabels],
];

let seq = 0;
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

async function render() {
  const my = ++seq;
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const query = new URLSearchParams(qs || '');
  for (const nav of ['#nav', '#tabbar']) {
    $(nav).innerHTML = String(html`${NAV.map(([href, label, ic, re]) =>
      html`<a href="${href}" class="${re.test(path) ? 'active' : ''}">${icon(ic)}<span>${label}</span></a>`)}`);
  }
  $('#modal-root').innerHTML = '';
  let fab = $('.fab');
  if (!fab) { fab = document.createElement('a'); fab.className = 'fab'; document.body.append(fab); }
  const onRepair = path.startsWith('/tamir');
  fab.href = onRepair ? '#/tamir/yeni' : '#/urun/yeni';
  fab.setAttribute('aria-label', onRepair ? 'Yeni tamir kaydı' : 'Yeni ürün ekle');
  fab.innerHTML = String(icon('plus'));
  fab.classList.toggle('hidden', /\/(yeni|duzenle)$/.test(path) || path === '/etiket' || path === '/ayarlar');

  const r = ROUTES.find(([re]) => re.test(path));
  if (!r) { app.innerHTML = String(empty('alert', 'Sayfa bulunamadı', html`<a class="btn" href="#/">Panele dön</a>`)); return; }
  const params = path.match(r[0]).slice(1);
  const ctx = {
    params, query, path,
    mount(content) { if (my !== seq) return false; app.innerHTML = String(content); return true; },
    alive: () => my === seq,
  };
  try { await r[1](ctx); }
  catch (e) {
    if (e instanceof LoginRequired) return viewLogin();
    console.error(e);
    ctx.mount(empty('alert', e.message, html`<button class="btn" onclick="location.reload()">Yeniden dene</button>`));
  }
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ============================================================ giriş
function viewLogin() {
  seq++;
  $('#nav').innerHTML = $('#tabbar').innerHTML = '';
  $('.fab')?.classList.add('hidden');
  app.innerHTML = String(html`<form class="login" id="login">
    <img src="/icon.svg" width="64" height="64" alt="">
    <h1>Roy Envanter</h1>
    <input type="password" name="pin" inputmode="numeric" autocomplete="current-password" placeholder="PIN" aria-label="PIN" required>
    <button class="btn primary">Giriş yap</button>
  </form>`);
  const f = $('#login');
  f.pin.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/login', { method: 'POST', body: { pin: f.pin.value } }); render(); }
    catch (err) { toast(err.message, true); f.pin.select(); }
  });
}

// ============================================================ panel
async function viewDashboard(ctx) {
  ctx.mount(html`<div class="skeleton"></div><div class="skeleton"></div>`);
  const d = await api('/api/dashboard');
  const monthName = new Date().toLocaleString('tr-TR', { month: 'long' });
  const s = d.stock;
  const welcome = s.items === 0 ? html`<div class="card card-pad" style="margin-bottom:16px;border-color:var(--accent)">
      <h2 style="font-size:18px;margin-bottom:6px">Hoş geldin 👋</h2>
      <p class="muted" style="margin:0 0 14px">Envanter boş. İlk ürünü ekleyerek başla — bir drone, bir pervane ya da tek bir vida olabilir.
      “Kaydet, yenisi” butonuyla aynı kutudaki parçaları art arda hızlıca girebilirsin.</p>
      <div class="btn-row"><a class="btn primary" href="#/urun/yeni?kind=drone">${icon('drone')} Drone ekle</a>
      <a class="btn" href="#/urun/yeni?kind=parca">${icon('part')} Parça ekle</a></div>
    </div>` : '';

  ctx.mount(html`
    <div class="page-head">
      <h1>Panel<div class="sub">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</div></h1>
      <div class="btn-row hide-m">
        <a class="btn" href="#/tamir/yeni">${icon('wrench')} Tamir kaydı</a>
        <a class="btn primary" href="#/urun/yeni">${icon('plus')} Ürün ekle</a>
      </div>
    </div>
    ${welcome}
    <div class="stats">
      <a class="card stat" href="#/envanter"><div class="label">Stok kalemi</div><div class="value">${fmtNum(s.items)}</div>
        <div class="hint">${fmtNum(s.units)} adet · ${fmtNum(s.drones)} drone</div></a>
      <div class="card stat"><div class="label">Stok değeri (maliyet)</div><div class="value">${fmtMoney(s.cost_value)}</div>
        <div class="hint">Satış değeri ${fmtMoney(s.sale_value)}</div></div>
      <a class="card stat accent" href="#/hareketler?kind=satis"><div class="label">${monthName} satışları</div><div class="value">${fmtMoney(d.sales.revenue)}</div>
        <div class="hint">${d.sales.count} satış · kâr ${fmtMoney(d.sales.profit)}</div></a>
      <a class="card stat" href="#/tamir"><div class="label">${monthName} tamirleri</div><div class="value">${fmtMoney(d.repairs.revenue)}</div>
        <div class="hint">${d.repairs.count} teslim · kâr ${fmtMoney(d.repairs.profit)}</div></a>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>Aktif tamirler</h2><a href="#/tamir">Tümü</a></div>
        <div class="list">${d.activeRepairs.length ? d.activeRepairs.map((r) => html`
          <a class="row" href="#/tamir/${r.id}"><div class="thumb">${icon('wrench')}</div>
            <div class="grow"><div class="title">${r.device || 'Cihaz belirtilmedi'}</div>
            <div class="meta"><span class="mono">${r.code}</span> · ${r.customer || '—'} · ${fmtDate(r.received_at, false)}</div></div>
            ${badge(REPAIR_STATUS, r.status)}</a>`) : empty('wrench', 'Bekleyen tamir yok')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Azalan stok ${s.low ? html`<span class="badge danger">${s.low}</span>` : ''}</h2><a href="#/envanter?low=1">Tümü</a></div>
        <div class="list">${d.low.length ? d.low.map((i) => html`
          <a class="row" href="#/urun/${i.id}"><div class="grow"><div class="title">${i.name}</div>
            <div class="meta"><span class="mono">${i.sku}</span>${i.location ? html` · ${i.location}` : ''}</div></div>
            <div class="right"><b style="color:var(--danger)">${fmtNum(i.quantity)}</b> <span class="muted small">/ min ${fmtNum(i.min_quantity)} ${i.unit}</span></div></a>`)
          : empty('box', 'Tüm stoklar yeterli. Ürünlere “min. stok” girersen azalınca burada görünür.')}</div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Son hareketler</h2><a href="#/hareketler">Tümü</a></div>
      <div class="list">${d.recent.length ? d.recent.map((m) => mvRow(m)) : empty('history', 'Henüz hareket yok')}</div>
    </div>`);
}

// ============================================================ envanter listesi
const INV_DEFAULT = { q: '', kind: '', category: '', location: '', status: '', sort: 'updated' };
async function viewInventory(ctx) {
  const st = { ...INV_DEFAULT, ...store_.get('inv', {}) };
  if (ctx.query.get('low')) Object.assign(st, INV_DEFAULT, { status: 'low' });
  if (ctx.query.get('q') != null) st.q = ctx.query.get('q');
  if (!cache.items) ctx.mount(html`<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`);
  const items = await getItems();
  let limit = 200;

  const uniq = (key) => [...new Set(items.map((i) => i[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const categories = uniq('category');
  const locations = uniq('location');
  const counts = { '': items.length };
  for (const i of items) counts[i.kind] = (counts[i.kind] || 0) + 1;

  if (!ctx.mount(html`
    <div class="page-head">
      <h1>Envanter<div class="sub">${fmtNum(items.length)} kalem kayıtlı</div></h1>
      <div class="btn-row">
        <button class="btn hide-m" id="print-labels">${icon('printer')} Etiket</button>
        <a class="btn primary hide-m" href="#/urun/yeni">${icon('plus')} Ürün ekle</a>
      </div>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search')}<input type="search" id="q" placeholder="Ad, kod, marka, model, konum, seri no ara…" value="${st.q}" autocomplete="off" aria-label="Ara"></label>
      <div class="chips" id="kind-chips">
        ${[['', 'Tümü'], ...Object.entries(KIND).map(([k, v]) => [k, v.label])].map(([k, label]) =>
          html`<button class="chip ${st.kind === k ? 'on' : ''}" data-kind="${k}">${label} <span class="count">${counts[k] || 0}</span></button>`)}
      </div>
      <div class="filters">
        <select id="f-category" aria-label="Kategori"><option value="">Tüm kategoriler</option>${categories.map((c) => html`<option ${c === st.category ? 'selected' : ''}>${c}</option>`)}</select>
        <select id="f-location" aria-label="Konum"><option value="">Tüm konumlar</option>${locations.map((c) => html`<option ${c === st.location ? 'selected' : ''}>${c}</option>`)}</select>
        <select id="f-status" aria-label="Durum">
          <option value="">Tüm durumlar</option>
          <option value="instock" ${st.status === 'instock' ? 'selected' : ''}>Stokta olanlar</option>
          <option value="low" ${st.status === 'low' ? 'selected' : ''}>Azalan stok</option>
          <option value="zero" ${st.status === 'zero' ? 'selected' : ''}>Stoğu biten</option>
          ${Object.entries(STATUS).map(([k, v]) => html`<option value="${k}" ${st.status === k ? 'selected' : ''}>${v.label}</option>`)}
        </select>
        <select id="f-sort" aria-label="Sıralama">
          ${[['updated', 'Son güncellenen'], ['name', 'Ada göre (A-Z)'], ['qty', 'Miktar (azdan çoğa)'], ['location', 'Konuma göre'], ['value', 'Değere göre']].map(([k, l]) =>
            html`<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`)}
        </select>
      </div>
    </div>
    <div class="result-info" id="info"></div>
    <div class="card"><div class="list" id="results"></div></div>
    <div id="more"></div>`)) return;

  const filtered = () => {
    const tokens = norm(st.q).split(/\s+/).filter(Boolean);
    let list = items.filter((i) =>
      (!st.kind || i.kind === st.kind) &&
      (!st.category || i.category === st.category) &&
      (!st.location || i.location === st.location) &&
      (!st.status || (st.status === 'low' ? i.min_quantity > 0 && i.quantity <= i.min_quantity
        : st.status === 'zero' ? i.quantity <= 0
        : st.status === 'instock' ? i.quantity > 0 && i.status !== 'satildi'
        : i.status === st.status)) &&
      tokens.every((t) => i._s.includes(t)));
    const by = {
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
      name: (a, b) => a.name.localeCompare(b.name, 'tr'),
      qty: (a, b) => a.quantity - b.quantity,
      location: (a, b) => a.location.localeCompare(b.location, 'tr') || a.name.localeCompare(b.name, 'tr'),
      value: (a, b) => b.quantity * b.sale_price - a.quantity * a.sale_price,
    }[st.sort];
    return list.sort(by);
  };

  const rowHtml = (i) => {
    const low = i.min_quantity > 0 && i.quantity <= i.min_quantity;
    const meta = [i.category, [i.brand, i.model].filter(Boolean).join(' '), i.location && `📍 ${i.location}`].filter(Boolean).join(' · ');
    return html`<div class="row link" data-id="${i.id}" style="cursor:pointer">
      ${thumb(i)}
      <div class="grow">
        <div class="title">${i.name}</div>
        <div class="meta"><span class="mono">${i.sku}</span>${meta ? ' · ' + meta : ''}</div>
      </div>
      ${i.status !== 'stokta' ? html`<span class="hide-m">${badge(STATUS, i.status)}</span>` : ''}
      <div class="price">${i.sale_price ? fmtMoney(i.sale_price) : html`<span class="muted">—</span>`}${i.purchase_price ? html`<small>alış ${fmtMoney(i.purchase_price)}</small>` : ''}</div>
      <div class="qty">
        <button class="btn sm icon ghost" data-step="-1" aria-label="Bir azalt">${icon('minus')}</button>
        <div class="n ${low ? 'low' : i.quantity <= 0 ? 'zero' : ''}">${fmtNum(i.quantity)}<small>${i.unit}</small></div>
        <button class="btn sm icon ghost" data-step="1" aria-label="Bir artır">${icon('plus')}</button>
      </div>
    </div>`;
  };

  let current = [];
  const draw = () => {
    store_.set('inv', st);
    current = filtered();
    const active = st.q || st.kind || st.category || st.location || st.status;
    $('#info').innerHTML = String(html`<span>${fmtNum(current.length)} sonuç</span>${active ? html`<a href="#" id="clear" style="color:var(--accent);font-weight:600">Filtreleri temizle</a>` : ''}`);
    $('#results').innerHTML = String(current.length
      ? html`${current.slice(0, limit).map(rowHtml)}`
      : items.length ? empty('search', 'Eşleşen ürün yok') : empty('box', 'Henüz ürün eklenmedi', html`<a class="btn primary" href="#/urun/yeni">${icon('plus')} İlk ürünü ekle</a>`));
    $('#more').innerHTML = current.length > limit
      ? String(html`<div style="text-align:center;padding:16px"><button class="btn" id="more-btn">${fmtNum(current.length - limit)} ürün daha göster</button></div>`) : '';
    $('#clear')?.addEventListener('click', (e) => { e.preventDefault(); Object.assign(st, INV_DEFAULT, { sort: st.sort }); ctx.alive() && render(); store_.set('inv', st); });
    $('#more-btn')?.addEventListener('click', () => { limit += 300; draw(); });
    $$('#kind-chips .chip').forEach((c) => c.classList.toggle('on', c.dataset.kind === st.kind));
  };

  let t;
  $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; limit = 200; draw(); }, 90); });
  $('#kind-chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; st.kind = c.dataset.kind; draw(); });
  for (const [id, key] of [['f-category', 'category'], ['f-location', 'location'], ['f-status', 'status'], ['f-sort', 'sort']]) {
    $('#' + id).addEventListener('change', (e) => { st[key] = e.target.value; draw(); });
  }
  $('#print-labels').addEventListener('click', () => {
    if (!current.length) return toast('Yazdırılacak ürün yok', true);
    go('#/etiket?ids=' + current.slice(0, 300).map((i) => i.id).join(','));
  });
  $('#results').addEventListener('click', async (e) => {
    const row = e.target.closest('.row[data-id]');
    if (!row) return;
    const step = e.target.closest('[data-step]');
    const item = items.find((i) => i.id === Number(row.dataset.id));
    if (!step) return go('#/urun/' + item.id);
    const next = item.quantity + Number(step.dataset.step);
    if (next < 0) return;
    try {
      const up = await api(`/api/items/${item.id}/move`, { method: 'POST', body: { kind: 'duzeltme', qty: next, note: 'Hızlı düzeltme' } });
      Object.assign(item, { quantity: up.quantity, status: up.status, updated_at: up.updated_at });
      row.outerHTML = String(rowHtml(item));
    } catch (err) { fail(err); }
  });
  draw();
  if (matchMedia('(min-width: 821px)').matches) $('#q').focus();
}

// ============================================================ ürün detayı
async function viewItem(ctx) {
  const id = Number(ctx.params[0]);
  const it = await api('/api/items/' + id);
  const k = KIND[it.kind] || KIND.parca;
  const low = it.min_quantity > 0 && it.quantity <= it.min_quantity;
  const margin = it.sale_price && it.purchase_price ? it.sale_price - it.purchase_price : null;
  const kv = (label, value, full = false, pre = false) => value || value === 0
    ? html`<div class="${full ? 'full' : ''}"><dt>${label}</dt><dd class="${pre ? 'pre' : ''}">${value}</dd></div>` : '';

  if (!ctx.mount(html`
    <a class="back" href="#/envanter">${icon('back')} Envanter</a>
    <div class="page-head">
      <h1>${it.name}<div class="sub"><span class="mono">${it.sku}</span></div></h1>
      <div class="btn-row">
        <a class="btn" href="#/urun/${id}/duzenle">${icon('edit')} <span class="hide-m">Düzenle</span></a>
        <a class="btn icon" href="#/urun/yeni?copy=${id}" title="Kopyasını oluştur" aria-label="Kopyasını oluştur">${icon('copy')}</a>
        <a class="btn icon" href="#/etiket?ids=${id}" title="Etiket yazdır" aria-label="Etiket yazdır">${icon('printer')}</a>
        <button class="btn icon danger" id="del" title="Sil" aria-label="Sil">${icon('trash')}</button>
      </div>
    </div>
    <div class="detail">
      <div class="grid">
        <div class="hero-photo ${it.photo ? '' : 'none'}" id="photo" title="Fotoğrafı değiştir">${it.photo ? html`<img src="/uploads/${it.photo}" alt="${it.name}">` : html`<div style="text-align:center">${icon('camera')}<div class="small" style="margin-top:6px">Fotoğraf ekle</div></div>`}</div>
        <div class="card stock-box">
          <div class="badges">
            <span class="badge accent">${k.label}</span>${badge(STATUS, it.status)}${badge(CONDITION, it.condition)}
            ${low ? html`<span class="badge danger">Azalan stok</span>` : ''}
          </div>
          <div class="big" style="${low ? 'color:var(--danger)' : ''}">${fmtNum(it.quantity)}<small>${it.unit}</small></div>
          <div class="actions-grid">
            <button class="btn" data-move="giris">${icon('in')} Stok girişi</button>
            <button class="btn primary" data-move="satis" ${it.quantity <= 0 ? 'disabled' : ''}>${icon('tag')} Sat</button>
            <button class="btn" data-move="cikis" ${it.quantity <= 0 ? 'disabled' : ''}>${icon('out')} Çıkış</button>
            <button class="btn" data-move="duzeltme">${icon('count')} Sayım</button>
          </div>
        </div>
      </div>
      <div class="grid">
        <div class="card"><dl class="kv" style="margin:0">
          ${kv('Kategori', it.category)}
          ${kv('Marka / model', [it.brand, it.model].filter(Boolean).join(' '))}
          ${kv('Konum', it.location ? html`📍 ${it.location}` : '')}
          ${kv('Seri no', it.serial ? html`<span class="mono">${it.serial}</span>` : '')}
          ${kv('Alış fiyatı', it.purchase_price ? fmtMoney(it.purchase_price) : '')}
          ${kv('Satış fiyatı', it.sale_price ? fmtMoney(it.sale_price) : '')}
          ${margin != null ? kv('Birim kâr', html`<span style="color:var(${margin >= 0 ? '--ok' : '--danger'})">${fmtMoney(margin)}</span> <span class="muted small">(%${fmtNum(it.purchase_price ? margin / it.purchase_price * 100 : 0)})</span>`) : ''}
          ${kv('Stok değeri', it.quantity > 0 && it.purchase_price ? fmtMoney(it.quantity * it.purchase_price) : '')}
          ${kv('Min. stok uyarısı', it.min_quantity ? `${fmtNum(it.min_quantity)} ${it.unit}` : '')}
          ${kv('Nereden alındı', it.source)}
          ${it.parent ? kv('Bağlı olduğu drone', html`<a href="#/urun/${it.parent.id}" style="color:var(--accent);font-weight:600">${it.parent.name}</a> <span class="mono muted">${it.parent.sku}</span>`) : ''}
          ${kv('Uyumlu modeller', it.compatible, true)}
          ${kv('Notlar', it.notes, true, true)}
          <div><dt>Eklenme</dt><dd>${fmtDate(it.created_at)}</dd></div>
          <div><dt>Güncelleme</dt><dd>${fmtDate(it.updated_at)}</dd></div>
        </dl></div>
        ${it.kind === 'drone' || it.children.length ? html`<div class="card">
          <div class="card-head"><h2>Parçaları <span class="muted" style="font-weight:400">(takılı / sökülen)</span></h2>
            <a href="#/urun/yeni?parent=${id}&kind=parca">+ Parça ekle</a></div>
          <div class="list">${it.children.length ? it.children.map((c) => html`<a class="row" href="#/urun/${c.id}">${thumb(c)}
            <div class="grow"><div class="title">${c.name}</div><div class="meta"><span class="mono">${c.sku}</span>${c.category ? ' · ' + c.category : ''}${c.location ? ' · 📍 ' + c.location : ''}</div></div>
            <b>${fmtNum(c.quantity)}</b> <span class="muted small">${c.unit}</span></a>`)
            : empty('layers', 'Bu drondan söktüğün ya da üzerindeki parçaları buraya bağlayabilirsin.')}</div>
        </div>` : ''}
        <div class="card">
          <div class="card-head"><h2>Hareket geçmişi</h2></div>
          <div class="list">${it.movements.length ? it.movements.map((m) => mvRow(m, false)) : empty('history', 'Hareket yok')}</div>
        </div>
      </div>
    </div>`)) return;

  $$('[data-move]').forEach((b) => b.addEventListener('click', () => moveModal(it, b.dataset.move)));
  $('#photo').addEventListener('click', async () => {
    const dataUrl = await pickPhoto();
    if (!dataUrl) return;
    try { await api(`/api/items/${id}/photo`, { method: 'POST', body: { dataUrl } }); invalidate(); toast('Fotoğraf kaydedildi'); render(); }
    catch (e) { fail(e); }
  });
  $('#del').addEventListener('click', async () => {
    if (!(await confirmModal('Ürün silinsin mi?', `“${it.name}” kalıcı olarak silinecek. Geçmiş hareketler kayıtlarda kalır.`))) return;
    try { await api('/api/items/' + id, { method: 'DELETE' }); invalidate(); toast('Ürün silindi'); go('#/envanter'); }
    catch (e) { fail(e); }
  });
}

function moveModal(it, kind) {
  const cfg = {
    giris: { title: 'Stok girişi', qtyLabel: 'Gelen miktar', price: 'Birim alış fiyatı', priceVal: it.purchase_price, note: 'Nereden / açıklama', ok: 'Stoğa ekle' },
    satis: { title: 'Satış', qtyLabel: 'Satılan miktar', price: 'Birim satış fiyatı', priceVal: it.sale_price, note: 'Müşteri / platform (ör. Sahibinden)', ok: 'Satışı kaydet' },
    cikis: { title: 'Stoktan çıkış', qtyLabel: 'Çıkan miktar', note: 'Neden? (bozuldu, kayıp, kendi kullanımım…)', ok: 'Çıkışı kaydet' },
    duzeltme: { title: 'Sayım', qtyLabel: 'Sayılan gerçek miktar', note: 'Açıklama', ok: 'Güncelle' },
  }[kind];
  const startQty = kind === 'duzeltme' ? it.quantity : 1;
  const m = openModal({
    title: cfg.title,
    body: html`<div class="small muted">${it.name} · stokta <b>${fmtNum(it.quantity)} ${it.unit}</b></div>
      <form id="mv" class="form" style="gap:14px">
        <label class="field"><span>${cfg.qtyLabel}</span>
          <div class="stepper"><button type="button" data-d="-1" aria-label="Azalt">−</button>
          <input type="text" inputmode="decimal" name="qty" value="${fmtNum(startQty)}" required>
          <button type="button" data-d="1" aria-label="Artır">+</button></div></label>
        ${cfg.price ? html`<label class="field"><span>${cfg.price} <em>(₺)</em></span><input type="text" inputmode="decimal" name="unit_price" value="${cfg.priceVal ? fmtNum(cfg.priceVal) : ''}" placeholder="0"></label>` : ''}
        <label class="field"><span>${cfg.note} <em>(isteğe bağlı)</em></span><input type="text" name="note"></label>
        ${kind === 'satis' ? html`<div class="note-box" id="sum"></div>` : ''}
      </form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" form="mv">${cfg.ok}</button>`,
  });
  const f = $('#mv', m.el);
  const sum = () => {
    if (!$('#sum', m.el)) return;
    const q = parseNum(f.qty.value), p = parseNum(f.unit_price.value);
    const profit = (p - it.purchase_price) * q;
    $('#sum', m.el).innerHTML = String(html`Toplam: <b>${fmtMoney(q * p)}</b>${it.purchase_price ? html` · Kâr: <b style="color:var(${profit >= 0 ? '--ok' : '--danger'})">${fmtMoney(profit)}</b>` : ''}`);
  };
  sum();
  f.addEventListener('input', sum);
  $$('[data-d]', f).forEach((b) => b.addEventListener('click', () => { f.qty.value = fmtNum(Math.max(0, parseNum(f.qty.value) + Number(b.dataset.d))); sum(); }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/items/${it.id}/move`, { method: 'POST', body: { kind, qty: parseNum(f.qty.value), unit_price: f.unit_price ? parseNum(f.unit_price.value) : 0, note: f.note.value } });
      m.close(); invalidate(); toast(MOVE[kind].label + ' kaydedildi'); render();
    } catch (err) { fail(err); }
  });
}

// ============================================================ ürün formu
async function viewItemForm(ctx) {
  const id = ctx.params[0] ? Number(ctx.params[0]) : null;
  const q = ctx.query;
  const items = await getItems();
  let it;
  if (id) it = await api('/api/items/' + id);
  else if (q.get('copy')) {
    const src = await api('/api/items/' + q.get('copy'));
    it = { ...src, id: null, sku: '', serial: '', photo: '', name: src.name + ' (kopya)' };
  } else {
    const last = store_.get('last-item', {});
    it = {
      kind: q.get('kind') || last.kind || 'parca', name: '', category: q.get('category') ?? last.category ?? '',
      brand: last.brand || '', model: '', compatible: last.compatible || '', serial: '', condition: 'yeni', status: 'stokta',
      quantity: 1, unit: 'adet', min_quantity: 0, location: q.get('location') ?? last.location ?? '',
      purchase_price: 0, sale_price: 0, source: '', parent_id: q.get('parent') ? Number(q.get('parent')) : null, notes: '', photo: '',
    };
    if (q.get('kind') === 'drone') Object.assign(it, { category: 'Drone', compatible: '', parent_id: null });
  }
  const uniq = (key, extra = []) => [...new Set([...extra, ...items.map((i) => i[key]).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'tr'));
  const drones = items.filter((i) => i.kind === 'drone' && i.id !== id);
  const models = uniq('model', items.filter((i) => i.kind === 'drone').map((i) => [i.brand, i.model].filter(Boolean).join(' ')));
  let photo = null; // yeni seçilen fotoğraf (dataURL) | 'remove'
  const num = (n) => (n ? fmtNum(n) : '');

  if (!ctx.mount(html`
    <a class="back" href="${id ? '#/urun/' + id : '#/envanter'}">${icon('back')} ${id ? 'Ürüne dön' : 'Envanter'}</a>
    <div class="page-head"><h1>${id ? 'Ürünü düzenle' : 'Yeni ürün'}${id ? html`<div class="sub mono">${it.sku}</div>` : ''}</h1></div>
    <form class="form" id="item-form" autocomplete="off">
      <div class="card form-section">
        <h3>Ne ekliyorsun?</h3>
        <div class="seg" role="radiogroup" aria-label="Tür">
          ${Object.entries(KIND).map(([k, v]) => html`<label><input type="radio" name="kind" value="${k}" ${it.kind === k ? 'checked' : ''}><span>${icon(v.icon)} ${v.label}</span></label>`)}
        </div>
        <div class="fields" style="margin-top:14px">
          <label class="field full"><span>Ürün adı</span><input type="text" name="name" value="${it.name}" required placeholder="ör. Mavic 3 sol ön motor, 2306 2450KV motor, M2 vida"></label>
          <label class="field"><span>Kategori</span><input type="text" name="category" value="${it.category}" list="dl-cat" placeholder="Seç ya da yaz"></label>
          <label class="field"><span>Marka</span><input type="text" name="brand" value="${it.brand}" list="dl-brand"></label>
          <label class="field"><span>Model / parça no</span><input type="text" name="model" value="${it.model}"></label>
          <label class="field"><span>Seri no</span><input type="text" name="serial" value="${it.serial}" class="mono"></label>
          <label class="field full"><span>Uyumlu modeller <em>(virgülle ayır)</em></span><input type="text" name="compatible" value="${it.compatible}" list="dl-model" placeholder="ör. Mavic 3, Mavic 3 Classic"></label>
        </div>
      </div>

      <div class="card form-section">
        <h3>Stok & konum</h3>
        <div class="fields three">
          <label class="field"><span>Miktar</span>
            <div class="stepper"><button type="button" data-step="-1" aria-label="Azalt">−</button><input type="text" inputmode="decimal" name="quantity" value="${fmtNum(it.quantity)}"><button type="button" data-step="1" aria-label="Artır">+</button></div></label>
          <label class="field"><span>Birim</span><input type="text" name="unit" value="${it.unit}" list="dl-unit"></label>
          <label class="field full-m"><span>Min. stok <em>(uyarı)</em></span><input type="text" inputmode="decimal" name="min_quantity" value="${num(it.min_quantity)}" placeholder="0 = uyarı yok"></label>
          <label class="field full"><span>Konum <em>(raf, kutu, çekmece…)</em></span><input type="text" name="location" value="${it.location}" list="dl-loc" placeholder="ör. Raf A / Kutu 3"></label>
          <label class="field"><span>Durum</span><select name="condition">${options(CONDITION, it.condition)}</select></label>
          <label class="field"><span>Statü</span><select name="status">${options(STATUS, it.status)}</select></label>
          <label class="field full-m"><span>Bağlı drone</span><select name="parent_id"><option value="">— Yok —</option>
            ${drones.map((d) => html`<option value="${d.id}" ${d.id === it.parent_id ? 'selected' : ''}>${d.name} (${d.sku})</option>`)}</select></label>
        </div>
      </div>

      <div class="card form-section">
        <h3>Fiyat</h3>
        <div class="fields three">
          <label class="field"><span>Alış fiyatı <em>(₺, birim)</em></span><input type="text" inputmode="decimal" name="purchase_price" value="${num(it.purchase_price)}" placeholder="0"></label>
          <label class="field"><span>Satış fiyatı <em>(₺, birim)</em></span><input type="text" inputmode="decimal" name="sale_price" value="${num(it.sale_price)}" placeholder="0"></label>
          <label class="field full-m"><span>Nereden alındı</span><input type="text" name="source" value="${it.source}" list="dl-source" placeholder="ör. AliExpress, Ahmet'ten"></label>
        </div>
      </div>

      <div class="card form-section">
        <h3>Fotoğraf & not</h3>
        <div class="photo-drop">
          <div class="preview" id="pv">${it.photo ? html`<img src="/uploads/${it.photo}" alt="">` : icon('camera')}</div>
          <div class="btn-row"><button type="button" class="btn" id="pick">${icon('camera')} ${it.photo ? 'Değiştir' : 'Fotoğraf çek / seç'}</button>
          ${it.photo && id ? html`<button type="button" class="btn ghost danger" id="rm-photo">Kaldır</button>` : ''}</div>
        </div>
        <label class="field" style="margin-top:14px"><span>Notlar</span><textarea name="notes" placeholder="Arıza, eksik, test sonucu, ilan linki…">${it.notes}</textarea></label>
      </div>

      <div class="form-actions">
        <a class="btn hide-m" href="${id ? '#/urun/' + id : '#/envanter'}">Vazgeç</a>
        ${!id ? html`<button type="submit" class="btn" data-again="1">${icon('plus')} Kaydet, yenisi</button>` : ''}
        <button type="submit" class="btn primary">${icon('save')} Kaydet</button>
      </div>
    </form>
    <datalist id="dl-cat">${uniq('category', DEFAULT_CATEGORIES).map((c) => html`<option value="${c}">`)}</datalist>
    <datalist id="dl-brand">${uniq('brand', DEFAULT_BRANDS).map((c) => html`<option value="${c}">`)}</datalist>
    <datalist id="dl-loc">${uniq('location').map((c) => html`<option value="${c}">`)}</datalist>
    <datalist id="dl-model">${models.map((c) => html`<option value="${c}">`)}</datalist>
    <datalist id="dl-source">${uniq('source', ['AliExpress', 'Trendyol', 'Hepsiburada', 'Sahibinden', 'Amazon']).map((c) => html`<option value="${c}">`)}</datalist>
    <datalist id="dl-unit">${['adet', 'set', 'paket', 'çift', 'metre', 'gram', 'rulo'].map((c) => html`<option value="${c}">`)}</datalist>`)) return;

  const f = $('#item-form');
  if (!id) f.name.focus();
  $$('[data-step]', f).forEach((b) => b.addEventListener('click', () => { f.quantity.value = fmtNum(Math.max(0, parseNum(f.quantity.value) + Number(b.dataset.step))); }));
  f.addEventListener('change', (e) => {
    if (e.target.name === 'kind' && e.target.value === 'drone') {
      if (!f.category.value) f.category.value = 'Drone';
      if (parseNum(f.quantity.value) === 0) f.quantity.value = '1';
    }
  });
  $('#pick').addEventListener('click', async () => {
    const d = await pickPhoto();
    if (!d) return;
    photo = d;
    $('#pv').innerHTML = `<img src="${d}" alt="">`;
  });
  $('#rm-photo')?.addEventListener('click', () => { photo = 'remove'; $('#pv').innerHTML = String(icon('camera')); });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const again = e.submitter?.dataset.again;
    const body = {
      kind: f.kind.value, name: f.name.value, category: f.category.value, brand: f.brand.value, model: f.model.value,
      serial: f.serial.value, compatible: f.compatible.value, quantity: parseNum(f.quantity.value), unit: f.unit.value || 'adet',
      min_quantity: parseNum(f.min_quantity.value), location: f.location.value, condition: f.condition.value,
      status: f.status.value, parent_id: f.parent_id.value || null, purchase_price: parseNum(f.purchase_price.value),
      sale_price: parseNum(f.sale_price.value), source: f.source.value, notes: f.notes.value,
    };
    $$('button', f).forEach((b) => (b.disabled = true));
    try {
      const saved = id ? await api('/api/items/' + id, { method: 'PUT', body }) : await api('/api/items', { method: 'POST', body });
      if (photo === 'remove') await api(`/api/items/${saved.id}/photo`, { method: 'POST', body: { remove: true } });
      else if (photo) await api(`/api/items/${saved.id}/photo`, { method: 'POST', body: { dataUrl: photo } });
      invalidate();
      if (!id) store_.set('last-item', { kind: body.kind, category: body.category, location: body.location, brand: body.brand, compatible: body.compatible });
      if (again) {
        toast(`“${saved.name}” eklendi · ${saved.sku}`);
        const p = new URLSearchParams({ kind: body.kind, category: body.category, location: body.location });
        if (body.parent_id) p.set('parent', body.parent_id);
        go('#/urun/yeni?' + p);
        window.scrollTo(0, 0);
      } else {
        toast(id ? 'Değişiklikler kaydedildi' : `Eklendi · ${saved.sku}`);
        go('#/urun/' + saved.id);
      }
    } catch (err) { fail(err); $$('button', f).forEach((b) => (b.disabled = false)); }
  });
}

// ============================================================ tamirler
async function viewRepairs(ctx) {
  const st = { tab: 'aktif', q: '', ...store_.get('rep', {}) };
  const list = await api('/api/repairs');
  const total = (r) => r.fee + r.parts_total;
  const TABS = [
    ['aktif', 'Aktif', (r) => !['teslim', 'iptal', 'hazir'].includes(r.status)],
    ['hazir', 'Hazır', (r) => r.status === 'hazir'],
    ['teslim', 'Teslim edilen', (r) => r.status === 'teslim'],
    ['hepsi', 'Tümü', () => true],
  ];
  if (!ctx.mount(html`
    <div class="page-head"><h1>Tamir işleri<div class="sub">${list.length} kayıt</div></h1>
      <a class="btn primary hide-m" href="#/tamir/yeni">${icon('plus')} Yeni tamir</a></div>
    <div class="toolbar">
      <label class="search">${icon('search')}<input type="search" id="q" placeholder="Müşteri, telefon, cihaz, kod ara…" value="${st.q}" aria-label="Ara"></label>
      <div class="chips" id="tabs">${TABS.map(([k, l, fn]) => html`<button class="chip ${st.tab === k ? 'on' : ''}" data-tab="${k}">${l} <span class="count">${list.filter(fn).length}</span></button>`)}</div>
    </div>
    <div class="card"><div class="list" id="results"></div></div>`)) return;

  const draw = () => {
    store_.set('rep', st);
    const fn = TABS.find((t) => t[0] === st.tab)[2];
    const tokens = norm(st.q).split(/\s+/).filter(Boolean);
    const rows = list.filter(fn).filter((r) => { const s = norm([r.code, r.customer, r.phone, r.device, r.serial, r.problem].join(' ')); return tokens.every((t) => s.includes(t)); });
    $('#results').innerHTML = String(rows.length ? html`${rows.map((r) => html`<a class="row" href="#/tamir/${r.id}">
      <div class="thumb">${icon('wrench')}</div>
      <div class="grow"><div class="title">${r.device || 'Cihaz belirtilmedi'} <span class="muted" style="font-weight:400">· ${r.customer || '—'}</span></div>
        <div class="meta"><span class="mono">${r.code}</span> · ${fmtDate(r.received_at, false)}${r.problem ? ' · ' + r.problem : ''}</div></div>
      <div class="price hide-m">${fmtMoney(total(r))}${r.paid ? html`<small style="color:var(--ok)">ödendi</small>` : ''}</div>
      ${badge(REPAIR_STATUS, r.status)}</a>`)}`
      : list.length ? empty('search', 'Bu listede kayıt yok') : empty('wrench', 'Henüz tamir kaydı yok', html`<a class="btn primary" href="#/tamir/yeni">${icon('plus')} İlk tamir kaydı</a>`));
    $$('#tabs .chip').forEach((c) => c.classList.toggle('on', c.dataset.tab === st.tab));
  };
  $('#tabs').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { st.tab = c.dataset.tab; draw(); } });
  $('#q').addEventListener('input', (e) => { st.q = e.target.value; draw(); });
  draw();
}

async function viewRepairForm(ctx) {
  const id = ctx.params[0] ? Number(ctx.params[0]) : null;
  const r = id ? await api('/api/repairs/' + id) : {
    customer: '', phone: '', device: '', serial: '', problem: '', diagnosis: '', status: 'bekliyor',
    fee: 0, deposit: 0, paid: 0, notes: '', received_at: today(), delivered_at: '',
  };
  const items = await getItems();
  const devices = [...new Set(items.filter((i) => i.kind === 'drone').map((i) => [i.brand, i.model].filter(Boolean).join(' ') || i.name))];
  const num = (n) => (n ? fmtNum(n) : '');
  if (!ctx.mount(html`
    <a class="back" href="${id ? '#/tamir/' + id : '#/tamir'}">${icon('back')} ${id ? 'Kayda dön' : 'Tamir işleri'}</a>
    <div class="page-head"><h1>${id ? 'Tamir kaydını düzenle' : 'Yeni tamir kaydı'}${id ? html`<div class="sub mono">${r.code}</div>` : ''}</h1></div>
    <form class="form" id="rf" autocomplete="off">
      <div class="card form-section"><h3>Müşteri & cihaz</h3>
        <div class="fields">
          <label class="field"><span>Müşteri adı</span><input type="text" name="customer" value="${r.customer}"></label>
          <label class="field"><span>Telefon</span><input type="tel" name="phone" value="${r.phone}" placeholder="05xx xxx xx xx"></label>
          <label class="field"><span>Cihaz</span><input type="text" name="device" value="${r.device}" list="dl-dev" placeholder="ör. DJI Mini 3 Pro"></label>
          <label class="field"><span>Seri no</span><input type="text" name="serial" value="${r.serial}" class="mono"></label>
          <label class="field full"><span>Müşterinin şikâyeti</span><textarea name="problem" placeholder="ör. Düşürüldü, gimbal titriyor, kol kırık">${r.problem}</textarea></label>
          <label class="field full"><span>Tespit / yapılan işlem</span><textarea name="diagnosis">${r.diagnosis}</textarea></label>
        </div></div>
      <div class="card form-section"><h3>Durum & ücret</h3>
        <div class="fields three">
          <label class="field"><span>Durum</span><select name="status">${options(REPAIR_STATUS, r.status)}</select></label>
          <label class="field"><span>Geliş tarihi</span><input type="date" name="received_at" value="${r.received_at}"></label>
          <label class="field full-m"><span>Teslim tarihi</span><input type="date" name="delivered_at" value="${r.delivered_at}"></label>
          <label class="field"><span>İşçilik ücreti <em>(₺)</em></span><input type="text" inputmode="decimal" name="fee" value="${num(r.fee)}" placeholder="0"></label>
          <label class="field"><span>Alınan kapora <em>(₺)</em></span><input type="text" inputmode="decimal" name="deposit" value="${num(r.deposit)}" placeholder="0"></label>
          <label class="field full-m" style="justify-content:flex-end"><span></span><label style="display:flex;gap:8px;align-items:center;height:42px;font-weight:600"><input type="checkbox" name="paid" ${r.paid ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)"> Ödeme tamamlandı</label></label>
          <label class="field full"><span>Notlar</span><textarea name="notes" placeholder="Aksesuarlar (kumanda, batarya sayısı), fiziksel hasar notları…">${r.notes}</textarea></label>
        </div>
        <p class="small muted" style="margin:12px 0 0">Kullanılan parçaları kaydettikten sonra tamir sayfasından ekleyebilirsin — stoktan otomatik düşer.</p>
      </div>
      <div class="form-actions"><a class="btn hide-m" href="${id ? '#/tamir/' + id : '#/tamir'}">Vazgeç</a><button class="btn primary">${icon('save')} Kaydet</button></div>
    </form>
    <datalist id="dl-dev">${devices.map((d) => html`<option value="${d}">`)}</datalist>`)) return;

  const f = $('#rf');
  if (!id) f.customer.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      customer: f.customer.value, phone: f.phone.value, device: f.device.value, serial: f.serial.value,
      problem: f.problem.value, diagnosis: f.diagnosis.value, status: f.status.value, received_at: f.received_at.value,
      delivered_at: f.delivered_at.value, fee: parseNum(f.fee.value), deposit: parseNum(f.deposit.value), paid: f.paid.checked, notes: f.notes.value,
    };
    try {
      const saved = id ? await api('/api/repairs/' + id, { method: 'PUT', body }) : await api('/api/repairs', { method: 'POST', body });
      toast(id ? 'Kaydedildi' : `Tamir kaydı açıldı · ${saved.code}`);
      go('#/tamir/' + saved.id);
    } catch (err) { fail(err); }
  });
}

function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

async function viewRepair(ctx) {
  const id = Number(ctx.params[0]);
  const r = await api('/api/repairs/' + id);
  const partsTotal = r.parts.reduce((s, p) => s + p.qty * p.unit_price, 0);
  const partsCost = r.parts.reduce((s, p) => s + p.qty * p.unit_cost, 0);
  const total = r.fee + partsTotal;
  const remaining = total - r.deposit;
  const wa = waLink(r.phone, `Merhaba ${r.customer || ''}, ${r.device || 'cihazınızın'} tamiri tamamlandı. Toplam ücret: ${fmtMoney(total)}${r.deposit ? `, kalan: ${fmtMoney(remaining)}` : ''}. (${r.code})`);
  const kv = (label, value, full = false) => value ? html`<div class="${full ? 'full' : ''}"><dt>${label}</dt><dd class="pre">${value}</dd></div>` : '';

  if (!ctx.mount(html`
    <a class="back" href="#/tamir">${icon('back')} Tamir işleri</a>
    <div class="page-head">
      <h1>${r.device || 'Tamir kaydı'}<div class="sub"><span class="mono">${r.code}</span> · ${r.customer || 'Müşteri belirtilmedi'}</div></h1>
      <div class="btn-row">
        <a class="btn" href="#/tamir/${id}/duzenle">${icon('edit')} <span class="hide-m">Düzenle</span></a>
        <button class="btn icon danger" id="del" aria-label="Sil" title="Sil">${icon('trash')}</button>
      </div>
    </div>
    <div class="detail">
      <div class="grid">
        <div class="card stock-box">
          <label class="field"><span>Durum</span><select id="status">${options(REPAIR_STATUS, r.status)}</select></label>
          <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="paid" ${r.paid ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)"> Ödeme tamamlandı</label>
          <div class="btn-row">
            ${r.phone ? html`<a class="btn" href="tel:${r.phone}">${icon('phone')} Ara</a>` : ''}
            ${wa ? html`<a class="btn" href="${wa}" target="_blank" rel="noopener">${icon('chat')} WhatsApp</a>` : ''}
          </div>
        </div>
        <div class="card">
          <div class="total-line" style="border-top:0"><span>İşçilik</span><span>${fmtMoney(r.fee)}</span></div>
          <div class="total-line"><span>Parçalar</span><span>${fmtMoney(partsTotal)}</span></div>
          <div class="total-line grand"><span>Toplam</span><span>${fmtMoney(total)}</span></div>
          ${r.deposit ? html`<div class="total-line"><span>Kapora</span><span>− ${fmtMoney(r.deposit)}</span></div>
            <div class="total-line grand"><span>Kalan</span><span style="color:var(${r.paid ? '--ok' : '--accent'})">${r.paid ? 'Ödendi' : fmtMoney(remaining)}</span></div>` : ''}
          <div class="total-line small muted"><span>Parça maliyeti · Kâr</span><span>${fmtMoney(partsCost)} · <b style="color:var(--ok)">${fmtMoney(total - partsCost)}</b></span></div>
        </div>
      </div>
      <div class="grid">
        <div class="card"><dl class="kv" style="margin:0">
          ${kv('Müşteri', r.customer)}${kv('Telefon', r.phone)}
          ${kv('Seri no', r.serial)}${kv('Geliş', fmtDate(r.received_at, false))}
          ${kv('Teslim', fmtDate(r.delivered_at, false))}
          ${kv('Şikâyet', r.problem, true)}${kv('Tespit / yapılan işlem', r.diagnosis, true)}${kv('Notlar', r.notes, true)}
        </dl></div>
        <div class="card">
          <div class="card-head"><h2>Kullanılan parçalar</h2><button class="btn sm primary" id="add-part">${icon('plus')} Stoktan parça ekle</button></div>
          <div class="list">${r.parts.length ? r.parts.map((p) => html`<div class="row">
            <div class="grow"><div class="title">${p.item_id ? html`<a href="#/urun/${p.item_id}">${p.item_name}</a>` : p.item_name}</div>
              <div class="meta">${p.sku ? html`<span class="mono">${p.sku}</span> · ` : ''}${fmtNum(p.qty)} × ${fmtMoney(p.unit_price)}</div></div>
            <b class="nowrap">${fmtMoney(p.qty * p.unit_price)}</b>
            <button class="btn sm icon ghost danger" data-rm="${p.id}" aria-label="Kaldır ve stoğa iade et" title="Kaldır (stoğa geri döner)">${icon('x')}</button></div>`)
            : empty('part', 'Henüz parça eklenmedi. Eklenen parça stoktan düşer, kaldırılırsa geri döner.')}</div>
        </div>
      </div>
    </div>`)) return;

  const put = async (body, msg) => {
    try { await api('/api/repairs/' + id, { method: 'PUT', body }); toast(msg); render(); } catch (e) { fail(e); }
  };
  $('#status').addEventListener('change', (e) => put({ status: e.target.value }, 'Durum: ' + REPAIR_STATUS[e.target.value].label));
  $('#paid').addEventListener('change', (e) => put({ paid: e.target.checked }, e.target.checked ? 'Ödendi olarak işaretlendi' : 'Ödeme bekleniyor'));
  $('#add-part').addEventListener('click', () => partPicker(r));
  $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/api/repairs/${id}/parts/${b.dataset.rm}`, { method: 'DELETE' }); invalidate(); toast('Parça kaldırıldı, stoğa iade edildi'); render(); }
    catch (e) { fail(e); }
  }));
  $('#del').addEventListener('click', async () => {
    if (!(await confirmModal('Tamir kaydı silinsin mi?', `${r.code} silinecek. Kullanılan parçalar stoğa geri eklenir.`))) return;
    try { await api('/api/repairs/' + id, { method: 'DELETE' }); invalidate(); toast('Tamir kaydı silindi'); go('#/tamir'); }
    catch (e) { fail(e); }
  });
}

async function partPicker(repair) {
  if ($('#pl')) return;
  const items = (await getItems(true)).filter((i) => i.quantity > 0 && i.kind !== 'drone');
  let selected = null;
  const m = openModal({
    title: 'Stoktan parça ekle', wide: true,
    body: html`<label class="search">${icon('search')}<input type="search" id="pq" placeholder="Parça ara (ad, kod, uyumlu model)…" value="${repair.device}"></label>
      <div class="picker-list" id="pl"></div>
      <form id="pf" class="fields" style="grid-template-columns:1fr 1fr">
        <label class="field"><span>Miktar</span><input type="text" inputmode="decimal" name="qty" value="1"></label>
        <label class="field"><span>Müşteriye birim fiyat <em>(₺)</em></span><input type="text" inputmode="decimal" name="unit_price" placeholder="Satış fiyatı"></label>
      </form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" form="pf" id="pok" disabled>Ekle</button>`,
  });
  const pq = $('#pq', m.el), pl = $('#pl', m.el), f = $('#pf', m.el);
  const draw = () => {
    const tokens = norm(pq.value).split(/\s+/).filter(Boolean);
    // Önce tüm kelimeleri eşleşenler; hiç yoksa herhangi birini eşleşenler
    let list = items.filter((i) => tokens.every((t) => i._s.includes(t)));
    if (!list.length && tokens.length) list = items.filter((i) => tokens.some((t) => i._s.includes(t)));
    pl.innerHTML = String(list.length ? html`${list.slice(0, 80).map((i) => html`<div class="row ${selected?.id === i.id ? 'sel' : ''}" data-id="${i.id}">
      ${thumb(i, 36)}<div class="grow"><div class="title">${i.name}</div><div class="meta"><span class="mono">${i.sku}</span>${i.location ? ' · 📍 ' + i.location : ''}${i.compatible ? ' · ' + i.compatible : ''}</div></div>
      <div class="right nowrap"><b>${fmtNum(i.quantity)}</b> <span class="muted small">${i.unit}</span>${i.sale_price ? html`<div class="small muted">${fmtMoney(i.sale_price)}</div>` : ''}</div></div>`)}`
      : empty('search', 'Stokta eşleşen parça yok'));
  };
  pq.addEventListener('input', draw);
  pl.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    selected = items.find((i) => i.id === Number(row.dataset.id));
    f.unit_price.value = selected.sale_price ? fmtNum(selected.sale_price) : '';
    $('#pok', m.el).disabled = false;
    draw();
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await api(`/api/repairs/${repair.id}/parts`, { method: 'POST', body: { item_id: selected.id, qty: parseNum(f.qty.value), unit_price: f.unit_price.value === '' ? '' : parseNum(f.unit_price.value) } });
      m.close(); invalidate(); toast(`${selected.name} eklendi, stoktan düşüldü`); render();
    } catch (err) { fail(err); }
  });
  draw();
  pq.select();
}

// ============================================================ hareketler
async function viewMovements(ctx) {
  const kind = ctx.query.get('kind') || '';
  const list = await api('/api/movements?limit=1000' + (kind ? '&kind=' + kind : ''));
  const sales = list.filter((m) => m.kind === 'satis');
  const revenue = sales.reduce((s, m) => s + -m.qty * m.unit_price, 0);
  const profit = sales.reduce((s, m) => s + -m.qty * (m.unit_price - m.unit_cost), 0);
  // güne göre grupla
  const groups = [];
  for (const m of list) {
    const day = localDay(new Date(m.created_at));
    if (groups.at(-1)?.day !== day) groups.push({ day, rows: [] });
    groups.at(-1).rows.push(m);
  }
  ctx.mount(html`
    <div class="page-head"><h1>Hareketler<div class="sub">Son ${list.length} stok hareketi</div></h1></div>
    <div class="chips" style="padding-top:0;margin-bottom:12px">
      ${[['', 'Tümü'], ...Object.entries(MOVE).map(([k, v]) => [k, v.label])].map(([k, l]) => html`<a class="chip ${kind === k ? 'on' : ''}" href="#/hareketler${k ? '?kind=' + k : ''}">${l}</a>`)}
    </div>
    ${kind === 'satis' && sales.length ? html`<div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="card stat accent"><div class="label">Listelenen satış cirosu</div><div class="value">${fmtMoney(revenue)}</div></div>
      <div class="card stat"><div class="label">Kâr</div><div class="value" style="color:var(--ok)">${fmtMoney(profit)}</div></div></div>` : ''}
    ${groups.length ? groups.map((g) => html`<div class="small muted" style="font-weight:600;margin:14px 2px 8px">${fmtDate(g.day, false)}</div>
      <div class="card"><div class="list">${g.rows.map((m) => mvRow(m))}</div></div>`) : html`<div class="card">${empty('history', 'Hareket yok')}</div>`}`);
}

// ============================================================ ayarlar
async function viewSettings(ctx) {
  const info = await api('/api/info');
  const theme = document.documentElement.dataset.theme || 'auto';
  if (!ctx.mount(html`
    <div class="page-head"><h1>Ayarlar</h1></div>
    <div class="grid" style="max-width:720px">
      <div class="card form-section"><h3>Görünüm</h3>
        <div class="seg" id="theme">${[['auto', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']].map(([k, l]) =>
          html`<label><input type="radio" name="theme" value="${k}" ${theme === k ? 'checked' : ''}><span>${l}</span></label>`)}</div>
      </div>
      <div class="card form-section"><h3>Telefondan erişim</h3>
        <p style="margin:0 0 10px">Telefon bu bilgisayarla aynı Wi-Fi ağındaysa tarayıcıya şu adresi yaz:</p>
        ${info.lan.length ? info.lan.map((u) => html`<div class="note-box mono" style="font-size:16px;margin-bottom:6px">${u}</div>`) : html`<div class="note-box">Ağ bağlantısı bulunamadı.</div>`}
        <p class="small muted" style="margin:10px 0 0">İpucu: Telefonda tarayıcı menüsünden “Ana ekrana ekle” dersen uygulama gibi açılır.
          ${info.pin ? 'PIN koruması açık.' : 'Başkalarının erişmesini istemiyorsan start.bat içindeki ROY_PIN satırını düzenleyerek PIN koyabilirsin.'}</p>
      </div>
      <div class="card form-section"><h3>Yedekleme</h3>
        <p style="margin:0 0 12px">Veritabanı her gün otomatik yedeklenir (son 30 gün). Yine de ara ara dosyayı bir flash belleğe / Drive'a kopyalamak iyi fikir.</p>
        <div class="btn-row">
          <a class="btn primary" href="/api/export.json" download>${icon('download')} Yedek indir (JSON)</a>
          <a class="btn" href="/api/export.csv" download>${icon('download')} Excel için (CSV)</a>
          <button class="btn" id="backup-now">${icon('save')} Şimdi yedekle</button>
          <button class="btn danger" id="import">${icon('upload')} Yedekten geri yükle</button>
        </div>
        <p class="small muted" style="margin:12px 0 0">Veri klasörü: <span class="mono">${info.data}</span> — fotoğraflar <span class="mono">uploads</span>, günlük yedekler <span class="mono">backups</span> içinde.</p>
      </div>
    </div>`)) return;

  $('#theme').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    try { v === 'auto' ? localStorage.removeItem('roy-theme') : localStorage.setItem('roy-theme', v); } catch {}
  });
  $('#backup-now').addEventListener('click', async () => {
    try { await api('/api/backup', { method: 'POST' }); toast('Yedek alındı'); } catch (e) { fail(e); }
  });
  $('#import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); } catch { return toast('Dosya okunamadı', true); }
      if (!(await confirmModal('Yedekten geri yüklensin mi?', `Mevcut tüm kayıtlar silinip “${file.name}” içindeki ${data.items?.length ?? 0} ürün yüklenecek. (Önce otomatik yedek alınır.)`, 'Geri yükle'))) return;
      try { const r = await api('/api/import', { method: 'POST', body: data }); invalidate(); toast(`${r.items} ürün yüklendi`); go('#/'); }
      catch (e) { fail(e); }
    };
    input.click();
  });
}

// ============================================================ etiket
async function viewLabels(ctx) {
  const ids = new Set((ctx.query.get('ids') || '').split(',').map(Number).filter(Boolean));
  const items = (await getItems()).filter((i) => ids.has(i.id));
  ctx.mount(html`
    <div class="no-print">
      <a class="back" href="javascript:history.back()">${icon('back')} Geri</a>
      <div class="page-head"><h1>Etiket yazdır<div class="sub">${items.length} etiket · 62×29 mm (etiket yazıcısı ya da A4'e kesip yapıştır)</div></h1>
        <button class="btn primary" onclick="print()">${icon('printer')} Yazdır</button></div>
    </div>
    <div class="labels">${items.map((i) => html`<div class="label-card">
      <div class="l-name">${i.name}</div>
      <div class="l-sku">${i.sku}</div>
      <div class="l-meta"><span>${i.location}</span><span>${i.sale_price ? fmtMoney(i.sale_price) : ''}</span></div>
    </div>`)}</div>`);
}

// ============================================================ başlat
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    const q = $('#q');
    if (q) { e.preventDefault(); q.focus(); } else { e.preventDefault(); go('#/envanter'); }
  }
});
render();
