import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { randomHex } from '../lib/tokens.js';

function storage(maxBytes) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(config.tmpDir, { recursive: true });
      cb(null, config.tmpDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, `${Date.now()}-${randomHex(12)}${ext}`);
    },
  });
}

export const uploadItemFile = multer({
  storage: storage(config.maxDocumentBytes),
  limits: {
    fileSize: config.maxDocumentBytes,
    files: 1,
    fields: 30,
    fieldSize: 2 * 1024 * 1024,
  },
}).single('file');

export const uploadAvatar = multer({
  storage: storage(config.maxAvatarBytes),
  limits: { fileSize: config.maxAvatarBytes, files: 1, fields: 10 },
}).single('avatar');

export const uploadThumbnail = multer({
  storage: storage(config.maxThumbnailBytes),
  limits: { fileSize: config.maxThumbnailBytes, files: 1, fields: 10 },
}).single('thumbnail');

export function cleanupFile(file) {
  if (file?.path) {
    fs.promises.unlink(file.path).catch(() => {});
  }
}
