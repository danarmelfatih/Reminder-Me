import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { getSessionUser, toPublicUser, touchSession } from '../services/auth.service.js';

export async function loadUser(req, res, next) {
  const raw = req.cookies?.[config.sessionCookieName];
  if (!raw) return next();

  try {
    const data = await getSessionUser(raw);
    if (!data) {
      res.clearCookie(config.sessionCookieName, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
        path: '/',
      });
      return next();
    }
    req.user = data.user;
    req.session = data.session;
    if (
      data.session.lastSeenAt &&
      Date.now() - new Date(data.session.lastSeenAt).getTime() > 5 * 60 * 1000
    ) {
      touchSession(data.session.id).catch(() => {});
    }
    next();
  } catch (error) {
    next(error);
  }
}

function wantsJson(req) {
  return req.path.startsWith('/api') || req.originalUrl.startsWith('/api');
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) {
    return next(new HttpError(401, 'Silakan masuk terlebih dahulu', 'unauthorized'));
  }
  const nextPath = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login?next=${nextPath}`);
}

export function requireAdmin(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (req.user.role !== 'admin') {
    if (wantsJson(req)) {
      return next(new HttpError(403, 'Akses admin diperlukan', 'forbidden'));
    }
    return res.status(403).render('pages/error', {
      layout: 'layouts/app',
      title: 'Akses ditolak',
      status: 403,
      message: 'Halaman ini hanya dapat diakses admin.',
      pageScript: null,
    });
  }
  return next();
}

export function requireVerified(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (req.user.email_verified_at) return next();
  if (wantsJson(req)) {
    return next(new HttpError(403, 'Email belum diverifikasi', 'email_unverified'));
  }
  return res.redirect('/verify-pending');
}

export function requireGuest(req, res, next) {
  if (!req.user) return next();
  if (wantsJson(req)) {
    return next(new HttpError(409, 'Anda sudah masuk', 'already_authenticated'));
  }
  return res.redirect('/app');
}

export function attachUserLocals(req, res, next) {
  res.locals.user = req.user ? toPublicUser(req.user) : null;
  next();
}
