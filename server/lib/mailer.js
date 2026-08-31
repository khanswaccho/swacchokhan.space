/**
 * Contact-form delivery.
 *
 * If SMTP credentials are configured the message is emailed. If they are not,
 * the site still works: messages are appended to data/messages.log.jsonl so
 * nothing is ever silently dropped in development or on a fresh deploy.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import { escapeHtml, sanitizeHeaderValue } from './validate.js';

const INBOX_FILE = resolve(process.cwd(), 'data', 'messages.log.jsonl');

/** The site's own hostname, so the emails it sends name the right domain. */
const siteLabel = () =>
  (process.env.SITE_ORIGIN || 'swacchokhan.space')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

let transporter = null;
let transportReady = false;

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  if (transporter || !smtpConfigured()) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '') === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { minVersion: 'TLSv1.2' },
  });
  transportReady = true;
  return transporter;
}

function buildHtml({ name, email, subject, message }, meta) {
  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email),
    subject: escapeHtml(subject),
    message: escapeHtml(message).replace(/\n/g, '<br>'),
  };
  return `<!doctype html>
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${siteLabel()} — contact form</p>
  <h2 style="margin:0 0 20px;font-size:20px">${safe.subject}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
    <tr><td style="padding:6px 0;color:#6b7280;width:96px">From</td><td style="padding:6px 0"><strong>${safe.name}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0"><a href="mailto:${safe.email}">${safe.email}</a></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Received</td><td style="padding:6px 0">${escapeHtml(meta.receivedAt)}</td></tr>
  </table>
  <div style="border-left:3px solid #7c3aed;padding:4px 0 4px 16px;font-size:15px;line-height:1.7;white-space:pre-wrap">${safe.message}</div>
</div>`;
}

function buildText({ name, email, subject, message }, meta) {
  return [
    `${siteLabel()} — contact form`,
    '',
    `Subject:  ${subject}`,
    `From:     ${name} <${email}>`,
    `Received: ${meta.receivedAt}`,
    '',
    '---',
    message,
  ].join('\n');
}

async function recordLocally(payload, meta, note) {
  try {
    await mkdir(dirname(INBOX_FILE), { recursive: true });
    await appendFile(INBOX_FILE, JSON.stringify({ ...payload, ...meta, note }) + '\n', 'utf8');
  } catch (err) {
    console.error('[mailer] failed to persist message locally:', err.message);
  }
}

/**
 * @returns {Promise<{ delivered: boolean, mode: 'smtp'|'local' }>}
 */
export async function sendContactMessage(payload, meta = {}) {
  const enriched = { receivedAt: new Date().toISOString(), ...meta };
  const to = process.env.CONTACT_TO || 'khanswaccho@gmail.com';

  if (!smtpConfigured()) {
    await recordLocally(payload, enriched, 'SMTP not configured — stored locally');
    console.warn(
      `[mailer] SMTP is not configured. Message from ${payload.email} was written to ${INBOX_FILE}`
    );
    return { delivered: true, mode: 'local' };
  }

  const transport = getTransport();
  try {
    await transport.sendMail({
      from: {
        name: sanitizeHeaderValue(`${payload.name} via ${siteLabel()}`),
        address: process.env.SMTP_FROM || process.env.SMTP_USER,
      },
      to,
      replyTo: { name: sanitizeHeaderValue(payload.name), address: payload.email },
      subject: sanitizeHeaderValue(`[Portfolio] ${payload.subject}`),
      text: buildText(payload, enriched),
      html: buildHtml(payload, enriched),
    });
    return { delivered: true, mode: 'smtp' };
  } catch (err) {
    console.error('[mailer] SMTP send failed:', err.message);
    await recordLocally(payload, enriched, `SMTP failed: ${err.message}`);
    throw new Error('delivery_failed');
  }
}

export const mailerStatus = () => ({ smtp: smtpConfigured(), ready: transportReady });
