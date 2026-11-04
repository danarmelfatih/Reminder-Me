const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** index;
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

export function formatDate(value, timezone = 'Asia/Jakarta', options = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...options,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
  }
}

export function formatDateTime(value, timezone = 'Asia/Jakarta') {
  return formatDate(value, timezone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(value, timezone = 'Asia/Jakarta') {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return formatDate(date, timezone);
}

export function truncate(value, max = 160) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const priorityLabels = {
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Rendah',
};

export const typeLabels = {
  link: 'Link',
  text: 'Catatan',
  image: 'Gambar',
  document: 'Dokumen',
};

export const priorityWeights = { high: 3, medium: 2, low: 1 };

export function toDateTimeLocal(value, timezone = 'Asia/Jakarta') {
  if (!value) return '';
  try {
    const date = value instanceof Date ? value : new Date(value);
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(date).replace(' ', 'T');
  } catch {
    return '';
  }
}

export function statusLabel(status) {
  const labels = {
    active: 'Aktif',
    disabled: 'Dinonaktifkan',
    pending: 'Menunggu',
    sent: 'Terkirim',
    failed: 'Gagal',
    done: 'Selesai',
    unsupported: 'Tidak didukung',
  };
  return labels[status] ?? status;
}
