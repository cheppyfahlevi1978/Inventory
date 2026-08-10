/**
 * Best-effort email notifications. GAS used MailApp/GmailApp (free, tied to the
 * script owner's Gmail). Vercel has no equivalent, so this uses the Resend API
 * if RESEND_API_KEY + MAIL_FROM are set; otherwise it just logs and no-ops so
 * the app keeps working without email configured.
 */
async function sendMail(to, subject, body) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from || !to) {
    console.log('[mailer] skip (not configured):', subject, '->', to);
    return;
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text: body }),
    });
  } catch (err) {
    console.error('[mailer] send failed:', err.message);
  }
}

module.exports = { sendMail };
