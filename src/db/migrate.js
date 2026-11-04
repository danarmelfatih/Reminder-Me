import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../lib/logger.js';
import { pool } from './pool.js';

const LOCK_ID = 728311;

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const dir = path.join(import.meta.dir, 'migrations');
    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [
        file,
      ]);
      if (existing.rowCount > 0) continue;

      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info({ migration: file }, 'Migration applied');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

if (import.meta.main) {
  runMigrations()
    .then(async () => {
      logger.info('Database migrations complete');
      await pool.end();
    })
    .catch(async (error) => {
      logger.error({ err: error }, 'Migration failed');
      await pool.end();
      process.exit(1);
    });
}
