import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { config, ensureStorageDirs } from '../src/config.js';
import { pool, query } from '../src/db/pool.js';
import {
  createEmailUser,
  createSession,
  findUserByEmail,
  getSessionUser,
  markEmailVerified,
  revokeSession,
  verifyPassword,
} from '../src/services/auth.service.js';
import { createFolder } from '../src/services/folder.service.js';
import {
  createItem,
  deleteItemPermanently,
  getItem,
  restoreItem,
  trashItem,
  updateItem,
} from '../src/services/item.service.js';
import { deleteReminder, getReminder, upsertReminder } from '../src/services/reminder.service.js';
import { absolutePath } from '../src/services/storage.service.js';
import { processDueReminders, processSnoozes } from '../src/worker.js';

const databaseName = new URL(config.databaseUrl).pathname.replace(/^\//, '');
const integrationEnabled = databaseName.endsWith('_test');
const describeDb = integrationEnabled ? describe : describe.skip;

const TABLES = [
  'admin_audit_logs',
  'email_outbox',
  'notifications',
  'reminder_occurrences',
  'reminders',
  'item_contents',
  'item_tags',
  'items',
  'tags',
  'folders',
  'auth_tokens',
  'sessions',
  'users',
  'system_heartbeats',
];

async function makeUser(email) {
  const user = await createEmailUser({ name: 'Test User', email, password: 'password123' });
  await markEmailVerified(user.id);
  return user;
}

async function makeLinkItem(user, title = 'Contoh item') {
  return createItem(user, {
    type: 'link',
    title,
    description: 'Deskripsi uji',
    priority: 'medium',
    url: 'https://example.com/artikel',
  });
}

async function makeFileItem(user, { content = 'uji', extension = 'txt', size = 3 } = {}) {
  const tempDir = await fs.promises.mkdtemp(path.join(config.tmpDir, 'test-'));
  const tempFile = path.join(tempDir, `contoh.${extension}`);
  await fs.promises.writeFile(tempFile, content);
  try {
    return await createItem(
      user,
      { type: 'document', title: 'Dokumen uji', priority: 'medium' },
      {
        tempFile: { path: tempFile, originalname: `contoh.${extension}` },
        validated: { kind: 'document', mime: 'text/plain', extension, size },
      },
    );
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function createCookieJar() {
  const cookies = new Map();
  return {
    header: () => [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
    get: (name) => cookies.get(name),
    absorb(response) {
      const values = response.headers.getSetCookie?.() ?? [];
      for (const raw of values) {
        const pair = raw.split(';')[0];
        const index = pair.indexOf('=');
        if (index < 0) continue;
        const name = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        if (value) cookies.set(name, value);
        else cookies.delete(name);
      }
    },
  };
}

describeDb('integration', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    ensureStorageDirs();
    await query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  test('auth: verifies password, email, and session lifecycle', async () => {
    const user = await createEmailUser({
      name: 'Auth User',
      email: 'auth@example.com',
      password: 'password123',
    });
    expect(user.email).toBe('auth@example.com');
    expect(user.email_verified_at).toBeNull();
    expect(await verifyPassword('password123', user.password_hash)).toBe(true);
    expect(await verifyPassword('password-salah', user.password_hash)).toBe(false);

    await markEmailVerified(user.id);
    const verified = await findUserByEmail('auth@example.com');
    expect(verified.email_verified_at).toBeTruthy();

    const { raw } = await createSession(user.id, { remember: false });
    const session = await getSessionUser(raw);
    expect(session.user.id).toBe(user.id);

    await revokeSession(session.session.id);
    expect(await getSessionUser(raw)).toBeNull();
  });

  test('auth: forgot-password creates a reset token for an active user', async () => {
    const user = await makeUser('forgot@example.com');
    const jar = createCookieJar();
    const health = await fetch(`${baseUrl}/api/health`);
    jar.absorb(health);

    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: jar.header(),
        'x-csrf-token': jar.get(config.csrfCookieName),
      },
      body: JSON.stringify({ email: user.email }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain('tautan pengaturan ulang password');

    const tokens = await query(
      `SELECT count(*)::int AS count FROM auth_tokens
       WHERE user_id = $1 AND type = 'password_reset' AND used_at IS NULL`,
      [user.id],
    );
    expect(tokens.rows[0].count).toBe(1);
  });

  test('ownership: user B cannot read or mutate user A data', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');
    const item = await makeLinkItem(alice, 'Rahasia Alice');

    expect(await getItem(bob.id, item.id)).toBeNull();
    await expect(updateItem(bob.id, item.id, { title: 'Dibajak' })).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    await expect(trashItem(bob.id, item.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteReminder(bob.id, item.id)).rejects.toMatchObject({ status: 404 });

    const bobFolder = await createFolder(bob.id, 'Folder Bob');
    await expect(
      createItem(alice, {
        type: 'link',
        title: 'Folder orang lain',
        url: 'https://example.com',
        folderId: bobFolder.id,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_folder' });
  });

  test('quota: upload is rejected when storage is full and nothing is persisted', async () => {
    const user = await makeUser('quota@example.com');
    await query('UPDATE users SET storage_quota_bytes = $1 WHERE id = $2', [4, user.id]);

    await expect(makeFileItem(user, { size: 8, content: '12345678' })).rejects.toMatchObject({
      status: 413,
      code: 'storage_full',
    });

    const stored = await query('SELECT storage_used_bytes FROM users WHERE id = $1', [user.id]);
    expect(Number(stored.rows[0].storage_used_bytes)).toBe(0);
    const items = await query('SELECT count(*)::int AS count FROM items WHERE user_id = $1', [
      user.id,
    ]);
    expect(items.rows[0].count).toBe(0);
  });

  test('trash: restore keeps reminder inactive, permanent delete releases storage', async () => {
    const user = await makeUser('trash@example.com');
    const item = await makeFileItem(user, { size: 3, content: 'abc' });
    const raw = await query('SELECT file_path FROM items WHERE id = $1', [item.id]);
    const filePath = absolutePath(raw.rows[0].file_path);
    expect(fs.existsSync(filePath)).toBe(true);

    await upsertReminder(user.id, item.id, {
      type: 'once',
      startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timezone: 'Asia/Jakarta',
    });
    expect((await getReminder(user.id, item.id)).is_active).toBe(true);

    await trashItem(user.id, item.id);
    expect((await getReminder(user.id, item.id)).is_active).toBe(false);
    const restored = await restoreItem(user.id, item.id);
    expect(restored.deletedAt).toBeNull();
    expect((await getReminder(user.id, item.id)).is_active).toBe(false);

    const usedBefore = await query('SELECT storage_used_bytes FROM users WHERE id = $1', [user.id]);
    expect(Number(usedBefore.rows[0].storage_used_bytes)).toBe(3);

    await trashItem(user.id, item.id);
    await expect(deleteItemPermanently(user.id, item.id)).resolves.toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(await getItem(user.id, item.id)).toBeNull();

    const usedAfter = await query('SELECT storage_used_bytes FROM users WHERE id = $1', [user.id]);
    expect(Number(usedAfter.rows[0].storage_used_bytes)).toBe(0);
  });

  test('worker: delivers due reminders and snoozes into notifications and email outbox', async () => {
    const user = await makeUser('worker@example.com');
    const item = await makeLinkItem(user, 'Pengingat uji');

    const inserted = await query(
      `INSERT INTO reminders
        (user_id, item_id, type, timezone, start_at, next_run_at, is_active)
       VALUES ($1, $2, 'once', 'Asia/Jakarta', now() - interval '1 minute', now() - interval '1 minute', true)
       RETURNING id`,
      [user.id, item.id],
    );
    expect(await processDueReminders()).toBe(1);

    const reminder = await query('SELECT is_active, next_run_at FROM reminders WHERE id = $1', [
      inserted.rows[0].id,
    ]);
    expect(reminder.rows[0].is_active).toBe(false);
    expect(reminder.rows[0].next_run_at).toBeNull();

    const notifications = await query(
      'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND type = $2',
      [user.id, 'reminder'],
    );
    expect(notifications.rows[0].count).toBe(1);
    const outbox = await query(
      'SELECT count(*)::int AS count FROM email_outbox WHERE user_id = $1',
      [user.id],
    );
    expect(outbox.rows[0].count).toBe(1);

    const snoozeReminder = await upsertReminder(user.id, item.id, {
      type: 'once',
      startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timezone: 'Asia/Jakarta',
    });
    await query(
      `INSERT INTO reminder_occurrences
        (reminder_id, user_id, item_id, kind, scheduled_for, status)
       VALUES ($1, $2, $3, 'snooze', now() - interval '1 minute', 'pending')`,
      [snoozeReminder.id, user.id, item.id],
    );
    expect(await processSnoozes()).toBe(1);

    const snoozed = await query(
      `SELECT count(*)::int AS count FROM notifications
       WHERE user_id = $1 AND body ILIKE '%ditunda%'`,
      [user.id],
    );
    expect(snoozed.rows[0].count).toBe(1);
  });

  test('http: csrf is required, login works, and export returns a zip', async () => {
    const email = 'export@example.com';
    const user = await makeUser(email);
    await makeLinkItem(user, 'Item export');
    const jar = createCookieJar();

    const csrfRejected = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    expect(csrfRejected.status).toBe(403);

    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
    jar.absorb(health);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: jar.header(),
        'x-csrf-token': jar.get(config.csrfCookieName),
      },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    expect(login.status).toBe(200);
    jar.absorb(login);
    expect(jar.get(config.sessionCookieName)).toBeTruthy();

    const exported = await fetch(`${baseUrl}/api/export`, {
      headers: { cookie: jar.header() },
    });
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-type')).toContain('application/zip');
    const bytes = new Uint8Array(await exported.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(100);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });

  test('verified gate: unverified session is rejected by private API', async () => {
    const user = await createEmailUser({
      name: 'Belum Verifikasi',
      email: 'unverified@example.com',
      password: 'password123',
    });
    const { raw } = await createSession(user.id, { remember: false });
    const cookie = `${config.sessionCookieName}=${raw}`;

    const rejected = await fetch(`${baseUrl}/api/me`, { headers: { cookie } });
    expect(rejected.status).toBe(403);
    expect((await rejected.json()).error.code).toBe('email_unverified');

    await markEmailVerified(user.id);
    const accepted = await fetch(`${baseUrl}/api/me`, { headers: { cookie } });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).user.email).toBe('unverified@example.com');
  });

  test('admin: stats accepts a period and reports storage/email services', async () => {
    const email = 'admin@example.com';
    const user = await makeUser(email);
    await query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);

    const jar = createCookieJar();
    const health = await fetch(`${baseUrl}/api/health`);
    jar.absorb(health);
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: jar.header(),
        'x-csrf-token': jar.get(config.csrfCookieName),
      },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    expect(login.status).toBe(200);
    jar.absorb(login);

    const stats = await fetch(`${baseUrl}/api/admin/stats?period=30`, {
      headers: { cookie: jar.header() },
    });
    expect(stats.status).toBe(200);
    const body = await stats.json();
    expect(body.users.periodDays).toBe(30);
    const services = body.system.map((entry) => entry.name);
    expect(services).toContain('storage');
    expect(services).toContain('email');

    const invalid = await fetch(`${baseUrl}/api/admin/stats?period=1`, {
      headers: { cookie: jar.header() },
    });
    expect(invalid.status).toBe(422);
  });
});
