import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { randomHex, timingSafeEqualString } from '../lib/tokens.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function ensureCsrf(req, res, next) {
  let token = req.cookies?.[config.csrfCookieName];
  if (!token || token.length < 32) {
    token = randomHex(32);
    res.cookie(config.csrfCookieName, token, {
      httpOnly: false,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/',
    });
  }
  req.csrfToken = token;
  res.locals.csrfToken = token;
  next();
}

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = req.get('host');
    return originUrl.host === host;
  } catch {
    return false;
  }
}

export function verifyCsrf(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (!sameOrigin(req)) {
    return next(new HttpError(403, 'Origin permintaan tidak valid', 'csrf_failed'));
  }
  const header = req.get('x-csrf-token');
  const cookie = req.cookies?.[config.csrfCookieName];
  if (!header || !cookie || !timingSafeEqualString(header, cookie)) {
    return next(
      new HttpError(403, 'Token keamanan tidak valid. Muat ulang halaman.', 'csrf_failed'),
    );
  }
  next();
}
