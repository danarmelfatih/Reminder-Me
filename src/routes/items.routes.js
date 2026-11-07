import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import { config, imageMimeTypes } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { randomHex } from '../lib/tokens.js';
import {
  itemBaseSchema,
  itemFilterQuerySchema,
  itemUpdateSchema,
  linkItemSchema,
  parse,
  parsePagination,
  reminderSchema,
  snoozeSchema,
  textItemSchema,
} from '../lib/validation.js';
import { uuidParam } from '../middleware/params.js';
import { cleanupFile, uploadItemFile, uploadThumbnail } from '../middleware/upload.js';
import { toPublicUser } from '../services/auth.service.js';
import {
  createItem,
  deleteItemPermanently,
  getItem,
  getRawItem,
  listItems,
  restoreItem,
  setArchived,
  setFavorite,
  trashItem,
  updateItem,
} from '../services/item.service.js';
import {
  completeReminder,
  deleteReminder,
  snoozeReminder,
  upsertReminder,
} from '../services/reminder.service.js';
import {
  absolutePath,
  safeDownloadName,
  validateUploadedFile,
} from '../services/storage.service.js';

export const itemsRouter = express.Router();

itemsRouter.param('id', uuidParam);

const VIEWS = new Set(['all', 'favorites', 'archive', 'trash']);
const SORTS = new Set(['priority', 'newest', 'oldest', 'updated', 'name']);
const TYPES = new Set(['link', 'text', 'image', 'document']);
const PRIORITIES = new Set(['high', 'medium', 'low']);

function uploadIfMultipart(req, res, next) {
  if (req.is('multipart/form-data')) {
    return uploadItemFile(req, res, next);
  }
  return next();
}

function parseTagIds(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new HttpError(422, 'Daftar tag tidak valid', 'validation_error');
  }
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1' || value === 'on';
}

itemsRouter.get('/', async (req, res) => {
  const view = VIEWS.has(req.query.view) ? req.query.view : 'all';
  const sort = SORTS.has(req.query.sort) ? req.query.sort : 'newest';
  const type = TYPES.has(req.query.type) ? req.query.type : null;
  const priority = PRIORITIES.has(req.query.priority) ? req.query.priority : null;
  const reminder = ['active', 'none'].includes(req.query.reminder) ? req.query.reminder : null;
  const filters = parse(itemFilterQuerySchema, {
    folderId: req.query.folderId,
    tagId: req.query.tagId,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
  });
  const folderId = filters.folderId ?? null;
  const tagId = filters.tagId ?? null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  const dateFrom = filters.dateFrom ?? null;
  const dateTo = filters.dateTo ?? null;
  const pagination = parsePagination(req.query, 24, 100);

  const data = await listItems(
    req.user.id,
    {
      view,
      sort,
      type,
      priority,
      reminder,
      folderId,
      tagId,
      q,
      dateFrom,
      dateTo,
    },
    pagination,
  );

  const itemCounts = await query(
    `SELECT
      count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = false)::int AS active,
      count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = true)::int AS archived,
      count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trash,
      count(*) FILTER (WHERE deleted_at IS NULL AND is_favorite = true AND is_archived = false)::int AS favorites
     FROM items WHERE user_id = $1`,
    [req.user.id],
  );

  res.json({ ...data, counts: itemCounts.rows[0] });
});

itemsRouter.get('/:id', async (req, res) => {
  const item = await getItem(req.user.id, req.params.id);
  if (!item) throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
  const content = await query(
    'SELECT extraction_status, char_count FROM item_contents WHERE item_id = $1',
    [item.id],
  );
  res.json({
    item,
    extraction: content.rows[0] ?? null,
    user: toPublicUser(req.user),
  });
});

itemsRouter.post('/', uploadIfMultipart, async (req, res) => {
  try {
    const isMultipart = req.is('multipart/form-data');
    let data;
    let fileInfo = null;

    if (isMultipart) {
      const type = String(req.body.type ?? '');
      if (!TYPES.has(type)) {
        throw new HttpError(422, 'Jenis konten tidak valid', 'validation_error');
      }
      const base = {
        type,
        title: String(req.body.title ?? '').trim(),
        description: req.body.description ? String(req.body.description) : null,
        priority: String(req.body.priority ?? 'medium'),
        folderId: req.body.folderId ? String(req.body.folderId) : null,
        tagIds: parseTagIds(req.body.tagIds),
        isFavorite: parseBoolean(req.body.isFavorite),
        url: req.body.url ? String(req.body.url) : null,
        linkMetadata: null,
      };

      if (type === 'link' || type === 'text') {
        data = parse(type === 'link' ? linkItemSchema : textItemSchema, base);
      } else {
        if (!req.file) throw new HttpError(422, 'File wajib diunggah', 'file_required');
        const validated = await validateUploadedFile(req.file, type);
        data = parse(itemBaseSchema, base);
        fileInfo = { tempFile: req.file, validated };
      }
    } else {
      const type = String(req.body?.type ?? '');
      if (type === 'link') {
        data = parse(linkItemSchema, req.body);
      } else if (type === 'text') {
        data = parse(textItemSchema, req.body);
      } else if (TYPES.has(type)) {
        throw new HttpError(422, 'File harus diunggah melalui form multipart', 'file_required');
      } else {
        throw new HttpError(422, 'Jenis konten tidak valid', 'validation_error');
      }
    }

    const item = await createItem(req.user, data, fileInfo);
    res.status(201).json({ message: 'Item berhasil disimpan', item });
  } catch (error) {
    cleanupFile(req.file);
    throw error;
  }
});

itemsRouter.patch('/:id', async (req, res) => {
  const data = parse(itemUpdateSchema, req.body);
  const item = await updateItem(req.user.id, req.params.id, data);
  res.json({ message: 'Item diperbarui', item });
});

itemsRouter.delete('/:id', async (req, res) => {
  await trashItem(req.user.id, req.params.id);
  res.json({ message: 'Item dipindahkan ke Trash. Pengingat dinonaktifkan.' });
});

itemsRouter.post('/:id/restore', async (req, res) => {
  const item = await restoreItem(req.user.id, req.params.id);
  res.json({ message: 'Item dipulihkan. Pengingat tetap nonaktif.', item });
});

itemsRouter.delete('/:id/permanent', async (req, res) => {
  await deleteItemPermanently(req.user.id, req.params.id);
  res.json({ message: 'Item dihapus permanen.' });
});

itemsRouter.post('/:id/favorite', async (req, res) => {
  const value = parseBoolean(req.body?.value, true);
  const item = await setFavorite(req.user.id, req.params.id, value);
  res.json({ message: value ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit', item });
});

itemsRouter.post('/:id/archive', async (req, res) => {
  const value = parseBoolean(req.body?.value, true);
  const item = await setArchived(req.user.id, req.params.id, value);
  res.json({
    message: value ? 'Item diarsipkan. Pengingat tetap aktif.' : 'Item dikeluarkan dari arsip',
    item,
  });
});

itemsRouter.put('/:id/reminder', async (req, res) => {
  const data = parse(reminderSchema, req.body);
  const reminder = await upsertReminder(req.user.id, req.params.id, data);
  res.json({ message: 'Pengingat disimpan', reminder });
});

itemsRouter.delete('/:id/reminder', async (req, res) => {
  await deleteReminder(req.user.id, req.params.id);
  res.json({ message: 'Pengingat dihapus' });
});

itemsRouter.post('/:id/reminder/complete', async (req, res) => {
  const reminder = await completeReminder(req.user.id, req.params.id);
  res.json({ message: 'Pengingat ditandai selesai', reminder });
});

itemsRouter.post('/:id/reminder/snooze', async (req, res) => {
  const data = parse(snoozeSchema, req.body);
  const reminder = await snoozeReminder(req.user.id, req.params.id, data.durationMinutes);
  res.json({ message: 'Pengingat ditunda', reminder });
});

itemsRouter.get('/:id/file', async (req, res) => {
  const item = await getRawItem(req.user.id, req.params.id);
  if (!item || !item.file_path) {
    throw new HttpError(404, 'File tidak ditemukan', 'not_found');
  }
  const file = absolutePath(item.file_path);
  if (!file) throw new HttpError(404, 'File tidak ditemukan', 'not_found');
  try {
    await fs.promises.access(file);
  } catch {
    throw new HttpError(404, 'File tidak ditemukan', 'not_found');
  }

  const download = req.query.download === '1';
  const inline = item.type === 'image' && !download;
  const filename = safeDownloadName(item.file_name, `item-${item.id}`);
  res.setHeader('Content-Type', item.file_mime || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.sendFile(file);
});

async function serveAsset(req, res, pathValue, contentType = 'image/webp') {
  const file = absolutePath(pathValue);
  if (!file) throw new HttpError(404, 'Aset tidak ditemukan', 'not_found');
  try {
    await fs.promises.access(file);
  } catch {
    throw new HttpError(404, 'Aset tidak ditemukan', 'not_found');
  }
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
}

itemsRouter.get('/:id/thumbnail', async (req, res) => {
  const item = await getRawItem(req.user.id, req.params.id);
  if (!item) throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
  if (req.query.kind === 'custom') {
    return serveAsset(req, res, item.custom_thumbnail_path);
  }
  return serveAsset(req, res, item.thumbnail_path);
});

itemsRouter.get('/:id/og-image', async (req, res) => {
  const item = await getRawItem(req.user.id, req.params.id);
  if (!item) throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
  return serveAsset(req, res, item.og_image_path);
});

itemsRouter.get('/:id/favicon', async (req, res) => {
  const item = await getRawItem(req.user.id, req.params.id);
  if (!item) throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
  return serveAsset(req, res, item.favicon_path, 'image/png');
});

itemsRouter.post('/:id/thumbnail', uploadThumbnail, async (req, res) => {
  if (!req.file) throw new HttpError(422, 'Pilih gambar thumbnail', 'file_required');
  try {
    const item = await getRawItem(req.user.id, req.params.id);
    if (!item) throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
    if (item.type !== 'link') {
      throw new HttpError(422, 'Thumbnail kustom hanya untuk item link', 'invalid_type');
    }
    const detected = await fileTypeFromFile(req.file.path).catch(() => null);
    if (!detected || !imageMimeTypes.has(detected.mime)) {
      throw new HttpError(422, 'Thumbnail harus JPG, PNG, atau WEBP', 'invalid_file_type');
    }
    if (req.file.size > config.maxThumbnailBytes) {
      throw new HttpError(413, 'Ukuran thumbnail maksimal 2 MB', 'file_too_large');
    }

    const dir = path.join(config.uploadDir, req.user.id, item.id);
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = `thumb-custom-${randomHex(10)}.webp`;
    const destination = path.join(dir, filename);
    await sharp(req.file.path)
      .rotate()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(destination);
    const relative = path.relative(config.storageDir, destination);

    const old = item.custom_thumbnail_path;
    await query('UPDATE items SET custom_thumbnail_path = $1 WHERE id = $2 AND user_id = $3', [
      relative,
      item.id,
      req.user.id,
    ]);
    if (old) {
      const oldPath = absolutePath(old);
      if (oldPath) fs.promises.unlink(oldPath).catch(() => {});
    }

    const updated = await getItem(req.user.id, item.id);
    res.json({ message: 'Thumbnail diperbarui', item: updated });
  } finally {
    cleanupFile(req.file);
  }
});

export default itemsRouter;
