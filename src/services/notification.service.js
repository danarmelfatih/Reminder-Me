import { query } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';

export async function listNotifications(userId, { unread = false, page = 1, perPage = 20 } = {}) {
  const offset = (page - 1) * perPage;
  const unreadFilter = unread ? 'AND is_read = false' : '';

  const [items, totals] = await Promise.all([
    query(
      `SELECT id, item_id, occurrence_id, type, title, body, is_read, created_at
       FROM notifications
       WHERE user_id = $1 ${unreadFilter}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, perPage, offset],
    ),
    query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE is_read = false)::int AS unread
       FROM notifications WHERE user_id = $1`,
      [userId],
    ),
  ]);

  return {
    notifications: items.rows,
    total: totals.rows[0].total,
    unread: totals.rows[0].unread,
    page,
    perPage,
  };
}

export async function unreadCount(userId) {
  const result = await query(
    'SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = false',
    [userId],
  );
  return result.rows[0].unread;
}

export async function markNotificationRead(userId, notificationId) {
  const result = await query(
    'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING id',
    [notificationId, userId],
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, 'Notifikasi tidak ditemukan', 'not_found');
  }
  return true;
}

export async function markAllNotificationsRead(userId) {
  const result = await query(
    'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false RETURNING id',
    [userId],
  );
  return result.rowCount;
}
