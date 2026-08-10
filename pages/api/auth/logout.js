const { clearSessionCookie } = require('../../../lib/session');

export default function handler(req, res) {
  clearSessionCookie(res);
  if (req.method === 'GET') {
    res.redirect(302, '/');
    return;
  }
  res.status(200).json({ ok: true });
}
