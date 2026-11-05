import { api, errorMessage } from './api.js';
import {
  clearFormError,
  confirmDialog,
  h,
  icon,
  promptDialog,
  setLoading,
  showFormError,
  toast,
} from './ui.js';

const form = document.querySelector('[data-create-folder]');
const list = document.querySelector('[data-folder-list]');
const limitNode = document.querySelector('[data-folder-limit]');
const countNode = document.querySelector('[data-folder-count]');
let folders = [];
let limit = 50;

if (form && list) {
  form.addEventListener('submit', createFolder);
  loadFolders();
}

async function loadFolders() {
  try {
    const data = await api('/api/folders');
    folders = data.folders ?? [];
    limit = data.limit ?? 50;
    render();
  } catch (error) {
    list.replaceChildren(h('p', { class: 'manage-empty', text: errorMessage(error) }));
  }
}

function render() {
  if (limitNode) limitNode.textContent = `${folders.length} / ${limit} folder`;
  if (countNode) countNode.textContent = `${folders.length} folder`;
  list.replaceChildren();

  if (!folders.length) {
    list.append(
      h('p', { class: 'manage-empty', text: 'Belum ada folder. Buat folder pertama Anda.' }),
    );
    return;
  }

  for (const folder of folders) {
    const row = h('div', { class: 'manage-row' });
    row.append(
      h('span', { class: 'manage-row-icon' }, icon('folder')),
      h(
        'span',
        { class: 'manage-row-copy' },
        h('strong', { text: folder.name }),
        h('span', { text: `${folder.item_count ?? 0} item` }),
      ),
    );

    const actions = h('div', { class: 'manage-row-actions' });
    actions.append(
      h(
        'a',
        {
          class: 'icon-btn',
          href: `/app/folders/${folder.id}`,
          title: 'Buka folder',
          'aria-label': 'Buka folder',
        },
        icon('chevron-right'),
      ),
      iconButton('pencil', 'Ubah nama', () => renameFolder(folder)),
      iconButton('trash', 'Hapus folder', () => deleteFolder(folder)),
    );
    row.append(actions);
    list.append(row);
  }
}

function iconButton(iconName, label, handler) {
  const button = h(
    'button',
    { class: 'icon-btn', type: 'button', title: label, 'aria-label': label },
    icon(iconName),
  );
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

async function createFolder(event) {
  event.preventDefault();
  clearFormError(form);
  const input = form.elements.name;
  const name = input.value.trim();
  if (!name) {
    showFormError(form, 'Nama folder wajib diisi.');
    return;
  }

  const button = form.querySelector('[data-submit]');
  setLoading(button, true);
  try {
    const result = await api('/api/folders', { method: 'POST', body: { name } });
    toast(result?.message ?? 'Folder dibuat.');
    input.value = '';
    await loadFolders();
  } catch (error) {
    showFormError(form, errorMessage(error));
  } finally {
    setLoading(button, false);
  }
}

async function renameFolder(folder) {
  const name = await promptDialog({
    title: 'Ubah nama folder',
    label: 'Nama folder',
    value: folder.name,
    maxLength: 60,
  });
  if (!name || name === folder.name) return;
  const result = await api(`/api/folders/${folder.id}`, { method: 'PATCH', body: { name } });
  toast(result?.message ?? 'Folder diperbarui.');
  await loadFolders();
}

async function deleteFolder(folder) {
  const confirmed = await confirmDialog({
    title: 'Hapus folder?',
    message: `Folder "${folder.name}" akan dihapus. Item di dalamnya tidak dihapus, tetapi menjadi tanpa folder.`,
    confirmLabel: 'Hapus folder',
    danger: true,
  });
  if (!confirmed) return;
  const result = await api(`/api/folders/${folder.id}`, { method: 'DELETE' });
  toast(result?.message ?? 'Folder dihapus.');
  await loadFolders();
}
