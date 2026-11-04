import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';

function isUniqueViolation(error) {
  return error?.code === '23505';
}

export async function listFolders(userId) {
  const result = await query(
    `SELECT f.id, f.name, f.created_at, f.updated_at,
            count(i.id) FILTER (WHERE i.deleted_at IS NULL AND i.is_archived = false)::int AS item_count
     FROM folders f
     LEFT JOIN items i ON i.folder_id = f.id AND i.user_id = f.user_id
     WHERE f.user_id = $1
     GROUP BY f.id
     ORDER BY lower(f.name) ASC`,
    [userId],
  );
  return result.rows;
}

export async function getFolder(userId, folderId) {
  const result = await query('SELECT * FROM folders WHERE id = $1 AND user_id = $2', [
    folderId,
    userId,
  ]);
  return result.rows[0] ?? null;
}

export async function assertFolderOwnership(userId, folderId, client = null) {
  if (!folderId) return null;
  const runner = client ?? { query };
  const result = await runner.query('SELECT id, name FROM folders WHERE id = $1 AND user_id = $2', [
    folderId,
    userId,
  ]);
  if (result.rowCount === 0) {
    throw new HttpError(400, 'Folder tidak ditemukan', 'invalid_folder');
  }
  return result.rows[0];
}

export async function createFolder(userId, name) {
  try {
    return await withTransaction(async (client) => {
      const user = await client.query(
        'SELECT folder_limit FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (user.rowCount === 0) throw new HttpError(404, 'Pengguna tidak ditemukan', 'not_found');
      const count = await client.query('SELECT count(*)::int AS count FROM folders WHERE user_id = $1', [
        userId,
      ]);
      if (count.rows[0].count >= Number(user.rows[0].folder_limit)) {
        throw new HttpError(
          422,
          `Batas maksimal ${user.rows[0].folder_limit} folder tercapai`,
          'folder_limit_reached',
        );
      }
      const result = await client.query(
        'INSERT INTO folders (user_id, name) VALUES ($1, $2) RETURNING *',
        [userId, name],
      );
      return { ...result.rows[0], item_count: 0 };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'Nama folder sudah tersedia', 'folder_exists');
    }
    throw error;
  }
}

export async function renameFolder(userId, folderId, name) {
  try {
    const result = await query(
      'UPDATE folders SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [name, folderId, userId],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Folder tidak ditemukan', 'not_found');
    }
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'Nama folder sudah tersedia', 'folder_exists');
    }
    throw error;
  }
}

export async function deleteFolder(userId, folderId) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT id FROM folders WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [folderId, userId],
    );
    if (existing.rowCount === 0) {
      throw new HttpError(404, 'Folder tidak ditemukan', 'not_found');
    }
    const count = await client.query(
      'SELECT count(*)::int AS count FROM items WHERE folder_id = $1 AND user_id = $2',
      [folderId, userId],
    );
    await client.query('DELETE FROM folders WHERE id = $1 AND user_id = $2', [folderId, userId]);
    return { movedItems: count.rows[0].count };
  });
}
