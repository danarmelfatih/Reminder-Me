import { describe, expect, test } from 'bun:test';
import { escapeHtml, formatBytes, initials, safeHttpUrl } from '../src/lib/format.js';
import { sha256, timingSafeEqualString } from '../src/lib/tokens.js';
import { emailSchema, parse, passwordSchema } from '../src/lib/validation.js';
import { isPrivateAddress } from '../src/services/metadata.service.js';

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
