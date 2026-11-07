import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { escapeHtml, formatBytes, initials, safeHttpUrl } from '../src/lib/format.js';
import { safeRedirectPath } from '../src/lib/redirect.js';
import { sha256, timingSafeEqualString } from '../src/lib/tokens.js';
import {
  dateSchema,
  emailSchema,
  itemFilterQuerySchema,
  parse,
  passwordSchema,
  uuidSchema,
} from '../src/lib/validation.js';
import * as XLSX from 'xlsx';
import {
  extractDocumentText,
  supportedDocumentExtension,
} from '../src/services/extraction.service.js';
import { toPublicItem } from '../src/services/item.service.js';
import { isPrivateAddress } from '../src/services/metadata.service.js';
import { generateCachedImage } from '../src/services/storage.service.js';

describe('format helpers', () => {
  test('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  test('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });

  test('accepts only http(s) urls', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
  });

  test('builds initials', () => {
    expect(initials('Demo Reminder Me')).toBe('DM');
    expect(initials('Satu')).toBe('SA');
    expect(initials('')).toBe('?');
  });
});

describe('token helpers', () => {
  test('hashes deterministically', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });

  test('compares strings safely', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
  });
});

describe('validation helpers', () => {
  test('normalizes email', () => {
    expect(parse(emailSchema, '  USER@Example.COM ')).toBe('user@example.com');
  });

  test('rejects short passwords', () => {
    expect(() => parse(passwordSchema, 'pendek')).toThrow('Password minimal 8 karakter');
  });

  test('validates UUID and date filters', () => {
    expect(parse(uuidSchema, '123e4567-e89b-12d3-a456-426614174000')).toBe(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(() => parse(uuidSchema, 'bukan-uuid')).toThrow('ID tidak valid');
    expect(parse(dateSchema, '2026-11-06')).toBe('2026-11-06');
    expect(() => parse(dateSchema, '2026-02-30')).toThrow('Tanggal tidak valid');
    expect(() => parse(dateSchema, '06-11-2026')).toThrow('Tanggal harus berformat YYYY-MM-DD');
  });

  test('rejects invalid item filter ranges', () => {
    expect(
      parse(itemFilterQuerySchema, {
        folderId: 'none',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-06',
      }),
    ).toEqual({ folderId: 'none', dateFrom: '2026-11-01', dateTo: '2026-11-06' });
    expect(() => parse(itemFilterQuerySchema, { folderId: 'abc' })).toThrow('ID tidak valid');
    expect(() => parse(itemFilterQuerySchema, { tagId: 'abc' })).toThrow('ID tidak valid');
    expect(() =>
      parse(itemFilterQuerySchema, { dateFrom: '2026-11-07', dateTo: '2026-11-06' }),
    ).toThrow('Rentang tanggal tidak valid');
  });
});

describe('item serialization', () => {
  test('exposes recurring reminder details for editing', () => {
    const repeatUntil = new Date('2026-12-31T23:59:59.000Z');
    const item = toPublicItem({
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'text',
      title: 'Contoh',
      tags: [],
      reminder_id: '123e4567-e89b-12d3-a456-426614174001',
      reminder_active: true,
      reminder_type: 'recurring',
      reminder_timezone: 'Asia/Jakarta',
      reminder_next_run_at: new Date('2026-11-09T10:00:00.000Z'),
      reminder_start_at: new Date('2026-11-02T10:00:00.000Z'),
      reminder_rrule:
        'DTSTART:20261102T100000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;UNTIL=20261231T235959Z',
      reminder_repeat_until: repeatUntil,
    });

    expect(item.reminder.recurrence).toEqual({
      frequency: 'weekly',
      interval: 2,
      weekdays: [0, 1],
      repeatUntil,
    });
  });
});

describe('cached image generation', () => {
  test('writes webp and png variants with expected formats', async () => {
    const targetDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reminder-cache-'));
    const source = await sharp({
      create: {
        width: 320,
        height: 180,
        channels: 3,
        background: { r: 12, g: 34, b: 56 },
      },
    })
      .png()
      .toBuffer();

    try {
      const webpRelative = await generateCachedImage(source, targetDir, 'og', 200, 'webp');
      const pngRelative = await generateCachedImage(source, targetDir, 'favicon', 128, 'png');
      const files = await fs.promises.readdir(targetDir);
      const webpFile = files.find((file) => file.startsWith('og-') && file.endsWith('.webp'));
      const pngFile = files.find((file) => file.startsWith('favicon-') && file.endsWith('.png'));

      expect(webpRelative.endsWith('.webp')).toBe(true);
      expect(pngRelative.endsWith('.png')).toBe(true);
      expect(webpFile).toBeTruthy();
      expect(pngFile).toBeTruthy();

      const webpMeta = await sharp(path.join(targetDir, webpFile)).metadata();
      const pngMeta = await sharp(path.join(targetDir, pngFile)).metadata();
      expect(webpMeta.format).toBe('webp');
      expect(pngMeta.format).toBe('png');
      expect(Math.max(webpMeta.width, webpMeta.height)).toBeLessThanOrEqual(200);
      expect(Math.max(pngMeta.width, pngMeta.height)).toBeLessThanOrEqual(128);
    } finally {
      await fs.promises.rm(targetDir, { recursive: true, force: true });
    }
  });

  test('removes partial output when the source is invalid', async () => {
    const targetDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reminder-cache-'));
    try {
      await expect(
        generateCachedImage(Buffer.from('not an image'), targetDir, 'broken', 128, 'webp'),
      ).rejects.toThrow();
      const files = await fs.promises.readdir(targetDir);
      expect(files.some((file) => file.startsWith('broken-'))).toBe(false);
    } finally {
      await fs.promises.rm(targetDir, { recursive: true, force: true });
    }
  });
});

describe('document text extraction', () => {
  test('extracts plain text and normalizes line endings', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reminder-extract-'));
    const file = path.join(dir, 'catatan.txt');
    try {
      await fs.promises.writeFile(file, 'Baris satu\r\n\r\nBaris dua\u0000');
      const result = await extractDocumentText(file, 'txt');
      expect(result.status).toBe('done');
      expect(result.text).toBe('Baris satu\n\nBaris dua');
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  test('extracts spreadsheet sheets as text', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reminder-extract-'));
    const file = path.join(dir, 'data.xlsx');
    try {
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([
        ['Nama', 'Nilai'],
        ['Alpha', 10],
        ['Beta', 20],
      ]);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Nilai');
      await fs.promises.writeFile(file, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
      const result = await extractDocumentText(file, 'xlsx');
      expect(result.status).toBe('done');
      expect(result.text).toContain('# Nilai');
      expect(result.text).toContain('Alpha,10');
      expect(result.text).toContain('Beta,20');
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  test('marks unsupported formats without reading the file', async () => {
    expect(supportedDocumentExtension('zip')).toBe(false);
    const result = await extractDocumentText('/tidak/ada/file.zip', 'zip');
    expect(result.status).toBe('unsupported');
    expect(result.text).toBe('');
  });
});

describe('redirect helper', () => {
  const base = 'http://localhost:3004';

  test('keeps same-origin paths', () => {
    expect(safeRedirectPath('/app/items?x=1', '/app', base)).toBe('/app/items?x=1');
    expect(safeRedirectPath('/app/settings#profile', '/app', base)).toBe('/app/settings#profile');
  });

  test('blocks external, protocol-relative, and backslash redirects', () => {
    expect(safeRedirectPath('https://evil.example', '/app', base)).toBe('/app');
    expect(safeRedirectPath('//evil.example', '/app', base)).toBe('/app');
    expect(safeRedirectPath('/\\evil.example', '/app', base)).toBe('/app');
    expect(safeRedirectPath('/app\\evil', '/app', base)).toBe('/app');
    expect(safeRedirectPath('/app\nSet-Cookie: x', '/app', base)).toBe('/app');
  });
});

describe('metadata SSRF guard', () => {
  test('blocks private and local addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.1.1',
      '::1',
      '::ffff:127.0.0.1',
      'fc00::1',
      'fe80::1',
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
  });

  test('allows public addresses', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
  });
});
