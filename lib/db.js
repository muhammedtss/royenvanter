// Veritabanı bağdaştırıcısı. DATABASE_URL varsa Postgres (Neon), yoksa yerel SQLite.
// Tüm sorgular `?` yer tutucusuyla yazılır; Postgres için $1, $2… biçimine çevrilir.
//
// Arayüz: all(sql, params) · get(sql, params) · run(sql, params) · insert(sql, params) → id · tx(async (t) => …)
import path from 'node:path';
import { schemaStatements, SCHEMA_VERSION } from './schema.js';

export async function openDb({ dataDir } = {}) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return url ? openPg(url) : openSqlite(dataDir);
}

async function openSqlite(dataDir) {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(path.join(dataDir, 'envanter.db'));
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  for (const s of schemaStatements('sqlite')) raw.exec(s);

  const stmts = new Map();
  const prep = (sql) => {
    let s = stmts.get(sql);
    if (!s) { s = raw.prepare(sql); stmts.set(sql, s); }
    return s;
  };
  const q = {
    all: async (sql, p = []) => prep(sql).all(...p),
    get: async (sql, p = []) => prep(sql).get(...p) ?? null,
    run: async (sql, p = []) => { prep(sql).run(...p); },
    insert: async (sql, p = []) => Number(prep(sql + ' RETURNING id').get(...p).id),
  };

  // node:sqlite eşzamanlı çalışır; işlemleri sıraya sokmak aynı bağlantıda iç içe geçmeyi önler.
  let queue = Promise.resolve();
  const tx = (fn) => {
    const job = queue.then(async () => {
      raw.exec('BEGIN');
      try { const r = await fn(q); raw.exec('COMMIT'); return r; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    });
    queue = job.catch(() => {});
    return job;
  };
  return { dialect: 'sqlite', raw, ...q, tx };
}

async function openPg(url) {
  const { neon, Pool } = await import('@neondatabase/serverless');
  const http = neon(url);
  const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => '$' + ++i); };
  const make = (query) => ({
    all: (sql, p = []) => query(toPg(sql), p),
    get: async (sql, p = []) => (await query(toPg(sql), p))[0] ?? null,
    run: async (sql, p = []) => { await query(toPg(sql), p); },
    insert: async (sql, p = []) => Number((await query(toPg(sql) + ' RETURNING id', p))[0].id),
  });
  const q = make((text, params) => http.query(text, params));

  // Şema yalnızca sürüm değiştiğinde kurulur (her soğuk başlangıçta 10 sorgu atmamak için)
  let version = 0;
  try { version = Number((await q.get("SELECT value FROM settings WHERE key = 'schema_version'"))?.value) || 0; } catch {}
  if (version < SCHEMA_VERSION) {
    for (const s of schemaStatements('pg')) await http.query(s);
    await q.run(`INSERT INTO settings (key, value) VALUES ('schema_version', ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [String(SCHEMA_VERSION)]);
  }

  // Etkileşimli işlem için istek başına WebSocket bağlantısı açılıp kapatılır (sunucusuz ortam kuralı)
  const tx = async (fn) => {
    const pool = new Pool({ connectionString: url });
    const client = await pool.connect();
    const t = make(async (text, params) => (await client.query(text, params)).rows);
    try {
      await client.query('BEGIN');
      const r = await fn(t);
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
      await pool.end();
    }
  };
  return { dialect: 'pg', ...q, tx };
}
