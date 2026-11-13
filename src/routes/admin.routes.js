import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import {
  adminQuotaSchema,
  adminStatsQuerySchema,
  adminUserQuerySchema,
  parse,
} from '../lib/validation.js';
import { uuidParam } from '../middleware/params.js';
import { findUserById } from '../services/auth.service.js';

export const adminRouter = express.Router();

adminRouter.param('id', uuidParam);

const USER_COLUMNS = `
  id, name, email, role, status, email_verified_at, timezone,
  storage_used_bytes, storage_quota_bytes, folder_limit, tag_limit,
  created_at, updated_at
`;

function safeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    email_verified_at: row.email_verified_at,
    timezone: row.timezone,
    storage_used_bytes: Number(row.storage_used_bytes),
    storage_quota_bytes: Number(row.storage_quota_bytes),
    folder_limit: row.folder_limit,
    tag_limit: row.tag_limit,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function readStorageStatus() {
  try {
    const stats = await fs.promises.statfs(config.storageDir);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedPercent = totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0;
    return {
      name: 'storage',
      label: 'Ruang penyimpanan',
      status: usedPercent >= 95 ? 'down' : usedPercent >= 80 ? 'degraded' : 'ok',
      totalBytes,
      freeBytes,
    };
  } catch {
    return {
      name: 'storage',
      label: 'Ruang penyimpanan',
      status: 'down',
      totalBytes: null,
      freeBytes: null,
    };
  }
}

function readEmailStatus() {
  if (config.mailDriver === 'console') {
    return {
      name: 'email',
      label: 'Layanan email',
      status: 'degraded',
      detail: 'Driver console: email hanya dicatat ke log',
    };
  }
  if (config.mailDriver === 'smtp') {
    if (!config.smtpHost) {
      return {
        name: 'email',
        label: 'Layanan email',
        status: 'down',
        detail: 'SMTP_HOST belum diatur',
      };
    }
    return {
      name: 'email',
      label: 'Layanan email',
      status: 'ok',
      detail: `SMTP · ${config.smtpHost}:${config.smtpPort}`,
    };
  }
  if (!config.resendApiKey) {
    return {
      name: 'email',
      label: 'Layanan email',
      status: 'down',
      detail: 'RESEND_API_KEY belum diatur',
    };
  }
  return {
    name: 'email',
    label: 'Layanan email',
    status: 'ok',
    detail: `Resend · ${config.mailFrom}`,
  };
}

async function audit(adminId, action, targetUserId, details, req) {
  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, target_user_id, details, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, targetUserId, details ? JSON.stringify(details) : null, req.ip ?? null],
  );
}

adminRouter.get('/stats', async (req, res) => {
  const data = parse(adminStatsQuerySchema, req.query);
  const [
    users,
    storage,
    items,
    folders,
    tags,
    reminders,
    notifications,
    email,
    heartbeats,
    disk,
    emailService,
  ] = await Promise.all([
    query(
      `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'active')::int AS active,
                count(*) FILTER (WHERE status = 'disabled')::int AS disabled,
                count(*) FILTER (WHERE created_at >= now() - make_interval(days => $1))::int AS new_in_period
         FROM users`,
      [data.period],
    ),
    query(
      `SELECT coalesce(sum(storage_used_bytes), 0)::bigint AS total_used_bytes,
                coalesce(sum(storage_quota_bytes), 0)::bigint AS total_quota_bytes
         FROM users`,
    ),
    query(
      `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = false)::int AS active,
                count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = true)::int AS archived,
                count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trash
         FROM items`,
    ),
    query('SELECT count(*)::int AS count FROM folders'),
    query('SELECT count(*)::int AS count FROM tags'),
    query(
      `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE is_active = true)::int AS active
         FROM reminders`,
    ),
    query(
      `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE is_read = false)::int AS unread
         FROM notifications`,
    ),
    query(
      `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
                count(*) FILTER (WHERE status = 'sending')::int AS sending,
                count(*) FILTER (WHERE status = 'sent')::int AS sent,
                count(*) FILTER (WHERE status = 'failed')::int AS failed,
                count(*) FILTER (WHERE status = 'sent' AND sent_at >= now() - interval '24 hours')::int AS last_24h
         FROM email_outbox`,
    ),
    query('SELECT name, last_seen_at FROM system_heartbeats'),
    readStorageStatus(),
    readEmailStatus(),
  ]);

  const heartbeatMap = new Map(heartbeats.rows.map((row) => [row.name, row.last_seen_at]));
  const now = Date.now();
  const workerSeen = heartbeatMap.get('worker');
  const workerOk =
    Boolean(workerSeen) &&
    now - new Date(workerSeen).getTime() < Math.max(60000, config.workerPollMs * 3);

  res.json({
    users: {
      total: users.rows[0].total,
      active: users.rows[0].active,
      disabled: users.rows[0].disabled,
      newInPeriod: users.rows[0].new_in_period,
      periodDays: data.period,
    },
    storage: {
      totalUsedBytes: Number(storage.rows[0].total_used_bytes),
      totalQuotaBytes: Number(storage.rows[0].total_quota_bytes),
    },
    items: items.rows[0],
    folders: folders.rows[0].count,
    tags: tags.rows[0].count,
    reminders: reminders.rows[0],
    notifications: notifications.rows[0],
    email: {
      pending: email.rows[0].pending,
      sending: email.rows[0].sending,
      sent: email.rows[0].sent,
      failed: email.rows[0].failed,
      last24h: email.rows[0].last_24h,
    },
    system: [
      {
        name: 'database',
        label: 'Database PostgreSQL',
        status: 'ok',
        lastSeenAt: new Date().toISOString(),
      },
      disk,
      emailService,
      {
        name: 'worker',
        label: 'Worker pengingat & email',
        status: workerOk ? 'ok' : 'down',
        lastSeenAt: workerSeen ?? null,
      },
    ],
  });
});

adminRouter.get('/users', async (req, res) => {
  const data = parse(adminUserQuerySchema, req.query);
  const perPage = 20;
  const offset = (data.page - 1) * perPage;
  const conditions = [];
  const params = [];

  if (data.q) {
    params.push(`%${data.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    conditions.push(
      `(name ILIKE $${params.length} ESCAPE '\\' OR email ILIKE $${params.length} ESCAPE '\\')`,
    );
  }
  if (data.status && data.status !== 'all') {
    params.push(data.status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [users, total] = await Promise.all([
    query(
      `SELECT ${USER_COLUMNS} FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, perPage, offset],
    ),
    query(`SELECT count(*)::int AS total FROM users ${where}`, params),
  ]);

  res.json({
    users: users.rows.map(safeUser),
    total: total.rows[0].total,
    page: data.page,
    perPage,
  });
});

adminRouter.get('/users/:id', async (req, res) => {
  const user = await findUserById(req.params.id);
  if (!user) throw new HttpError(404, 'Pengguna tidak ditemukan', 'not_found');

  const [items, folders, tags, reminders, notifications, sessions] = await Promise.all([
    query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = false)::int AS active,
              count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = true)::int AS archived,
              count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trash
       FROM items WHERE user_id = $1`,
      [user.id],
    ),
    query('SELECT count(*)::int AS count FROM folders WHERE user_id = $1', [user.id]),
    query('SELECT count(*)::int AS count FROM tags WHERE user_id = $1', [user.id]),
    query('SELECT count(*)::int AS count FROM reminders WHERE user_id = $1 AND is_active = true', [
      user.id,
    ]),
    query('SELECT count(*)::int AS count FROM notifications WHERE user_id = $1', [user.id]),
    query(
      `SELECT count(*)::int AS count FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [user.id],
    ),
  ]);

  res.json({
    user: safeUser(user),
    stats: {
      items: items.rows[0],
      folders: folders.rows[0].count,
      tags: tags.rows[0].count,
      reminders: reminders.rows[0].count,
      notifications: notifications.rows[0].count,
    },
    sessions: sessions.rows[0].count,
  });
});

adminRouter.patch('/users/:id', async (req, res) => {
  const data = parse(adminQuotaSchema, req.body);
  const result = await query(
    `UPDATE users
     SET storage_quota_bytes = $1, folder_limit = $2, tag_limit = $3
     WHERE id = $4
     RETURNING ${USER_COLUMNS}`,
    [data.storageQuotaBytes, data.folderLimit, data.tagLimit, req.params.id],
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, 'Pengguna tidak ditemukan', 'not_found');
  }
  await audit(req.user.id, 'update_quota', req.params.id, data, req);
  res.json({ message: 'Kapasitas pengguna diperbarui', user: safeUser(result.rows[0]) });
});

adminRouter.post('/users/:id/status', async (req, res) => {
  const status = req.body?.status;
  if (!['active', 'disabled'].includes(status)) {
    throw new HttpError(422, 'Status tidak valid', 'validation_error');
  }

  const target = await findUserById(req.params.id);
  if (!target) throw new HttpError(404, 'Pengguna tidak ditemukan', 'not_found');

  if (status === 'disabled' && target.role === 'admin') {
    const admins = await query(
      "SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND status = 'active'",
    );
    if (admins.rows[0].count <= 1) {
      throw new HttpError(400, 'Admin aktif terakhir tidak dapat dinonaktifkan', 'last_admin');
    }
  }

  const result = await query(
    `UPDATE users SET status = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`,
    [status, target.id],
  );
  if (status === 'disabled') {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [target.id],
    );
  }
  await audit(
    req.user.id,
    status === 'disabled' ? 'disable_user' : 'enable_user',
    target.id,
    null,
    req,
  );
  res.json({
    message: status === 'disabled' ? 'Akun pengguna dinonaktifkan' : 'Akun pengguna diaktifkan',
    user: safeUser(result.rows[0]),
  });
});

adminRouter.delete('/users/:id', async (req, res) => {
  if (req.body?.confirmation !== 'HAPUS') {
    throw new HttpError(422, 'Konfirmasi tidak valid', 'validation_error');
  }
  if (req.params.id === req.user.id) {
    throw new HttpError(400, 'Gunakan pengaturan akun untuk menghapus akun sendiri', 'self_delete');
  }

  const target = await findUserById(req.params.id);
  if (!target) throw new HttpError(404, 'Pengguna tidak ditemukan', 'not_found');

  if (target.role === 'admin') {
    const admins = await query(
      "SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND status = 'active'",
    );
    if (admins.rows[0].count <= 1) {
      throw new HttpError(400, 'Admin aktif terakhir tidak dapat dihapus', 'last_admin');
    }
  }

  const files = await query(
    `SELECT file_path, thumbnail_path, og_image_path, favicon_path, custom_thumbnail_path
     FROM items WHERE user_id = $1`,
    [target.id],
  );
  const relativePaths = files.rows.flatMap((row) => Object.values(row).filter(Boolean));
  if (target.avatar_path) relativePaths.push(target.avatar_path);

  await withTransaction(async (client) => {
    await client.query('DELETE FROM users WHERE id = $1', [target.id]);
  });

  await audit(req.user.id, 'delete_user', target.id, { email: target.email }, req);

  for (const relative of relativePaths) {
    const absolute = path.join(config.storageDir, relative);
    if (absolute.startsWith(config.storageDir)) {
      fs.promises.unlink(absolute).catch(() => {});
    }
  }
  for (const dir of [config.uploadDir, config.avatarDir, config.metadataDir]) {
    fs.promises.rm(path.join(dir, target.id), { recursive: true, force: true }).catch(() => {});
  }

  res.json({ message: 'Akun pengguna dan seluruh datanya dihapus permanen' });
});

export default adminRouter;
