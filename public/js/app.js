import { api } from './api.js';
import {
  loadNotificationBadge,
  setupFlash,
  setupLogout,
  setupShortcuts,
  setupSidebar,
  updateStorageWidget,
} from './ui.js';

setupSidebar();
setupLogout();
setupFlash();
setupShortcuts();

const body = document.body;
const authed = body?.dataset.authed === 'true';

if (authed) {
  const searchInput = document.querySelector('.topbar-search input[type="search"]');
  if (searchInput && body.dataset.page === 'items') {
    const query = new URLSearchParams(window.location.search).get('q');
    if (query && !searchInput.value) searchInput.value = query;
  }

  api('/api/me')
    .then((data) => {
      updateStorageWidget(data?.storage);
    })
    .catch(() => {});

  loadNotificationBadge();
}
