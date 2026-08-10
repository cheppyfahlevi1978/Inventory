const db = require('../sheetsDb');
const drive = require('../drive');
const mailer = require('../mailer');
const auth = require('./auth');
const { CONFIG, SH, HEAD, SEED_SETTINGS, ROLE_FULL, asetSheet, mplSheet, now } = require('../schema');

async function getBootstrap(ctx) {
  const u = await auth.requireUser(ctx);
  return {
    user: auth.publicUser(u),
    hotels: await getHotels(ctx),
    departments: await getDepartments(ctx),
    settings: await getSettings(ctx),
  };
}

async function getHotels() {
  await auth.ensureSetup();
  const list = await db.objs(SH.HOTELS);
  return list
    .filter((h) => String(h.Kode).trim())
    .map((h) => ({
      kode: String(h.Kode).trim(),
      nama: String(h.Nama || '').trim(),
      alamat: String(h.Alamat || ''),
      fotoURL: String(h.FotoURL || ''),
      status: String(h.Status || 'Aktif'),
    }));
}

async function getDepartments() {
  await auth.ensureSetup();
  const list = await db.objs(SH.DEPTS);
  return list
    .filter((d) => String(d.Kode).trim())
    .map((d) => ({
      kode: String(d.Kode).trim().toUpperCase(),
      nama: String(d.Nama || '').trim(),
      unit: String(d.Unit || 'ALL'),
      kepala: String(d.Kepala || ''),
      status: String(d.Status || 'Aktif'),
    }));
}

async function getSettings() {
  await auth.ensureSetup();
  const list = await db.objs(SH.SETTINGS);
  const out = {};
  for (const [k, v] of SEED_SETTINGS) out[k] = v;
  for (const row of list) {
    if (String(row.Kunci).trim()) out[String(row.Kunci).trim()] = String(row.Nilai === undefined ? '' : row.Nilai);
  }
  return out;
}

/** Upsert one or more Kunci/Nilai pairs into Settings (shared by saveSettings/saveBranding). */
async function settingsUpsert(patch) {
  await db.ensureSheet(SH.SETTINGS, HEAD.Settings);
  const existing = await db.objs(SH.SETTINGS);
  for (const key of Object.keys(patch)) {
    const found = existing.find((r) => String(r.Kunci).trim() === key);
    if (found) {
      await db.updateRow(SH.SETTINGS, found.__row, { Nilai: patch[key] });
    } else {
      await db.appendObj(SH.SETTINGS, HEAD.Settings, { Kunci: key, Nilai: patch[key] });
    }
  }
}

async function saveSettings(ctx, payload) {
  await auth.requireRole(ctx, ROLE_FULL);
  const p = payload || {};
  await settingsUpsert(p);
  await auth.logAct(ctx, 'Pengaturan', 'Menyimpan pengaturan', Object.keys(p).join(', '));
  return getSettings();
}

async function saveBranding(ctx, payload) {
  await auth.requireRole(ctx, ROLE_FULL);
  const p = payload || {};
  const patch = {
    appTitle: String(p.appTitle || '').trim() || 'HAIMS',
    loginHeroTitle: String(p.loginHeroTitle || ''),
    loginHeroSub: String(p.loginHeroSub || ''),
  };
  if (p.fotoBase64) {
    patch.logoURL = await drive.savePhoto(p.fotoBase64, `logo_${Date.now()}.png`, `${CONFIG.DRIVE_ROOT}_Branding`);
  } else if (p.removeLogo === true) {
    patch.logoURL = '';
  }
  await settingsUpsert(patch);
  await auth.logAct(ctx, 'Pengaturan', 'Ubah identitas aplikasi', `judul=${patch.appTitle}${patch.logoURL !== undefined ? ' · logo diperbarui' : ''}`);
  return getSettings();
}

async function saveHotel(ctx, payload) {
  await auth.requireRole(ctx, ROLE_FULL);
  const p = payload || {};
  const kode = String(p.kode || '').trim().toUpperCase();
  const nama = String(p.nama || '').trim();
  if (!kode) throw new Error('Kode unit wajib diisi (contoh: APK).');
  if (!nama) throw new Error('Nama unit hotel wajib diisi.');

  let foto = String(p.fotoURL || '');
  if (p.fotoBase64) foto = await drive.savePhoto(p.fotoBase64, `unit_${kode}.jpg`, `${CONFIG.DRIVE_ROOT}_Hotels`);

  const list = await db.objs(SH.HOTELS);
  const existing = list.find((h) => String(h.Kode).trim().toUpperCase() === kode);

  if (existing) {
    await db.updateByKey(SH.HOTELS, 'Kode', kode, {
      Nama: nama, Alamat: String(p.alamat || ''), FotoURL: foto, Status: String(p.status || 'Aktif'),
    });
    await auth.logAct(ctx, 'Pengaturan', 'Ubah unit hotel', `${kode} — ${nama}`);
  } else {
    await db.appendObj(SH.HOTELS, HEAD.Hotels, {
      Kode: kode, Nama: nama, Alamat: String(p.alamat || ''), FotoURL: foto, Status: String(p.status || 'Aktif'),
    });
    await auth.logAct(ctx, 'Pengaturan', 'Tambah unit hotel', `${kode} — ${nama}`);
  }
  return getHotels();
}

async function deleteHotel(ctx, kode) {
  await auth.requireRole(ctx, ['Admin']);
  const k = String(kode || '').trim().toUpperCase();
  if (!k) throw new Error('Kode unit tidak valid.');
  await db.updateByKey(SH.HOTELS, 'Kode', k, { Status: 'Nonaktif' });
  await auth.logAct(ctx, 'Pengaturan', 'Nonaktifkan unit hotel', k);
  return getHotels();
}

async function saveDepartment(ctx, payload) {
  await auth.requireRole(ctx, ROLE_FULL);
  const p = payload || {};
  const kode = String(p.kode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nama = String(p.nama || '').trim();
  if (!kode) throw new Error('Kode departemen wajib diisi (huruf/angka, contoh: ENG).');
  if (!nama) throw new Error('Nama departemen wajib diisi.');

  const list = await db.objs(SH.DEPTS);
  const existing = list.find((d) => String(d.Kode).trim().toUpperCase() === kode);

  if (existing) {
    await db.updateByKey(SH.DEPTS, 'Kode', kode, {
      Nama: nama, Unit: String(p.unit || 'ALL'), Kepala: String(p.kepala || ''), Status: String(p.status || 'Aktif'),
    });
    await auth.logAct(ctx, 'Pengaturan', 'Ubah sub-departemen', `${kode} — ${nama}`);
  } else {
    await db.appendObj(SH.DEPTS, HEAD.Departments, {
      Kode: kode, Nama: nama, Unit: String(p.unit || 'ALL'), Kepala: String(p.kepala || ''), Status: 'Aktif',
    });
    await auth.logAct(ctx, 'Pengaturan', 'Tambah sub-departemen', `${kode} — ${nama}`);
  }
  await db.ensureSheet(asetSheet(kode), HEAD.Aset);
  await db.ensureSheet(mplSheet(kode), HEAD.Mpl);
  return getDepartments();
}

async function deleteDepartment(ctx, kode) {
  await auth.requireRole(ctx, ['Admin']);
  const k = String(kode || '').trim().toUpperCase();
  if (!k) throw new Error('Kode departemen tidak valid.');
  await db.updateByKey(SH.DEPTS, 'Kode', k, { Status: 'Nonaktif' });
  await auth.logAct(ctx, 'Pengaturan', 'Nonaktifkan sub-departemen', `${k} (sheet aset tetap tersimpan)`);
  return getDepartments();
}

async function getUsers(ctx) {
  await auth.requireRole(ctx, ROLE_FULL);
  const list = await db.objs(SH.USERS);
  return list.map((u) => ({
    email: String(u.Email || ''),
    nama: String(u.Nama || ''),
    role: String(u.Role || 'User'),
    unit: String(u.Unit || ''),
    departemen: String(u.Departemen || ''),
    fotoURL: String(u.FotoURL || ''),
    status: String(u.Status || ''),
    dibuat: String(u.Dibuat || ''),
    punyaSandi: String(u.PasswordHash || '').trim() !== '',
  }));
}

async function saveUser(ctx, payload) {
  const me = await auth.requireRole(ctx, ROLE_FULL);
  const p = payload || {};
  const email = String(p.email || '').toLowerCase().trim();
  const nama = String(p.nama || '').trim();
  if (!email || email.indexOf('@') < 0) throw new Error('Email pengguna tidak valid.');
  if (!nama) throw new Error('Nama pengguna wajib diisi.');

  let role = String(p.role || 'User');
  if (['Admin', 'Manager', 'User'].indexOf(role) < 0) role = 'User';
  if (role === 'Admin' && String(me.Role) !== 'Admin') throw new Error('Hanya Admin yang boleh menetapkan role Admin.');

  const existingForRole = await auth.findUser(email);
  if (existingForRole && role !== String(existingForRole.Role) && String(me.Role) !== 'Admin') {
    throw new Error('Hanya Admin yang boleh mengubah role pengguna.');
  }

  let foto = String(p.fotoURL || '');
  if (p.fotoBase64) foto = await drive.savePhoto(p.fotoBase64, `user_${email.split('@')[0]}.jpg`, `${CONFIG.DRIVE_ROOT}_Users`);

  const existing = await auth.findUser(email);
  if (existing) {
    const patch = {
      Nama: nama,
      Role: role,
      Unit: String(p.unit || existing.Unit || ''),
      Departemen: String(p.departemen || existing.Departemen || ''),
      Status: String(p.status || existing.Status || 'Aktif'),
      DiubahOleh: String(me.Email),
    };
    if (foto) patch.FotoURL = foto;
    if (p.password) patch.PasswordHash = auth.hash(email, p.password);
    if (p.resetSandi === true) patch.PasswordHash = '';
    await db.updateByKey(SH.USERS, 'Email', email, patch);
    await auth.logAct(ctx, 'Add User', 'Ubah pengguna', `${email} → role ${role}, status ${patch.Status}`);
  } else {
    await db.appendObj(SH.USERS, HEAD.Users, {
      Email: email,
      Nama: nama,
      Role: role,
      Unit: String(p.unit || ''),
      Departemen: String(p.departemen || ''),
      FotoURL: foto,
      PasswordHash: p.password ? auth.hash(email, p.password) : '',
      Status: String(p.status || 'Aktif'),
      Dibuat: now(),
      DiubahOleh: String(me.Email),
    });
    await auth.logAct(ctx, 'Add User', 'Tambah pengguna', `${email} → role ${role}`);
    await mailer.sendMail(
      email,
      'Akses HAIMS Anda sudah dibuat',
      `Halo ${nama},\n\nAkun HAIMS Anda sudah dibuat dengan role ${role}.\n` +
        `Masuk memakai akun Google ${email} pada URL HAIMS.\n\n— HAIMS`
    );
  }
  return getUsers(ctx);
}

async function setUserStatus(ctx, email, status) {
  const me = await auth.requireRole(ctx, ROLE_FULL);
  const e = String(email || '').toLowerCase().trim();
  const s = String(status || '').trim();
  if (['Aktif', 'Menunggu', 'Nonaktif'].indexOf(s) < 0) throw new Error('Status tidak valid.');
  if (e === String(me.Email).toLowerCase() && s !== 'Aktif') throw new Error('Anda tidak dapat menonaktifkan akun sendiri.');
  await db.updateByKey(SH.USERS, 'Email', e, { Status: s, DiubahOleh: String(me.Email) });
  await auth.logAct(ctx, 'Add User', 'Ubah status pengguna', `${e} → ${s}`);
  if (s === 'Aktif') {
    await mailer.sendMail(e, 'Akses HAIMS diaktifkan', 'Akun HAIMS Anda sudah diaktifkan. Silakan masuk lewat URL HAIMS.\n\n— HAIMS');
  }
  return getUsers(ctx);
}

async function deleteUser(ctx, email) {
  const me = await auth.requireRole(ctx, ['Admin']);
  const e = String(email || '').toLowerCase().trim();
  if (e === String(me.Email).toLowerCase()) throw new Error('Anda tidak dapat menghapus akun sendiri.');
  await db.updateByKey(SH.USERS, 'Email', e, { Status: 'Nonaktif', DiubahOleh: String(me.Email) });
  await auth.logAct(ctx, 'Add User', 'Nonaktifkan pengguna', e);
  return getUsers(ctx);
}

module.exports = {
  getBootstrap, getHotels, getDepartments, getSettings, settingsUpsert, saveSettings, saveBranding,
  saveHotel, deleteHotel, saveDepartment, deleteDepartment,
  getUsers, saveUser, setUserStatus, deleteUser,
};
