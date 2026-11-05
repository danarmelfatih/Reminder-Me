import { api, errorMessage } from './api.js';
import {
  confirmDialog,
  debounce,
  emptyState,
  formatDateTime,
  h,
  icon,
  priorityLabel,
  renderPagination,
  timeAgo,
  toast,
  typeIcon,
  typeLabel,
  updateNavCounts,
} from './ui.js';

const app = document.getElementById('items-app');
if (app) init();

const PAGE_SIZE = 24;
const FILTER_KEYS = ['type', 'priority', 'folderId', 'tagId', 'reminder', 'dateFrom', 'dateTo'];
const params = new URLSearchParams(window.location.search);

const state = {
  view: app?.dataset.view || 'all',
  folderId: params.get('folderId') || app?.dataset.folderId || '',
  tagId: params.get('tagId') || app?.dataset.tagId || '',
  q: params.get('q') || '',
  type: params.get('type') || '',
  priority: params.get('priority') || '',
  reminder: params.get('reminder') || '',
  dateFrom: params.get('dateFrom') || '',
  dateTo: params.get('dateTo') || '',
  sort: params.get('sort') || 'newest',
  page: Math.max(1, Number(params.get('page')) || 1),
};

const elements = {
  grid: app?.querySelector('[data-item-grid]'),
  summary: app?.querySelector('[data-result-summary]'),
  note: app?.querySelector('[data-view-note]'),
  pagination: app?.querySelector('[data-pagination]'),
  search: app?.querySelector('[data-list-search] input'),
  sort: app?.querySelector('[data-sort-select]'),
  filterPanel: app?.querySelector('[data-filter-panel]'),
  filterToggle: app?.querySelector('[data-toggle-filters]'),
  filterCount: app?.querySelector('[data-filter-count]'),
  reset: app?.querySelector('[data-reset-filters]'),
};

function init() {
  if (elements.search) elements.search.value = state.q;
  if (elements.sort) elements.sort.value = state.sort;

  bindEvents();
  populateFilters();
  updateViewNote();
  fetchItems();
}

function bindEvents() {
  elements.search?.addEventListener(
    'input',
    debounce(() => {
      state.q = elements.search.value.trim();
      state.page = 1;
      fetchItems();
    }, 300),
  );

  elements.sort?.addEventListener('change', () => {
    state.sort = elements.sort.value;
    state.page = 1;
    fetchItems();
  });

  elements.filterToggle?.addEventListener('click', () => {
    if (!elements.filterPanel) return;
    elements.filterPanel.hidden = !elements.filterPanel.hidden;
  });

  elements.reset?.addEventListener('click', () => {
    for (const key of FILTER_KEYS) state[key] = '';
    if (elements.search) elements.search.value = '';
    state.q = '';
    state.page = 1;
    for (const select of app.querySelectorAll('[data-filter]')) {
      select.value = '';
    }
    fetchItems();
  });

  for (const select of app.querySelectorAll('[data-filter]')) {
    select.addEventListener('change', () => {
      state[select.dataset.filter] = select.value;
      state.page = 1;
      fetchItems();
    });
  }

  elements.grid?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-item-action]');
    if (!button) return;
    const card = button.closest('[data-item-id]');
    const id = card?.dataset.itemId;
    if (!id) return;
    await handleAction(button.dataset.itemAction, id, card.dataset.itemTitle ?? 'item');
  });
}

async function populateFilters() {
  try {
    const [folders, tags] = await Promise.all([api('/api/folders'), api('/api/tags')]);
    const folderSelect = app.querySelector('[data-filter="folderId"]');
    if (folderSelect) {
      for (const folder of folders.folders ?? []) {
        folderSelect.append(h('option', { value: folder.id, text: folder.name }));
      }
      folderSelect.value = state.folderId;
    }
    const tagSelect = app.querySelector('[data-filter="tagId"]');
    if (tagSelect) {
      for (const tag of tags.tags ?? []) {
        tagSelect.append(h('option', { value: tag.id, text: tag.name }));
      }
      tagSelect.value = state.tagId;
    }
  } catch {
    // filters remain usable without options
  }
}

async function fetchItems() {
  showLoading();
  syncUrl();

  const query = new URLSearchParams();
  query.set('view', state.view);
  query.set('sort', state.sort);
  query.set('page', String(state.page));
  query.set('perPage', String(PAGE_SIZE));
  if (state.q) query.set('q', state.q);
  for (const key of FILTER_KEYS) {
    if (state[key]) query.set(key, state[key]);
  }

  try {
    const data = await api(`/api/items?${query.toString()}`);
    renderItems(data);
    updateNavCounts(data.counts);
    updateFilterCount();
  } catch (error) {
    elements.grid.replaceChildren(
      emptyState({
        iconName: 'alert',
        title: 'Gagal memuat item',
        text: errorMessage(error),
        action: retryButton(),
      }),
    );
    if (elements.summary) elements.summary.textContent = 'Tidak dapat memuat item.';
    elements.pagination.hidden = true;
  }
}

function retryButton() {
  const button = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Coba lagi');
  button.addEventListener('click', () => fetchItems());
  return button;
}

function showLoading() {
  elements.grid.replaceChildren(
    ...Array.from({ length: 3 }, () => h('div', { class: 'skeleton skeleton-card' })),
  );
  if (elements.summary) elements.summary.textContent = 'Memuat item…';
}

function renderItems(data) {
  const items = data.items ?? [];
  elements.grid.replaceChildren();

  if (!items.length) {
    elements.grid.append(
      emptyState({
        iconName: state.q ? 'search' : 'inbox',
        title: state.q ? 'Tidak ada hasil' : app.dataset.emptyTitle || 'Belum ada item',
        text: state.q
          ? 'Coba kata kunci lain atau ubah filter pencarian.'
          : app.dataset.emptyText || 'Simpan informasi pertama Anda.',
        action: state.q ? null : newItemButton(),
      }),
    );
  } else {
    for (const item of items) elements.grid.append(renderCard(item));
  }

  if (elements.summary) {
    const start = data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1;
    const end = Math.min(data.total, data.page * data.perPage);
    elements.summary.textContent =
      data.total === 0 ? 'Tidak ada item' : `Menampilkan ${start}–${end} dari ${data.total} item`;
  }

  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / (data.perPage || PAGE_SIZE)));
  renderPagination(elements.pagination, {
    page: data.page ?? state.page,
    totalPages,
    onChange: (page) => {
      state.page = page;
      fetchItems();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });
}

function newItemButton() {
  return h(
    'a',
    { class: 'btn btn-primary btn-sm', href: '/app/items/new' },
    icon('plus'),
    'Tambah item',
  );
}

function chip(iconName, text, className = 'chip') {
  const node = h('span', { class: className, title: text }, iconName ? icon(iconName) : null, text);
  return node;
}

function renderCard(item) {
  const card = h('article', {
    class: `item-card${item.isArchived ? ' is-archived' : ''}${item.deletedAt ? ' is-trashed' : ''}`,
    dataset: { itemId: item.id, itemTitle: item.title },
  });

  const actions = h('div', { class: 'item-card-actions' });
  if (state.view === 'trash') {
    actions.append(
      actionButton('rotate', 'Pulihkan item', 'restore'),
      actionButton('trash', 'Hapus permanen', 'permanent'),
    );
  } else {
    const favorite = actionButton(
      'star',
      item.isFavorite ? 'Hapus dari favorit' : 'Tandai favorit',
      'favorite',
    );
    favorite.querySelector('svg')?.classList.toggle('is-active', item.isFavorite);
    actions.append(
      favorite,
      actionButton('archive', item.isArchived ? 'Keluarkan dari arsip' : 'Arsipkan', 'archive'),
      actionButton('trash', 'Pindahkan ke Trash', 'trash'),
    );
  }

  const typeBadge = h(
    'span',
    { class: 'item-type-icon', dataset: { type: item.type }, title: typeLabel(item.type) },
    icon(typeIcon(item.type)),
  );
  card.append(h('div', { class: 'item-card-top' }, typeBadge, actions));

  const preview = item.thumbnailUrl || item.link?.imageUrl;
  if (preview) {
    const image = h('img', {
      class: 'item-card-thumb',
      src: preview,
      alt: '',
      loading: 'lazy',
    });
    image.addEventListener('error', () => image.remove());
    card.append(image);
  }

  card.append(
    h('a', { class: 'item-card-title', href: `/app/items/${item.id}`, text: item.title }),
  );

  if (item.description) {
    card.append(h('p', { class: 'item-card-desc', text: item.description }));
  }

  const meta = h('div', { class: 'item-card-meta' });
  if (item.folder) meta.append(chip('folder', item.folder.name, 'chip chip-folder'));
  for (const tag of (item.tags ?? []).slice(0, 2)) {
    meta.append(chip(null, `#${tag.name}`, 'chip chip-tag'));
  }
  if ((item.tags ?? []).length > 2) {
    meta.append(chip(null, `+${item.tags.length - 2}`, 'chip'));
  }
  if (item.reminder?.isActive) {
    const label = item.reminder.nextRunAt
      ? formatDateTime(item.reminder.nextRunAt, item.reminder.timezone)
      : 'Pengingat aktif';
    meta.append(chip('bell', label, 'chip chip-reminder'));
  }
  if (item.priority === 'high')
    meta.append(chip(null, priorityLabel('high'), 'chip chip-priority-high'));
  if (item.priority === 'low')
    meta.append(chip(null, priorityLabel('low'), 'chip chip-priority-low'));
  if (item.deletedAt) meta.append(chip('trash', 'Di Trash', 'chip'));
  if (meta.childElementCount) card.append(meta);

  card.append(
    h(
      'div',
      { class: 'item-card-footer' },
      h('span', { class: 'item-card-domain', text: item.domain || typeLabel(item.type) }),
      h('span', { text: timeAgo(item.createdAt) }),
    ),
  );

  return card;
}

function actionButton(iconName, label, action) {
  return h(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      title: label,
      'aria-label': label,
      dataset: { itemAction: action },
    },
    icon(iconName),
  );
}

async function handleAction(action, id, title) {
  try {
    if (action === 'favorite') {
      const card = elements.grid.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
      const active = card
        ?.querySelector('[data-item-action="favorite"] svg')
        ?.classList.contains('is-active');
      const result = await api(`/api/items/${id}/favorite`, {
        method: 'POST',
        body: { value: !active },
      });
      toast(result?.message ?? 'Favorit diperbarui.');
      fetchItems();
      return;
    }
    if (action === 'archive') {
      const card = elements.grid.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
      const archived = card?.classList.contains('is-archived');
      const result = await api(`/api/items/${id}/archive`, {
        method: 'POST',
        body: { value: !archived },
      });
      toast(result?.message ?? 'Arsip diperbarui.');
      fetchItems();
      return;
    }
    if (action === 'trash') {
      const confirmed = await confirmDialog({
        title: 'Pindahkan ke Trash?',
        message: `"${title}" akan dipindahkan ke Trash selama 30 hari. Pengingatnya akan dinonaktifkan.`,
        confirmLabel: 'Pindahkan',
        danger: true,
      });
      if (!confirmed) return;
      const result = await api(`/api/items/${id}`, { method: 'DELETE' });
      toast(result?.message ?? 'Item dipindahkan ke Trash.');
      fetchItems();
      return;
    }
    if (action === 'restore') {
      const result = await api(`/api/items/${id}/restore`, { method: 'POST' });
      toast(result?.message ?? 'Item dipulihkan.');
      fetchItems();
      return;
    }
    if (action === 'permanent') {
      const confirmed = await confirmDialog({
        title: 'Hapus permanen?',
        message: `"${title}" dan filenya akan dihapus selamanya. Tindakan ini tidak dapat dibatalkan.`,
        confirmLabel: 'Hapus permanen',
        danger: true,
      });
      if (!confirmed) return;
      const result = await api(`/api/items/${id}/permanent`, { method: 'DELETE' });
      toast(result?.message ?? 'Item dihapus permanen.');
      fetchItems();
    }
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

function updateViewNote() {
  if (!elements.note) return;
  const notes = {
    archive: 'Pengingat tetap aktif untuk item arsip.',
    trash: 'Item dihapus permanen setelah 30 hari.',
    favorites: 'Item yang Anda tandai penting.',
    all: '',
  };
  elements.note.textContent = notes[state.view] ?? '';
}

function updateFilterCount() {
  const count = FILTER_KEYS.filter((key) => state[key]).length;
  if (!elements.filterCount) return;
  elements.filterCount.textContent = String(count);
  elements.filterCount.hidden = count === 0;
}

function syncUrl() {
  const query = new URLSearchParams();
  if (state.q) query.set('q', state.q);
  if (state.sort !== 'newest') query.set('sort', state.sort);
  if (state.page > 1) query.set('page', String(state.page));
  for (const key of FILTER_KEYS) {
    if (state[key]) query.set(key, state[key]);
  }
  const suffix = query.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}`);
}
