import { config } from '../src/config.js';
import { pool, query } from '../src/db/pool.js';

function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const email = (arg('email') ?? '').trim().toLowerCase();
  const password = arg('password') ?? '';
  const name = (arg('name') ?? 'Administrator').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Gunakan --email=alamat@contoh.com');
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error('Gunakan --password=... dengan panjang 8-128 karakter');
  }
  if (name.length < 1 || name.length > 100) {
    throw new Error('Nama harus 1-100 karakter');
  }

  const passwordHash = await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 19456,
    timeCost: 2,
  });

  const existing = await query('SELECT id, role FROM users WHERE lower(email) = lower($1)', [
    email,
  ]);
  let userId;
  if (existing.rowCount > 0) {
    const result = await query(
      `UPDATE users
       SET role = 'admin', status = 'active', email_verified_at = coalesce(email_verified_at, now()),
           password_hash = $1, name = $2
       WHERE id = $3
       RETURNING id`,
      [passwordHash, name, existing.rows[0].id],
    );
    userId = result.rows[0].id;
    console.log(`Akun ${email} diperbarui menjadi admin.`);
  } else {
    const result = await query(
      `INSERT INTO users
        (name, email, password_hash, role, status, email_verified_at, timezone,
         storage_quota_bytes, folder_limit, tag_limit)
       VALUES ($1, $2, $3, 'admin', 'active', now(), 'Asia/Jakarta', $4, $5, $6)
       RETURNING id`,
      [
        name,
        email,
        passwordHash,
        config.defaultStorageQuotaBytes,
        config.defaultFolderLimit,
        config.defaultTagLimit,
      ],
    );
    userId = result.rows[0].id;
    console.log(`Admin baru dibuat: ${email}`);
  }

  console.log(`User ID: ${userId}`);
}

main()
  .catch((error) => {
    console.error('Gagal membuat admin:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
