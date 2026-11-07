import { spawn } from 'node:child_process';
import pg from 'pg';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL belum diatur. Salin .env.example ke .env terlebih dahulu.');
  process.exit(1);
}

const parsed = new URL(baseUrl);
const baseName = parsed.pathname.replace(/^\//, '') || 'reminder_me';
const testDbName = process.env.TEST_DATABASE_NAME || `${baseName}_test`;

const adminUrl = new URL(baseUrl);
adminUrl.pathname = '/postgres';
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${testDbName}`;

const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDbName]);
  if (existing.rowCount === 0) {
    const quoted = testDbName.replaceAll('"', '""');
    await client.query(`CREATE DATABASE "${quoted}"`);
  }
} finally {
  await client.end();
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testUrl.toString(),
  STORAGE_DIR: process.env.TEST_STORAGE_DIR || './storage-test',
  MAIL_DRIVER: 'console',
};

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), { env, stdio: 'inherit', shell: false });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      console.error(error);
      resolve(1);
    });
  });
}

const migrateCode = await run(['bun', 'run', 'src/db/migrate.js']);
if (migrateCode !== 0) process.exit(migrateCode);

const testCode = await run(['bun', 'test', ...process.argv.slice(2)]);
process.exit(testCode);
