// Fotoğraf ve yedek dosyaları. BLOB_READ_WRITE_TOKEN ya da BLOB_STORE_ID (OIDC) varsa Vercel Blob, yoksa yerel disk.
// Veritabanında yalnızca dosya adı tutulur; tarayıcı fotoğrafı her zaman /uploads/<ad> üzerinden ister.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const KEEP_BACKUPS = 30;

export async function createStorage({ uploadsDir, backupsDir } = {}) {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return blobStorage();
  return diskStorage(uploadsDir, backupsDir);
}

function diskStorage(uploadsDir, backupsDir) {
  for (const d of [uploadsDir, backupsDir]) fs.mkdirSync(d, { recursive: true });
  const safe = (dir, name) => path.join(dir, path.basename(String(name)));
  return {
    kind: 'disk',
    async savePhoto(name, buf) { await fs.promises.writeFile(safe(uploadsDir, name), buf); },
    async removePhoto(name) { if (name) await fs.promises.rm(safe(uploadsDir, name), { force: true }); },
    async readPhoto(name) {
      const file = safe(uploadsDir, name);
      return fs.existsSync(file) ? { stream: fs.createReadStream(file), type: typeOf(name) } : null;
    },
    async saveBackup(name, text) {
      await fs.promises.writeFile(safe(backupsDir, name), text);
      await prune((await fs.promises.readdir(backupsDir)).filter((f) => f.endsWith('.json')).sort(),
        (f) => fs.promises.rm(path.join(backupsDir, f), { force: true }));
    },
    async listBackups() {
      const files = (await fs.promises.readdir(backupsDir)).filter((f) => /\.(json|db)$/.test(f));
      return files.map((f) => {
        const st = fs.statSync(path.join(backupsDir, f));
        return { name: f, size: st.size, date: st.mtime.toISOString() };
      }).sort((a, b) => b.name.localeCompare(a.name));
    },
    async readBackup(name) {
      const file = safe(backupsDir, name);
      return fs.existsSync(file) ? { stream: fs.createReadStream(file), type: 'application/octet-stream' } : null;
    },
  };
}

async function blobStorage() {
  const blob = await import('@vercel/blob');
  const access = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
  const read = async (pathname) => {
    const r = await blob.get(pathname, { access }).catch((e) => (e instanceof blob.BlobNotFoundError ? null : Promise.reject(e)));
    if (!r || r.statusCode !== 200) return null;
    return { stream: Readable.fromWeb(r.stream), type: r.blob.contentType };
  };
  const all = async (prefix) => {
    const out = [];
    let cursor;
    do {
      const r = await blob.list({ prefix, cursor, limit: 1000 });
      out.push(...r.blobs);
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  };
  return {
    kind: 'blob',
    async savePhoto(name, buf) {
      await blob.put(`photos/${name}`, buf, { access, contentType: typeOf(name), addRandomSuffix: false, allowOverwrite: true });
    },
    async removePhoto(name) { if (name) await blob.del(`photos/${path.basename(name)}`).catch(() => {}); },
    readPhoto: (name) => read(`photos/${path.basename(String(name))}`),
    async saveBackup(name, text) {
      await blob.put(`backups/${name}`, text, { access, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
      const list = (await all('backups/')).sort((a, b) => a.pathname.localeCompare(b.pathname));
      await prune(list, (b) => blob.del(b.url));
    },
    async listBackups() {
      return (await all('backups/'))
        .map((b) => ({ name: b.pathname.slice('backups/'.length), size: b.size, date: new Date(b.uploadedAt).toISOString() }))
        .sort((a, b) => b.name.localeCompare(a.name));
    },
    readBackup: (name) => read(`backups/${path.basename(String(name))}`),
  };
}

async function prune(sortedOldestFirst, remove) {
  for (const x of sortedOldestFirst.slice(0, Math.max(0, sortedOldestFirst.length - KEEP_BACKUPS))) await remove(x);
}

function typeOf(name) {
  const ext = path.extname(String(name)).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' }[ext]
    || 'application/octet-stream';
}
