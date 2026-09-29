// Roy Envanter — yerel sunucu (start.bat ile çalışır).
// Veritabanı: data/envanter.db (SQLite) · Fotoğraflar: data/uploads · Günlük yedek: data/backups
// DATABASE_URL tanımlıysa yerelde de Postgres kullanılır.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.js';
import { createStorage } from './lib/storage.js';
import { createApp, localDate, send } from './lib/app.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.ROY_DATA || path.join(ROOT, 'data');
const BACKUPS = path.join(DATA, 'backups');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const KEEP_DAILY = 30;

fs.mkdirSync(BACKUPS, { recursive: true });
const db = await openDb({ dataDir: DATA });
const storage = await createStorage({ uploadsDir: path.join(DATA, 'uploads'), backupsDir: BACKUPS });

// Gerçek Wi-Fi/Ethernet adresleri önce; VirtualBox, WSL, Hyper-V gibi sanal ağ kartları sona
const VIRTUAL = /virtual|vbox|vmware|vethernet|wsl|hyper-v|docker|bluetooth|loopback|tailscale|zerotier/i;
function lanUrls() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const score = (VIRTUAL.test(name) ? 10 : 0) + (a.address.startsWith('192.168.56.') ? 10 : 0)
        + (/^(wi-?fi|wlan|kablosuz)/i.test(name) ? -2 : 0) + (a.address.startsWith('192.168.') ? -1 : 0);
      found.push({ url: `http://${a.address}:${PORT}`, score });
    }
  }
  return found.sort((a, b) => a.score - b.score).map((f) => f.url);
}

// SQLite dosyasının tutarlı kopyası; Postgres modunda JSON yedeğe düşer
async function sqliteBackup(tag) {
  if (db.dialect !== 'sqlite') return null;
  const name = `envanter-${tag || localDate()}.db`;
  const file = path.join(BACKUPS, name);
  if (!tag && fs.existsSync(file)) return { ok: true, name };
  fs.rmSync(file, { force: true });
  db.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const daily = fs.readdirSync(BACKUPS).filter((f) => /^envanter-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const f of daily.slice(0, Math.max(0, daily.length - KEEP_DAILY))) fs.rmSync(path.join(BACKUPS, f), { force: true });
  return { ok: true, name };
}

const handle = createApp({
  db, storage, mode: 'local',
  hooks: {
    lanUrls, dataDir: DATA,
    backup: db.dialect === 'sqlite' ? sqliteBackup : undefined,
  },
});

const runDaily = () => sqliteBackup().catch((e) => console.error('Yedekleme hatası:', e.message));
runDaily();
setInterval(runDaily, 60 * 60 * 1000).unref();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

function serveStatic(res, pathname) {
  let file = path.join(PUBLIC, path.normalize(pathname).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(PUBLIC, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Bulunamadı');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  if (await handle(req, res)) return;
  serveStatic(res, decodeURIComponent(new URL(req.url, 'http://x').pathname));
}).listen(PORT, '0.0.0.0', () => {
  console.log('\n  Roy Envanter çalışıyor 🚁\n');
  console.log(`  Bu bilgisayarda:  http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  Telefondan:       ${u}`);
  console.log(`\n  Veriler: ${db.dialect === 'pg' ? 'Postgres (DATABASE_URL)' : DATA}`);
  if (process.env.ROY_PIN) console.log('  PIN koruması: açık');
  console.log('\n  Kapatmak için bu pencereyi kapatın veya Ctrl+C.\n');
});
