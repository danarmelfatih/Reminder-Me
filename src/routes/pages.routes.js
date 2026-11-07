import express from 'express';
import { config } from '../config.js';
import { requireAuth, requireGuest } from '../middleware/auth.js';
import { uuidParam } from '../middleware/params.js';

export const pagesRouter = express.Router();

pagesRouter.param('id', uuidParam);

function page(res, view, options = {}) {
  const {
    title,
    layout = 'layouts/app',
    pageScript = null,
    pageId = '',
    status = 200,
    bodyClass = '',
    ...extra
  } = options;
  return res.status(status).render(view, {
    layout,
    title,
    pageScript,
    pageId,
    bodyClass,
    ...extra,
  });
}

function itemsPage(res, options) {
  return page(res, 'pages/items', {
    pageScript: '/js/items.js',
    pageId: 'items',
    layout: 'layouts/app',
    showNewButton: true,
    viewMode: 'all',
    folderId: '',
    tagId: '',
    emptyTitle: 'Belum ada item',
    emptyText: 'Simpan link, catatan, gambar, atau dokumen pertama Anda.',
    ...options,
  });
}

pagesRouter.get('/', (req, res) => {
  if (req.user) return res.redirect('/app');
  return page(res, 'pages/landing', {
    layout: 'layouts/public',
    title: 'Simpan, atur, dan ingat',
    pageScript: null,
    pageId: 'landing',
    bodyClass: 'landing-body',
  });
});

pagesRouter.get('/login', requireGuest, (req, res) => {
  page(res, 'pages/login', {
    layout: 'layouts/auth',
    title: 'Masuk',
    pageScript: '/js/auth.js',
    pageId: 'login',
    next: typeof req.query.next === 'string' ? req.query.next : '/app',
    authMode: 'login',
  });
});

pagesRouter.get('/register', requireGuest, (req, res) => {
  page(res, 'pages/register', {
    layout: 'layouts/auth',
    title: 'Buat akun',
    pageScript: '/js/auth.js',
    pageId: 'register',
    authMode: 'register',
  });
});

pagesRouter.get('/forgot-password', requireGuest, (req, res) => {
  page(res, 'pages/forgot-password', {
    layout: 'layouts/auth',
    title: 'Lupa password',
    pageScript: '/js/auth.js',
    pageId: 'forgot-password',
    authMode: 'forgot',
  });
});

pagesRouter.get('/reset-password', requireGuest, (req, res) => {
  page(res, 'pages/reset-password', {
    layout: 'layouts/auth',
    title: 'Atur ulang password',
    pageScript: '/js/auth.js',
    pageId: 'reset-password',
    authMode: 'reset',
    token: typeof req.query.token === 'string' ? req.query.token : '',
  });
});

pagesRouter.get('/verify-pending', requireAuth, (req, res) => {
  if (req.user.email_verified_at) return res.redirect('/app');
  return page(res, 'pages/verify-pending', {
    layout: 'layouts/auth',
    title: 'Verifikasi email',
    pageScript: '/js/auth.js',
    pageId: 'verify-pending',
    authMode: 'verify',
  });
});

pagesRouter.get('/app', requireAuth, (req, res) => {
  page(res, 'pages/dashboard', {
    title: 'Dashboard',
    pageScript: '/js/dashboard.js',
    pageId: 'dashboard',
  });
});

pagesRouter.get('/app/items', requireAuth, (req, res) => {
  itemsPage(res, {
    title: 'Semua item',
    viewMode: 'all',
    folderId: typeof req.query.folderId === 'string' ? req.query.folderId : '',
    tagId: typeof req.query.tagId === 'string' ? req.query.tagId : '',
    heading: 'Semua item',
    subtitle: 'Semua informasi yang Anda simpan di satu tempat.',
    emptyTitle: 'Belum ada item',
    emptyText: 'Simpan link, catatan, gambar, atau dokumen pertama Anda.',
  });
});

pagesRouter.get('/app/items/new', requireAuth, (req, res) => {
  page(res, 'pages/item-form', {
    title: 'Tambah item',
    pageScript: '/js/item-form.js',
    pageId: 'item-form',
    mode: 'create',
    itemId: null,
    initialType: ['link', 'text', 'image', 'document'].includes(req.query.type)
      ? req.query.type
      : 'link',
  });
});

pagesRouter.get('/app/items/:id', requireAuth, (req, res) => {
  page(res, 'pages/item-detail', {
    title: 'Detail item',
    pageScript: '/js/item-detail.js',
    pageId: 'item-detail',
    itemId: req.params.id,
  });
});

pagesRouter.get('/app/items/:id/edit', requireAuth, (req, res) => {
  page(res, 'pages/item-form', {
    title: 'Edit item',
    pageScript: '/js/item-form.js',
    pageId: 'item-form',
    mode: 'edit',
    itemId: req.params.id,
    initialType: 'link',
  });
});

pagesRouter.get('/app/favorites', requireAuth, (req, res) => {
  itemsPage(res, {
    title: 'Favorit',
    viewMode: 'favorites',
    heading: 'Favorit',
    subtitle: 'Informasi yang Anda tandai penting.',
    emptyTitle: 'Belum ada favorit',
    emptyText: 'Tandai item dengan bintang agar mudah ditemukan kembali.',
  });
});

pagesRouter.get('/app/archive', requireAuth, (req, res) => {
  itemsPage(res, {
    title: 'Arsip',
    viewMode: 'archive',
    heading: 'Arsip',
    subtitle: 'Item yang disimpan tetapi tidak ingin ditampilkan di daftar utama.',
    emptyTitle: 'Arsip kosong',
    emptyText: 'Item yang diarsipkan akan muncul di sini. Pengingatnya tetap aktif.',
  });
});

pagesRouter.get('/app/trash', requireAuth, (req, res) => {
  itemsPage(res, {
    title: 'Trash',
    viewMode: 'trash',
    heading: 'Trash',
    subtitle: 'Item dihapus permanen setelah 30 hari. File di Trash tetap memakai storage.',
    emptyTitle: 'Trash kosong',
    emptyText: 'Item yang dihapus akan muncul di sini selama 30 hari.',
  });
});

pagesRouter.get('/app/folders', requireAuth, (req, res) => {
  page(res, 'pages/folders', {
    title: 'Folder',
    pageScript: '/js/folders.js',
    pageId: 'folders',
  });
});

pagesRouter.get('/app/folders/:id', requireAuth, (req, res) => {
  itemsPage(res, {
    title: 'Folder',
    viewMode: 'all',
    folderId: req.params.id,
    heading: 'Folder',
    subtitle: 'Item dalam folder ini.',
    emptyTitle: 'Folder masih kosong',
    emptyText: 'Pindahkan item ke folder ini atau tambahkan item baru.',
  });
});

pagesRouter.get('/app/tags', requireAuth, (req, res) => {
  page(res, 'pages/tags', {
    title: 'Tag',
    pageScript: '/js/tags.js',
    pageId: 'tags',
  });
});

pagesRouter.get('/app/tags/:id', requireAuth, (req, res) => {
  itemsPage(res, {
    title: 'Tag',
    viewMode: 'all',
    tagId: req.params.id,
    heading: 'Tag',
    subtitle: 'Item dengan tag ini.',
    emptyTitle: 'Belum ada item',
    emptyText: 'Tambahkan tag ini ke item agar muncul di sini.',
  });
});

pagesRouter.get('/app/notifications', requireAuth, (req, res) => {
  page(res, 'pages/notifications', {
    title: 'Notifikasi',
    pageScript: '/js/notifications.js',
    pageId: 'notifications',
  });
});

pagesRouter.get('/app/storage', requireAuth, (req, res) => {
  page(res, 'pages/storage', {
    title: 'Storage',
    pageScript: '/js/storage.js',
    pageId: 'storage',
    warningPercent: config.storageWarnPercent,
  });
});

pagesRouter.get('/app/settings', requireAuth, (req, res) => {
  page(res, 'pages/settings', {
    title: 'Pengaturan',
    pageScript: '/js/settings.js',
    pageId: 'settings',
    googleEnabled: config.googleEnabled,
  });
});

pagesRouter.get('/admin', requireAuth, (req, res) => {
  page(res, 'admin/dashboard', {
    title: 'Admin',
    pageScript: '/js/admin.js',
    pageId: 'admin-dashboard',
  });
});

pagesRouter.get('/admin/users', requireAuth, (req, res) => {
  page(res, 'admin/users', {
    title: 'Kelola pengguna',
    pageScript: '/js/admin.js',
    pageId: 'admin-users',
  });
});

pagesRouter.get('/admin/users/:id', requireAuth, (req, res) => {
  page(res, 'admin/user-detail', {
    title: 'Detail pengguna',
    pageScript: '/js/admin.js',
    pageId: 'admin-user-detail',
    userId: req.params.id,
  });
});

export default pagesRouter;
