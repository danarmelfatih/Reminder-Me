import { Resend } from 'resend';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

let resendClient = null;

function getResend() {
  if (!resendClient) {
    if (!config.resendApiKey) {
      throw new Error('RESEND_API_KEY belum diatur');
    }
    resendClient = new Resend(config.resendApiKey);
  }
  return resendClient;
}

export async function sendMail({ to, subject, html, text }) {
  if (config.mailDriver === 'console') {
    logger.info({ to, subject, text }, 'Email (console driver)');
    return { id: 'console', driver: 'console' };
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: config.mailFrom,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message || 'Gagal mengirim email');
  }
  return { id: data?.id ?? null, driver: 'resend' };
}

export async function sendTemplate(to, template) {
  return sendMail({ to, subject: template.subject, html: template.html, text: template.text });
}
