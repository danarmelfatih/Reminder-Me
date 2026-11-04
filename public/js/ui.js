import { api, errorMessage } from './api.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'hidden') node.hidden = Boolean(value);
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = Boolean(value);
    else if (key === 'value') node.value = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') node.innerHTML = value;
    else node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function icon(name, className = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = h(
    'div',
    { class: `toast${type === 'error' ? ' toast-error' : ''}`, role: 'status' },
    icon(type === 'error' ? 'alert' : 'check'),
    h('span', { text: message }),
  );
  root.append(node);
  window.setTimeout(() => node.remove(), 4200);
}

export function openModal({ title, description, body, actions = [], onClose, className = '' }) {
  const root = document.getElementById('modal-root') ?? document.body;
  const backdrop = h('div', { class: 'modal-backdrop' });
  const modal = h('div', {
    class: `modal ${className}`.trim(),
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'modal-title',
  });

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
    onClose?.(result);
  };

  const closeButton = h(
    'button',
    { class: 'icon-btn modal-close', type: 'button', 'aria-label': 'Tutup' },
    icon('x'),
  );
  closeButton.addEventListener('click', () => close());

  modal.append(
    h(
      'div',
      { class: 'modal-head' },
      h('div', {}, h('h2', { id: 'modal-title', text: title }), description ? h('p', { text: description }) : null),
      closeButton,
    ),
  );
  if (body) modal.append(body);

  if (actions.length) {
    const actionRow = h('div', { class: 'modal-actions' });
    for (const action of actions) {
      const button = h(
        'button',
        {
          class: action.className ?? 'btn btn-ghost',
          type: 'button',
          disabled: action.disabled,
        },
        action.icon ? icon(action.icon) : null,
        action.label,
      );
      button.addEventListener('click', async () => {
        if (!action.onClick) return close(action.value);
        button.disabled = true;
        try {
          const keepOpen = await action.onClick({ close });
          if (keepOpen !== false) close(action.value);
        } catch (error) {
          toast(errorMessage(error), 'error');
        } finally {
          button.disabled = false;
        }
      });
      actionRow.append(button);
    }
    modal.append(actionRow);
  }

  backdrop.append(modal);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });

  const onKeydown = (event) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown);
  root.append(backdrop);

  const focusTarget = modal.querySelector('input, textarea, select, button:not(.modal-close)');
  window.setTimeout(() => focusTarget?.focus(), 30);

  return { close, element: modal };
}

export function confirmDialog({
  title,
  message,
  confirmLabel = 'Lanjutkan',
  cancelLabel = 'Batal',
  danger = false,
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    openModal({
      title,
      body: h('p', { class: 'settings-copy', text: message }),
      actions: [
        { label: cancelLabel, className: 'btn btn-ghost', value: false, onClick: () => {} },
        {
          label: confirmLabel,
          className: danger ? 'btn btn-danger' : 'btn btn-primary',
          value: true,
          onClick: () => {},
        },
      ],
      onClose: (value) => finish(value === true),
    });
  });
}

export function promptDialog({ title, label, value = '', confirmLabel = 'Simpan', maxLength = 60 }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const input = h('input', {
      type: 'text',
      value,
      maxlength: maxLength,
      required: true,
      autocomplete: 'off',
    });
    const body = h(
      'div',
      { class: 'field' },
      h('label', { for: 'prompt-input', text: label }),
      input,
    );
    input.id = 'prompt-input';
    openModal({
      title,
      body,
      actions: [
        { label: 'Batal', className: 'btn btn-ghost', value: null, onClick: () => {} },
        {
          label: confirmLabel,
          className: 'btn btn-primary',
          value: input,
          onClick: () => {
            const text = input.value.trim();
            if (!text) {
              input.focus();
              return false;
            }
            return true;
          },
        },
      ],
      onClose: (result) => finish(result === input ? input.value.trim() : null),
    });
  });
}

export function showFormError(container, message) {
  const node = container.querySelector('[data-form-error]');
  if (!node) {
    toast(message, 'error');
    return;
  }
  node.textContent = message;
  node.hidden = false;
}

export function clearFormError(container) {
  const node = container.querySelector('[data-form-error]');
  if (node) {
    node.textContent = '';
    node.hidden = true;
  }
}

export function showFormSuccess(container, message) {
  const node = container.querySelector('[data-form-success]');
  if (!node) {
    toast(message);
    return;
  }
  node.textContent = message;
  node.hidden = false;
}

export function clearFormSuccess(container) {
  const node = container.querySelector('[data-form-success]');
  if (node) {
    node.textContent = '';
    node.hidden = true;
  }
}

export function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.classList.toggle('is-loading', loading);
  button.querySelector('[data-spinner]')?.toggleAttribute('hidden', !loading);
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

export function toDateTimeLocalValue(value, timezone = 'Asia/Jakarta') {
  if (!value) return '';
  try {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(date)
      .replace(' ', 'T');
  } catch {
    return '';
  }
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const typeLabels = { link: 'Link', text: 'Catatan', image: 'Gambar', document: 'Dokumen' };
export const priorityLabels = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
export const typeIcons = { link: 'link', text: 'note', image: 'image', document: 'file-text' };

export function typeLabel(type) {
  return typeLabels[type] ?? type;
}

export function priorityLabel(priority) {
  return priorityLabels[priority] ?? priority;
}

export function typeIcon(type) {
  return typeIcons[type] ?? 'inbox';
}

export function emptyState({ iconName = 'inbox', title, text, action }) {
  const node = h(
    'div',
    { class: 'empty-state' },
    h('span', { class: 'empty-state-icon' }, icon(iconName)),
    h('h3', { text: title }),
    h('p', { text }),
  );
  if (action) node.append(action);
  return node;
}

export function renderPagination(container, { page, totalPages, onChange }) {
  if (!container) return;
  container.replaceChildren();
  if (totalPages <= 1) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const addButton = (label, target, options = {}) => {
    const button = h('button', {
      type: 'button',
      text: label,
      disabled: options.disabled,
      'aria-label': options.ariaLabel,
    });
    if (options.active) button.classList.add('is-active');
    button.addEventListener('click', () => onChange(target));
    container.append(button);
  };

  addButton('‹', page - 1, { disabled: page <= 1, ariaLabel: 'Halaman sebelumnya' });

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  let previous = 0;
  for (const value of sorted) {
    if (value - previous > 1) {
      const gap = h('button', { type: 'button', text: '…', disabled: true });
      container.append(gap);
    }
    addButton(String(value), value, { active: value === page, ariaLabel: `Halaman ${value}` });
    previous = value;
  }

  addButton('›', page + 1, { disabled: page >= totalPages, ariaLabel: 'Halaman berikutnya' });
}

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

export function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.querySelector('[data-sidebar-backdrop]');
  if (!sidebar) return;

  const open = () => {
    sidebar.classList.add('is-open');
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('sidebar-open');
  };
  const close = () => {
    sidebar.classList.remove('is-open');
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('sidebar-open');
  };

  document.querySelectorAll('[data-sidebar-open]').forEach((button) => {
    button.addEventListener('click', open);
  });
  document.querySelectorAll('[data-sidebar-close]').forEach((button) => {
    button.addEventListener('click', close);
  });
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}

export function setupLogout() {
  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {
        // ignore network failures, still leave the page
      }
      window.location.assign('/login');
    });
  });
}

export function setupFlash() {
  document.querySelectorAll('[data-flash-auto]').forEach((node) => {
    window.setTimeout(() => {
      node.style.transition = 'opacity 0.25s ease';
      node.style.opacity = '0';
      window.setTimeout(() => node.remove(), 260);
    }, 6000);
  });
}

export function setupShortcuts() {
  const search = document.querySelector('.topbar-search input[type="search"]');
  if (!search) return;
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.matches('input, textarea, select') || target.isContentEditable);
    if (event.key === '/' && !typing) {
      event.preventDefault();
      search.focus();
      search.select();
    }
    if (event.key === 'Escape' && document.activeElement === search) {
      search.blur();
    }
  });
}

export function updateStorageWidget(storage) {
  if (!storage) return;
  const percent = Math.min(100, Math.max(0, Number(storage.percent) || 0));
  const used = document.querySelector('[data-storage-used]');
  const quota = document.querySelector('[data-storage-quota]');
  const fill = document.querySelector('[data-storage-fill]');
  const bar = document.querySelector('[data-storage-bar]');
  if (used) used.textContent = formatBytes(storage.used);
  if (quota) quota.textContent = formatBytes(storage.quota);
  if (fill) fill.style.width = `${percent}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(percent)));
}

export function updateNavCounts(counts) {
  if (!counts) return;
  const map = {
    active: counts.active,
    favorites: counts.favorites,
    archived: counts.archived,
    trash: counts.trash,
  };
  for (const [key, value] of Object.entries(map)) {
    const node = document.querySelector(`[data-nav-count="${key}"]`);
    if (!node) continue;
    if (value === undefined || value === null) continue;
    node.textContent = String(value);
    node.hidden = !Number(value);
  }
}

export async function loadNotificationBadge() {
  const badge = document.querySelector('[data-notification-badge]');
  if (!badge) return;
  try {
    const data = await api('/api/notifications/count');
    badge.hidden = !data?.unread;
  } catch {
    // silent
  }
}
