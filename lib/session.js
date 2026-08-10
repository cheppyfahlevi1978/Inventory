const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'haims_session';
const SECRET = process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me';

function signSession(email) {
  return jwt.sign({ email: String(email).toLowerCase() }, SECRET, { expiresIn: '30d' });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

/** Returns the logged-in Google email for this request, or '' if none/invalid. */
function currentEmailFromReq(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return '';
  try {
    const payload = jwt.verify(token, SECRET);
    return String(payload.email || '').toLowerCase();
  } catch (err) {
    return '';
  }
}

function setSessionCookie(res, email) {
  const token = signSession(email);
  const maxAge = 30 * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

module.exports = { COOKIE_NAME, currentEmailFromReq, setSessionCookie, clearSessionCookie, parseCookies };
