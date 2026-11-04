import { config } from '../src/config.js';
import { pool, query, withTransaction } from '../src/db/pool.js';

const DEMO_EMAIL = 'demo@reminder.me';
const DEMO_PASSWORD = 'demo12345';

async function main() {
  const existing = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [DEMO_EMAIL]);
  if (existing.rowCount > 0) {
    console.log(`User demo sudah ada: ${DEMO_EMAIL}`);
    return;
  }

  const passwordHash = await Bun.password.hash(DEMO_PASSWORD, {
    algorithm: 'argon2id',
    memoryCost: 19456,
    timeCost: 2,
  });

  const result = await withTransaction(async (client) => {
    const user = await client.query(
      `INSERT INTO users
        (name, email, password_hash, email_verified_at, timezone, storage_quota_bytes, folder_limit, tag_limit)
       VALUES ($1, $2, $3, now(), 'Asia/Jakarta', $4, $5, $6)
       RETURNING id`,
      [
        'Demo Reminder Me',
        DEMO_EMAIL,
        passwordHash,
        config.defaultStorageQuotaBytes,
        config.defaultFolderLimit,
        config.defaultTagLimit,
      ],
    );
    const userId = user.rows[0].id;

    const folders = {};
    for (const name of ['Kuliah', 'Pribadi', 'Referensi']) {
      const folder = await client.query(
        'INSERT INTO folders (user_id, name) VALUES ($1, $2) RETURNING id',
        [userId, name],
      );
      folders[name] = folder.rows[0].id;
    }

    const tags = {};
    for (const name of ['penting', 'tugas', 'bacaan']) {
      const tag = await client.query(
        'INSERT INTO tags (user_id, name) VALUES ($1, $2) RETURNING id',
        [userId, name],
      );
      tags[name] = tag.rows[0].id;
    }

    const link = await client.query(
      `INSERT INTO items (user_id, type, title, description, url, domain, folder_id, priority, is_favorite)
       VALUES ($1, 'link', $2, $3, $4, $5, $6, 'high', true)
       RETURNING id`,
      [
        userId,
        'Panduan PostgreSQL',
        'Dokumentasi resmi PostgreSQL untuk referensi query dan indexing.',
        'https://www.postgresql.org/docs/current/',
        'postgresql.org',
        folders.Referensi,
      ],
    );

    const note = await client.query(
      `INSERT INTO items (user_id, type, title, description, folder_id, priority)
       VALUES ($1, 'text', $2, $3, $4, 'medium')
       RETURNING id`,
      [
        userId,
        'Ide aplikasi minggu ini',
        'Rapikan daftar bacaan, coba fitur export ZIP, dan evaluasi reminder email.',
        folders.Pribadi,
      ],
    );

    await client.query(
      `INSERT INTO item_tags (item_id, tag_id) VALUES ($1, $2), ($1, $3), ($4, $3)`,
      [link.rows[0].id, tags.bacaan, tags.penting, note.rows[0].id],
    );

    const reminder = await client.query(
      `INSERT INTO reminders (user_id, item_id, type, timezone, start_at, next_run_at)
       VALUES ($1, $2, 'once', 'Asia/Jakarta', now() + interval '1 hour', now() + interval '1 hour')
       RETURNING id`,
      [userId, note.rows[0].id],
    );

    return { userId, reminderId: reminder.rows[0].id };
  });

  console.log('Seed selesai.');
  console.log(`Email    : ${DEMO_EMAIL}`);
  console.log(`Password : ${DEMO_PASSWORD}`);
  console.log(`User ID  : ${result.userId}`);
  console.log(`Reminder : ${result.reminderId} (jatuh tempo 1 jam lagi)`);
}

main()
  .catch((error) => {
    console.error('Seed gagal:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
