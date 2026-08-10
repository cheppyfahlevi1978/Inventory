const { oauth2Client } = require('../../../../lib/googleAuth');
const { setSessionCookie } = require('../../../../lib/session');

function redirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

export default async function handler(req, res) {
  const { code, error } = req.query;
  if (error || !code) {
    res.redirect(302, '/?authError=' + encodeURIComponent(error || 'batal'));
    return;
  }
  try {
    const client = oauth2Client(redirectUri(req));
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = String(payload.email || '').toLowerCase();
    if (!email || payload.email_verified === false) {
      res.redirect(302, '/?authError=' + encodeURIComponent('Email Google tidak terverifikasi.'));
      return;
    }
    setSessionCookie(res, email);
    res.redirect(302, '/');
  } catch (err) {
    res.redirect(302, '/?authError=' + encodeURIComponent(err.message || 'Gagal login dengan Google.'));
  }
}
