import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { config } from '../../../src/config.js';
import {databaseConnection} from './db-connection.js';
export const pool = new pg.Pool({ ...databaseConnection(config.database,process.env.HISTORY_DB_CA_BASE64), max: Number(process.env.HISTORY_POOL_MAX??8), connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
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
  try { await c.query('BEGIN');
    const schema=process.env.HISTORY_SCHEMA;
    if(schema){if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new Error('INVALID_SCHEMA');await c.query(`SET LOCAL search_path TO "${schema}"`);}
    await c.query("SET LOCAL statement_timeout='10s'");
    const result = await fn(c); await c.query('COMMIT'); return result; }
  catch(e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}
