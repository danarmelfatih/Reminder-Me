import { config } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/tokens.js';

const DUMMY_HASH = await Bun.password.hash('timing-protection-dummy-password', {
  algorithm: 'argon2id',
});

export function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

export async function hashPassword(password) {
  return Bun.password.hash(password, { algorithm: 'argon2id' });
}

export async function verifyPassword(password, hash) {
  if (!hash) {
    await Bun.password.verify(password, DUMMY_HASH).catch(() => false);
    return false;
  }
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

export async function findUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [
    normalizeEmail(email),
  ]);
  return result.rows[0] ?? null;
}

export async function findUserById(id) {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function createEmailUser({ name, email, password }) {
  const passwordHash = await hashPassword(password);
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [
      email,
    ]);
    if (existing.rowCount > 0) {
      throw new HttpError(409, 'Email sudah terdaftar', 'email_exists');
    }
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, storage_quota_bytes, folder_limit, tag_limit)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        name,
        normalizeEmail(email),
        passwordHash,
        config.defaultStorageQuotaBytes,
        config.defaultFolderLimit,
        config.defaultTagLimit,
      ],
    );
    return result.rows[0];
  });
}

export async function upsertGoogleUser({ googleId, email, name, emailVerified }) {
  const normalized = normalizeEmail(email);
  if (!emailVerified) {
    throw new HttpError(403, 'Email Google belum terverifikasi', 'google_email_unverified');
  }

  return withTransaction(async (client) => {
    const byGoogle = await client.query('SELECT * FROM users WHERE google_id = $1 FOR UPDATE', [
      googleId,
    ]);
    if (byGoogle.rowCount > 0) {
      return byGoogle.rows[0];
    }

    const byEmail = await client.query(
      'SELECT * FROM users WHERE lower(email) = lower($1) FOR UPDATE',
      [normalized],
    );
    if (byEmail.rowCount > 0) {
      const existing = byEmail.rows[0];
      if (existing.email_verified_at && existing.status !== 'disabled') {
        const linked = await client.query(
          `UPDATE users SET google_id = $1, email_verified_at = coalesce(email_verified_at, now())
           WHERE id = $2 RETURNING *`,
          [googleId, existing.id],
        );
        return linked.rows[0];
      }
      return existing;
    }

    const created = await client.query(
      `INSERT INTO users
        (name, email, google_id, email_verified_at, storage_quota_bytes, folder_limit, tag_limit)
       VALUES ($1, $2, $3, now(), $4, $5, $6)
       RETURNING *`,
      [
        name || normalized.split('@')[0],
        normalized,
        googleId,
        config.defaultStorageQuotaBytes,
        config.defaultFolderLimit,
        config.defaultTagLimit,
      ],
    );
    return created.rows[0];
  });
}

export async function createAuthToken(userId, type, ttlMs) {
  const raw = randomToken(32);
  const hash = sha256(raw);
  const expiresAt = new Date(Date.now() + ttlMs);
  await query(
    `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, type, hash, expiresAt],
  );
  return raw;
}

export async function consumeAuthToken(rawToken, type) {
  const hash = sha256(rawToken);
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT * FROM auth_tokens
       WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [hash, type],
    );
    if (result.rowCount === 0) {
      throw new HttpError(400, 'Token tidak valid atau sudah kedaluwarsa', 'invalid_token');
    }
    const token = result.rows[0];
    await client.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [token.id]);
    return token;
  });
}

export async function invalidateAuthTokens(userId, type) {
  await query(
    'UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND type = $2 AND used_at IS NULL',
    [userId, type],
  );
}

export async function markEmailVerified(userId) {
  const result = await query(
    `UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1 RETURNING *`,
    [userId],
  );
  return result.rows[0];
}

export async function updateUserPassword(userId, passwordHash) {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function createSession(userId, { remember = false, ip, userAgent } = {}) {
  const raw = randomToken(32);
  const tokenHash = sha256(raw);
  const expiresAt = new Date(
    Date.now() +
      (remember ? config.sessionRememberDays * 24 : config.sessionDefaultHours) * 3600000,
  );
  const result = await query(
    `INSERT INTO sessions (user_id, token_hash, remember, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, expires_at`,
    [userId, tokenHash, remember, expiresAt, ip ?? null, userAgent ?? null],
  );
  return { raw, session: result.rows[0], expiresAt };
}

export async function getSessionUser(rawToken) {
  if (!rawToken) return null;
  const hash = sha256(rawToken);
  const result = await query(
    `SELECT s.id AS session_id, s.user_id, s.remember, s.expires_at, s.revoked_at,
            s.last_seen_at, s.reauth_at,
            u.*
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [hash],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.status !== 'active') return null;

  const {
    session_id,
    user_id,
    remember,
    expires_at: sessionExpiresAt,
    revoked_at,
    last_seen_at,
    reauth_at,
    ...user
  } = row;

  return {
    user,
    session: {
      id: session_id,
      userId: user_id,
      remember,
      expiresAt: sessionExpiresAt,
      revokedAt: revoked_at,
      lastSeenAt: last_seen_at,
      reauthAt: reauth_at,
    },
  };
}

export async function touchSession(sessionId) {
  await query(
    `UPDATE sessions SET last_seen_at = now()
     WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
    [sessionId],
  );
}

export async function revokeSession(sessionId) {
  await query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
}

export async function revokeAllSessions(userId, exceptSessionId = null) {
  if (exceptSessionId) {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL',
      [userId, exceptSessionId],
    );
  } else {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
  }
}

export async function markSessionReauthenticated(sessionId) {
  await query('UPDATE sessions SET reauth_at = now() WHERE id = $1', [sessionId]);
}

export function sessionCookieOptions(remember = false) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    ...(remember ? { maxAge: config.sessionRememberDays * 24 * 60 * 60 * 1000 } : {}),
  };
}

export function clearSessionCookie(res) {
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
}

export function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    timezone: user.timezone,
    emailVerified: Boolean(user.email_verified_at),
    hasPassword: Boolean(user.password_hash),
    googleLinked: Boolean(user.google_id),
    avatarUrl: user.avatar_path
      ? `/api/me/avatar?v=${new Date(user.updated_at ?? Date.now()).getTime()}`
      : null,
    storageQuotaBytes: Number(user.storage_quota_bytes),
    storageUsedBytes: Number(user.storage_used_bytes),
    folderLimit: Number(user.folder_limit),
    tagLimit: Number(user.tag_limit),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export function reauthIsFresh(session, windowMinutes = 10) {
  if (!session?.reauthAt) return false;
  return Date.now() - new Date(session.reauthAt).getTime() <= windowMinutes * 60 * 1000;
}
