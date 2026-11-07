import crypto from 'node:crypto';
import path from 'node:path';
import { RRule } from 'rrule';
import { config } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { assertFolderOwnership } from './folder.service.js';
import { fetchImage } from './metadata.service.js';
import {
  generateCachedImage,
  generateImageThumbnail,
  persistItemFile,
  releaseStorage,
  removeItemDirectory,
  removeRelativeFiles,
  reserveStorage,
} from './storage.service.js';
import { assertTagsOwnership } from './tag.service.js';

const ITEM_SELECT = `
  SELECT i.*, f.name AS folder_name,
    COALESCE(
      json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY lower(t.name))
        FILTER (WHERE t.id IS NOT NULL),
      '[]'::json
    ) AS tags,
    r.id AS reminder_id, r.is_active AS reminder_active, r.type AS reminder_type,
    r.next_run_at AS reminder_next_run_at, r.timezone AS reminder_timezone,
    r.start_at AS reminder_start_at, r.rrule AS reminder_rrule,
    r.repeat_until AS reminder_repeat_until
  FROM items i
  LEFT JOIN folders f ON f.id = i.folder_id
  LEFT JOIN item_tags it ON it.item_id = i.id
  LEFT JOIN tags t ON t.id = it.tag_id
  LEFT JOIN reminders r ON r.item_id = i.id
`;

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

const RRULE_FREQUENCIES = new Map([
  [RRule.DAILY, 'daily'],
  [RRule.WEEKLY, 'weekly'],
  [RRule.MONTHLY, 'monthly'],
  [RRule.YEARLY, 'yearly'],
]);

function recurrenceFromRule(rruleText, repeatUntil) {
  if (!rruleText) return null;
  try {
    const rule = RRule.fromString(rruleText);
    return {
      frequency: RRULE_FREQUENCIES.get(rule.options.freq) ?? 'daily',
      interval: Math.max(1, Number(rule.options.interval) || 1),
      weekdays: (rule.options.byweekday ?? []).map((day) => (Number(day) + 1) % 7),
      repeatUntil: repeatUntil ?? rule.options.until ?? null,
    };
  } catch {
    return null;
  }
}

async function cacheLinkAssets({ userId, itemId, metadata }) {
  const targetDir = path.join(config.metadataDir, userId, itemId);
  const cache = async (url, prefix, maxWidth, format) => {
    if (!url) return null;
    try {
      const image = await fetchImage(url);
      return await generateCachedImage(image.buffer, targetDir, prefix, maxWidth, format);
    } catch (error) {
      logger.warn({ err: error, userId, itemId, prefix }, 'Failed to cache link asset');
      return null;
    }
  };

  const [ogImagePath, faviconPath] = await Promise.all([
    cache(metadata?.imageUrl, 'og', 1200, 'webp'),
    cache(metadata?.faviconUrl, 'favicon', 128, 'png'),
  ]);
  return { ogImagePath, faviconPath };
}

export function toPublicItem(row) {
  if (!row) return null;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const trashPurgeAt = row.deleted_at
    ? new Date(new Date(row.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;
  const isLink = row.type === 'link';
  const isImage = row.type === 'image';

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    url: row.url,
    domain: row.domain,
    priority: row.priority,
    isFavorite: row.is_favorite,
    isArchived: row.is_archived,
    deletedAt: row.deleted_at,
    trashPurgeAt,
    folder: row.folder_id ? { id: row.folder_id, name: row.folder_name } : null,
    tags,
    file: row.file_path
      ? {
          name: row.file_name,
          mime: row.file_mime,
          extension: row.file_ext,
          size: Number(row.file_size),
          url: `/api/items/${row.id}/file`,
          downloadUrl: `/api/items/${row.id}/file?download=1`,
        }
      : null,
    thumbnailUrl: isImage && row.thumbnail_path ? `/api/items/${row.id}/thumbnail` : null,
    link: isLink
      ? {
          imageUrl: row.custom_thumbnail_path
            ? `/api/items/${row.id}/thumbnail?kind=custom`
            : row.og_image_path
              ? `/api/items/${row.id}/og-image`
              : null,
          faviconUrl: row.favicon_path ? `/api/items/${row.id}/favicon` : null,
          metadata: row.link_metadata ?? null,
        }
      : null,
    reminder: row.reminder_id
      ? {
          id: row.reminder_id,
          isActive: row.reminder_active,
          type: row.reminder_type,
          nextRunAt: row.reminder_next_run_at,
          timezone: row.reminder_timezone,
          startAt: row.reminder_start_at,
          recurrence: recurrenceFromRule(row.reminder_rrule, row.reminder_repeat_until),
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildFilters(userId, filters = {}) {
  const conditions = ['i.user_id = $1'];
  const params = [userId];

  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const view = filters.view ?? 'all';
  if (view === 'trash') {
    conditions.push('i.deleted_at IS NOT NULL');
  } else {
    conditions.push('i.deleted_at IS NULL');
    if (view === 'archive') {
      conditions.push('i.is_archived = true');
    } else if (view === 'favorites') {
      conditions.push('i.is_archived = false AND i.is_favorite = true');
    } else {
      conditions.push('i.is_archived = false');
    }
  }

  if (filters.type) {
    conditions.push(`i.type = ${add(filters.type)}`);
  }
  if (filters.priority) {
    conditions.push(`i.priority = ${add(filters.priority)}`);
  }
  if (filters.folderId) {
    if (filters.folderId === 'none') {
      conditions.push('i.folder_id IS NULL');
    } else {
      conditions.push(`i.folder_id = ${add(filters.folderId)}`);
    }
  }
  if (filters.tagId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM item_tags x WHERE x.item_id = i.id AND x.tag_id = ${add(filters.tagId)})`,
    );
  }
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    conditions.push(
      `(i.search_vector @@ websearch_to_tsquery('simple', ${add(filters.q)})
        OR i.title ILIKE ${add(like)} ESCAPE '\\'
        OR coalesce(i.description, '') ILIKE ${add(like)} ESCAPE '\\'
        OR coalesce(i.file_name, '') ILIKE ${add(like)} ESCAPE '\\')`,
    );
  }
  if (filters.dateFrom) {
    conditions.push(`i.created_at >= ${add(filters.dateFrom)}`);
  }
  if (filters.dateTo) {
    conditions.push(`i.created_at < (${add(filters.dateTo)}::date + interval '1 day')`);
  }
  if (filters.reminder === 'active') {
    conditions.push(
      'EXISTS (SELECT 1 FROM reminders rr WHERE rr.item_id = i.id AND rr.is_active = true)',
    );
  } else if (filters.reminder === 'none') {
    conditions.push(
      'NOT EXISTS (SELECT 1 FROM reminders rr WHERE rr.item_id = i.id AND rr.is_active = true)',
    );
  }

  return { conditions, params };
}

function orderClause(sort) {
  switch (sort) {
    case 'oldest':
      return 'i.created_at ASC';
    case 'updated':
      return 'i.updated_at DESC';
    case 'name':
      return 'lower(i.title) ASC';
    case 'priority':
      return `CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC, i.created_at DESC`;
    default:
      return 'i.created_at DESC';
  }
}

export async function listItems(userId, filters = {}, pagination = { page: 1, perPage: 24 }) {
  const { conditions, params } = buildFilters(userId, filters);
  const where = conditions.join(' AND ');
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const listParams = [...params, pagination.perPage, pagination.offset];

  const itemsResult = await query(
    `${ITEM_SELECT}
     WHERE ${where}
     GROUP BY i.id, f.name, r.id
     ORDER BY ${orderClause(filters.sort)}
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    listParams,
  );

  const countResult = await query(
    `SELECT count(*)::int AS total FROM items i WHERE ${where}`,
    params,
  );

  return {
    items: itemsResult.rows.map(toPublicItem),
    total: countResult.rows[0].total,
    page: pagination.page,
    perPage: pagination.perPage,
  };
}

export async function getItem(userId, itemId, client = null) {
  const runner = client ?? { query };
  const result = await runner.query(
    `${ITEM_SELECT}
     WHERE i.id = $1 AND i.user_id = $2
     GROUP BY i.id, f.name, r.id`,
    [itemId, userId],
  );
  if (result.rowCount === 0) return null;
  return toPublicItem(result.rows[0]);
}

export async function getRawItem(userId, itemId, client = null) {
  const runner = client ?? { query };
  const result = await runner.query('SELECT * FROM items WHERE id = $1 AND user_id = $2', [
    itemId,
    userId,
  ]);
  return result.rows[0] ?? null;
}

export async function assertItemOwnership(userId, itemId, client = null) {
  const item = await getRawItem(userId, itemId, client);
  if (!item) throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
  return item;
}

async function replaceTags(client, itemId, tagIds) {
  await client.query('DELETE FROM item_tags WHERE item_id = $1', [itemId]);
  if (tagIds?.length) {
    const values = tagIds.map((_, index) => `($1, $${index + 2})`).join(', ');
    await client.query(`INSERT INTO item_tags (item_id, tag_id) VALUES ${values}`, [
      itemId,
      ...tagIds,
    ]);
  }
}

export async function createItem(user, data, fileInfo = null) {
  const {
    type,
    title,
    description = null,
    priority = 'medium',
    folderId = null,
    tagIds = [],
    isFavorite = false,
    url = null,
    linkMetadata = null,
  } = data;

  if (folderId) await assertFolderOwnership(user.id, folderId);
  const validTagIds = await assertTagsOwnership(user.id, tagIds);

  const itemId = crypto.randomUUID();
  let storedFile = null;
  let thumbnailPath = null;
  let linkUrl = null;
  let domain = null;
  let cachedAssets = { ogImagePath: null, faviconPath: null };

  if (type === 'link') {
    linkUrl = normalizeUrl(url);
    if (!linkUrl) {
      throw new HttpError(422, 'URL tidak valid', 'invalid_url');
    }
    domain = domainFromUrl(linkUrl);
    cachedAssets = await cacheLinkAssets({
      userId: user.id,
      itemId,
      metadata: linkMetadata,
    });
  }

  if (fileInfo) {
    storedFile = await persistItemFile({
      userId: user.id,
      itemId,
      tempFile: fileInfo.tempFile,
      extension: fileInfo.validated.extension,
    });
    if (fileInfo.validated.kind === 'image') {
      thumbnailPath = await generateImageThumbnail({
        sourceAbsolutePath: storedFile.absolutePath,
        userId: user.id,
        itemId,
      });
    }
  }

  try {
    await withTransaction(async (client) => {
      if (storedFile) {
        await reserveStorage(client, user.id, fileInfo.validated.size);
      }
      await client.query(
        `INSERT INTO items
          (id, user_id, type, title, description, url, domain, link_metadata,
           file_path, file_name, file_mime, file_ext, file_size, thumbnail_path,
           og_image_path, favicon_path, folder_id, priority, is_favorite)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          itemId,
          user.id,
          type,
          title,
          description,
          linkUrl,
          domain,
          linkMetadata ? JSON.stringify(linkMetadata) : null,
          storedFile?.relativePath ?? null,
          fileInfo?.tempFile.originalname ?? null,
          fileInfo?.validated.mime ?? null,
          fileInfo?.validated.extension ?? null,
          fileInfo?.validated.size ?? 0,
          thumbnailPath,
          cachedAssets.ogImagePath,
          cachedAssets.faviconPath,
          folderId || null,
          priority,
          isFavorite,
        ],
      );
      await replaceTags(client, itemId, validTagIds);
      if (type === 'document') {
        await client.query('INSERT INTO item_contents (item_id) VALUES ($1)', [itemId]);
      }
    });
  } catch (error) {
    await removeItemDirectory(user.id, itemId);
    await removeRelativeFiles(Object.values(cachedAssets));
    throw error;
  }

  return getItem(user.id, itemId);
}

export async function updateItem(userId, itemId, data) {
  const existing = await assertItemOwnership(userId, itemId);
  if (existing.deleted_at) {
    throw new HttpError(400, 'Item di Trash tidak dapat diedit', 'item_in_trash');
  }

  if (data.folderId !== undefined && data.folderId) {
    await assertFolderOwnership(userId, data.folderId);
  }
  let validTagIds;
  if (data.tagIds !== undefined) {
    validTagIds = await assertTagsOwnership(userId, data.tagIds);
  }

  const fields = [];
  const values = [];
  let index = 1;
  const set = (column, value) => {
    fields.push(`${column} = $${index++}`);
    values.push(value);
  };

  if (data.title !== undefined) set('title', data.title);
  if (data.description !== undefined) set('description', data.description);
  if (data.priority !== undefined) set('priority', data.priority);
  if (data.folderId !== undefined) set('folder_id', data.folderId || null);
  if (data.isFavorite !== undefined) set('is_favorite', data.isFavorite);

  const pathsToRemove = [];
  let cachedAssets = { ogImagePath: null, faviconPath: null };
  if (data.url !== undefined && existing.type === 'link') {
    const normalized = normalizeUrl(data.url);
    if (!normalized) throw new HttpError(422, 'URL tidak valid', 'invalid_url');
    if (normalized !== existing.url) {
      const linkMetadata = data.linkMetadata ?? null;
      set('url', normalized);
      set('domain', domainFromUrl(normalized));
      set('link_metadata', linkMetadata ? JSON.stringify(linkMetadata) : null);
      cachedAssets = await cacheLinkAssets({ userId, itemId, metadata: linkMetadata });
      set('og_image_path', cachedAssets.ogImagePath);
      set('favicon_path', cachedAssets.faviconPath);
      if (existing.og_image_path) pathsToRemove.push(existing.og_image_path);
      if (existing.favicon_path) pathsToRemove.push(existing.favicon_path);
    }
  }

  if (fields.length === 0 && validTagIds === undefined) {
    return getItem(userId, itemId);
  }

  values.push(itemId, userId);
  try {
    await withTransaction(async (client) => {
      if (fields.length > 0) {
        await client.query(
          `UPDATE items SET ${fields.join(', ')} WHERE id = $${index} AND user_id = $${index + 1}`,
          values,
        );
      }
      if (validTagIds !== undefined) {
        await replaceTags(client, itemId, validTagIds);
      }
    });
  } catch (error) {
    await removeRelativeFiles(Object.values(cachedAssets));
    throw error;
  }

  await removeRelativeFiles(pathsToRemove);
  return getItem(userId, itemId);
}

export async function setFavorite(userId, itemId, isFavorite) {
  const result = await query(
    `UPDATE items SET is_favorite = $1
     WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id`,
    [isFavorite, itemId, userId],
  );
  if (result.rowCount === 0) throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
  return getItem(userId, itemId);
}

export async function setArchived(userId, itemId, isArchived) {
  const result = await query(
    `UPDATE items SET is_archived = $1
     WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id`,
    [isArchived, itemId, userId],
  );
  if (result.rowCount === 0) throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
  return getItem(userId, itemId);
}

export async function trashItem(userId, itemId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE items SET deleted_at = now(), trash_warning_sent_at = NULL
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
      [itemId, userId],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
    }
    await client.query(
      `UPDATE reminders SET is_active = false, next_run_at = NULL
       WHERE item_id = $1 AND user_id = $2`,
      [itemId, userId],
    );
    await client.query(
      `UPDATE reminder_occurrences SET status = 'cancelled'
       WHERE item_id = $1 AND status = 'pending'`,
      [itemId],
    );
    return { id: itemId };
  });
}

export async function restoreItem(userId, itemId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE items SET deleted_at = NULL, trash_warning_sent_at = NULL
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id`,
      [itemId, userId],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Item tidak ditemukan di Trash', 'not_found');
    }
    await client.query(
      `UPDATE reminders SET is_active = false, next_run_at = NULL
       WHERE item_id = $1 AND user_id = $2`,
      [itemId, userId],
    );
    await client.query(
      `UPDATE reminder_occurrences SET status = 'cancelled'
       WHERE item_id = $1 AND status = 'pending'`,
      [itemId],
    );
    return getItem(userId, itemId, client);
  });
}

export async function deleteItemPermanently(userId, itemId) {
  const existing = await assertItemOwnership(userId, itemId);
  if (!existing.deleted_at) {
    throw new HttpError(
      400,
      'Hapus permanen hanya tersedia untuk item di Trash',
      'item_not_in_trash',
    );
  }
  const fileSize = Number(existing.file_size);

  await withTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM items
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
       RETURNING id`,
      [itemId, userId],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Item tidak ditemukan', 'not_found');
    }
    await releaseStorage(client, userId, fileSize);
  });

  await removeItemDirectory(userId, itemId);
  return true;
}

export async function itemStats(userId) {
  const result = await query(
    `SELECT
       count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = false)::int AS active_items,
       count(*) FILTER (WHERE deleted_at IS NULL AND is_archived = true)::int AS archived_items,
       count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trash_items
     FROM items WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0];
}
