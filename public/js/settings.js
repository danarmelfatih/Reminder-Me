import { api, errorMessage } from './api.js';
import {
  clearFormError,
  clearFormSuccess,
  h,
  icon,
  initials,
  openModal,
  setLoading,
  showFormError,
  showFormSuccess,
  toast,
} from './ui.js';

const profileForm = document.querySelector('[data-profile-form]');
const passwordForm = document.querySelector('[data-password-form]');
const avatarInput = document.querySelector('[data-avatar-input]');
const timezoneSelect = document.querySelector('[data-timezone-select]');
const deleteButton = document.querySelector('[data-delete-account]');
const exportButton = document.querySelector('[data-export-button]');

let user = null;

init();

async function init() {
  try {
    const data = await api('/api/me');
    user = data.user;
    populateTimezones(user.timezone);
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

function populateTimezones(current) {
  if (!timezoneSelect) return;
  const fallback = [
    'Asia/Jakarta',
    'Asia/Makassar',
    'Asia/Jayapura',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Los_Angeles',
    'UTC',
  ];
  let zones = fallback;
  try {
    zones = Intl.supportedValuesOf?.('timeZone') ?? fallback;
  } catch {
    zones = fallback;
  }
  if (current && !zones.includes(current)) zones = [current, ...zones];

  timezoneSelect.replaceChildren();
  for (const zone of zones) {
    timezoneSelect.append(h('option', { value: zone, text: zone }));
  }
  timezoneSelect.value = current || 'Asia/Jakarta';
}

profileForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormError(profileForm);
  clearFormSuccess(profileForm);

  const name = profileForm.elements.name.value.trim();
  const timezone = timezoneSelect?.value || 'Asia/Jakarta';
  if (!name) {
    showFormError(profileForm, 'Nama wajib diisi.');
    return;
  }

  const button = profileForm.querySelector('[data-submit]');
  setLoading(button, true);
  try {
    const result = await api('/api/me', { method: 'PATCH', body: { name, timezone } });
    user = result.user;
    updateNameEverywhere(name);
    showFormSuccess(profileForm, result?.message ?? 'Profil diperbarui.');
    toast('Profil diperbarui.');
  } catch (error) {
    showFormError(profileForm, errorMessage(error));
  } finally {
    setLoading(button, false);
  }
});

function updateNameEverywhere(name) {
  const nameNode = document.querySelector('.sidebar-user .user-chip-copy strong');
  if (nameNode) nameNode.textContent = name;
  for (const node of document.querySelectorAll('.avatar-fallback')) {
    node.textContent = initials(name);
  }
}

avatarInput?.addEventListener('change', async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast('Foto profil harus JPG, PNG, atau WEBP.', 'error');
    avatarInput.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    toast('Ukuran foto profil maksimal 2 MB.', 'error');
    avatarInput.value = '';
    return;
  }

  const data = new FormData();
  data.set('avatar', file);
  try {
    const result = await api('/api/me/avatar', { method: 'POST', formData: data });
    toast(result?.message ?? 'Foto profil diperbarui.');
    window.setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    avatarInput.value = '';
  }
});

passwordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormError(passwordForm);
  clearFormSuccess(passwordForm);

  const newPassword = passwordForm.elements.newPassword.value;
  const confirmPassword = passwordForm.elements.confirmPassword.value;
  const currentPassword = passwordForm.elements.currentPassword?.value ?? '';

  if (newPassword.length < 8) {
    showFormError(passwordForm, 'Password baru minimal 8 karakter.');
    return;
  }
  if (newPassword !== confirmPassword) {
    showFormError(passwordForm, 'Konfirmasi password baru tidak cocok.');
    return;
  }

  const button = passwordForm.querySelector('[data-submit]');
  setLoading(button, true);
  try {
    const result = await api('/api/me/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    showFormSuccess(passwordForm, result?.message ?? 'Password berhasil diubah.');
    passwordForm.reset();
  } catch (error) {
    showFormError(passwordForm, errorMessage(error));
  } finally {
    setLoading(button, false);
  }
});

deleteButton?.addEventListener('click', openDeleteModal);

function openDeleteModal() {
  const hasPassword = deleteButton.dataset.hasPassword === 'true';
  const googleLinked = deleteButton.dataset.googleLinked === 'true';
  const confirmationInput = h('input', {
    type: 'text',
    placeholder: 'HAPUS',
    autocomplete: 'off',
    required: true,
  });
  const passwordInput = hasPassword
    ? h('input', { type: 'password', autocomplete: 'current-password', required: true })
    : null;

  const errorBox = h('div', { class: 'form-error', hidden: true });
  const body = h(
    'div',
    { class: 'form-stack' },
    h('p', {
      class: 'settings-copy',
      text: 'Seluruh item, file, folder, tag, pengingat, notifikasi, dan sesi login akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.',
    }),
    errorBox,
    h(
      'div',
      { class: 'field' },
      h('label', { text: 'Ketik HAPUS untuk mengonfirmasi' }),
      confirmationInput,
    ),
    hasPassword
      ? h('div', { class: 'field' }, h('label', { text: 'Password akun' }), passwordInput)
      : null,
    !hasPassword && googleLinked
      ? h(
          'div',
          { class: 'notice' },
          icon('shield'),
          h(
            'span',
            {},
            'Akun ini menggunakan Google. Anda mungkin perlu ',
            h('a', {
              class: 'text-link',
              href: '/api/auth/google?purpose=reauth&next=%2Fapp%2Fsettings',
              text: 'verifikasi ulang dengan Google',
            }),
            ' sebelum menghapus akun.',
          ),
        )
      : null,
  );

  openModal({
    title: 'Hapus akun permanen?',
    description: 'Pastikan Anda sudah mengunduh data yang diperlukan.',
    body,
    actions: [
      { label: 'Batal', className: 'btn btn-ghost' },
      {
        label: 'Hapus akun permanen',
        className: 'btn btn-danger',
        onClick: async ({ close }) => {
          errorBox.hidden = true;
          const confirmation = confirmationInput.value.trim();
          if (confirmation !== 'HAPUS') {
            errorBox.textContent = 'Ketik HAPUS (huruf kapital) untuk melanjutkan.';
            errorBox.hidden = false;
            return false;
          }
          if (hasPassword && !passwordInput.value) {
            errorBox.textContent = 'Password wajib diisi.';
            errorBox.hidden = false;
            return false;
          }

          try {
            const result = await api('/api/me', {
              method: 'DELETE',
              body: {
                confirmation,
                ...(hasPassword ? { password: passwordInput.value } : {}),
              },
            });
            toast(result?.message ?? 'Akun dihapus.');
            close();
            window.location.assign('/');
          } catch (error) {
            errorBox.textContent = errorMessage(error);
            errorBox.hidden = false;
            return false;
          }
        },
      },
    ],
  });
}

exportButton?.addEventListener('click', () => {
  toast('Menyiapkan arsip ZIP. Proses dapat memakan waktu.');
});
