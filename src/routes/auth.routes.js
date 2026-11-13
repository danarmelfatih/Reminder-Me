import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { safeRedirectPath } from '../lib/redirect.js';
import {
  forgotPasswordSchema,
  loginSchema,
  parse,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
} from '../lib/validation.js';
import { setFlash } from '../middleware/flash.js';
import {
  authLimiter,
  passwordLimiter,
  registerLimiter,
  resendLimiter,
} from '../middleware/rateLimit.js';
import {
  consumeAuthToken,
  createAuthToken,
  createEmailUser,
  createSession,
  findUserByEmail,
  findUserById,
  hashPassword,
  invalidateAuthTokens,
  markEmailVerified,
  markSessionReauthenticated,
  revokeAllSessions,
  revokeSession,
  sessionCookieOptions,
  toPublicUser,
  updateUserPassword,
  upsertGoogleUser,
  verifyPassword,
} from '../services/auth.service.js';
import {
  buildGoogleAuthUrl,
  createPkcePair,
  exchangeGoogleCode,
  googleConfigured,
} from '../services/google.service.js';
import { sendTemplate } from '../services/mail.service.js';
import {
  passwordChangedEmail,
  resetPasswordEmail,
  verificationEmail,
} from '../services/mail.templates.js';

export const authRouter = express.Router();

const VERIFY_TTL = 24 * 60 * 60 * 1000;
const RESET_TTL = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 60) * 60 * 1000;

function safeNext(value, fallback = '/app') {
  return safeRedirectPath(value, fallback, config.appUrl);
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

async function sendVerification(user) {
  await invalidateAuthTokens(user.id, 'email_verify');
  const token = await createAuthToken(user.id, 'email_verify', VERIFY_TTL);
  await sendTemplate(user.email, verificationEmail({ name: user.name, token }));
}

authRouter.post('/register', registerLimiter, async (req, res) => {
  const data = parse(registerSchema, req.body);
  const user = await createEmailUser(data);
  let mailSent = true;
  try {
    await sendVerification(user);
  } catch (error) {
    mailSent = false;
    logger.error({ err: error, userId: user.id }, 'Failed to send verification email');
  }
  res.status(201).json({
    message: mailSent
      ? 'Akun dibuat. Silakan cek email untuk verifikasi.'
      : 'Akun dibuat, tetapi email verifikasi gagal dikirim. Gunakan kirim ulang verifikasi.',
    mailSent,
    email: user.email,
  });
});

authRouter.get('/verify-email', async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) {
    setFlash(res, 'error', 'Tautan verifikasi tidak lengkap.');
    return res.redirect('/login');
  }
  try {
    const tokenRow = await consumeAuthToken(token, 'email_verify');
    const user = await markEmailVerified(tokenRow.user_id);
    if (req.user) {
      setFlash(res, 'success', 'Email berhasil diverifikasi.');
      return res.redirect('/app');
    }
    setFlash(res, 'success', `Email ${user.email} berhasil diverifikasi. Silakan masuk.`);
    return res.redirect('/login?verified=1');
  } catch (error) {
    logger.debug({ err: error }, 'Email verification failed');
    setFlash(res, 'error', 'Tautan verifikasi tidak valid atau sudah kedaluwarsa.');
    return res.redirect('/login?verify=failed');
  }
});

authRouter.post('/resend-verification', resendLimiter, async (req, res) => {
  const data = parse(resendVerificationSchema, req.body);
  const user = await findUserByEmail(data.email);
  if (user && !user.email_verified_at && user.status === 'active') {
    try {
      await sendVerification(user);
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Failed to resend verification email');
    }
  }
  res.json({ message: 'Jika email terdaftar dan belum diverifikasi, tautan baru telah dikirim.' });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const data = parse(loginSchema, req.body);
  const user = await findUserByEmail(data.email);

  if (!user) {
    await verifyPassword(data.password, null);
    throw new HttpError(401, 'Email atau password salah', 'invalid_credentials');
  }

  const valid = await verifyPassword(data.password, user.password_hash);
  if (!valid) {
    throw new HttpError(401, 'Email atau password salah', 'invalid_credentials');
  }
  if (user.status !== 'active') {
    throw new HttpError(403, 'Akun Anda dinonaktifkan. Hubungi admin.', 'account_disabled');
  }
  if (!user.email_verified_at) {
    throw new HttpError(
      403,
      'Email Anda belum diverifikasi. Silakan cek email atau kirim ulang verifikasi.',
      'email_unverified',
    );
  }

  const session = await createSession(user.id, {
    remember: Boolean(data.remember),
    ip: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });

  res.cookie(config.sessionCookieName, session.raw, sessionCookieOptions(Boolean(data.remember)));
  res.json({ message: 'Berhasil masuk', user: toPublicUser(user) });
});

authRouter.post('/logout', async (req, res) => {
  if (req.session?.id) {
    await revokeSession(req.session.id);
  }
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
  res.json({ message: 'Berhasil keluar' });
});

authRouter.post('/forgot-password', passwordLimiter, async (req, res) => {
  const data = parse(forgotPasswordSchema, req.body);
  const user = await findUserByEmail(data.email);
  if (user && user.status === 'active') {
    try {
      await invalidateAuthTokens(user.id, 'password_reset');
      const token = await createAuthToken(user.id, 'password_reset', RESET_TTL);
      await sendTemplate(user.email, resetPasswordEmail({ name: user.name, token }));
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Failed to send password reset email');
    }
  }
  res.json({
    message: 'Jika email terdaftar, tautan pengaturan ulang password telah dikirim.',
  });
});

authRouter.post('/reset-password', passwordLimiter, async (req, res) => {
  const data = parse(resetPasswordSchema, req.body);
  const tokenRow = await consumeAuthToken(data.token, 'password_reset');
  const user = await findUserById(tokenRow.user_id);
  if (user?.status !== 'active') {
    throw new HttpError(400, 'Token tidak valid', 'invalid_token');
  }
  const hash = await hashPassword(data.password);
  await updateUserPassword(user.id, hash);
  await revokeAllSessions(user.id);
  try {
    await sendTemplate(user.email, passwordChangedEmail({ name: user.name }));
  } catch (error) {
    logger.error({ err: error, userId: user.id }, 'Failed to send password changed email');
  }
  res.json({ message: 'Password berhasil diperbarui. Silakan masuk kembali.' });
});

authRouter.get('/google', async (req, res) => {
  if (!googleConfigured()) {
    setFlash(res, 'error', 'Google Login belum dikonfigurasi.');
    return res.redirect('/login');
  }

  const purpose = req.query.purpose === 'reauth' ? 'reauth' : 'login';
  if (purpose === 'reauth' && !req.user) {
    return res.redirect('/login');
  }

  try {
    const state = crypto.randomUUID();
    const { verifier, challenge } = createPkcePair();
    const next = safeNext(req.query.next, purpose === 'reauth' ? '/app/settings' : '/app');
    const remember = req.query.remember === '1';

    res.cookie(
      config.oauthStateCookieName,
      JSON.stringify({ state, verifier, next, purpose, remember }),
      {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: 10 * 60 * 1000,
      },
    );

    const url = buildGoogleAuthUrl({ state, codeChallenge: challenge });
    res.redirect(url);
  } catch (error) {
    logger.error({ err: error }, 'Failed to start Google OAuth');
    setFlash(res, 'error', 'Gagal memulai Google Login.');
    res.redirect('/login');
  }
});

authRouter.get('/google/callback', async (req, res) => {
  const rawState = req.cookies?.[config.oauthStateCookieName];
  res.clearCookie(config.oauthStateCookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });

  if (req.query.error || !req.query.code || !rawState) {
    setFlash(res, 'error', 'Google Login dibatalkan atau gagal.');
    return res.redirect('/login');
  }

  let stateData;
  try {
    stateData = JSON.parse(rawState);
  } catch {
    setFlash(res, 'error', 'Sesi Google Login tidak valid.');
    return res.redirect('/login');
  }

  if (req.query.state !== stateData.state) {
    setFlash(res, 'error', 'State Google Login tidak valid.');
    return res.redirect('/login');
  }

  try {
    const profile = await exchangeGoogleCode({
      code: String(req.query.code),
      codeVerifier: stateData.verifier,
    });

    if (stateData.purpose === 'reauth') {
      if (!req.user || !req.session) {
        setFlash(res, 'error', 'Sesi Anda telah berakhir. Silakan masuk kembali.');
        return res.redirect('/login');
      }
      if (req.user.google_id !== profile.googleId) {
        setFlash(res, 'error', 'Akun Google tidak cocok dengan akun Anda.');
        return res.redirect('/app/settings');
      }
      await markSessionReauthenticated(req.session.id);
      setFlash(res, 'success', 'Verifikasi Google berhasil. Anda dapat melanjutkan.');
      return res.redirect(safeNext(stateData.next, '/app/settings'));
    }

    const user = await upsertGoogleUser(profile);
    if (user.status !== 'active') {
      setFlash(res, 'error', 'Akun Anda dinonaktifkan. Hubungi admin.');
      return res.redirect('/login');
    }
    if (!user.email_verified_at) {
      setFlash(res, 'error', 'Email Google belum terverifikasi.');
      return res.redirect('/login');
    }

    const session = await createSession(user.id, {
      remember: Boolean(stateData.remember),
      ip: clientIp(req),
      userAgent: req.get('user-agent') ?? null,
    });
    res.cookie(
      config.sessionCookieName,
      session.raw,
      sessionCookieOptions(Boolean(stateData.remember)),
    );
    return res.redirect(safeNext(stateData.next, '/app'));
  } catch (error) {
    logger.error({ err: error }, 'Google OAuth callback failed');
    setFlash(res, 'error', 'Google Login gagal. Silakan coba lagi.');
    return res.redirect('/login');
  }
});

export default authRouter;
