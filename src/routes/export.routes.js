import fs from 'node:fs';
import { ZipArchive } from 'archiver';
import express from 'express';
import { query } from '../db/pool.js';
import { absolutePath, safeDownloadName } from '../services/storage.service.js';

export const exportRouter = express.Router();

exportRouter.get('/', async (req, res, next) => {
  const userId = req.user.id;

  const [folders, tags, items, itemTags, reminders, notifications, contents] = await Promise.all([
    query('SELECT id, name, created_at, updated_at FROM folders WHERE user_id = $1 ORDER BY name', [
      userId,
    ]),
    query('SELECT id, name, created_at, updated_at FROM tags WHERE user_id = $1 ORDER BY name', [
      userId,
    ]),
    query(
      `SELECT id, type, title, description, url, domain, link_metadata, file_path, file_name,
              file_mime, file_ext, file_size, folder_id, priority, is_favorite, is_archived,
              deleted_at, created_at, updated_at
       FROM items WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    ),
    query(
      `SELECT it.item_id, t.id, t.name
       FROM item_tags it
       JOIN tags t ON t.id = it.tag_id
       JOIN items i ON i.id = it.item_id
       WHERE i.user_id = $1
       ORDER BY lower(t.name)`,
      [userId],
    ),
    query(
      `SELECT id, item_id, type, timezone, start_at, rrule, repeat_until, next_run_at,
              is_active, completed_at, created_at
       FROM reminders WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    ),
    query(
      `SELECT id, item_id, type, title, body, is_read, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    ),
    query(
      `SELECT ic.item_id, ic.extracted_text, ic.extraction_status, ic.char_count
       FROM item_contents ic
       JOIN items i ON i.id = ic.item_id
       WHERE i.user_id = $1`,
      [userId],
    ),
  ]);

  const tagsByItem = new Map();
  for (const row of itemTags.rows) {
    const list = tagsByItem.get(row.item_id) ?? [];
    list.push({ id: row.id, name: row.name });
    tagsByItem.set(row.item_id, list);
  }
  const contentsByItem = new Map(contents.rows.map((row) => [row.item_id, row]));

  const data = {
    exportedAt: new Date().toISOString(),
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      timezone: req.user.timezone,
      createdAt: req.user.created_at,
    },
    folders: folders.rows,
    tags: tags.rows,
    items: items.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      url: row.url,
      domain: row.domain,
      linkMetadata: row.link_metadata,
      folderId: row.folder_id,
      priority: row.priority,
      isFavorite: row.is_favorite,
      isArchived: row.is_archived,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: tagsByItem.get(row.id) ?? [],
      file: row.file_name
        ? {
            name: row.file_name,
            mime: row.file_mime,
            extension: row.file_ext,
            size: Number(row.file_size),
          }
        : null,
      content: contentsByItem.get(row.id) ?? null,
    })),
    reminders: reminders.rows,
    notifications: notifications.rows,
  };

  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('warning', (error) => {
    if (error.code !== 'ENOENT') res.destroy(error);
  });
  archive.on('error', (error) => {
    if (!res.headersSent) next(error);
    else res.destroy(error);
  });

  const filename = `reminder-me-export-${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  archive.pipe(res);

  archive.append(JSON.stringify(data, null, 2), { name: 'data.json' });

  for (const row of items.rows) {
    if (!row.file_name) continue;
    const file = absolutePath(row.file_path ?? '');
    if (!file || !fs.existsSync(file)) continue;
    archive.file(file, {
      name: `files/${row.id}/${safeDownloadName(row.file_name, `item-${row.id}`)}`,
    });
  }

  if (req.user.avatar_path) {
    const avatar = absolutePath(req.user.avatar_path);
    if (avatar && fs.existsSync(avatar)) {
      archive.file(avatar, { name: 'profile/avatar.webp' });
    }
  }

  await archive.finalize();
});

export default exportRouter;
