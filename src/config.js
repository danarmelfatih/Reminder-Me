import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3004),
    APP_URL: z.string().url().default('http://localhost:3004'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
    COOKIE_SECURE: boolish.default(false),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    STORAGE_DIR: z.string().default('./storage'),
    DEFAULT_STORAGE_QUOTA_BYTES: z.coerce.number().int().positive().default(1073741824),
    DEFAULT_FOLDER_LIMIT: z.coerce.number().int().positive().default(50),
    DEFAULT_TAG_LIMIT: z.coerce.number().int().positive().default(100),
    STORAGE_WARN_PERCENT: z.coerce.number().int().min(1).max(100).default(80),
    STORAGE_CRITICAL_PERCENT: z.coerce.number().int().min(1).max(100).default(95),

    MAIL_DRIVER: z.enum(['console', 'resend', 'smtp']).default('console'),
    RESEND_API_KEY: z.string().optional().default(''),
    MAIL_FROM: z.string().default('Reminder Me <onboarding@resend.dev>'),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: boolish.default(false),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    SMTP_FROM: z.string().optional().default(''),

    GOOGLE_CLIENT_ID: z.string().optional().default(''),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
    GOOGLE_REDIRECT_URI: z.string().optional().default(''),

    WORKER_POLL_MS: z.coerce.number().int().min(1000).default(15000),
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    EMAIL_STALE_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
    NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
    DOCUMENT_EXTRACTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
    DOCUMENT_EXTRACTION_STALE_MINUTES: z.coerce.number().int().min(1).default(15),
    DOCUMENT_EXTRACTION_MAX_CHARS: z.coerce.number().int().min(1000).default(2000000),
    DOCUMENT_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_DRIVER === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST wajib diisi jika MAIL_DRIVER=smtp',
      });
    }
    if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY wajib diisi jika MAIL_DRIVER=resend',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Konfigurasi environment tidak valid:\n${issues.join('\n')}`);
}

const env = parsed.data;
const rootDir = path.resolve(import.meta.dir, '..');
const storageDir = path.resolve(rootDir, env.STORAGE_DIR);

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  appUrl: env.APP_URL.replace(/\/$/, ''),
  databaseUrl: env.DATABASE_URL,
  cookieSecure: env.COOKIE_SECURE,
  trustProxy: env.TRUST_PROXY,

  rootDir,
  storageDir,
  uploadDir: path.join(storageDir, 'uploads'),
  tmpDir: path.join(storageDir, 'tmp'),
  avatarDir: path.join(storageDir, 'avatars'),
  metadataDir: path.join(storageDir, 'metadata'),

  defaultStorageQuotaBytes: env.DEFAULT_STORAGE_QUOTA_BYTES,
  defaultFolderLimit: env.DEFAULT_FOLDER_LIMIT,
  defaultTagLimit: env.DEFAULT_TAG_LIMIT,
  storageWarnPercent: env.STORAGE_WARN_PERCENT,
  storageCriticalPercent: env.STORAGE_CRITICAL_PERCENT,

  mailDriver: env.MAIL_DRIVER,
  resendApiKey: env.RESEND_API_KEY,
  mailFrom: env.MAIL_FROM,
  smtpHost: env.SMTP_HOST,
  smtpPort: env.SMTP_PORT,
  smtpSecure: env.SMTP_SECURE,
  smtpUser: env.SMTP_USER,
  smtpPass: env.SMTP_PASS,
  smtpFrom: env.SMTP_FROM || env.MAIL_FROM,

  googleClientId: env.GOOGLE_CLIENT_ID,
  googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri:
    env.GOOGLE_REDIRECT_URI || `${env.APP_URL.replace(/\/$/, '')}/api/auth/google/callback`,
  googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),

  workerPollMs: env.WORKER_POLL_MS,
  emailMaxAttempts: env.EMAIL_MAX_ATTEMPTS,
  emailStaleLockMinutes: env.EMAIL_STALE_LOCK_MINUTES,
  notificationRetentionDays: env.NOTIFICATION_RETENTION_DAYS,
  documentExtractionMaxAttempts: env.DOCUMENT_EXTRACTION_MAX_ATTEMPTS,
  documentExtractionStaleMinutes: env.DOCUMENT_EXTRACTION_STALE_MINUTES,
  documentExtractionMaxChars: env.DOCUMENT_EXTRACTION_MAX_CHARS,
  documentExtractionTimeoutMs: env.DOCUMENT_EXTRACTION_TIMEOUT_MS,

  sessionCookieName: 'rm_session',
  csrfCookieName: 'rm_csrf',
  oauthStateCookieName: 'rm_oauth',
  sessionRememberDays: 7,
  sessionDefaultHours: 24,

  maxImageBytes: 10 * 1024 * 1024,
  maxDocumentBytes: 25 * 1024 * 1024,
  maxAvatarBytes: 2 * 1024 * 1024,
  maxThumbnailBytes: 2 * 1024 * 1024,
};

export const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const documentMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
export const allowedExtensions = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'pdf',
  'doc',
  'docx',
  'txt',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
]);

export function ensureStorageDirs() {
  for (const dir of [
    config.storageDir,
    config.uploadDir,
    config.tmpDir,
    config.avatarDir,
    config.metadataDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
