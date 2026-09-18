import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { config } from '../../../src/config.js';
export const pool = new pg.Pool({ connectionString: config.database, max: 8, connectionTimeoutMillis: 10000 });
// Idle sockets can close during a database restart. Active requests still receive their own errors.
pool.on('error',()=>console.error('history_db_connection_lost'));
export async function migrate() {
  const c = await pool.connect();
  try {
    await c.query("SELECT pg_advisory_lock(702601)");
    await c.query(await readFile(new URL('../../../src/migration.sql', import.meta.url), 'utf8'));
  } finally { await c.query("SELECT pg_advisory_unlock(702601)"); c.release(); }
}
export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
  catch(e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}
