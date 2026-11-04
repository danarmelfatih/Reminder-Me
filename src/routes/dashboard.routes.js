import express from 'express';
import { query } from '../db/pool.js';
import { listItems } from '../services/item.service.js';
import { storageSummary } from '../services/user.service.js';

export const dashboardRouter = express.Router();

dashboardRouter.get('/', async (req, res) => {
  const userId = req.user.id;

  const [counts, upcoming, recent, unread, folderCount] = await Promise.all([
    query(
      `SELECT
        count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = false)::int AS active_items,
        count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = true)::int AS archived_items,
        count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trash_items,
        count(*) FILTER (WHERE deleted_at IS NULL AND is_favorite = true AND is_archived = false)::int AS favorites
       FROM items WHERE user_id = $1`,
      [userId],
    ),
    query(
      `SELECT r.id, r.next_run_at, r.type, r.timezone,
              i.id AS item_id, i.title, i.is_archived
       FROM reminders r
       JOIN items i ON i.id = r.item_id
       WHERE r.user_id = $1 AND r.is_active = true AND r.next_run_at IS NOT NULL
         AND i.deleted_at IS NULL
         AND r.next_run_at <= now() + interval '7 days'
       ORDER BY r.next_run_at ASC
       LIMIT 6`,
      [userId],
    ),
    listItems(userId, { view: 'all', sort: 'newest' }, { page: 1, perPage: 5, offset: 0 }),
    query('SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false', [
      userId,
    ]),
    query(
      'SELECT count(*)::int AS count FROM folders WHERE user_id = $1',
      [userId],
    ),
  ]);

  const reminderCount = await query(
    'SELECT count(*)::int AS count FROM reminders WHERE user_id = $1 AND is_active = true',
    [userId],
  );

  res.json({
    counts: {
      ...counts.rows[0],
      folders: folderCount.rows[0].count,
      activeReminders: reminderCount.rows[0].count,
      unreadNotifications: unread.rows[0].count,
    },
    storage: storageSummary(req.user),
    upcomingReminders: upcoming.rows,
    recentItems: recent.items,
  });
});
