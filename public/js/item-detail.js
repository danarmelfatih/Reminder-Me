import { api, errorMessage } from './api.js';
import {
  append,
  confirmDialog,
  formatBytes,
  formatDate,
  formatDateTime,
  h,
  icon,
  openModal,
  priorityLabel,
  setLoading,
  timeAgo,
  toast,
  toDateTimeLocalValue,
  typeIcon,
  typeLabel,
} from './ui.js';

const app = document.getElementById('item-detail-app');
if (app) init();

const itemId = app?.dataset.itemId;
let item = null;
let user = null;

async function init() {
  try {
    const [data, me] = await Promise.all([api(`/api/items/${itemId}`), api('/api/me')]);
    item = data.item;
    user = me.user;
    render();
    handleQueryToast();
  } catch (error) {
    toast(errorMessage(error), 'error');
    document.querySelector('[data-detail-content]').replaceChildren(
      h('div', { class: 'notice notice-error' }, icon('alert'), errorMessage(error)),
    );
  }
}

function render() {
  document.title = `${item.title} · Reminder Me`;
  const title = document.querySelector('[data-detail-title]');
  if (title) title.textContent = item.title;

  const actions = document.querySelector('[data-detail-actions]');
  if (actions) {
    actions.hidden = false;
    const edit = actions.querySelector('[data-detail-edit]');
    if (edit) edit.href = `/app/items/${item.id}/edit`;
    const favorite = actions.querySelector('[data-detail-favorite]');
    if (favorite) {
      favorite.classList.toggle('is-active', item.isFavorite);
      favorite.disabled = Boolean(item.deletedAt);
      favorite.addEventListener('click', toggleFavorite);
    }
  }

  const container = document.querySelector('[data-detail-content]');
  if (!container) return;
  container.replaceChildren();

  const main = h('div', { class: 'detail-main' }, renderContentCard());
  const side = h('aside', { class: 'detail-side' }, renderInfoPanel(), renderReminderPanel(), renderActionsPanel());
  container.append(h('div', { class: 'detail-layout' }, main, side));
}

function renderContentCard() {
  const card = h('article', { class: 'detail-card' });

  if (item.type === 'image' && item.file) {
    card.append(
      h('div', { class: 'detail-preview' }, h('img', { src: item.file.url, alt: item.title, loading: 'lazy' })),
    );
  } else if (item.type === 'link' && item.link?.imageUrl) {
    const link = h(
      'a',
      { class: 'detail-preview-link', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
      h('img', { src: item.link.imageUrl, alt: '', loading: 'lazy' }),
      h(
        'span',
        { class: 'detail-preview-link-copy' },
        h('strong', { text: item.domain || item.title }),
        h('span', { text: item.url }),
      ),
    );
    card.append(link);
  }

  const body = h('div', { class: 'detail-body' });
  if (item.description) {
    body.append(h('p', { class: 'detail-description', text: item.description }));
  } else {
    body.append(h('p', { class: 'detail-description is-empty', text: 'Tidak ada deskripsi atau catatan tambahan.' }));
  }

  if (item.tags?.length) {
    const tags = h('div', { class: 'detail-tags' });
    for (const tag of item.tags) {
      tags.append(h('a', { class: 'chip chip-tag', href: `/app/tags/${tag.id}`, text: `#${tag.name}` }));
    }
    body.append(tags);
  }

  if (item.type === 'link' && item.url) {
    body.append(
      h(
        'div',
        { class: 'detail-file' },
        h('span', { class: 'detail-file-icon' }, icon('link')),
        h(
          'span',
          { class: 'detail-file-copy' },
          h('strong', { text: item.domain || 'Tautan' }),
          h('span', { text: item.url }),
        ),
        h(
          'a',
          { class: 'btn btn-ghost btn-sm', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
          icon('external'),
          'Buka',
        ),
      ),
    );
  }

  if (item.file) {
    body.append(
      h(
        'div',
        { class: 'detail-file' },
        h('span', { class: 'detail-file-icon' }, icon(item.type === 'image' ? 'image' : 'file-text')),
        h(
          'span',
          { class: 'detail-file-copy' },
          h('strong', { text: item.file.name }),
          h('span', {
            text: `${formatBytes(item.file.size)} · ${item.file.extension?.toUpperCase() ?? item.file.mime}`,
          }),
        ),
        h('a', { class: 'btn btn-ghost btn-sm', href: item.file.downloadUrl }, icon('download'), 'Unduh'),
      ),
    );
  }

  card.append(body);
  return card;
}

function renderInfoPanel() {
  const panel = h('section', { class: 'panel' }, h('h2', { text: 'Informasi' }));
  const list = h('dl', { class: 'meta-list' });

  const rows = [
    ['Jenis', typeLabel(item.type)],
    ['Prioritas', priorityLabel(item.priority)],
    ['Folder', item.folder?.name ?? 'Tanpa folder'],
    ['Dibuat', formatDate(item.createdAt, user?.timezone)],
    ['Diperbarui', timeAgo(item.updatedAt, user?.timezone)],
  ];
  if (item.deletedAt) {
    rows.push(['Dihapus', formatDate(item.deletedAt, user?.timezone)]);
    rows.push(['Hapus permanen', formatDate(item.trashPurgeAt, user?.timezone)]);
  }

  for (const [label, value] of rows) {
    list.append(h('div', { class: 'meta-row' }, h('dt', { text: label }), h('dd', { text: value })));
  }
  panel.append(list);
  return panel;
}

function renderReminderPanel() {
  const panel = h('section', { class: 'panel' }, h('h2', { text: 'Pengingat' }));

  if (item.deletedAt) {
    panel.append(
      h('p', { class: 'empty-mini', text: 'Item berada di Trash. Pengingat dinonaktifkan dan tidak dapat diubah.' }),
    );
    return panel;
  }

  if (!item.reminder) {
    panel.append(
      h('p', { class: 'empty-mini', text: 'Belum ada pengingat untuk item ini.' }),
      h(
        'button',
        { class: 'btn btn-ghost btn-sm', type: 'button', onclick: openReminderModal },
        icon('bell'),
        'Atur pengingat',
      ),
    );
    return panel;
  }

  const reminder = item.reminder;
  const active = reminder.isActive;
  const card = h(
    'div',
    { class: 'reminder-card' },
    h(
      'div',
      { class: 'reminder-card-head' },
      h('strong', { text: active ? 'Pengingat aktif' : 'Pengingat nonaktif' }),
      h('span', {
        class: `status-badge ${active ? 'status-badge-active' : 'status-badge-soft'}`,
        text: active ? 'Aktif' : 'Nonaktif',
      }),
    ),
    h('p', {
      text: active
        ? `${reminder.type === 'recurring' ? 'Berulang' : 'Sekali'} · ${formatDateTime(reminder.nextRunAt, reminder.timezone)}`
        : 'Tandai selesai atau atur ulang jadwal.',
    }),
  );

  const actions = h('div', { class: 'reminder-card-actions' });
  if (active) {
    actions.append(
      smallButton('Selesai', () => completeReminder()),
      smallButton('Tunda 10 menit', () => snoozeReminder(10)),
      smallButton('Tunda 1 jam', () => snoozeReminder(60)),
      smallButton('Tunda 1 hari', () => snoozeReminder(1440)),
    );
  }
  actions.append(
    smallButton('Ubah', openReminderModal),
    smallButton('Hapus', deleteReminder, 'detail-action-danger'),
  );
  card.append(actions);
  panel.append(card);
  return panel;
}

function smallButton(label, handler, className = '') {
  const button = h('button', { class: `btn btn-ghost btn-sm ${className}`.trim(), type: 'button', text: label });
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await handler();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function renderActionsPanel() {
  const panel = h('section', { class: 'panel' }, h('h2', { text: 'Tindakan' }));
  const list = h('div', { class: 'detail-action-list' });

  if (item.type === 'link' && item.url) {
    list.append(
      actionLink('external', 'Buka tautan', item.url, { target: '_blank', rel: 'noopener noreferrer' }),
    );
  }
  if (item.file) {
    list.append(actionLink('download', 'Unduh file', item.file.downloadUrl));
  }

  list.append(
    actionButton(item.isFavorite ? 'star' : 'star', item.isFavorite ? 'Hapus dari favorit' : 'Tandai favorit', toggleFavorite),
  );

  if (item.deletedAt) {
    list.append(
      actionButton('rotate', 'Pulihkan item', restoreItem),
      actionButton('trash', 'Hapus permanen', deletePermanently, 'detail-action-danger'),
    );
  } else {
    list.append(
      actionButton(
        'archive',
        item.isArchived ? 'Keluarkan dari arsip' : 'Arsipkan item',
        toggleArchive,
      ),
      actionButton('trash', 'Pindahkan ke Trash', trashItem, 'detail-action-danger'),
    );
  }

  panel.append(list);
  return panel;
}

function actionLink(iconName, label, href, extra = {}) {
  return h('a', { class: 'detail-action', href, ...extra }, icon(iconName), label);
}

function actionButton(iconName, label, handler, className = '') {
  const button = h('button', { class: `detail-action ${className}`.trim(), type: 'button' }, icon(iconName), label);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await handler();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

async function reload() {
  const data = await api(`/api/items/${itemId}`);
  item = data.item;
  render();
}

async function toggleFavorite() {
  const result = await api(`/api/items/${item.id}/favorite`, {
    method: 'POST',
    body: { value: !item.isFavorite },
  });
  toast(result?.message ?? 'Favorit diperbarui.');
  await reload();
}

async function toggleArchive() {
  const result = await api(`/api/items/${item.id}/archive`, {
    method: 'POST',
    body: { value: !item.isArchived },
  });
  toast(result?.message ?? 'Arsip diperbarui.');
  await reload();
}

async function trashItem() {
  const confirmed = await confirmDialog({
    title: 'Pindahkan ke Trash?',
    message: 'Item akan berada di Trash selama 30 hari dan pengingatnya dinonaktifkan.',
    confirmLabel: 'Pindahkan',
    danger: true,
  });
  if (!confirmed) return;
  const result = await api(`/api/items/${item.id}`, { method: 'DELETE' });
  toast(result?.message ?? 'Item dipindahkan ke Trash.');
  await reload();
}

async function restoreItem() {
  const result = await api(`/api/items/${item.id}/restore`, { method: 'POST' });
  toast(result?.message ?? 'Item dipulihkan.');
  await reload();
}

async function deletePermanently() {
  const confirmed = await confirmDialog({
    title: 'Hapus permanen?',
    message: 'Item dan seluruh filenya akan dihapus selamanya. Tindakan ini tidak dapat dibatalkan.',
    confirmLabel: 'Hapus permanen',
    danger: true,
  });
  if (!confirmed) return;
  await api(`/api/items/${item.id}/permanent`, { method: 'DELETE' });
  toast('Item dihapus permanen.');
  window.location.assign('/app/trash');
}

async function completeReminder() {
  const result = await api(`/api/items/${item.id}/reminder/complete`, { method: 'POST' });
  toast(result?.message ?? 'Pengingat ditandai selesai.');
  await reload();
}

async function snoozeReminder(durationMinutes) {
  const result = await api(`/api/items/${item.id}/reminder/snooze`, {
    method: 'POST',
    body: { durationMinutes },
  });
  toast(result?.message ?? 'Pengingat ditunda.');
  await reload();
}

async function deleteReminder() {
  const confirmed = await confirmDialog({
    title: 'Hapus pengingat?',
    message: 'Item tetap tersimpan, tetapi tidak akan ada pengingat untuk item ini.',
    confirmLabel: 'Hapus pengingat',
    danger: true,
  });
  if (!confirmed) return;
  const result = await api(`/api/items/${item.id}/reminder`, { method: 'DELETE' });
  toast(result?.message ?? 'Pengingat dihapus.');
  await reload();
}

function openReminderModal() {
  const timezone = user?.timezone || 'Asia/Jakarta';
  const reminder = item.reminder;

  const typeSelect = h(
    'select',
    { name: 'type' },
    h('option', { value: 'once', text: 'Sekali' }),
    h('option', { value: 'recurring', text: 'Berulang' }),
  );
  typeSelect.value = reminder?.type ?? 'once';

  const startInput = h('input', {
    type: 'datetime-local',
    name: 'startAt',
    required: true,
    value: toDateTimeLocalValue(reminder?.nextRunAt ?? new Date(Date.now() + 3600000), timezone),
  });

  const timezoneInput = h('input', {
    type: 'text',
    name: 'timezone',
    value: timezone,
    maxlength: 64,
    required: true,
  });

  const frequencySelect = h(
    'select',
    { name: 'frequency' },
    h('option', { value: 'daily', text: 'Harian' }),
    h('option', { value: 'weekly', text: 'Mingguan' }),
    h('option', { value: 'monthly', text: 'Bulanan' }),
    h('option', { value: 'yearly', text: 'Tahunan' }),
  );
  const intervalInput = h('input', { type: 'number', name: 'interval', min: 1, max: 99, value: 1 });
  const repeatUntilInput = h('input', { type: 'datetime-local', name: 'repeatUntil' });

  const weekdayLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const weekdayInputs = weekdayLabels.map((label, index) => {
    const input = h('input', { type: 'checkbox', value: String(index) });
    return { input, node: h('label', { class: 'checkbox-row' }, input, h('span', { text: label })) };
  });

  const recurringFields = h(
    'div',
    { class: 'form-stack' },
    h('div', { class: 'form-row' }, h('div', { class: 'field' }, h('label', { text: 'Frekuensi' }), frequencySelect),
      h('div', { class: 'field' }, h('label', { text: 'Setiap' }), intervalInput)),
    h('div', { class: 'field' }, h('label', { text: 'Hari (untuk mingguan)' }), h('div', { class: 'form-row' }, weekdayInputs.map((entry) => entry.node))),
    h('div', { class: 'field' }, h('label', { text: 'Berulang sampai (opsional)' }), repeatUntilInput),
  );

  const updateVisibility = () => {
    recurringFields.hidden = typeSelect.value !== 'recurring';
  };
  typeSelect.addEventListener('change', updateVisibility);
  updateVisibility();

  const body = h(
    'div',
    { class: 'form-stack' },
    h('div', { class: 'form-error', 'data-form-error': '', hidden: true }),
    h('div', { class: 'field' }, h('label', { text: 'Jenis pengingat' }), typeSelect),
    h('div', { class: 'field' }, h('label', { text: 'Tanggal dan waktu' }), startInput),
    h('div', { class: 'field' }, h('label', { text: 'Zona waktu' }), timezoneInput),
    recurringFields,
  );

  const modal = openModal({
    title: reminder ? 'Ubah pengingat' : 'Atur pengingat',
    description: 'Pengingat dikirim di aplikasi dan melalui email.',
    body,
    actions: [
      { label: 'Batal', className: 'btn btn-ghost' },
      {
        label: reminder ? 'Simpan perubahan' : 'Simpan pengingat',
        className: 'btn btn-primary',
        onClick: async ({ close }) => {
          const errorBox = body.querySelector('[data-form-error]');
          errorBox.hidden = true;
          try {
            const payload = {
              type: typeSelect.value,
              startAt: zonedTimeToUtc(startInput.value, timezoneInput.value.trim()),
              timezone: timezoneInput.value.trim(),
              recurrence:
                typeSelect.value === 'recurring'
                  ? {
                      frequency: frequencySelect.value,
                      interval: Math.max(1, Number(intervalInput.value) || 1),
                      weekdays:
                        frequencySelect.value === 'weekly'
                          ? weekdayInputs.filter((entry) => entry.input.checked).map((entry) => Number(entry.input.value))
                          : undefined,
                      repeatUntil: repeatUntilInput.value
                        ? zonedTimeToUtc(repeatUntilInput.value, timezoneInput.value.trim())
                        : null,
                    }
                  : null,
            };
            if (!startInput.value) throw new Error('Tanggal dan waktu wajib diisi.');
            const result = await api(`/api/items/${item.id}/reminder`, { method: 'PUT', body: payload });
            toast(result?.message ?? 'Pengingat disimpan.');
            close();
            await reload();
          } catch (error) {
            errorBox.textContent = errorMessage(error);
            errorBox.hidden = false;
            return false;
          }
        },
      },
    ],
  });

  return modal;
}

function zonedTimeToUtc(localValue, timeZone) {
  if (!localValue) return '';
  const [datePart, timePart] = localValue.split('T');
  if (!datePart || !timePart) return new Date(localValue).toISOString();
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utcGuess)).map((part) => [part.type, part.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
    );
    return new Date(utcGuess - (asUtc - utcGuess)).toISOString();
  } catch {
    return new Date(localValue).toISOString();
  }
}

function handleQueryToast() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('created')) toast('Item berhasil disimpan.');
  if (params.get('updated')) toast('Item berhasil diperbarui.');
  if (params.has('created') || params.has('updated')) {
    params.delete('created');
    params.delete('updated');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }
}
