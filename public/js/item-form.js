import { api, errorMessage } from './api.js';
import { createReminderControls } from './reminder.js';
import {
  clearFormError,
  debounce,
  formatBytes,
  h,
  icon,
  setLoading,
  showFormError,
  toast,
  typeLabel,
} from './ui.js';

const app = document.getElementById('item-form-app');

const mode = app?.dataset.mode ?? 'create';
const itemId = app?.dataset.itemId ?? '';
const form = app?.querySelector('[data-item-form]');

const elements = {
  typeOptions: [...(app?.querySelectorAll('[data-type-option]') ?? [])],
  urlField: app?.querySelector('[data-url-field]'),
  urlInput: app?.querySelector('#item-url'),
  fileField: app?.querySelector('[data-file-field]'),
  fileInput: app?.querySelector('[data-file-input]'),
  dropzone: app?.querySelector('[data-dropzone]'),
  dropzoneTitle: app?.querySelector('[data-dropzone-title]'),
  dropzoneHint: app?.querySelector('[data-dropzone-hint]'),
  fileError: app?.querySelector('[data-file-error]'),
  thumbnailField: app?.querySelector('[data-thumbnail-field]'),
  thumbnailInput: app?.querySelector('[data-thumbnail-input]'),
  thumbnailPreview: app?.querySelector('[data-thumbnail-preview]'),
  thumbnailError: app?.querySelector('[data-thumbnail-error]'),
  metadataStatus: app?.querySelector('[data-metadata-status]'),
  metadataPreview: app?.querySelector('[data-metadata-preview]'),
  title: app?.querySelector('#item-title'),
  description: app?.querySelector('#item-description'),
  descriptionCount: app?.querySelector('[data-description-count]'),
  folderSelect: app?.querySelector('[data-folder-select]'),
  tagPicker: app?.querySelector('[data-tag-picker]'),
  existingFile: app?.querySelector('[data-existing-file]'),
  editTypeLabel: app?.querySelector('[data-edit-type-label]'),
  reminderToggle: app?.querySelector('[data-reminder-toggle]'),
  reminderControls: app?.querySelector('[data-reminder-controls]'),
  submit: form?.querySelector('[data-submit]'),
  cancel: app?.querySelector('[data-cancel-link]'),
};

let type = mode === 'create' ? app.dataset.initialType || 'link' : 'link';
let currentItem = null;
let reminder = null;
let metadata = null;
let metadataUrl = null;
let metadataRequest = 0;

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'];
const THUMBNAIL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
let thumbnailObjectUrl = null;

function init() {
  bindEvents();
  setType(type);
  setupReminder();
  if (mode === 'edit') {
    loadItem();
  } else {
    loadOptions();
    loadUserTimezone();
  }
  updateDescriptionCount();
}

function setupReminder() {
  if (mode !== 'create' || !elements.reminderToggle || !elements.reminderControls) return;
  reminder = createReminderControls({ timezone: 'Asia/Jakarta' });
  elements.reminderControls.append(reminder.node);
  elements.reminderToggle.addEventListener('change', () => {
    elements.reminderControls.hidden = !elements.reminderToggle.checked;
  });
}

async function loadUserTimezone() {
  try {
    const data = await api('/api/me');
    if (data?.user?.timezone && reminder) {
      reminder.timezoneInput.value = data.user.timezone;
    }
  } catch {
    return;
  }
}

function reminderEnabled() {
  return mode === 'create' && Boolean(elements.reminderToggle?.checked);
}

function bindEvents() {
  for (const option of elements.typeOptions) {
    option.addEventListener('click', () => setType(option.dataset.typeOption));
  }

  elements.fileInput?.addEventListener('change', () => {
    validateSelectedFile();
    updateDropzone();
  });

  elements.thumbnailInput?.addEventListener('change', () => {
    if (validateSelectedThumbnail()) updateThumbnailPreview();
  });

  for (const eventName of ['dragenter', 'dragover']) {
    elements.dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add('is-dragover');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    elements.dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.remove('is-dragover');
    });
  }
  elements.dropzone?.addEventListener('drop', (event) => {
    const files = event.dataTransfer?.files;
    if (!files?.length || !elements.fileInput) return;
    elements.fileInput.files = files;
    validateSelectedFile();
    updateDropzone();
  });

  elements.description?.addEventListener('input', updateDescriptionCount);

  elements.urlInput?.addEventListener(
    'input',
    debounce(() => {
      fetchMetadata();
    }, 500),
  );

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitForm();
  });
}

function setType(nextType) {
  type = ['link', 'text', 'image', 'document'].includes(nextType) ? nextType : 'link';

  for (const option of elements.typeOptions) {
    const selected = option.dataset.typeOption === type;
    option.classList.toggle('is-selected', selected);
    option.setAttribute('aria-checked', String(selected));
  }

  const showUrl = type === 'link';
  const showFile = (type === 'image' || type === 'document') && mode === 'create';
  if (elements.urlField) elements.urlField.hidden = !showUrl;
  if (elements.fileField) elements.fileField.hidden = !showFile;
  if (elements.thumbnailField) elements.thumbnailField.hidden = !showUrl;

  if (elements.fileInput) {
    elements.fileInput.accept =
      type === 'image'
        ? 'image/jpeg,image/png,image/webp'
        : type === 'document'
          ? DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',')
          : '';
  }
  if (elements.dropzoneHint) {
    elements.dropzoneHint.textContent =
      type === 'image'
        ? 'JPG, PNG, atau WEBP. Maksimal 10 MB.'
        : 'PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, atau TXT. Maksimal 25 MB.';
  }

  if (elements.metadataStatus) {
    elements.metadataStatus.hidden = !showUrl;
  }
  if (elements.metadataPreview) {
    elements.metadataPreview.hidden = true;
  }

  if (showUrl) fetchMetadata();
}

function updateDescriptionCount() {
  if (elements.descriptionCount) {
    elements.descriptionCount.textContent = String(elements.description?.value.length ?? 0);
  }
}

function updateDropzone() {
  const file = elements.fileInput?.files?.[0];
  if (!elements.dropzoneTitle) return;
  elements.dropzoneTitle.textContent = file
    ? `${file.name} · ${formatBytes(file.size)}`
    : 'Pilih file atau tarik ke sini';
}

function validateSelectedFile() {
  const file = elements.fileInput?.files?.[0];
  if (!file) return true;
  if (elements.fileError) elements.fileError.hidden = true;

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowed = type === 'image' ? IMAGE_EXTENSIONS : DOCUMENT_EXTENSIONS;
  const maxBytes = type === 'image' ? 10 * 1024 * 1024 : 25 * 1024 * 1024;

  if (!allowed.includes(extension)) {
    showFileError(
      type === 'image'
        ? 'Format gambar harus JPG, PNG, atau WEBP.'
        : 'Format dokumen tidak didukung.',
    );
    elements.fileInput.value = '';
    return false;
  }
  if (file.size > maxBytes) {
    showFileError(
      type === 'image' ? 'Ukuran gambar maksimal 10 MB.' : 'Ukuran dokumen maksimal 25 MB.',
    );
    elements.fileInput.value = '';
    return false;
  }
  return true;
}

function validateSelectedThumbnail() {
  const file = elements.thumbnailInput?.files?.[0];
  if (!file) return true;
  if (elements.thumbnailError) elements.thumbnailError.hidden = true;

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!THUMBNAIL_EXTENSIONS.includes(extension)) {
    showThumbnailError('Thumbnail harus JPG, PNG, atau WEBP.');
    elements.thumbnailInput.value = '';
    clearThumbnailPreview();
    return false;
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    showThumbnailError('Ukuran thumbnail maksimal 2 MB.');
    elements.thumbnailInput.value = '';
    clearThumbnailPreview();
    return false;
  }
  return true;
}

function showThumbnailError(message) {
  if (!elements.thumbnailError) {
    toast(message, 'error');
    return;
  }
  elements.thumbnailError.textContent = message;
  elements.thumbnailError.hidden = false;
}

function clearThumbnailPreview() {
  if (thumbnailObjectUrl) {
    URL.revokeObjectURL(thumbnailObjectUrl);
    thumbnailObjectUrl = null;
  }
  if (elements.thumbnailPreview) {
    elements.thumbnailPreview.replaceChildren();
    elements.thumbnailPreview.hidden = true;
  }
}

function updateThumbnailPreview(url) {
  if (!elements.thumbnailPreview) return;
  const file = elements.thumbnailInput?.files?.[0];
  const source = file ? URL.createObjectURL(file) : url;
  clearThumbnailPreview();
  if (!source) return;
  if (file) thumbnailObjectUrl = source;

  const image = h('img', { src: source, alt: 'Pratinjau thumbnail', loading: 'lazy' });
  elements.thumbnailPreview.append(
    image,
    h('span', { class: 'thumbnail-preview-copy', text: file ? file.name : 'Thumbnail saat ini' }),
  );
  elements.thumbnailPreview.hidden = false;
}

function showFileError(message) {
  if (!elements.fileError) {
    toast(message, 'error');
    return;
  }
  elements.fileError.textContent = message;
  elements.fileError.hidden = false;
}

async function loadOptions() {
  try {
    const [folderData, tagData] = await Promise.all([api('/api/folders'), api('/api/tags')]);
    renderFolders(folderData.folders ?? []);
    renderTags(tagData.tags ?? []);
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

function renderFolders(folders) {
  if (!elements.folderSelect) return;
  const selected = currentItem?.folder?.id ?? '';
  elements.folderSelect.replaceChildren(h('option', { value: '', text: 'Tanpa folder' }));
  for (const folder of folders) {
    elements.folderSelect.append(h('option', { value: folder.id, text: folder.name }));
  }
  elements.folderSelect.value = selected;
}

function renderTags(tags) {
  if (!elements.tagPicker) return;
  elements.tagPicker.replaceChildren();
  if (!tags.length) {
    elements.tagPicker.append(
      h(
        'p',
        { class: 'tag-picker-loading' },
        'Belum ada tag. ',
        h('a', { class: 'text-link', href: '/app/tags', text: 'Buat tag' }),
        ' terlebih dahulu.',
      ),
    );
    return;
  }

  const selected = new Set((currentItem?.tags ?? []).map((tag) => tag.id));
  for (const tag of tags) {
    const input = h('input', {
      type: 'checkbox',
      name: 'tagIds',
      value: tag.id,
      checked: selected.has(tag.id),
    });
    elements.tagPicker.append(
      h('label', { class: 'tag-choice' }, input, h('span', { text: tag.name })),
    );
  }
}

async function loadItem() {
  try {
    const data = await api(`/api/items/${itemId}`);
    currentItem = data.item;
    type = currentItem.type;
    setType(type);

    if (elements.title) elements.title.value = currentItem.title;
    if (elements.description) elements.description.value = currentItem.description ?? '';
    if (elements.urlInput) elements.urlInput.value = currentItem.url ?? '';

    const favorite = form.querySelector('input[name="isFavorite"]');
    if (favorite) favorite.checked = Boolean(currentItem.isFavorite);

    const priority = form.querySelector(`input[name="priority"][value="${currentItem.priority}"]`);
    if (priority) priority.checked = true;

    if (elements.editTypeLabel) {
      elements.editTypeLabel.textContent =
        currentItem.type === 'link'
          ? 'Link. Anda dapat memperbarui judul, deskripsi, dan URL.'
          : `${typeLabel(currentItem.type)}. File tidak dapat diganti; hapus dan simpan ulang bila perlu.`;
    }
    renderExistingFile();
    updateThumbnailPreview(currentItem.link?.imageUrl);

    if (elements.cancel) elements.cancel.href = `/app/items/${itemId}`;
    updateDescriptionCount();
    await loadOptions();
  } catch (error) {
    showFormError(form, errorMessage(error));
  }
}

function renderExistingFile() {
  if (!elements.existingFile || !currentItem) return;
  elements.existingFile.replaceChildren();
  const file = currentItem.file;
  if (!file) {
    elements.existingFile.hidden = true;
    return;
  }
  elements.existingFile.hidden = false;
  elements.existingFile.append(
    h('span', { class: 'detail-file-icon' }, icon('file-text')),
    h(
      'span',
      { class: 'detail-file-copy' },
      h('strong', { text: file.name }),
      h('span', { text: `${formatBytes(file.size)} · ${file.extension?.toUpperCase() ?? ''}` }),
    ),
    h('a', { class: 'btn btn-ghost btn-sm', href: file.downloadUrl, text: 'Unduh' }),
  );
}

async function fetchMetadata() {
  if (type !== 'link' || !elements.urlInput) return;
  const url = elements.urlInput.value.trim();
  if (!isHttpUrl(url)) {
    metadata = null;
    metadataUrl = null;
    if (elements.metadataPreview) elements.metadataPreview.hidden = true;
    return;
  }

  const requestId = ++metadataRequest;
  if (elements.metadataStatus) {
    elements.metadataStatus.hidden = false;
    elements.metadataStatus.textContent = 'Mengambil metadata tautan…';
  }

  try {
    const data = await api(`/api/metadata?url=${encodeURIComponent(url)}`);
    if (requestId !== metadataRequest) return;
    metadata = data.metadata;
    metadataUrl = url;
    renderMetadata(metadata);

    if (elements.title && !elements.title.value.trim() && metadata.title) {
      elements.title.value = metadata.title;
    }
    if (elements.description && !elements.description.value.trim() && metadata.description) {
      elements.description.value = metadata.description;
      updateDescriptionCount();
    }
  } catch (error) {
    if (requestId !== metadataRequest) return;
    metadata = null;
    metadataUrl = null;
    if (elements.metadataPreview) elements.metadataPreview.hidden = true;
    if (elements.metadataStatus) {
      elements.metadataStatus.textContent = `Metadata tidak tersedia: ${errorMessage(error)}`;
    }
  }
}

function renderMetadata(data) {
  if (!elements.metadataPreview || !elements.metadataStatus) return;
  elements.metadataPreview.replaceChildren();

  if (data.imageUrl) {
    const image = h('img', {
      src: `/api/metadata/image?url=${encodeURIComponent(data.imageUrl)}`,
      alt: '',
      loading: 'lazy',
    });
    image.addEventListener('error', () => image.remove());
    elements.metadataPreview.append(image);
  }

  elements.metadataPreview.append(
    h(
      'div',
      { class: 'metadata-preview-copy' },
      h('strong', { text: data.title || data.domain || 'Tautan' }),
      h('p', { text: data.description || data.siteName || data.url }),
    ),
  );
  elements.metadataPreview.hidden = false;
  elements.metadataStatus.textContent = `Metadata dari ${data.domain ?? 'situs'}.`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function selectedTagIds() {
  return [...(app.querySelectorAll('input[name="tagIds"]:checked') ?? [])].map(
    (input) => input.value,
  );
}

function basePayload() {
  return {
    title: elements.title.value.trim(),
    description: elements.description.value.trim() || null,
    priority: form.querySelector('input[name="priority"]:checked')?.value ?? 'medium',
    folderId: elements.folderSelect?.value || null,
    tagIds: selectedTagIds(),
    isFavorite: Boolean(form.querySelector('input[name="isFavorite"]')?.checked),
  };
}

async function uploadCustomThumbnail(id) {
  const file = elements.thumbnailInput?.files?.[0];
  if (!file) return null;
  const data = new FormData();
  data.set('thumbnail', file);
  return api(`/api/items/${id}/thumbnail`, { method: 'POST', formData: data });
}

async function submitForm() {
  clearFormError(form);
  const title = elements.title?.value.trim();
  if (!title) {
    showFormError(form, 'Judul wajib diisi.');
    elements.title?.focus();
    return;
  }

  if (type === 'link' && !isHttpUrl(elements.urlInput?.value.trim())) {
    showFormError(form, 'URL harus diawali http:// atau https://.');
    elements.urlInput?.focus();
    return;
  }

  if (type === 'link' && !validateSelectedThumbnail()) {
    showFormError(form, 'Thumbnail tidak valid. Periksa format dan ukuran.');
    return;
  }

  if (mode === 'create' && (type === 'image' || type === 'document')) {
    if (!elements.fileInput?.files?.length) {
      showFormError(form, 'Pilih file yang ingin diunggah.');
      return;
    }
    if (!validateSelectedFile()) {
      showFormError(form, 'File tidak valid. Periksa format dan ukuran.');
      return;
    }
  }

  if (reminderEnabled()) {
    try {
      reminder.validate();
    } catch (error) {
      showFormError(form, errorMessage(error));
      return;
    }
  }

  setLoading(elements.submit, true);
  try {
    const payload = basePayload();
    let result;

    if (mode === 'edit') {
      const update = {
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
        folderId: payload.folderId,
        tagIds: payload.tagIds,
        isFavorite: payload.isFavorite,
      };
      if (type === 'link') {
        const url = elements.urlInput.value.trim();
        update.url = url;
        if (url !== currentItem?.url) {
          update.linkMetadata = metadataUrl === url ? metadata : null;
        }
      }
      result = await api(`/api/items/${itemId}`, { method: 'PATCH', body: update });
      if (type === 'link' && elements.thumbnailInput?.files?.length) {
        try {
          await uploadCustomThumbnail(itemId);
          toast('Item dan thumbnail diperbarui.');
        } catch (error) {
          toast(`Item diperbarui, tetapi thumbnail gagal: ${errorMessage(error)}`, 'error');
        }
      } else {
        toast(result?.message ?? 'Item diperbarui.');
      }
      window.location.assign(`/app/items/${itemId}?updated=1`);
      return;
    }

    if (type === 'link' || type === 'text') {
      const url = elements.urlInput.value.trim();
      result = await api('/api/items', {
        method: 'POST',
        body: {
          type,
          ...payload,
          ...(type === 'link'
            ? {
                url,
                linkMetadata: metadataUrl === url ? (metadata ?? undefined) : undefined,
              }
            : {}),
        },
      });
    } else {
      const data = new FormData();
      data.set('type', type);
      data.set('title', payload.title);
      if (payload.description) data.set('description', payload.description);
      data.set('priority', payload.priority);
      if (payload.folderId) data.set('folderId', payload.folderId);
      data.set('tagIds', JSON.stringify(payload.tagIds));
      data.set('isFavorite', payload.isFavorite ? 'true' : 'false');
      data.set('file', elements.fileInput.files[0]);
      result = await api('/api/items', { method: 'POST', formData: data });
    }

    if (type === 'link' && elements.thumbnailInput?.files?.length) {
      try {
        await uploadCustomThumbnail(result.item.id);
        toast('Item dan thumbnail disimpan.');
      } catch (error) {
        toast(`Item tersimpan, tetapi thumbnail gagal: ${errorMessage(error)}`, 'error');
      }
    } else {
      toast(result?.message ?? 'Item disimpan.');
    }

    let reminderFailed = false;
    if (reminderEnabled()) {
      try {
        await api(`/api/items/${result.item.id}/reminder`, {
          method: 'PUT',
          body: reminder.getPayload(),
        });
      } catch (error) {
        reminderFailed = true;
        toast(`Item tersimpan, tetapi pengingat gagal: ${errorMessage(error)}`, 'error');
      }
    }
    const query = reminderFailed ? '?created=1&reminder=failed' : '?created=1';
    window.location.assign(`/app/items/${result.item.id}${query}`);
  } catch (error) {
    showFormError(form, errorMessage(error));
  } finally {
    setLoading(elements.submit, false);
  }
}

if (app) init();
