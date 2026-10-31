const nodemailer = require('nodemailer');
const logoBase64 = require('./logo-data');

const SUBJECT = "You're on the waitlist! 🎉";
const BRAND_NAME = 'Z1P.Pro';
const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL'];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

function buildMessage({ name, siteUrl }) {
  const first = firstName(name);
  const greeting = first ? `Hi ${first}` : 'Hi there';
  const safeGreeting = escapeHtml(greeting);
  const safeUrl = escapeHtml(siteUrl);

  const text = [
    `${greeting},`,
    '',
    `Thank you for joining the ${BRAND_NAME} waitlist. You're officially on the list!`,
    "We'll email you as soon as we launch.",
    '',
    `Visit us: ${siteUrl}`,
    '',
    `— The ${BRAND_NAME} team`
  ].join('\n');

  // Table layout + inline styles for email-client compatibility. Colors match the site (--pink, --ink, --muted).
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#fff0f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">You're on the ${BRAND_NAME} waitlist. We'll email you when we launch.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff0f7;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
      <tr><td align="center" style="background:#ff159b;padding:28px 24px;">
        <a href="${safeUrl}" style="text-decoration:none;"><img src="cid:z1p-logo" width="132" height="73" alt="${BRAND_NAME}" style="display:block;border:0;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;color:#ffffff;"></a>
      </td></tr>
      <tr><td style="padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:#202027;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#202027;">${safeGreeting},</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Thank you for joining the ${BRAND_NAME} waitlist. You're officially on the list! 🎉</p>
        <p style="margin:0 0 28px;font-size:16px;line-height:1.6;">We'll email you as soon as we launch.</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ff159b;border-radius:999px;">
          <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">Visit ${BRAND_NAME}</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:20px 28px;border-top:1px solid #dfe0e8;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#777784;">
        You're receiving this because you signed up for the ${BRAND_NAME} waitlist.<br>
        <a href="${safeUrl}" style="color:#ff159b;text-decoration:none;">${safeUrl}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { text, html };
}

function isSmtpConfigured(env = process.env) {
  return REQUIRED_ENV.every((key) => Boolean(env[key]));
}

// Throws on failure; the caller decides how to handle it.
async function sendWaitlistEmail({ to, name, siteUrl }) {
  if (!isSmtpConfigured()) {
    throw new Error(`SMTP is not configured. Missing: ${REQUIRED_ENV.filter((k) => !process.env[k]).join(', ')}`);
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) throw new Error('SMTP_PORT must be a valid port number.');

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; otherwise (587) require STARTTLS
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000
  });

  const { text, html } = buildMessage({ name, siteUrl });
  const fromName = (process.env.SMTP_FROM_NAME || BRAND_NAME).replace(/[\r\n"]/g, '');
  await transport.sendMail({
    from: { name: fromName, address: process.env.SMTP_FROM_EMAIL },
    to,
    subject: SUBJECT,
    text,
    html,
    // Inline attachment: Gmail shows it without fetching anything (and it can't render SVG).
    attachments: [{
      filename: 'z1p-logo.png',
      content: Buffer.from(logoBase64, 'base64'),
      contentType: 'image/png',
      cid: 'z1p-logo',
      contentDisposition: 'inline'
    }]
  });
}

module.exports = { sendWaitlistEmail, buildMessage, isSmtpConfigured, SUBJECT };
