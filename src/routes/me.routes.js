import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import { config, imageMimeTypes } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { randomHex } from '../lib/tokens.js';
import { deleteAccountSchema, parse, updateProfileSchema } from '../lib/validation.js';
import { cleanupFile, uploadAvatar } from '../middleware/upload.js';
import {
  hashPassword,
  reauthIsFresh,
  revokeAllSessions,
  toPublicUser,
  updateUserPassword,
  verifyPassword,
} from '../services/auth.service.js';
import { sendTemplate } from '../services/mail.service.js';
import { passwordChangedEmail } from '../services/mail.templates.js';
import { storageSummary } from '../services/user.service.js';

export const meRouter = express.Router();

meRouter.get('/', (req, res) => {
  res.json({
    user: toPublicUser(req.user),
    storage: storageSummary(req.user),
  });
});

meRouter.get('/storage', async (req, res) => {
  const result = await query(
    `SELECT
       coalesce(sum(file_size) FILTER (WHERE deleted_at IS NULL), 0)::bigint AS active_bytes,
       coalesce(sum(file_size) FILTER (WHERE deleted_at IS NOT NULL), 0)::bigint AS trash_bytes,
       count(*) FILTER (WHERE deleted_at IS NULL AND type IN ('image', 'document'))::int AS active_count,
       count(*) FILTER (WHERE deleted_at IS NOT NULL AND type IN ('image', 'document'))::int AS trash_count
     FROM items WHERE user_id = $1`,
    [req.user.id],
  );
  const row = result.rows[0];
  res.json({
    storage: storageSummary(req.user),
    files: {
      activeBytes: Number(row.active_bytes),
      trashBytes: Number(row.trash_bytes),
      activeCount: row.active_count,
      trashCount: row.trash_count,
    },
  });
});

meRouter.patch('/', async (req, res) => {
  const data = parse(updateProfileSchema, req.body);
  const fields = [];
  const values = [];
  let index = 1;
  if (data.name !== undefined) {
    fields.push(`name = $${index++}`);
    values.push(data.name);
  }
  if (data.timezone !== undefined) {
    fields.push(`timezone = $${index++}`);
    values.push(data.timezone);
  }
  if (!fields.length) {
    return res.json({ message: 'Tidak ada perubahan', user: toPublicUser(req.user) });
  }
  values.push(req.user.id);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
    values,
  );
  res.json({ message: 'Profil diperbarui', user: toPublicUser(result.rows[0]) });
});

meRouter.post('/password', async (req, res) => {
  const body = req.body ?? {};
  const newPassword = String(body.newPassword ?? '');
  const currentPassword = String(body.currentPassword ?? '');

  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new HttpError(422, 'Password baru minimal 8 karakter', 'validation_error');
  }

  if (req.user.password_hash) {
    const valid = await verifyPassword(currentPassword, req.user.password_hash);
    if (!valid) {
      throw new HttpError(400, 'Password saat ini salah', 'invalid_password');
    }
  } else if (!reauthIsFresh(req.session)) {
    throw new HttpError(
      403,
      'Verifikasi ulang dengan Google diperlukan sebelum mengatur password',
      'reauth_required',
    );
  }

  const hash = await hashPassword(newPassword);
  await updateUserPassword(req.user.id, hash);
  await revokeAllSessions(req.user.id, req.session.id);
  try {
    await sendTemplate(req.user.email, passwordChangedEmail({ name: req.user.name }));
  } catch (error) {
    logger.error({ err: error, userId: req.user.id }, 'Failed to send password changed email');
  }
  res.json({ message: 'Password berhasil diubah. Sesi lain telah dicabut.' });
});

meRouter.post('/avatar', uploadAvatar, async (req, res) => {
  if (!req.file) {
    throw new HttpError(422, 'Pilih file gambar terlebih dahulu', 'file_required');
  }

  try {
    if (req.file.size > config.maxAvatarBytes) {
      throw new HttpError(413, 'Ukuran foto profil maksimal 2 MB', 'file_too_large');
    }
    const detected = await fileTypeFromFile(req.file.path);
    if (!detected || !imageMimeTypes.has(detected.mime)) {
      throw new HttpError(422, 'Foto profil harus JPG, PNG, atau WEBP', 'invalid_file_type');
    }

    const userDir = path.join(config.avatarDir, req.user.id);
    await fs.promises.mkdir(userDir, { recursive: true });
    const filename = `${randomHex(16)}.webp`;
    const destination = path.join(userDir, filename);
    await sharp(req.file.path)
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 84 })
      .toFile(destination);

    const relativePath = path.relative(config.storageDir, destination);
    const previous = req.user.avatar_path;

    const result = await query('UPDATE users SET avatar_path = $1 WHERE id = $2 RETURNING *', [
      relativePath,
      req.user.id,
    ]);

    if (previous) {
      const previousPath = path.join(config.storageDir, previous);
      if (previousPath.startsWith(config.avatarDir)) {
        fs.promises.unlink(previousPath).catch(() => {});
      }
    }

    res.json({ message: 'Foto profil diperbarui', user: toPublicUser(result.rows[0]) });
  } finally {
    cleanupFile(req.file);
  }
});

meRouter.get('/avatar', (req, res) => {
  if (!req.user.avatar_path) {
    throw new HttpError(404, 'Foto profil tidak ditemukan', 'not_found');
  }
  const filePath = path.join(config.storageDir, req.user.avatar_path);
  if (!filePath.startsWith(config.avatarDir)) {
    throw new HttpError(404, 'Foto profil tidak ditemukan', 'not_found');
  }
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
});

meRouter.delete('/', async (req, res) => {
  const data = parse(deleteAccountSchema, req.body ?? {});

  if (req.user.password_hash) {
    const valid = await verifyPassword(data.password ?? '', req.user.password_hash);
    if (!valid) {
      throw new HttpError(400, 'Password salah. Penghapusan dibatalkan.', 'invalid_password');
    }
  } else if (!reauthIsFresh(req.session)) {
    throw new HttpError(
      403,
      'Verifikasi ulang dengan Google diperlukan sebelum menghapus akun',
      'reauth_required',
    );
  }

  if (req.user.role === 'admin') {
    const admins = await query(
      "SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND status = 'active'",
    );
    if (admins.rows[0].count <= 1) {
      throw new HttpError(
        400,
        'Admin terakhir tidak dapat menghapus akunnya sendiri',
        'last_admin',
      );
    }
  }

  const files = await query(
    `SELECT file_path, thumbnail_path, og_image_path, favicon_path, custom_thumbnail_path
     FROM items WHERE user_id = $1`,
    [req.user.id],
  );

  const relativePaths = [];
  for (const row of files.rows) {
    for (const value of Object.values(row)) {
      if (value) relativePaths.push(value);
    }
  }
  if (req.user.avatar_path) relativePaths.push(req.user.avatar_path);

  await withTransaction(async (client) => {
    await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1', [req.user.id]);
    await client.query('DELETE FROM users WHERE id = $1', [req.user.id]);
  });

  for (const relative of relativePaths) {
    const absolute = path.join(config.storageDir, relative);
    if (absolute.startsWith(config.storageDir)) {
      fs.promises.unlink(absolute).catch(() => {});
    }
  }
  fs.promises
    .rm(path.join(config.uploadDir, req.user.id), { recursive: true, force: true })
    .catch(() => {});
  fs.promises
    .rm(path.join(config.avatarDir, req.user.id), { recursive: true, force: true })
    .catch(() => {});
  fs.promises
    .rm(path.join(config.metadataDir, req.user.id), { recursive: true, force: true })
    .catch(() => {});

  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
  res.json({ message: 'Akun dan seluruh data berhasil dihapus permanen.' });
});

export default meRouter;
