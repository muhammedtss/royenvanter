// Vercel sunucusuz fonksiyonu — /api/* ve /uploads/* istekleri buraya yönlendirilir (vercel.json).
// Gerekli ortam değişkenleri: DATABASE_URL (Neon), BLOB_READ_WRITE_TOKEN (Vercel Blob), ROY_PIN, CRON_SECRET.
import { openDb } from '../lib/db.js';
import { createStorage } from '../lib/storage.js';
import { createApp, send } from '../lib/app.js';

let ready; // soğuk başlangıçta bir kez kurulur, sıcak çağrılarda yeniden kullanılır

async function init() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('Veritabanı bağlı değil: Vercel → Storage → Neon (Postgres) ekleyin.');
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    throw new Error('Fotoğraf deposu bağlı değil: Vercel → Storage → Blob ekleyin.');
  }
  const db = await openDb();
  const storage = await createStorage();
  return createApp({ db, storage, mode: 'vercel' });
}

// Yeniden yazma sonrası URL hedef (/api/index?__route=…) olarak gelirse orijinal yolu geri kur
function restoreUrl(req) {
  const u = new URL(req.url, 'http://x');
  const route = u.searchParams.get('__route');
  u.searchParams.delete('__route');
  const pathname = u.pathname === '/api/index' || u.pathname === '/api' ? (route ? '/' + route : u.pathname) : u.pathname;
  req.url = pathname + (u.searchParams.size ? '?' + u.searchParams : '');
}

export default async function handler(req, res) {
  try {
    restoreUrl(req);
    ready ??= init().catch((e) => { ready = undefined; throw e; });
    const handle = await ready;
    if (!(await handle(req, res))) send(res, 404, { error: 'Bulunamadı' });
  } catch (e) {
    console.error(e);
    send(res, 503, { error: e.message, setup: true });
  }
}
