import { config } from '../config.js';
import { escapeHtml, formatDateTime } from '../lib/format.js';

function layout({ title, body, footer = '' }) {
  return `<!doctype html>
<html lang="id">
  <body style="margin:0;padding:0;background:#f4f2ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#24211d;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ed;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf9;border:1px solid #e4dfd5;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:22px 28px;border-bottom:1px solid #eee9df;font-weight:700;font-size:15px;letter-spacing:-0.01em;">
                Reminder Me
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid #eee9df;color:#7d756a;font-size:12px;line-height:1.6;">
                ${footer || 'Email ini dikirim otomatis oleh Reminder Me.'}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href, label) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#1f6b5c;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>`;
}

export function verificationEmail({ name, token }) {
  const link = `${config.appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Verifikasi email akun Reminder Me',
    html: layout({
      title: `Halo ${name}, verifikasi email Anda`,
      body: `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#4b453d;">Satu langkah lagi untuk mengaktifkan akun Reminder Me. Klik tombol di bawah ini. Tautan berlaku selama 24 jam.</p>
        <p style="margin:0 0 22px;">${button(link, 'Verifikasi email')}</p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#7d756a;">Atau salin tautan berikut ke browser:<br><span style="word-break:break-all;color:#4b453d;">${escapeHtml(link)}</span></p>`,
    }),
    text: `Halo ${name}, verifikasi email Reminder Me Anda: ${link}`,
  };
}

export function resetPasswordEmail({ name, token }) {
  const link = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Atur ulang password Reminder Me',
    html: layout({
      title: 'Atur ulang password',
      body: `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#4b453d;">Halo ${escapeHtml(name)}, kami menerima permintaan untuk mengatur ulang password akun Anda. Tautan ini berlaku selama 1 jam.</p>
        <p style="margin:0 0 22px;">${button(link, 'Atur ulang password')}</p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#7d756a;">Jika Anda tidak meminta perubahan ini, abaikan email ini. Password lama Anda tetap berlaku.</p>`,
    }),
    text: `Halo ${name}, atur ulang password Reminder Me Anda di: ${link}`,
  };
}

export function passwordChangedEmail({ name }) {
  return {
    subject: 'Password Reminder Me Anda telah diubah',
    html: layout({
      title: 'Password berhasil diubah',
      body: `<p style="margin:0;font-size:15px;line-height:1.7;color:#4b453d;">Halo ${escapeHtml(name)}, password akun Reminder Me Anda baru saja diubah. Semua sesi lain telah dicabut untuk keamanan.</p>`,
    }),
    text: `Halo ${name}, password akun Reminder Me Anda baru saja diubah.`,
  };
}

export function reminderEmail({ name, itemTitle, dueAt, timezone, itemId }) {
  const link = `${config.appUrl}/app/items/${itemId}`;
  return {
    subject: `Pengingat: ${itemTitle}`,
    html: layout({
      title: itemTitle,
      body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#4b453d;">Halo ${escapeHtml(name)}, ini pengingat untuk informasi yang Anda simpan.</p>
        <p style="margin:0 0 20px;font-size:14px;color:#7d756a;">Jadwal: ${escapeHtml(formatDateTime(dueAt, timezone))} (${escapeHtml(timezone)})</p>
        <p style="margin:0 0 22px;">${button(link, 'Lihat detail')}</p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#7d756a;">Buka aplikasi untuk menandai selesai atau menunda pengingat.</p>`,
    }),
    text: `Halo ${name}, pengingat: ${itemTitle}. Jadwal ${formatDateTime(dueAt, timezone)} (${timezone}). Detail: ${link}`,
  };
}

export function trashWarningEmail({ name, itemTitle, purgeAt, timezone, itemId }) {
  const link = `${config.appUrl}/app/trash`;
  return {
    subject: `Item akan dihapus permanen: ${itemTitle}`,
    html: layout({
      title: 'Item akan segera dihapus permanen',
      body: `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#4b453d;">Halo ${escapeHtml(name)}, item berikut masih berada di Trash dan akan dihapus permanen pada <strong>${escapeHtml(formatDateTime(purgeAt, timezone))}</strong>.</p>
        <p style="margin:0 0 22px;padding:12px 14px;background:#f7f3ea;border-radius:9px;font-size:14px;color:#4b453d;">${escapeHtml(itemTitle)}</p>
        <p style="margin:0 0 22px;">${button(link, 'Buka Trash')}</p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#7d756a;">Pulihkan item sebelum tanggal tersebut jika masih dibutuhkan.</p>`,
    }),
    text: `Halo ${name}, item "${itemTitle}" akan dihapus permanen pada ${formatDateTime(purgeAt, timezone)}. Buka ${link} untuk memulihkannya.`,
  };
}
