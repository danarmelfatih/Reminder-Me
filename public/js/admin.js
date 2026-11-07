import { api, errorMessage } from './api.js';
import {
  clearFormError,
  clearFormSuccess,
  debounce,
  formatBytes,
  formatDate,
  formatDateTime,
  h,
  initials,
  promptDialog,
  renderPagination,
  setLoading,
  showFormError,
  showFormSuccess,
  toast,
} from './ui.js';

const page = document.body.dataset.page;

if (page === 'admin-dashboard') initDashboard();
if (page === 'admin-users') initUsers();
if (page === 'admin-user-detail') initUserDetail();

async function initDashboard() {
  const periodSelect = document.querySelector('[data-admin-period]');

  const load = async () => {
    try {
      const period = periodSelect?.value ?? '7';
      const data = await api(`/api/admin/stats?period=${encodeURIComponent(period)}`);
      setStat('totalUsers', data.users?.total ?? 0);
      setStat('activeUsers', data.users?.active ?? 0);
      setStat('disabledUsers', data.users?.disabled ?? 0);
      setStat('totalStorage', formatBytes(data.storage?.totalUsedBytes ?? 0));

      const newUsers = document.querySelector('[data-admin-note="newUsers"]');
      if (newUsers) {
        newUsers.textContent = `${data.users?.newInPeriod ?? 0} baru dalam ${data.users?.periodDays ?? period} hari`;
      }

      renderSystem(data.system ?? []);
      renderSummary(data);
      renderEmail(data.email ?? {});
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  periodSelect?.addEventListener('change', load);
  await load();
}

function setStat(key, value) {
  const node = document.querySelector(`[data-admin-stat="${key}"]`);
  if (node) node.textContent = String(value);
}

function renderSystem(system) {
  const container = document.querySelector('[data-system-status]');
  if (!container) return;
  container.replaceChildren();
  if (!system.length) {
    container.append(h('p', { class: 'manage-empty', text: 'Belum ada heartbeat layanan.' }));
    return;
  }
  for (const entry of system) {
    const statusClass =
      entry.status === 'ok' ? '' : entry.status === 'degraded' ? ' is-degraded' : ' is-down';
    let meta;
    if (entry.name === 'storage' && entry.totalBytes != null) {
      meta = `${formatBytes(entry.freeBytes)} tersedia dari ${formatBytes(entry.totalBytes)}`;
    } else if (entry.detail) {
      meta = entry.detail;
    } else if (entry.lastSeenAt) {
      meta = formatDateTime(entry.lastSeenAt);
    } else {
      meta = 'Tidak diketahui';
    }
    container.append(
      h(
        'div',
        { class: 'system-row' },
        h('span', { class: `system-status${statusClass}` }),
        h('strong', { text: entry.label ?? entry.name }),
        h('span', { text: meta }),
      ),
    );
  }
}

function renderSummary(data) {
  const container = document.querySelector('[data-admin-summary]');
  if (!container) return;
  container.replaceChildren();
  const rows = [
    ['Total item', data.items?.total ?? 0],
    ['Item aktif', data.items?.active ?? 0],
    ['Di Trash', data.items?.trash ?? 0],
    ['Folder', data.folders ?? 0],
    ['Tag', data.tags ?? 0],
    ['Pengingat aktif', data.reminders?.active ?? 0],
    ['Notifikasi', data.notifications?.total ?? 0],
  ];
  for (const [label, value] of rows) {
    container.append(
      h(
        'div',
        { class: 'summary-row' },
        h('span', { text: label }),
        h('strong', { text: String(value) }),
      ),
    );
  }
}

function renderEmail(email) {
  const container = document.querySelector('[data-email-stats]');
  if (!container) return;
  container.replaceChildren();
  const items = [
    ['Tertunda', email.pending ?? 0],
    ['Terkirim', email.sent ?? 0],
    ['Gagal', email.failed ?? 0],
    ['24 jam terakhir', email.last24h ?? 0],
  ];
  for (const [label, value] of items) {
    container.append(
      h(
        'div',
        { class: 'email-stat' },
        h('span', { text: label }),
        h('strong', { text: String(value) }),
      ),
    );
  }
}

const usersState = { q: '', status: 'all', page: 1 };

function initUsers() {
  const search = document.querySelector('[data-admin-user-search] input');
  const statusFilter = document.querySelector('[data-admin-status-filter]');
  search?.addEventListener(
    'input',
    debounce(() => {
      usersState.q = search.value.trim();
      usersState.page = 1;
      loadUsers();
    }, 300),
  );
  statusFilter?.addEventListener('change', () => {
    usersState.status = statusFilter.value;
    usersState.page = 1;
    loadUsers();
  });
  loadUsers();
}

async function loadUsers() {
  const tbody = document.querySelector('[data-admin-user-rows]');
  const summary = document.querySelector('[data-admin-user-summary]');
  const pagination = document.querySelector('[data-admin-user-pagination]');
  if (!tbody) return;

  tbody.replaceChildren(
    h('tr', {}, h('td', { colspan: '5' }, h('div', { class: 'skeleton skeleton-row' }))),
  );

  const query = new URLSearchParams({
    status: usersState.status,
    page: String(usersState.page),
  });
  if (usersState.q) query.set('q', usersState.q);

  try {
    const data = await api(`/api/admin/users?${query.toString()}`);
    tbody.replaceChildren();

    if (!data.users?.length) {
      tbody.append(
        h('tr', {}, h('td', { colspan: '5', class: 'manage-empty', text: 'Tidak ada pengguna.' })),
      );
    } else {
      for (const user of data.users) tbody.append(renderUserRow(user));
    }

    if (summary) summary.textContent = `${data.total ?? 0} pengguna`;
    const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / (data.perPage || 20)));
    renderPagination(pagination, {
      page: data.page ?? usersState.page,
      totalPages,
      onChange: (nextPage) => {
        usersState.page = nextPage;
        loadUsers();
      },
    });
  } catch (error) {
    tbody.replaceChildren(
      h('tr', {}, h('td', { colspan: '5', class: 'manage-empty', text: errorMessage(error) })),
    );
  }
}

function renderUserRow(user) {
  const active = user.status === 'active';
  const link = h(
    'a',
    { class: 'table-user', href: `/admin/users/${user.id}` },
    h('span', { class: 'avatar avatar-sm avatar-fallback', text: initials(user.name) }),
    h(
      'span',
      { class: 'table-user-copy' },
      h('strong', { text: user.name }),
      h('span', { text: user.email }),
    ),
  );
  return h(
    'tr',
    {},
    h('td', {}, link),
    h(
      'td',
      {},
      h('span', {
        class: `status-badge ${active ? 'status-badge-active' : 'status-badge-disabled'}`,
        text: active ? 'Aktif' : 'Dinonaktifkan',
      }),
    ),
    h('td', { text: formatDate(user.created_at) }),
    h('td', {
      text: `${formatBytes(user.storage_used_bytes)} / ${formatBytes(user.storage_quota_bytes)}`,
    }),
    h(
      'td',
      { class: 'table-actions' },
      h('a', { class: 'btn btn-ghost btn-sm', href: `/admin/users/${user.id}`, text: 'Kelola' }),
    ),
  );
}

async function initUserDetail() {
  const app = document.getElementById('admin-user-app');
  if (!app) return;
  try {
    const data = await api(`/api/admin/users/${app.dataset.userId}`);
    renderUserDetail(data);
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

function renderUserDetail(data) {
  const user = data.user;
  const stats = data.stats ?? {};
  const app = document.getElementById('admin-user-app');

  setText('[data-admin-user-name]', user.name);
  setText('[data-admin-user-email]', user.email);
  const status = document.querySelector('[data-admin-user-status]');
  if (status) {
    status.textContent = user.status === 'active' ? 'Aktif' : 'Dinonaktifkan';
    status.className = `status-badge ${user.status === 'active' ? 'status-badge-active' : 'status-badge-disabled'}`;
  }

  const info = document.querySelector('[data-admin-user-info]');
  if (info) {
    info.replaceChildren();
    const rows = [
      ['ID', user.id],
      ['Peran', user.role],
      ['Status', user.status === 'active' ? 'Aktif' : 'Dinonaktifkan'],
      ['Email terverifikasi', user.email_verified_at ? 'Ya' : 'Belum'],
      ['Zona waktu', user.timezone],
      ['Terdaftar', formatDate(user.created_at)],
      ['Sesi aktif', String(data.sessions ?? 0)],
      [
        'Storage',
        `${formatBytes(user.storage_used_bytes)} / ${formatBytes(user.storage_quota_bytes)}`,
      ],
    ];
    for (const [label, value] of rows) {
      info.append(h('div', {}, h('dt', { text: label }), h('dd', { text: value })));
    }
  }

  const form = document.querySelector('[data-admin-quota-form]');
  if (form) {
    form.elements.storageQuotaMb.value = Math.max(
      1,
      Math.round(Number(user.storage_quota_bytes) / (1024 * 1024)),
    );
    form.elements.folderLimit.value = user.folder_limit;
    form.elements.tagLimit.value = user.tag_limit;
    const hint = form.querySelector('[data-admin-quota-hint]');
    if (hint) hint.textContent = `Saat ini terpakai ${formatBytes(user.storage_used_bytes)}.`;
    form.onsubmit = (event) => saveQuota(event, form, user);
  }

  const toggle = document.querySelector('[data-admin-toggle-status]');
  if (toggle) {
    toggle.textContent = user.status === 'active' ? 'Nonaktifkan akun' : 'Aktifkan akun';
    toggle.onclick = () => toggleStatus(user, toggle);
  }

  const deleteButton = document.querySelector('[data-admin-delete-user]');
  if (deleteButton) deleteButton.onclick = () => deleteUser(user, deleteButton);

  const statsContainer = document.querySelector('[data-admin-user-stats]');
  if (statsContainer) {
    statsContainer.replaceChildren();
    const rows = [
      ['Item aktif', stats.items?.active ?? 0],
      ['Item diarsipkan', stats.items?.archived ?? 0],
      ['Item di Trash', stats.items?.trash ?? 0],
      ['Folder', stats.folders ?? 0],
      ['Tag', stats.tags ?? 0],
      ['Pengingat aktif', stats.reminders ?? 0],
      ['Notifikasi', stats.notifications ?? 0],
    ];
    for (const [label, value] of rows) {
      statsContainer.append(
        h(
          'div',
          { class: 'summary-row' },
          h('span', { text: label }),
          h('strong', { text: String(value) }),
        ),
      );
    }
  }

  const email = document.querySelector('[data-admin-user-email]');
  if (email) email.textContent = user.email;
  if (app) app.dataset.status = user.status;
}

async function saveQuota(event, form, user) {
  event.preventDefault();
  clearFormError(form);
  clearFormSuccess(form);
  const storageQuotaMb = Number(form.elements.storageQuotaMb.value);
  const folderLimit = Number(form.elements.folderLimit.value);
  const tagLimit = Number(form.elements.tagLimit.value);

  if (!Number.isFinite(storageQuotaMb) || storageQuotaMb < 1 || folderLimit < 1 || tagLimit < 1) {
    showFormError(form, 'Kuota dan batas harus berupa angka positif.');
    return;
  }

  const button = form.querySelector('[data-submit]');
  setLoading(button, true);
  try {
    const result = await api(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: {
        storageQuotaBytes: Math.round(storageQuotaMb * 1024 * 1024),
        folderLimit,
        tagLimit,
      },
    });
    showFormSuccess(form, result?.message ?? 'Kapasitas diperbarui.');
    toast('Kapasitas pengguna diperbarui.');
    await initUserDetail();
  } catch (error) {
    showFormError(form, errorMessage(error));
  } finally {
    setLoading(button, false);
  }
}

async function toggleStatus(user, button) {
  const nextStatus = user.status === 'active' ? 'disabled' : 'active';
  button.disabled = true;
  try {
    const result = await api(`/api/admin/users/${user.id}/status`, {
      method: 'POST',
      body: { status: nextStatus },
    });
    toast(result?.message ?? 'Status pengguna diperbarui.');
    await initUserDetail();
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    button.disabled = false;
  }
}

async function deleteUser(user, button) {
  const email = await promptDialog({
    title: 'Hapus akun permanen',
    label: `Ketik email pengguna (${user.email}) untuk mengonfirmasi`,
    value: '',
    confirmLabel: 'Hapus akun',
    maxLength: 254,
  });
  if (email === null) return;
  if (email.trim().toLowerCase() !== user.email.toLowerCase()) {
    toast('Email konfirmasi tidak cocok. Penghapusan dibatalkan.', 'error');
    return;
  }

  button.disabled = true;
  try {
    const result = await api(`/api/admin/users/${user.id}`, {
      method: 'DELETE',
      body: { confirmation: 'HAPUS' },
    });
    toast(result?.message ?? 'Akun pengguna dihapus.');
    window.location.assign('/admin/users');
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    button.disabled = false;
  }
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}
