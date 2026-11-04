import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

function limiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: message ?? 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.',
        },
      });
    },
  });
}

export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  message: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.',
});

export const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.',
});

export const passwordLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Terlalu banyak permintaan reset password. Coba lagi nanti.',
});

export const resendLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Terlalu banyak permintaan verifikasi. Coba lagi nanti.',
});

export const apiLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
});

export const uploadLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 150,
  message: 'Terlalu banyak upload. Coba lagi nanti.',
});

export const exportLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Terlalu banyak permintaan export. Coba lagi nanti.',
});

export const metadataLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 200,
  message: 'Terlalu banyak pengambilan metadata. Coba lagi nanti.',
});
