const REQUIRED_VARS = [
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'SPREADSHEET_ID',
  'HAIMS_DRIVE_ROOT_FOLDER_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'SESSION_SECRET',
];

/**
 * Safe env-var diagnostic: never returns secret values, only whether each
 * one is set and a redacted preview, so a real deployment failure caused by
 * missing/misnamed Vercel env vars can be confirmed from the browser instead
 * of guessed at from dashboard screenshots. Temporary — remove once the
 * deployment is confirmed healthy.
 */
export default function handler(req, res) {
  const report = {};
  for (const name of REQUIRED_VARS) {
    const raw = process.env[name];
    const value = raw === undefined ? '' : String(raw);
    report[name] = {
      set: value.trim() !== '',
      length: value.length,
      looksLikePemKey: name === 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY' ? value.includes('BEGIN PRIVATE KEY') : undefined,
      preview: value ? `${value.slice(0, 4)}…${value.slice(-4)}` : '',
    };
  }
  report._vercelEnv = process.env.VERCEL_ENV || null;
  report._vercelUrl = process.env.VERCEL_URL || null;
  res.status(200).json(report);
}
