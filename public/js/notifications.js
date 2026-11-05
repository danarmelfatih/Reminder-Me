import { api, errorMessage } from './api.js';
import { h, icon, renderPagination, timeAgo, toast } from './ui.js';

const list = document.querySelector('[data-notification-list]');
const pagination = document.querySelector('[data-notification-pagination]');
const unreadOnly = document.querySelector('[data-unread-only]');
const summary = document.querySelector('[data-unread-summary]');
const markAll = document.querySelector('[data-mark-all-read]');

const state = { page: 1, unread: false };

if (list) {
  unreadOnly?.addEventListener('change', () => {
    state.unread = unreadOnly.checked;
    state.page = 1;
    load();
  });
  markAll?.addEventListener('click', async () => {
    markAll.disabled = true;
    try {
      const result = await api('/api/notifications/read-all', { method: 'POST' });
      toast(result?.message ?? 'Semua notifikasi ditandai dibaca.');
      await load();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      markAll.disabled = false;
    }
  });
  load();
}

async function load() {
  list.replaceChildren(
    h('div', { class: 'skeleton skeleton-row' }),
    h('div', { class: 'skeleton skeleton-row' }),
  );

  const query = new URLSearchParams({ page: String(state.page) });
  if (state.unread) query.set('unread', 'true');

  try {
    const data = await api(`/api/notifications?${query.toString()}`);
    render(data);
  } catch (error) {
    list.replaceChildren(h('p', { class: 'manage-empty', text: errorMessage(error) }));
  }
}

function render(data) {
  const notifications = data.notifications ?? [];
  list.replaceChildren();

  if (summary) {
    summary.textContent = `${data.unread ?? 0} belum dibaca · ${data.total ?? 0} notifikasi`;
  }

  if (!notifications.length) {
    list.append(
      h(
        'p',
        { class: 'manage-empty' },
        state.unread ? 'Tidak ada notifikasi yang belum dibaca.' : 'Belum ada notifikasi.',
      ),
    );
    pagination.hidden = true;
    return;
  }

  for (const notification of notifications) {
    list.append(renderNotification(notification));
  }

  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / (data.perPage || 20)));
  renderPagination(pagination, {
    page: data.page ?? state.page,
    totalPages,
    onChange: (page) => {
      state.page = page;
      load();
    },
  });
}

function renderNotification(notification) {
  const iconName =
    notification.type === 'trash_warning'
      ? 'trash'
      : notification.type === 'system'
        ? 'alert'
        : 'bell';
  const item = h(
    'div',
    { class: `notification-item${notification.is_read ? '' : ' is-unread'}` },
    h('span', { class: 'notification-item-icon' }, icon(iconName)),
    h(
      'div',
      { class: 'notification-item-copy' },
      h('strong', { text: notification.title }),
      notification.body ? h('p', { text: notification.body }) : null,
    ),
    h('span', { class: 'notification-item-time', text: timeAgo(notification.created_at) }),
  );

  const actions = h('div', { class: 'notification-item-actions' });
  if (notification.item_id) {
    actions.append(
      h('a', {
        class: 'btn btn-ghost btn-sm',
        href: `/app/items/${notification.item_id}`,
        text: 'Buka item',
      }),
    );
  }
  if (!notification.is_read) {
    const button = h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      text: 'Tandai dibaca',
    });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/api/notifications/${notification.id}/read`, { method: 'POST' });
        await load();
      } catch (error) {
        toast(errorMessage(error), 'error');
      } finally {
        button.disabled = false;
      }
    });
    actions.append(button);
  }
  if (actions.childElementCount) item.querySelector('.notification-item-copy').append(actions);
  return item;
}
