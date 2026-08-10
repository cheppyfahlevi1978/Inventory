const { google } = require('googleapis');

/**
 * Service-account client used for all Sheets/Drive access (the "database"
 * connection"). This replaces SpreadsheetApp/DriveApp running as the GAS
 * project owner — the sheet and Drive upload folder must be shared with
 * this service account's email as Editor.
 */
function serviceAccountAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY belum diset.');
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

let _sheets = null;
function sheetsClient() {
  if (!_sheets) _sheets = google.sheets({ version: 'v4', auth: serviceAccountAuth() });
  return _sheets;
}

let _drive = null;
function driveClient() {
  if (!_drive) _drive = google.drive({ version: 'v3', auth: serviceAccountAuth() });
  return _drive;
}

/**
 * OAuth2 client used only for the "Lanjut dengan akun Google" login button —
 * it identifies who the visitor is (their Google email), it never touches
 * the spreadsheet itself.
 */
function oauth2Client(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri
  );
}

module.exports = { serviceAccountAuth, sheetsClient, driveClient, oauth2Client };
