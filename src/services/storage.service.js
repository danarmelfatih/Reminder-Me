import fs from 'node:fs';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import { allowedExtensions, config, documentMimeTypes, imageMimeTypes } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { randomHex } from '../lib/tokens.js';

const EXTENSION_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const CFB_MIMES = new Set(['application/x-cfb', 'application/x-ole-storage', 'application/msword']);

function legacyCfbMime(extension) {
  if (extension === 'doc') return 'application/msword';
  if (extension === 'xls') return 'application/vnd.ms-excel';
  if (extension === 'ppt') return 'application/vnd.ms-powerpoint';
  return null;
}

export function fileExtension(originalName) {
  return path
    .extname(originalName || '')
    .slice(1)
    .toLowerCase();
}

export function safeDownloadName(name, fallback = 'file') {
  const base = path.basename(String(name || fallback));
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, '_').trim();
  return cleaned || fallback;
}

export async function validateUploadedFile(file, expectedKind) {
  if (!file) {
    throw new HttpError(422, 'File wajib diunggah', 'file_required');
  }

  const extension = fileExtension(file.originalname);
  if (!allowedExtensions.has(extension)) {
    throw new HttpError(422, 'Ekstensi file tidak didukung', 'invalid_file_type');
  }

  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
  const kind = isImage ? 'image' : 'document';
  if (expectedKind && expectedKind !== kind) {
    throw new HttpError(422, 'Jenis file tidak sesuai', 'invalid_file_type');
  }

  const maxBytes = isImage ? config.maxImageBytes : config.maxDocumentBytes;
  if (file.size > maxBytes) {
    throw new HttpError(
      413,
      isImage ? 'Ukuran gambar maksimal 10 MB' : 'Ukuran dokumen maksimal 25 MB',
      'file_too_large',
    );
  }

  const detected = await fileTypeFromFile(file.path).catch(() => null);
  let mime = EXTENSION_MIME[extension];

  if (isImage) {
    if (!detected || !imageMimeTypes.has(detected.mime) || detected.mime !== mime) {
      throw new HttpError(422, 'Isi file tidak cocok dengan ekstensi gambar', 'invalid_file_type');
    }
    mime = detected.mime;
  } else if (extension === 'txt') {
    const buffer = await fs.promises.readFile(file.path);
    if (buffer.includes(0)) {
      throw new HttpError(422, 'File TXT tidak valid', 'invalid_file_type');
    }
    mime = 'text/plain';
  } else if (extension === 'pdf') {
    if (detected?.mime !== 'application/pdf') {
      throw new HttpError(422, 'File PDF tidak valid', 'invalid_file_type');
    }
    mime = detected.mime;
  } else if (['doc', 'xls', 'ppt'].includes(extension)) {
    if (!detected || !CFB_MIMES.has(detected.mime)) {
      throw new HttpError(
        422,
        'File Office lama tidak valid atau tidak didukung',
        'invalid_file_type',
      );
    }
    mime = legacyCfbMime(extension);
  } else {
    const expectedMime = EXTENSION_MIME[extension];
    if (!detected || detected.mime !== expectedMime || !documentMimeTypes.has(expectedMime)) {
      throw new HttpError(422, 'Isi file tidak cocok dengan ekstensinya', 'invalid_file_type');
    }
    mime = expectedMime;
  }

  return { kind, mime, extension, size: file.size };
}

export async function persistItemFile({ userId, itemId, tempFile, extension }) {
  const dir = path.join(config.uploadDir, userId, itemId);
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${randomHex(16)}.${extension}`;
  const destination = path.join(dir, filename);
  await fs.promises.rename(tempFile.path, destination);
  return {
    absolutePath: destination,
    relativePath: path.relative(config.storageDir, destination),
  };
}

export async function generateImageThumbnail({ sourceAbsolutePath, userId, itemId }) {
  const dir = path.join(config.uploadDir, userId, itemId);
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `thumb-${randomHex(10)}.webp`;
  const destination = path.join(dir, filename);
  try {
    await sharp(sourceAbsolutePath)
      .rotate()
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(destination);
    return path.relative(config.storageDir, destination);
  } catch (error) {
    logger.warn({ err: error, itemId }, 'Failed to generate thumbnail');
    fs.promises.unlink(destination).catch(() => {});
    return null;
  }
}

export async function generateCachedImage(sourceAbsolutePath, targetDir, prefix, maxWidth = 1200) {
  await fs.promises.mkdir(targetDir, { recursive: true });
  const filename = `${prefix}-${randomHex(10)}.webp`;
  const destination = path.join(targetDir, filename);
  await sharp(sourceAbsolutePath)
    .rotate()
    .resize(maxWidth, maxWidth, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(destination);
  return path.relative(config.storageDir, destination);
}

export async function removeRelativeFiles(relativePaths = []) {
  await Promise.all(
    relativePaths.filter(Boolean).map((relative) => {
      const absolute = path.join(config.storageDir, relative);
      if (!absolute.startsWith(config.storageDir)) return Promise.resolve();
      return fs.promises.unlink(absolute).catch(() => {});
    }),
  );
}

export async function removeItemDirectory(userId, itemId) {
  await fs.promises
    .rm(path.join(config.uploadDir, userId, itemId), { recursive: true, force: true })
    .catch(() => {});
}

export function absolutePath(relative) {
  if (!relative) return null;
  const resolved = path.join(config.storageDir, relative);
  if (!resolved.startsWith(config.storageDir)) return null;
  return resolved;
}

export async function reserveStorage(client, userId, bytes) {
  if (!bytes) return;
  const result = await client.query(
    'SELECT storage_quota_bytes, storage_used_bytes FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, 'Pengguna tidak ditemukan', 'not_found');
  }
  const quota = Number(result.rows[0].storage_quota_bytes);
  const used = Number(result.rows[0].storage_used_bytes);
  if (used + bytes > quota) {
    throw new HttpError(
      413,
      'Kapasitas penyimpanan penuh. Hapus beberapa file untuk membebaskan ruang.',
      'storage_full',
    );
  }
  await client.query(
    'UPDATE users SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2',
    [bytes, userId],
  );
}

export async function releaseStorage(client, userId, bytes) {
  if (!bytes) return;
  await client.query(
    'UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2',
    [bytes, userId],
  );
}
