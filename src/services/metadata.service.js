import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { HttpError } from '../lib/errors.js';

const MAX_HTML_BYTES = 768 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function ipv4ToInt(address) {
  return address.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function inIpv4Range(address, cidr, bits) {
  const value = ipv4ToInt(address);
  const base = ipv4ToInt(cidr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function isPrivateAddress(address) {
  if (!address) return true;
  const version = net.isIP(address);
  if (version === 4) {
    return BLOCKED_IPV4_RANGES.some(([cidr, bits]) => inIpv4Range(address, cidr, bits));
  }
  if (version === 6) {
    const value = address.toLowerCase();
    if (value === '::' || value === '::1') return true;
    if (value.startsWith('::ffff:')) {
      const mapped = value.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) return isPrivateAddress(mapped);
    }
    if (value.startsWith('fc') || value.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(value)) return true;
    if (value.startsWith('ff')) return true;
    if (value.startsWith('2001:db8')) return true;
    return false;
  }
  return true;
}

function blockedUrl(message = 'URL tidak diizinkan') {
  return new HttpError(400, message, 'blocked_url');
}

export async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new HttpError(422, 'URL tidak valid', 'invalid_url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(422, 'URL harus menggunakan http atau https', 'invalid_url');
  }
  if (url.username || url.password) throw blockedUrl('URL dengan kredensial tidak diizinkan');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw blockedUrl('Port URL tidak diizinkan');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw blockedUrl();
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw blockedUrl();
    return url;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpError(422, 'Host tidak dapat ditemukan', 'invalid_url');
  }
  if (!addresses.length) throw new HttpError(422, 'Host tidak dapat ditemukan', 'invalid_url');
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw blockedUrl('URL mengarah ke alamat privat');
  }

  return url;
}

async function fetchWithRedirects(rawUrl, accept) {
  let current = await assertSafeUrl(rawUrl);

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    let response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          accept,
          'user-agent': 'ReminderMeBot/0.1 (+local personal organizer)',
          'accept-language': 'id,en;q=0.8',
        },
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new HttpError(504, 'Situs tidak merespons tepat waktu', 'metadata_timeout');
      }
      throw new HttpError(422, 'Gagal mengambil data dari situs', 'metadata_fetch_failed');
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location)
        throw new HttpError(422, 'Situs mengembalikan redirect tanpa tujuan', 'metadata_failed');
      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }

    return { response, url: current };
  }

  throw new HttpError(422, 'Terlalu banyak redirect', 'metadata_failed');
}

async function readLimited(response, maxBytes) {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) {
    throw new HttpError(413, 'Konten dari situs terlalu besar', 'metadata_too_large');
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'Konten dari situs terlalu besar', 'metadata_too_large');
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

function clean(value, maxLength) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function resolveHttpUrl(value, base) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function extractMetadata(rawUrl) {
  const { response, url } = await fetchWithRedirects(
    rawUrl,
    'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
  );

  if (!response.ok) {
    throw new HttpError(422, `Situs mengembalikan status ${response.status}`, 'metadata_failed');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new HttpError(422, 'URL bukan halaman HTML', 'metadata_unsupported');
  }

  const buffer = await readLimited(response, MAX_HTML_BYTES);
  const charset = contentType
    .match(/charset=([^;]+)/i)?.[1]
    ?.trim()
    .replace(/["']/g, '');
  let html;
  try {
    html = charset ? iconv.decode(buffer, charset) : buffer.toString('utf8');
  } catch {
    html = buffer.toString('utf8');
  }

  const $ = cheerio.load(html);
  const meta = (...selectors) => {
    for (const selector of selectors) {
      const content = $(selector).first().attr('content');
      if (content) return content;
    }
    return null;
  };

  const title =
    clean(meta('meta[property="og:title"]', 'meta[name="twitter:title"]'), 200) ??
    clean($('title').first().text(), 200) ??
    url.hostname.replace(/^www\./, '');

  const description = clean(
    meta(
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ),
    500,
  );

  const imageUrl = resolveHttpUrl(
    meta(
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="og:image:url"]',
    ),
    url,
  );

  const faviconUrl =
    resolveHttpUrl($('link[rel~="icon"]').first().attr('href'), url) ?? `${url.origin}/favicon.ico`;

  return {
    url: url.toString(),
    title,
    description,
    imageUrl,
    faviconUrl,
    siteName: clean(meta('meta[property="og:site_name"]'), 120),
    domain: url.hostname.replace(/^www\./, ''),
  };
}

export async function fetchImage(rawUrl) {
  const { response } = await fetchWithRedirects(
    rawUrl,
    'image/avif,image/webp,image/png,image/jpeg,image/gif',
  );
  if (!response.ok) {
    throw new HttpError(422, `Gambar mengembalikan status ${response.status}`, 'metadata_failed');
  }

  const contentType = (response.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new HttpError(422, 'Tipe gambar tidak didukung', 'metadata_unsupported');
  }

  const buffer = await readLimited(response, MAX_IMAGE_BYTES);
  return { buffer, contentType };
}
