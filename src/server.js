import { createApp } from './app.js';
import { config, ensureStorageDirs } from './config.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';

ensureStorageDirs();

if (!config.isTest) {
  await runMigrations();
}

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.env, url: config.appUrl },
    'Reminder Me web server berjalan',
  );
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Mematikan server');
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
