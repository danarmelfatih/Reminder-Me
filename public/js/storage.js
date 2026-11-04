import { api, errorMessage } from './api.js';
import { formatBytes, h, toast } from './ui.js';

init();

async function init() {
  try {
    const data = await api('/api/me/storage');
    render(data);
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

function render(data) {
  const storage = data.storage ?? {};
  const files = data.files ?? {};
  const percent = Math.min(100, Math.max(0, Number(storage.percent) || 0));

  setText('[data-storage-page-percent]', `${Math.round(percent)}%`);
  setText(
    '[data-storage-page-numbers]',
    `${formatBytes(storage.used)} dari ${formatBytes(storage.quota)}`,
  );
  setText('[data-storage-file-size]', formatBytes(files.activeBytes ?? 0));
  setText('[data-storage-trash-size]', formatBytes(files.trashBytes ?? 0));
  setText('[data-storage-free-size]', formatBytes(storage.remaining ?? 0));

  const fill = document.querySelector('[data-storage-page-fill]');
  const bar = document.querySelector('[data-storage-page-bar]');
  if (fill) fill.style.width = `${percent}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(percent)));

  const status = document.querySelector('[data-storage-status]');
  if (status) {
    const count = (files.activeCount ?? 0) + (files.trashCount ?? 0);
    status.textContent = `${count} file tersimpan di ${files.activeCount ?? 0} item aktif dan ${files.trashCount ?? 0} item di Trash.`;
  }

  const warning = document.querySelector('[data-storage-warning]');
  const warningText = document.querySelector('[data-storage-warning-text]');
  if (warning && warningText) {
    if (storage.level === 'full') {
      warningText.textContent = 'Kapasitas storage penuh. Hapus file atau kosongkan Trash untuk membebaskan ruang.';
      warning.hidden = false;
    } else if (storage.level === 'critical') {
      warningText.textContent = 'Kapasitas hampir penuh (di atas 95%). Segera kosongkan Trash atau hapus file besar.';
      warning.hidden = false;
    } else if (storage.level === 'warning') {
      warningText.textContent = 'Penggunaan storage sudah di atas 80%. Pertimbangkan merapikan file.';
      warning.hidden = false;
    } else {
      warning.hidden = true;
    }
  }
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}
