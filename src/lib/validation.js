import { z } from 'zod';
import { HttpError } from './errors.js';

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('Alamat email tidak valid')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(128, 'Password maksimal 128 karakter');

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Nama wajib diisi')
  .max(120, 'Nama maksimal 120 karakter');

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, 'Zona waktu tidak valid');

export const uuidSchema = z.string().trim().uuid('ID tidak valid');

export const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Tanggal tidak valid');

const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);

export const itemFilterQuerySchema = z
  .object({
    folderId: z.preprocess(emptyToUndefined, z.union([uuidSchema, z.literal('none')]).optional()),
    tagId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
    dateFrom: z.preprocess(emptyToUndefined, dateSchema.optional()),
    dateTo: z.preprocess(emptyToUndefined, dateSchema.optional()),
  })
  .refine(
    (data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo,
    'Rentang tanggal tidak valid',
  );

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password wajib diisi').max(128),
  remember: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const resendVerificationSchema = z.object({ email: emailSchema });

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  timezone: timezoneSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal('HAPUS'),
  password: z.string().max(128).optional(),
});

export const folderSchema = z.object({
  name: z.string().trim().min(1, 'Nama folder wajib diisi').max(60, 'Maksimal 60 karakter'),
});

export const tagSchema = z.object({
  name: z.string().trim().min(1, 'Nama tag wajib diisi').max(40, 'Maksimal 40 karakter'),
});

export const itemBaseSchema = z.object({
  type: z.enum(['link', 'text', 'image', 'document']),
  title: z.string().trim().min(1, 'Judul wajib diisi').max(200, 'Judul maksimal 200 karakter'),
  description: z
    .string()
    .max(100000, 'Deskripsi terlalu panjang')
    .optional()
    .nullable()
    .transform((value) => value || null),
  priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  folderId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).max(100).optional().default([]),
  isFavorite: z.boolean().optional().default(false),
});

export const linkItemSchema = itemBaseSchema.extend({
  type: z.literal('link'),
  url: z
    .string()
    .trim()
    .min(1, 'URL wajib diisi')
    .max(2048, 'URL terlalu panjang')
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'URL harus diawali http:// atau https://'),
  linkMetadata: z.record(z.string(), z.unknown()).optional(),
});

export const textItemSchema = itemBaseSchema.extend({
  type: z.literal('text'),
});

export const itemUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(100000).optional().nullable(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).max(100).optional(),
  isFavorite: z.boolean().optional(),
  url: z.string().trim().max(2048).optional(),
  linkMetadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const reminderSchema = z.object({
  type: z.enum(['once', 'recurring']),
  startAt: z.string().datetime({ offset: true }),
  timezone: timezoneSchema,
  recurrence: z
    .object({
      frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
      interval: z.number().int().min(1).max(99).default(1),
      weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      repeatUntil: z.string().datetime({ offset: true }).optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const snoozeSchema = z.object({
  durationMinutes: z.union([z.literal(10), z.literal(60), z.literal(1440)]),
});

export const notificationQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const adminQuotaSchema = z.object({
  storageQuotaBytes: z.coerce
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024 * 1024 * 1024),
  folderLimit: z.coerce.number().int().positive().max(10000),
  tagLimit: z.coerce.number().int().positive().max(10000),
});

export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['all', 'active', 'disabled']).optional().default('all'),
  page: z.coerce.number().int().min(1).default(1),
});

export const adminStatsQuerySchema = z.object({
  period: z.enum(['7', '30', '90']).default('7').transform(Number),
});

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new HttpError(422, issues[0]?.message ?? 'Data tidak valid', 'validation_error', issues);
  }
  return result.data;
}

export function parsePagination(query, defaultPerPage = 20, maxPerPage = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const perPage = Math.min(
    maxPerPage,
    Math.max(1, Number.parseInt(query.perPage, 10) || defaultPerPage),
  );
  return { page, perPage, offset: (page - 1) * perPage };
}
