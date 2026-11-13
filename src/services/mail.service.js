import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

let resendClient = null;
let smtpTransport = null;

function getResend() {
  if (!resendClient) {
    if (!config.resendApiKey) {
      throw new Error('RESEND_API_KEY belum diatur');
    }
    resendClient = new Resend(config.resendApiKey);
  }
  return resendClient;
}

function getSmtpTransport() {
  if (!smtpTransport) {
    if (!config.smtpHost) {
      throw new Error('SMTP_HOST belum diatur');
    }
    smtpTransport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    });
  }
  return smtpTransport;
}

export async function sendMail({ to, subject, html, text }) {
  if (config.mailDriver === 'console') {
    logger.info({ to, subject, text }, 'Email (console driver)');
    return { id: 'console', driver: 'console' };
  }

  if (config.mailDriver === 'smtp') {
    const info = await getSmtpTransport().sendMail({
      from: config.smtpFrom,
      to,
      subject,
      html,
      text,
    });
    return { id: info.messageId ?? null, driver: 'smtp' };
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
