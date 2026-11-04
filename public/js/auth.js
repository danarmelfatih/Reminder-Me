import { api, errorMessage } from './api.js';
import {
  clearFormError,
  clearFormSuccess,
  h,
  setLoading,
  showFormError,
  showFormSuccess,
  toast,
} from './ui.js';

const form = document.querySelector('[data-auth-form]');
const mode = form?.dataset.authForm;

if (form && mode) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (mode === 'login') return handleLogin();
    if (mode === 'register') return handleRegister();
    if (mode === 'forgot') return handleForgot();
    if (mode === 'reset') return handleReset();
    if (mode === 'resend') return handleResend();
  });
}

function submitButton() {
  return form.querySelector('[data-submit]');
}

function showUnverifiedError(email) {
  showFormError(form, 'Email Anda belum diverifikasi. Periksa kotak masuk atau kirim ulang tautan verifikasi.');
  const errorBox = form.querySelector('[data-form-error]');
  if (!errorBox || errorBox.querySelector('[data-resend-inline]')) return;
  const button = h(
    'button',
    { type: 'button', class: 'btn btn-ghost btn-sm', 'data-resend-inline': '' },
    'Kirim ulang verifikasi',
  );
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const result = await api('/api/auth/resend-verification', {
        method: 'POST',
        body: { email },
      });
      toast(result?.message ?? 'Tautan verifikasi telah dikirim.');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      button.disabled = false;
    }
  });
  errorBox.append(' ', button);
}

async function handleLogin() {
  clearFormError(form);
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    showFormError(form, 'Email dan password wajib diisi.');
    return;
  }

  const button = submitButton();
  setLoading(button, true);
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: { email, password, remember: form.remember?.checked ?? false },
    });
    const next = document.body.dataset.next || '/app';
    window.location.assign(next.startsWith('/') && !next.startsWith('//') ? next : '/app');
  } catch (error) {
    if (error.code === 'email_unverified') showUnverifiedError(email);
    else showFormError(form, errorMessage(error));
  } finally {
    setLoading(button, false);
  }
}

async function handleRegister() {
  clearFormError(form);
  clearFormSuccess(form);
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (!name || !email || !password) {
    showFormError(form, 'Nama, email, dan password wajib diisi.');
    return;
  }
  if (password.length < 8) {
    showFormError(form, 'Password minimal 8 karakter.');
    return;
  }
  if (password !== confirmPassword) {
    showFormError(form, 'Konfirmasi password tidak cocok.');
    return;
  }

  const button = submitButton();
  setLoading(button, true);
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
    form.querySelectorAll('input, button').forEach((node) => {
      node.disabled = true;
    });
    showFormSuccess(
      form,
      result?.message ?? 'Akun dibuat. Silakan cek email untuk verifikasi sebelum masuk.',
    );
    const resend = h(
      'button',
      { type: 'button', class: 'btn btn-ghost btn-block' },
      'Kirim ulang email verifikasi',
    );
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      try {
        await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
        toast('Tautan verifikasi telah dikirim.');
      } catch (error) {
        toast(errorMessage(error), 'error');
      } finally {
        resend.disabled = false;
      }
    });
    form.append(
      resend,
      h(
        'p',
        { class: 'auth-switch' },
        'Sudah verifikasi? ',
        h('a', { href: '/login', text: 'Masuk sekarang' }),
      ),
    );
  } catch (error) {
    showFormError(form, errorMessage(error));
    setLoading(button, false);
  }
}

async function handleForgot() {
  clearFormError(form);
  clearFormSuccess(form);
  const email = form.email.value.trim();
  if (!email) {
    showFormError(form, 'Email wajib diisi.');
    return;
  }

  const button = submitButton();
  setLoading(button, true);
  try {
    const result = await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
    showFormSuccess(
      form,
      result?.message ?? 'Jika email terdaftar, tautan pengaturan ulang password telah dikirim.',
    );
  } catch (error) {
    showFormError(form, errorMessage(error));
  } finally {
    setLoading(button, false);
  }
}

async function handleReset() {
  clearFormError(form);
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;
  const token = form.dataset.token ?? '';

  if (password.length < 8) {
    showFormError(form, 'Password minimal 8 karakter.');
    return;
  }
  if (password !== confirmPassword) {
    showFormError(form, 'Konfirmasi password tidak cocok.');
    return;
  }

  const button = submitButton();
  setLoading(button, true);
  try {
    const result = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    });
    showFormSuccess(form, result?.message ?? 'Password berhasil diperbarui.');
    form.querySelectorAll('input, button').forEach((node) => {
      node.disabled = true;
    });
    window.setTimeout(() => window.location.assign('/login'), 1600);
  } catch (error) {
    showFormError(form, errorMessage(error));
    setLoading(button, false);
  }
}

async function handleResend() {
  clearFormError(form);
  clearFormSuccess(form);
  const email = document.querySelector('.auth-lead strong')?.textContent.trim();
  if (!email) {
    showFormError(form, 'Email akun tidak ditemukan. Muat ulang halaman.');
    return;
  }

  const button = submitButton();
  setLoading(button, true);
  try {
    const result = await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
    showFormSuccess(form, result?.message ?? 'Tautan verifikasi telah dikirim.');
  } catch (error) {
    showFormError(form, errorMessage(error));
  } finally {
    setLoading(button, false);
  }
}
