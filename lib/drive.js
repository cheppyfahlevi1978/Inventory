const { driveClient } = require('./googleAuth');

const DRIVE_ROOT_NAME = 'HAIMS_Uploads';
const MAX_UPLOAD_BYTES = 1600 * 1024;

/**
 * Root Drive folder. Prefer HAIMS_DRIVE_ROOT_FOLDER_ID (a folder shared with
 * the service account as Editor) — service accounts have no personal Drive
 * quota of their own, so a folder must be pre-created and shared, or live on
 * a Shared Drive. Falls back to searching/creating by name for Shared Drives.
 */
async function rootFolderId() {
  const configured = process.env.HAIMS_DRIVE_ROOT_FOLDER_ID;
  if (configured) return configured;
  const drive = driveClient();
  const found = await drive.files.list({
    q: `name = '${DRIVE_ROOT_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  if (found.data.files && found.data.files.length) return found.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name: DRIVE_ROOT_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.data.id;
}

async function subFolderId(name) {
  const root = await rootFolderId();
  const target = String(name || DRIVE_ROOT_NAME);
  if (target === DRIVE_ROOT_NAME) return root;
  const drive = driveClient();
  const found = await drive.files.list({
    q: `name = '${target.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${root}' in parents and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  if (found.data.files && found.data.files.length) return found.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name: target, mimeType: 'application/vnd.google-apps.folder', parents: [root] },
    fields: 'id',
  });
  return created.data.id;
}

/** Mirrors GAS savePhoto_(base64Data, filename, folderName). */
async function savePhoto(base64Data, filename, folderName) {
  if (!base64Data) return '';
  const str = String(base64Data);
  let mime = 'image/jpeg';
  const m = str.match(/^data:([^;]+);base64,/);
  if (m) mime = m[1];
  const data = str.indexOf(',') > -1 ? str.substring(str.indexOf(',') + 1) : str;
  if (!data) return '';

  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Ukuran foto masih terlalu besar (maksimal ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB setelah dikompres).`
    );
  }

  const { Readable } = require('stream');
  const drive = driveClient();
  const parent = await subFolderId(folderName);
  const created = await drive.files.create({
    requestBody: { name: filename || `foto_${Date.now()}.jpg`, parents: [parent] },
    media: { mimeType: mime, body: Readable.from(buffer) },
    fields: 'id',
  });
  const fileId = created.data.id;

  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  } catch (err) {
    return `https://drive.google.com/uc?id=${fileId}`;
  }
}

module.exports = { savePhoto };
