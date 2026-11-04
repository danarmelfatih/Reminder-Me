import { pool, query, withTransaction } from '../src/db/pool.js';

async function main() {
  const result = await query(
    `SELECT u.id, u.email, u.storage_used_bytes,
            coalesce(sum(i.file_size), 0)::bigint AS actual_bytes
     FROM users u
     LEFT JOIN items i ON i.user_id = u.id
     GROUP BY u.id
     ORDER BY u.email`,
  );

  let fixed = 0;
  let totalDelta = 0;

  for (const row of result.rows) {
    const stored = Number(row.storage_used_bytes);
    const actual = Number(row.actual_bytes);
    if (stored === actual) continue;

    const delta = actual - stored;
    totalDelta += delta;
    fixed += 1;

    await withTransaction(async (client) => {
      await client.query('UPDATE users SET storage_used_bytes = $1 WHERE id = $2', [
        actual,
        row.id,
      ]);
    });

    console.log(
      `Diperbaiki ${row.email}: ${stored} -> ${actual} byte (${delta >= 0 ? '+' : ''}${delta})`,
    );
  }

  console.log(`Selesai. ${fixed} pengguna disesuaikan, delta total ${totalDelta} byte.`);
}

main()
  .catch((error) => {
    console.error('Rekonsiliasi gagal:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
