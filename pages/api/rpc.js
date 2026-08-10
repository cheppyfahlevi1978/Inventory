const { REGISTRY } = require('../../lib/api/registry');
const { currentEmailFromReq } = require('../../lib/session');

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
};

/**
 * Single JSON-RPC-style endpoint that stands in for google.script.run:
 * POST { fn: 'getAssets', args: ['ENG', {}] } -> { ok: true, result }
 * This is intentionally close to a 1:1 mapping of the old Apps Script
 * function names so the frontend's srun() bridge barely has to change.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { fn, args } = req.body || {};
  const impl = typeof fn === 'string' ? REGISTRY[fn] : null;
  if (!impl) {
    res.status(404).json({ ok: false, error: `Fungsi tidak dikenal: ${fn}` });
    return;
  }

  const ctx = { email: currentEmailFromReq(req) };
  try {
    const result = await impl(ctx, ...(Array.isArray(args) ? args : []));
    res.status(200).json({ ok: true, result });
  } catch (err) {
    res.status(200).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}
