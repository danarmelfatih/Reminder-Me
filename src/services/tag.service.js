import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';

function isUniqueViolation(error) {
  return error?.code === '23505';
}

export async function listTags(userId) {
  const result = await query(
    `SELECT t.id, t.name, t.created_at, t.updated_at,
            count(it.item_id) FILTER (WHERE i.deleted_at IS NULL AND i.is_archived = false)::int AS item_count
     FROM tags t
     LEFT JOIN item_tags it ON it.tag_id = t.id
     LEFT JOIN items i ON i.id = it.item_id AND i.user_id = t.user_id
     WHERE t.user_id = $1
     GROUP BY t.id
     ORDER BY lower(t.name) ASC`,
    [userId],
  );
  return result.rows;
}

export async function assertTagsOwnership(userId, tagIds, client = null) {
  const uniqueIds = [...new Set((tagIds ?? []).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const runner = client ?? { query };
  const result = await runner.query(
    'SELECT id FROM tags WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [userId, uniqueIds],
  );
  if (result.rowCount !== uniqueIds.length) {
    throw new HttpError(400, 'Salah satu tag tidak ditemukan', 'invalid_tag');
  }
  return uniqueIds;
}

export async function createTag(userId, name) {
  try {
    return await withTransaction(async (client) => {
      const user = await client.query('SELECT tag_limit FROM users WHERE id = $1 FOR UPDATE', [
        userId,
      ]);
      if (user.rowCount === 0) throw new HttpError(404, 'Pengguna tidak ditemukan', 'not_found');
      const count = await client.query(
        'SELECT count(*)::int AS count FROM tags WHERE user_id = $1',
        [userId],
      );
      if (count.rows[0].count >= Number(user.rows[0].tag_limit)) {
        throw new HttpError(
          422,
          `Batas maksimal ${user.rows[0].tag_limit} tag tercapai`,
          'tag_limit_reached',
        );
      }
      const result = await client.query(
        'INSERT INTO tags (user_id, name) VALUES ($1, $2) RETURNING *',
        [userId, name],
      );
      return { ...result.rows[0], item_count: 0 };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'Nama tag sudah tersedia', 'tag_exists');
    }
    throw error;
  }
}

export async function renameTag(userId, tagId, name) {
  try {
    const result = await query(
      'UPDATE tags SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [name, tagId, userId],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Tag tidak ditemukan', 'not_found');
    }
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'Nama tag sudah tersedia', 'tag_exists');
    }
    throw error;
  }
}

export async function deleteTag(userId, tagId) {
  const result = await query('DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id', [
    tagId,
    userId,
  ]);
  if (result.rowCount === 0) {
    throw new HttpError(404, 'Tag tidak ditemukan', 'not_found');
  }
  return true;
}
