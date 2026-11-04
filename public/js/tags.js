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

const form = document.querySelector('[data-create-tag]');
const list = document.querySelector('[data-tag-list]');
const limitNode = document.querySelector('[data-tag-limit]');
const countNode = document.querySelector('[data-tag-count]');
let tags = [];
let limit = 100;

if (form && list) {
  form.addEventListener('submit', createTag);
  loadTags();
}

async function loadTags() {
  try {
    const data = await api('/api/tags');
    tags = data.tags ?? [];
    limit = data.limit ?? 100;
    render();
  } catch (error) {
    list.replaceChildren(h('p', { class: 'manage-empty', text: errorMessage(error) }));
  }
}

function render() {
  if (limitNode) limitNode.textContent = `${tags.length} / ${limit} tag`;
  if (countNode) countNode.textContent = `${tags.length} tag`;
  list.replaceChildren();

  if (!tags.length) {
    list.append(h('p', { class: 'manage-empty', text: 'Belum ada tag. Buat tag pertama Anda.' }));
    return;
  }

  for (const tag of tags) {
    const row = h('div', { class: 'manage-row' });
    row.append(
      h('span', { class: 'manage-row-icon' }, icon('tag')),
      h(
        'span',
        { class: 'manage-row-copy' },
        h('strong', { text: `#${tag.name}` }),
        h('span', { text: `${tag.item_count ?? 0} item` }),
      ),
    );

    const actions = h('div', { class: 'manage-row-actions' });
    actions.append(
      h(
        'a',
        { class: 'icon-btn', href: `/app/tags/${tag.id}`, title: 'Buka tag', 'aria-label': 'Buka tag' },
        icon('chevron-right'),
      ),
      iconButton('pencil', 'Ubah nama', () => renameTag(tag)),
      iconButton('trash', 'Hapus tag', () => deleteTag(tag)),
    );
    row.append(actions);
    list.append(row);
  }
}

function iconButton(iconName, label, handler) {
  const button = h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label }, icon(iconName));
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

async function createTag(event) {
  event.preventDefault();
  clearFormError(form);
  const input = form.elements.name;
  const name = input.value.trim();
  if (!name) {
    showFormError(form, 'Nama tag wajib diisi.');
    return;
  }

  const button = form.querySelector('[data-submit]');
  setLoading(button, true);
  try {
    const result = await api('/api/tags', { method: 'POST', body: { name } });
    toast(result?.message ?? 'Tag dibuat.');
    input.value = '';
    await loadTags();
  } catch (error) {
    showFormError(form, errorMessage(error));
  } finally {
    setLoading(button, false);
  }
}

async function renameTag(tag) {
  const name = await promptDialog({
    title: 'Ubah nama tag',
    label: 'Nama tag',
    value: tag.name,
    maxLength: 40,
  });
  if (!name || name === tag.name) return;
  const result = await api(`/api/tags/${tag.id}`, { method: 'PATCH', body: { name } });
  toast(result?.message ?? 'Tag diperbarui.');
  await loadTags();
}

async function deleteTag(tag) {
  const confirmed = await confirmDialog({
    title: 'Hapus tag?',
    message: `Tag "#${tag.name}" akan dihapus dari semua item. Item tetap tersimpan.`,
    confirmLabel: 'Hapus tag',
    danger: true,
  });
  if (!confirmed) return;
  const result = await api(`/api/tags/${tag.id}`, { method: 'DELETE' });
  toast(result?.message ?? 'Tag dihapus.');
  await loadTags();
}
