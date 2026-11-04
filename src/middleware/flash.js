import { config } from '../config.js';

const COOKIE_NAME = 'rm_flash';

export function readFlash(req, res, next) {
  const raw = req.cookies?.[COOKIE_NAME];
  res.locals.flash = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.message === 'string') {
        res.locals.flash = {
          type: parsed.type === 'error' ? 'error' : 'success',
          message: parsed.message,
        };
      }
    } catch {
      // ignore malformed flash
    }
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/',
    });
  }
  next();
}

export function setFlash(res, type, message) {
  res.cookie(
    COOKIE_NAME,
    JSON.stringify({ type: type === 'error' ? 'error' : 'success', message }),
    {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 1000,
    },
  );
}
