const axios = require('axios');

// Outgoing email. Two backends:
//
//   1. Resend (production) — set RESEND_API_KEY and EMAIL_FROM.
//      EMAIL_FROM must be on a domain you've verified at resend.com.
//   2. Console (dev) — if no key is set AND NODE_ENV !== 'production', the
//      message is logged to stdout. Lets you iterate without signing up for
//      anything. Hard-fails in production so we don't silently drop real codes.
//
// Keep this surface tiny on purpose. Adding new template types belongs here,
// not in the controllers that call it.

const RESEND_URL = 'https://api.resend.com/emails';

async function sendVerificationEmail({ to, code, ttlMinutes }) {
  const subject = `Your FootyGuru code: ${code}`;
  const text =
    `Your FootyGuru sign-in code is ${code}.\n\n` +
    `It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.`;
  const html =
    `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">` +
    `<h2 style="color: #D32F2F; margin-bottom: 8px;">Your FootyGuru code</h2>` +
    `<p style="color: #5F6368; margin-top: 0;">Enter this 6-digit code in the app:</p>` +
    `<div style="font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #212121; padding: 16px 0;">${code}</div>` +
    `<p style="color: #9AA0A6; font-size: 14px;">Expires in ${ttlMinutes} minutes. If you didn't request this, ignore this email.</p>` +
    `</div>`;

  return send({ to, subject, text, html });
}

async function send({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (apiKey && from) {
    try {
      await axios.post(
        RESEND_URL,
        { from, to, subject, text, html },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      return { provider: 'resend' };
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.message;
      throw new Error(`Resend send failed (${status ?? 'no-status'}): ${detail}`);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Email provider not configured. Set RESEND_API_KEY and EMAIL_FROM in production.',
    );
  }

  // Dev fallback. Print the message in a box so it's easy to spot in stdout.
  const lines = [
    '',
    '┌─── DEV EMAIL ' + '─'.repeat(46),
    `│ To:      ${to}`,
    `│ Subject: ${subject}`,
    '│',
    ...text.split('\n').map((l) => `│ ${l}`),
    '└' + '─'.repeat(60),
    '',
  ];
  console.log(lines.join('\n'));
  return { provider: 'console' };
}

module.exports = { sendVerificationEmail };
