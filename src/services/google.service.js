import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';

export function googleConfigured() {
  return config.googleEnabled;
}

export function createOAuthClient() {
  return new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: config.googleRedirectUri,
  });
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildGoogleAuthUrl({ state, codeChallenge, prompt = 'select_account' }) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt,
  });
}

export async function exchangeGoogleCode({ code, codeVerifier }) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken({ code, codeVerifier });
  if (!tokens.id_token) {
    throw new Error('Google tidak mengembalikan ID token');
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Profil Google tidak lengkap');
  }
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    emailVerified: Boolean(payload.email_verified),
  };
}
