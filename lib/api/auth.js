const crypto = require('crypto');
const db = require('../sheetsDb');
const drive = require('../drive');
const mailer = require('../mailer');
const { CONFIG, SH, HEAD, SEED_HOTELS, SEED_DEPTS, SEED_SETTINGS, ROLE_FULL, asetSheet, mplSheet, now } = require('../schema');

let setupDone = false;

/** Mirrors GAS ensureSetup_() — creates sheets/headers/seed data once. */
async function ensureSetup() {
  if (setupDone) return;
  await db.ensureSheet(SH.USERS, HEAD.Users);
  await db.ensureSheet(SH.HOTELS, HEAD.Hotels);
  await db.ensureSheet(SH.DEPTS, HEAD.Departments);
  await db.ensureSheet(SH.SETTINGS, HEAD.Settings);
  await db.ensureSheet(SH.LOG, HEAD.ActivitiesLog);
  await db.ensureSheet(SH.OTP, HEAD.OTP_Log);
  await db.ensureSheet(SH.MUTASI, HEAD.Mutasi);
  await db.ensureSheet(SH.OPNAME, HEAD.Opname);
  await db.ensureSheet(SH.OPNAME_DETAIL, HEAD.OpnameDetail);
  await db.ensureSheet(SH.MAINT, HEAD.Maintenance);
  await db.ensureSheet(SH.DEPR, HEAD.Depresiasi);
  await db.ensureSheet(SH.WRITEOFF, HEAD.WriteOff);

  if ((await db.objs(SH.HOTELS)).length === 0) await db.writeBlock(SH.HOTELS, 2, SEED_HOTELS);
  if ((await db.objs(SH.DEPTS)).length === 0) await db.writeBlock(SH.DEPTS, 2, SEED_DEPTS);
  if ((await db.objs(SH.SETTINGS)).length === 0) await db.writeBlock(SH.SETTINGS, 2, SEED_SETTINGS);

  const depts = await db.objs(SH.DEPTS);
  for (const d of depts) {
    if (String(d.Status) === 'Nonaktif') continue;
    await db.ensureSheet(asetSheet(d.Kode), HEAD.Aset);
    await db.ensureSheet(mplSheet(d.Kode), HEAD.Mpl);
  }
  setupDone = true;
}

async function findUser(email) {
  if (!email) return null;
  const list = await db.objs(SH.USERS);
  const e = String(email).toLowerCase().trim();
  return list.find((u) => String(u.Email).toLowerCase().trim() === e) || null;
}

function publicUser(u) {
  if (!u) return null;
  return {
    email: String(u.Email || ''),
    nama: String(u.Nama || ''),
    role: String(u.Role || 'User'),
    unit: String(u.Unit || ''),
    departemen: String(u.Departemen || ''),
    fotoURL: String(u.FotoURL || ''),
    status: String(u.Status || ''),
    full: ROLE_FULL.indexOf(String(u.Role)) > -1,
  };
}

async function requireUser(ctx) {
  const u = await findUser(ctx.email);
  if (!u) throw new Error('Sesi tidak dikenali. Silakan login ulang.');
  if (String(u.Status) !== 'Aktif') throw new Error('Akun Anda belum diaktifkan oleh Admin.');
  return u;
}

async function requireRole(ctx, roles) {
  const u = await requireUser(ctx);
  if (roles.indexOf(String(u.Role)) < 0) throw new Error(`Akses ditolak. Menu ini hanya untuk ${roles.join(' / ')}.`);
  return u;
}

function hash(email, pw) {
  return crypto.createHash('sha256').update(`${String(email).toLowerCase()}::haims::${String(pw)}`).digest('hex');
}

async function logAct(ctx, modul, aksi, detail) {
  try {
    const u = await findUser(ctx.email);
    await db.appendObj(SH.LOG, HEAD.ActivitiesLog, {
      Waktu: now(),
      Email: ctx.email,
      Role: u ? String(u.Role) : '-',
      Modul: modul,
      Aksi: aksi,
      Detail: detail || '',
    });
  } catch (err) {
    // logging never fails the main operation
  }
}

async function getSettingValue(key) {
  const list = await db.objs(SH.SETTINGS);
  const row = list.find((r) => String(r.Kunci) === key);
  return row ? row.Nilai : '';
}

async function notifyAdmins(subject, body) {
  try {
    const list = await db.objs(SH.USERS);
    let to = list
      .filter((u) => ROLE_FULL.indexOf(String(u.Role)) > -1 && String(u.Status) === 'Aktif')
      .map((u) => String(u.Email));
    const extra = await getSettingValue('emailNotifikasi');
    if (extra) to = to.concat(String(extra).split(/[;,\s]+/));
    const clean = [...new Set(to.map((e) => String(e).trim()).filter(Boolean))];
    if (!clean.length) return;
    await mailer.sendMail(clean, subject, body);
  } catch (err) {
    // notifications are best-effort
  }
}

/**
 * Status sesi:
 *   READY    — boleh masuk dashboard
 *   LOGIN    — akun punya kata sandi, minta email + sandi
 *   REGISTER — email Google belum terdaftar
 *   PENDING  — sudah registrasi, menunggu aktivasi Admin
 *   NOEMAIL  — belum login dengan Google sama sekali
 */
async function checkSession(ctx) {
  await ensureSetup();
  const email = ctx.email;
  if (!email) return { stage: 'NOEMAIL', googleEmail: '' };

  const users = await db.objs(SH.USERS);

  if (users.length === 0) {
    const hotels = await db.objs(SH.HOTELS);
    await db.appendObj(SH.USERS, HEAD.Users, {
      Email: email,
      Nama: email.split('@')[0],
      Role: 'Admin',
      Unit: hotels.length ? String(hotels[0].Kode) : 'APK',
      Departemen: 'AG',
      FotoURL: '',
      PasswordHash: '',
      Status: 'Aktif',
      Dibuat: now(),
      DiubahOleh: 'sistem',
    });
    await logAct(ctx, 'Autentikasi', 'Admin pertama dibuat otomatis', email);
    return { stage: 'READY', googleEmail: email, user: publicUser(await findUser(email)), bootstrapped: true };
  }

  const u = await findUser(email);
  if (!u) {
    const hotelList = await db.objs(SH.HOTELS);
    const deptList = await db.objs(SH.DEPTS);
    const defUnit = hotelList.length ? String(hotelList[0].Kode) : 'APK';
    const defDept = deptList.length ? String(deptList[0].Kode) : 'OTHERS';
    await db.appendObj(SH.USERS, HEAD.Users, {
      Email: email, Nama: email.split('@')[0], Role: 'User', Unit: defUnit, Departemen: defDept,
      FotoURL: '', PasswordHash: '', Status: 'Aktif', Dibuat: now(), DiubahOleh: 'auto-google',
    });
    await logAct(ctx, 'Autentikasi', 'User baru dibuat otomatis via Google', email);
    await notifyAdmins(
      'Pengguna baru bergabung ke HAIMS',
      `Akun baru otomatis aktif sebagai User melalui tombol "Lanjut dengan akun Google":\n\n` +
        `Email : ${email}\nUnit  : ${defUnit}\nDept  : ${defDept}\n\n` +
        `Ubah role, unit, atau departemennya lewat menu Add User bila perlu.`
    );
    return { stage: 'READY', googleEmail: email, user: publicUser(await findUser(email)), autoProvisioned: true };
  }
  if (String(u.Status) === 'Menunggu') return { stage: 'PENDING', googleEmail: email };
  if (String(u.Status) !== 'Aktif') return { stage: 'PENDING', googleEmail: email, nonaktif: true };
  if (String(u.PasswordHash || '').trim() !== '') return { stage: 'LOGIN', googleEmail: email };
  return { stage: 'READY', googleEmail: email, user: publicUser(u) };
}

async function loginWithPassword(ctx, email, password) {
  await ensureSetup();
  const sesi = ctx.email;
  const typed = String(email || '').toLowerCase().trim();
  if (!typed || !password) throw new Error('Email dan kata sandi wajib diisi.');
  if (!sesi) throw new Error('Sesi Google tidak terbaca. Silakan login dengan Google terlebih dahulu.');
  if (typed !== sesi) throw new Error(`Email yang diisi harus sama dengan akun Google yang aktif (${sesi}).`);

  const u = await findUser(typed);
  if (!u) throw new Error('Akun belum terdaftar. Silakan daftar dengan akun Google.');
  if (String(u.Status) !== 'Aktif') throw new Error('Akun Anda belum diaktifkan oleh Admin.');
  if (String(u.PasswordHash || '').trim() === '') return { stage: 'READY', user: publicUser(u) };
  if (hash(typed, password) !== String(u.PasswordHash).trim()) throw new Error('Kata sandi salah.');

  await logAct(ctx, 'Autentikasi', 'Login kata sandi', typed);
  return { stage: 'READY', user: publicUser(u) };
}

async function registerUser(ctx, payload) {
  await ensureSetup();
  const p = payload || {};
  const email = ctx.email;
  if (!email) throw new Error('Sesi Google tidak terbaca. Silakan login dengan Google terlebih dahulu.');
  if (await findUser(email)) throw new Error('Email ini sudah terdaftar.');

  const nama = String(p.nama || '').trim();
  const unit = String(p.unit || '').trim();
  const dept = String(p.departemen || '').trim();
  if (!nama) throw new Error('Nama lengkap wajib diisi.');
  if (!unit) throw new Error('Unit hotel wajib dipilih.');
  if (!dept) throw new Error('Departemen wajib dipilih.');

  let foto = '';
  if (p.fotoBase64) foto = await drive.savePhoto(p.fotoBase64, `user_${email.split('@')[0]}.jpg`, `${CONFIG.DRIVE_ROOT}_Users`);

  await db.appendObj(SH.USERS, HEAD.Users, {
    Email: email,
    Nama: nama,
    Role: 'User',
    Unit: unit,
    Departemen: dept,
    FotoURL: foto,
    PasswordHash: p.password ? hash(email, p.password) : '',
    Status: 'Menunggu',
    Dibuat: now(),
    DiubahOleh: email,
  });

  await logAct(ctx, 'Autentikasi', 'Registrasi pengguna baru', `${nama} (${email}) unit ${unit}`);
  await notifyAdmins(
    'Registrasi HAIMS menunggu aktivasi',
    `Pengguna baru mendaftar di HAIMS:\n\nNama: ${nama}\nEmail: ${email}\nUnit: ${unit}\n` +
      `Departemen: ${dept}\n\nAktifkan lewat menu Add User.`
  );

  return { stage: 'PENDING' };
}

async function requestOtp(ctx, email) {
  await ensureSetup();
  const target = String(email || '').toLowerCase().trim() || ctx.email;
  if (!target) throw new Error('Email wajib diisi.');
  const u = await findUser(target);
  if (!u) throw new Error('Email tidak terdaftar di HAIMS.');

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const exp = new Date(Date.now() + CONFIG.OTP_MINUTES * 60 * 1000);

  await db.appendObj(SH.OTP, HEAD.OTP_Log, {
    Email: target,
    Kode: code,
    Kedaluwarsa: exp.toISOString().slice(0, 19).replace('T', ' '),
    Dipakai: 'Belum',
  });

  await mailer.sendMail(
    target,
    `Kode akses HAIMS: ${code}`,
    `Halo ${String(u.Nama || '')},\n\n` +
      `Kode akses sekali pakai Anda: ${code}\n` +
      `Kode berlaku ${CONFIG.OTP_MINUTES} menit sejak email ini dikirim.\n\n` +
      `Masukkan kode tersebut di halaman login HAIMS, lalu tetapkan kata sandi baru.\n\n` +
      `Jika Anda tidak meminta kode ini, abaikan email ini.\n\n— HAIMS, Hotel Asset Inventory`
  );

  await logAct(ctx, 'Autentikasi', 'Kode OTP dikirim', target);
  return { ok: true, menit: CONFIG.OTP_MINUTES };
}

async function verifyOtpAndLogin(ctx, email, code, newPassword) {
  await ensureSetup();
  const target = String(email || '').toLowerCase().trim();
  const kode = String(code || '').trim();
  if (!target || !kode) throw new Error('Email dan kode wajib diisi.');

  const u = await findUser(target);
  if (!u) throw new Error('Email tidak terdaftar di HAIMS.');

  const list = await db.objs(SH.OTP);
  let found = null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (String(list[i].Email).toLowerCase().trim() === target && String(list[i].Kode).trim() === kode) {
      found = list[i];
      break;
    }
  }
  if (!found) throw new Error('Kode tidak cocok. Periksa kembali email Anda.');
  if (String(found.Dipakai) === 'Sudah') throw new Error('Kode ini sudah dipakai. Minta kode baru.');

  const exp = new Date(String(found.Kedaluwarsa).replace(' ', 'T'));
  if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) throw new Error('Kode sudah kedaluwarsa. Minta kode baru.');

  await db.updateRow(SH.OTP, found.__row, { Dipakai: 'Sudah' });

  if (newPassword) {
    await db.updateByKey(SH.USERS, 'Email', target, { PasswordHash: hash(target, newPassword), DiubahOleh: target });
  }
  if (String(u.Status) !== 'Aktif') throw new Error('Kode benar, tetapi akun Anda belum diaktifkan Admin.');

  await logAct(ctx, 'Autentikasi', 'Login via OTP', target);
  return { stage: 'READY', user: publicUser(await findUser(target)) };
}

async function logLogout(ctx) {
  await logAct(ctx, 'Autentikasi', 'Logout', ctx.email);
  return { ok: true };
}

module.exports = {
  ensureSetup, findUser, publicUser, requireUser, requireRole, hash, logAct, getSettingValue, notifyAdmins,
  checkSession, loginWithPassword, registerUser, requestOtp, verifyOtpAndLogin, logLogout,
};
