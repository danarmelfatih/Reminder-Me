import { api } from './api.js';
import {
  append,
  formatBytes,
  formatDateTime,
  h,
  icon,
  timeAgo,
  toast,
  typeIcon,
  typeLabel,
} from './ui.js';

const root = document.querySelector('[data-stat="active_items"]')?.closest('.page-content');
if (root) init();

async function init() {
  try {
    const [dashboard, me] = await Promise.all([api('/api/dashboard'), api('/api/me')]);
    renderGreeting(me?.user);
    renderStats(dashboard);
    renderUpcoming(dashboard.upcomingReminders ?? [], me?.user?.timezone);
    renderRecent(dashboard.recentItems ?? [], me?.user?.timezone);
    renderStorage(dashboard.storage);
  } catch (error) {
    toast(error?.message ?? 'Gagal memuat dashboard.', 'error');
  }
}

function renderGreeting(user) {
  const node = document.querySelector('[data-greeting]');
  if (!node) return;
  const hour = new Date().getHours();
  const greeting =
    hour < 11
      ? 'Selamat pagi'
      : hour < 15
        ? 'Selamat siang'
        : hour < 19
          ? 'Selamat sore'
          : 'Selamat malam';
  const firstName = user?.name?.trim().split(/\s+/)[0];
  node.textContent = firstName ? `${greeting}, ${firstName}` : greeting;
}

function renderStats(dashboard) {
  const counts = dashboard?.counts ?? {};
  setStat('active_items', counts.active_items ?? 0);
  setStat('activeReminders', counts.activeReminders ?? 0);
  setStat('folders', counts.folders ?? 0);
  setStat('storage', formatBytes(dashboard?.storage?.used ?? 0));

  const storageNote = document.querySelector('[data-stat-note="storage"]');
  if (storageNote) storageNote.textContent = `dari ${formatBytes(dashboard?.storage?.quota ?? 0)}`;
}

function setStat(key, value) {
  const node = document.querySelector(`[data-stat="${key}"]`);
  if (node) node.textContent = String(value);
}

function renderUpcoming(reminders, timezone) {
  const container = document.querySelector('[data-upcoming-reminders]');
  if (!container) return;
  container.replaceChildren();

  if (!reminders.length) {
    container.append(
      h('p', { class: 'empty-mini', text: 'Tidak ada pengingat dalam tujuh hari ke depan.' }),
    );
    return;
  }

  for (const reminder of reminders) {
    const link = h('a', { class: 'compact-item', href: `/app/items/${reminder.item_id}` });
    append(link, [
      h('span', { class: 'compact-item-icon' }, icon('bell')),
      h(
        'span',
        { class: 'compact-item-copy' },
        h('strong', { text: reminder.title }),
        h('span', {
          text: `${formatDateTime(reminder.next_run_at, reminder.timezone ?? timezone)}${
            reminder.is_archived ? ' · Diarsipkan' : ''
          }`,
        }),
      ),
      h('span', {
        class: 'compact-item-meta',
        text: reminder.type === 'recurring' ? 'Berulang' : 'Sekali',
      }),
    ]);
    container.append(link);
  }
}

function renderRecent(items, timezone) {
  const container = document.querySelector('[data-recent-items]');
  if (!container) return;
  container.replaceChildren();

  if (!items.length) {
    container.append(
      h('p', { class: 'empty-mini', text: 'Belum ada item. Mulai dengan menyimpan sesuatu.' }),
    );
    return;
  }

  for (const item of items) {
    const link = h('a', { class: 'compact-item', href: `/app/items/${item.id}` });
    const detail = item.domain || item.folder?.name || typeLabel(item.type);
    append(link, [
      h('span', { class: 'compact-item-icon' }, icon(typeIcon(item.type))),
      h(
        'span',
        { class: 'compact-item-copy' },
        h('strong', { text: item.title }),
        h('span', { text: detail }),
      ),
      h('span', { class: 'compact-item-meta', text: timeAgo(item.createdAt, timezone) }),
    ]);
    container.append(link);
  }
}

function renderStorage(storage) {
  if (!storage) return;
  const percent = Math.min(100, Math.max(0, Number(storage.percent) || 0));
  const fill = document.querySelector('[data-dashboard-storage-fill]');
  const bar = document.querySelector('[data-dashboard-storage-bar]');
  const used = document.querySelector('[data-dashboard-storage-used]');
  const remaining = document.querySelector('[data-dashboard-storage-remaining]');
  const message = document.querySelector('[data-storage-message]');

  if (fill) fill.style.width = `${percent}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(percent)));
  if (used) used.textContent = formatBytes(storage.used);
  if (remaining) remaining.textContent = formatBytes(storage.remaining);
  if (message) {
    if (storage.level === 'full') {
      message.textContent =
        'Kapasitas penuh. Hapus file atau kosongkan Trash untuk membebaskan ruang.';
    } else if (storage.level === 'critical') {
      message.textContent = 'Kapasitas hampir penuh. Segera kosongkan Trash atau hapus file besar.';
    } else if (storage.level === 'warning') {
      message.textContent = 'Penggunaan storage sudah cukup tinggi. Pertimbangkan merapikan file.';
    } else {
      message.textContent = `${Math.round(percent)}% dari kuota Anda terpakai.`;
    }
  }
}
