import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Endpoint tidak ditemukan' },
    });
  }
  return res.status(404).render('pages/error', {
    layout: req.user ? 'layouts/app' : 'layouts/public',
    title: 'Halaman tidak ditemukan',
    status: 404,
    message: 'Halaman yang Anda cari tidak tersedia.',
    pageScript: null,
  });
}

function isApiRequest(req) {
  return req.path.startsWith('/api') || req.accepts(['html', 'json']) === 'json';
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = 500;
  let code = 'internal_error';
  let message = 'Terjadi kesalahan pada server';
  let details;

  if (error instanceof HttpError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      code = 'file_too_large';
      message = 'Ukuran file melebihi batas yang diizinkan';
    } else {
      status = 400;
      code = 'upload_error';
      message = 'Upload file gagal';
    }
  } else if (error?.type === 'entity.too.large') {
    status = 413;
    code = 'payload_too_large';
    message = 'Data yang dikirim terlalu besar';
  } else if (error?.type === 'entity.parse.failed') {
    status = 400;
    code = 'invalid_json';
    message = 'Format data tidak valid';
  }

  if (status >= 500) {
    logger.error({ err: error, path: req.originalUrl, method: req.method }, 'Request failed');
  } else {
    logger.debug({ err: error, path: req.originalUrl, method: req.method }, 'Request error');
  }

  if (isApiRequest(req)) {
    return res.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    });
  }

  return res.status(status).render('pages/error', {
    layout: req.user ? 'layouts/app' : 'layouts/public',
    title: status === 404 ? 'Tidak ditemukan' : 'Terjadi kesalahan',
    status,
    message: config.isProd && status >= 500 ? 'Terjadi kesalahan pada server.' : message,
    pageScript: null,
  });
}
