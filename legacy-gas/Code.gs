/**************************************************************************************************
 * HAIMS — Hotel Asset Inventory Management System
 * Fase 1 — Neumorphism "Warm Sand"
 * Backend: Google Apps Script  |  Database: Google Spreadsheet  |  File: Google Drive
 *
 * Modul Fase 1:
 *   1. Autentikasi Google + registrasi + login email/password + OTP lupa sandi
 *   2. Dashboard (KPI + grafik per sub-departemen)
 *   3. Departemen (11 sub-departemen, sheet Aset_<KODE> + folder Drive masing-masing)
 *   4. Add User (Admin/Manager = akses penuh, User = input saja)
 *   5. Pengaturan (bahasa ID/EN, font, Light/Dark, unit hotel, sub-departemen, email notifikasi)
 *   6. ActivitiesLog
 *
 * PENTING SAAT DEPLOY:
 *   Deploy > New deployment > Web app
 *     Execute as        : User accessing the web app
 *     Who has access    : Anyone within <domain Anda>  (atau Anyone with Google account)
 *   Setiap kali kode diubah: Deploy > Manage deployments > Edit (pensil) > Version: New version.
 **************************************************************************************************/

/* =============================== KONFIGURASI =============================== */

var CONFIG = {
  SPREADSHEET_ID: '1f_0Vw7BDVWqu5mIh3wlAhpK1IepxBGV7nK1GsWmi4AQ',
  APP_NAME: 'HAIMS',
  DRIVE_ROOT: 'HAIMS_Uploads',
  OTP_MINUTES: 10,
  MAX_UPLOAD_BYTES: 1600 * 1024,
  SETUP_FLAG: 'HAIMS_SETUP_V1'
};

var SH = {
  USERS: 'Users',
  HOTELS: 'Hotels',
  DEPTS: 'Departments',
  SETTINGS: 'Settings',
  LOG: 'ActivitiesLog',
  OTP: 'OTP_Log',
  MUTASI: 'Mutasi',          /* FASE 3 */
  OPNAME: 'Opname',          /* FASE 4 */
  OPNAME_DETAIL: 'OpnameDetail',
  MAINT: 'Maintenance',
  DEPR: 'Depresiasi',
  WRITEOFF: 'WriteOff'          /* FASE 5 */
};

var HEAD = {
  Users: ['Email', 'Nama', 'Role', 'Unit', 'Departemen', 'FotoURL', 'PasswordHash', 'Status', 'Dibuat', 'DiubahOleh'],
  Hotels: ['Kode', 'Nama', 'Alamat', 'FotoURL', 'Status'],
  Departments: ['Kode', 'Nama', 'Unit', 'Kepala', 'Status'],
  Settings: ['Kunci', 'Nilai'],
  ActivitiesLog: ['Waktu', 'Email', 'Role', 'Modul', 'Aksi', 'Detail'],
  OTP_Log: ['Email', 'Kode', 'Kedaluwarsa', 'Dipakai'],
  Aset: ['IDAset', 'Nama', 'Kategori', 'Merk', 'TglPembelian', 'Garansi', 'Harga', 'Lokasi', 'PIC',
         'Kondisi', 'FotoURL', 'Vendor', 'Keterangan', 'Status', 'Dibuat', 'DibuatOleh', 'Diubah', 'DiubahOleh'],
  /* FASE 3 — Mutasi Aset */
  Mutasi: ['IDMutasi', 'IDAset', 'Sumber', 'Dept', 'DariLokasi', 'KeLokasi', 'DariPIC', 'KePIC',
           'Alasan', 'Pemohon', 'Status', 'Penyetuju', 'CatatanPenyetuju', 'TglAju', 'TglPutus'],
  /* FASE 4 — Stock Opname, Maintenance, Depresiasi */
  Opname: ['IDSesi', 'Unit', 'Lokasi', 'Petugas', 'Mulai', 'Selesai', 'TotalTarget', 'TotalScan',
            'Ditemukan', 'TidakDitemukan', 'Akurasi', 'Status'],
  OpnameDetail: ['IDSesi', 'IDAset', 'Sumber', 'Dept', 'Nama', 'KondisiFisik', 'Catatan', 'Waktu'],
  Maintenance: ['IDServis', 'IDAset', 'Sumber', 'Dept', 'Jenis', 'TglJadwal', 'TglRealisasi', 'Vendor',
                 'Biaya', 'Hasil', 'Status', 'Dibuat', 'DibuatOleh'],
  Depresiasi: ['IDAset', 'Sumber', 'Dept', 'Metode', 'NilaiPerolehan', 'TglPembelian', 'UmurBulan',
                'PenyusutanBulan', 'AkumulasiPenyusutan', 'NilaiBuku', 'DihitungPada'],
  /* FASE 5 — Write-Off berjenjang Dept → GM → Finance */
  WriteOff: ['IDWO', 'IDAset', 'Sumber', 'Dept', 'Alasan', 'NilaiBukuTerakhir', 'Pemohon',
              'StatusDept', 'PenyetujuDept', 'CatatanDept',
              'StatusGM', 'PenyetujuGM', 'CatatanGM',
              'StatusFinance', 'PenyetujuFinance', 'CatatanFinance',
              'Status', 'BAURL', 'TglAju', 'TglSelesai'],
  /* FASE 2 — MPL Asset */
  Mpl: ['IDAset', 'Jenis', 'Merk', 'TglPembelian', 'Garansi', 'Harga', 'Lokasi', 'PIC', 'Vendor',
        'Kondisi', 'FotoURL', 'Keterangan', 'Status', 'Dibuat', 'DibuatOleh', 'Diubah', 'DiubahOleh']
};

var SEED_HOTELS = [
  ['APK', 'ASTON Pekalongan', 'Pekalongan, Jawa Tengah', '', 'Aktif'],
  ['AMP', 'ASTON Mampang', 'Mampang Prapatan, Jakarta Selatan', '', 'Aktif']
];

var SEED_DEPTS = [
  ['FO', 'Front Office', 'ALL', '', 'Aktif'],
  ['HK', 'Housekeeping', 'ALL', '', 'Aktif'],
  ['ENG', 'Engineering', 'ALL', '', 'Aktif'],
  ['IT', 'Information Technology', 'ALL', '', 'Aktif'],
  ['FBP', 'F&B Product', 'ALL', '', 'Aktif'],
  ['FBS', 'F&B Service', 'ALL', '', 'Aktif'],
  ['SM', 'Sales & Marketing', 'ALL', '', 'Aktif'],
  ['AG', 'Administration & General', 'ALL', '', 'Aktif'],
  ['HR', 'Human Resources', 'ALL', '', 'Aktif'],
  ['ACCT', 'Accounting', 'ALL', '', 'Aktif'],
  ['OTHERS', 'Lain-lain', 'ALL', '', 'Aktif']
];

var SEED_SETTINGS = [
  ['bahasa', 'id'],
  ['font', 'Comfortaa'],
  ['tema', 'light'],
  ['emailNotifikasi', ''],
  ['metodeDepresiasi', 'Garis Lurus'],
  ['masaManfaatBulan', '48'],  /* FASE 4 — default 4 tahun bila umur ekonomis tidak diisi manual */
  ['appTitle', 'HAIMS'],       /* Identitas aplikasi — judul, logo, teks halaman login */
  ['logoURL', ''],
  ['loginHeroTitle', ''],
  ['loginHeroSub', '']
];

var ROLE_FULL = ['Admin', 'Manager'];

/* =============================== ENTRY POINT =============================== */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('HAIMS — Hotel Asset Inventory')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* =============================== UTIL SPREADSHEET =============================== */

function ss_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function sheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && headers.length) {
    var lc = Math.max(sh.getLastColumn(), 1);
    var first = sh.getRange(1, 1, 1, Math.max(lc, headers.length)).getValues()[0];
    if (String(first.join('')).trim() === '') {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function rows_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) return { head: [], data: [] };
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return { head: [], data: [] };
  var head = sh.getRange(1, 1, 1, lc).getValues()[0];
  if (lr < 2) return { head: head, data: [] };
  var data = sh.getRange(2, 1, lr - 1, lc).getValues();
  return { head: head, data: data };
}

function objs_(name) {
  var r = rows_(name);
  var out = [];
  for (var i = 0; i < r.data.length; i++) {
    var row = r.data[i];
    if (String(row.join('')).trim() === '') continue;
    var o = {};
    for (var c = 0; c < r.head.length; c++) o[String(r.head[c])] = row[c];
    o.__row = i + 2;
    out.push(o);
  }
  return out;
}

function appendObj_(name, headers, obj) {
  var sh = sheet_(name, headers);
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var v = obj[headers[i]];
    row.push(v === undefined || v === null ? '' : v);
  }
  sh.appendRow(row);
  return row;
}

function updateByKey_(name, keyCol, keyVal, patch) {
  var sh = ss_().getSheetByName(name);
  if (!sh) return false;
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 2) return false;
  var head = sh.getRange(1, 1, 1, lc).getValues()[0];
  var ki = head.indexOf(keyCol);
  if (ki < 0) return false;
  var data = sh.getRange(2, 1, lr - 1, lc).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][ki]).trim().toLowerCase() === String(keyVal).trim().toLowerCase()) {
      var keys = Object.keys(patch);
      for (var k = 0; k < keys.length; k++) {
        var ci = head.indexOf(keys[k]);
        if (ci > -1) data[i][ci] = patch[keys[k]];
      }
      sh.getRange(i + 2, 1, 1, lc).setValues([data[i]]);
      return true;
    }
  }
  return false;
}

function asetSheet_(kode) {
  return 'Aset_' + String(kode).toUpperCase();
}

/* FASE 2 — sheet MPL terpisah per sub-departemen */
function mplSheet_(kode) {
  return 'MPL_' + String(kode).toUpperCase();
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
}

/* =============================== SETUP OTOMATIS =============================== */

function ensureSetup_() {
  sheet_(SH.USERS, HEAD.Users);
  sheet_(SH.HOTELS, HEAD.Hotels);
  sheet_(SH.DEPTS, HEAD.Departments);
  sheet_(SH.SETTINGS, HEAD.Settings);
  sheet_(SH.LOG, HEAD.ActivitiesLog);
  sheet_(SH.OTP, HEAD.OTP_Log);
  sheet_(SH.MUTASI, HEAD.Mutasi);        // FASE 3
  sheet_(SH.OPNAME, HEAD.Opname);        // FASE 4
  sheet_(SH.OPNAME_DETAIL, HEAD.OpnameDetail);
  sheet_(SH.MAINT, HEAD.Maintenance);
  sheet_(SH.DEPR, HEAD.Depresiasi);
  sheet_(SH.WRITEOFF, HEAD.WriteOff);   // FASE 5

  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(CONFIG.SETUP_FLAG) === '1') return;

  if (objs_(SH.HOTELS).length === 0) {
    sheet_(SH.HOTELS, HEAD.Hotels).getRange(2, 1, SEED_HOTELS.length, HEAD.Hotels.length).setValues(SEED_HOTELS);
  }
  if (objs_(SH.DEPTS).length === 0) {
    sheet_(SH.DEPTS, HEAD.Departments).getRange(2, 1, SEED_DEPTS.length, HEAD.Departments.length).setValues(SEED_DEPTS);
  }
  if (objs_(SH.SETTINGS).length === 0) {
    sheet_(SH.SETTINGS, HEAD.Settings).getRange(2, 1, SEED_SETTINGS.length, 2).setValues(SEED_SETTINGS);
  }
  var depts = objs_(SH.DEPTS);
  for (var i = 0; i < depts.length; i++) {
    if (String(depts[i].Status) === 'Nonaktif') continue;
    sheet_(asetSheet_(depts[i].Kode), HEAD.Aset);
    sheet_(mplSheet_(depts[i].Kode), HEAD.Mpl);   // FASE 2
  }
  props.setProperty(CONFIG.SETUP_FLAG, '1');
}

/** Jalankan manual dari editor bila struktur sheet perlu dibangun ulang. */
function resetSetupFlag() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.SETUP_FLAG);
  ensureSetup_();
  return 'Setup dijalankan ulang.';
}

/* =============================== SESI & ROLE =============================== */

function currentEmail_() {
  try {
    return String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  } catch (err) {
    return '';
  }
}

function findUser_(email) {
  if (!email) return null;
  var list = objs_(SH.USERS);
  var e = String(email).toLowerCase().trim();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].Email).toLowerCase().trim() === e) return list[i];
  }
  return null;
}

function publicUser_(u) {
  if (!u) return null;
  return {
    email: String(u.Email || ''),
    nama: String(u.Nama || ''),
    role: String(u.Role || 'User'),
    unit: String(u.Unit || ''),
    departemen: String(u.Departemen || ''),
    fotoURL: String(u.FotoURL || ''),
    status: String(u.Status || ''),
    full: ROLE_FULL.indexOf(String(u.Role)) > -1
  };
}

function requireUser_() {
  var u = findUser_(currentEmail_());
  if (!u) throw new Error('Sesi tidak dikenali. Muat ulang aplikasi lewat URL Web App.');
  if (String(u.Status) !== 'Aktif') throw new Error('Akun Anda belum diaktifkan oleh Admin.');
  return u;
}

function requireRole_(roles) {
  var u = requireUser_();
  if (roles.indexOf(String(u.Role)) < 0) throw new Error('Akses ditolak. Menu ini hanya untuk ' + roles.join(' / ') + '.');
  return u;
}

function hash_(email, pw) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(email).toLowerCase() + '::haims::' + String(pw),
    Utilities.Charset.UTF_8
  );
  var out = '';
  for (var i = 0; i < raw.length; i++) {
    var b = (raw[i] < 0 ? raw[i] + 256 : raw[i]).toString(16);
    out += b.length === 1 ? '0' + b : b;
  }
  return out;
}

function logAct_(modul, aksi, detail) {
  try {
    var email = currentEmail_();
    var u = findUser_(email);
    appendObj_(SH.LOG, HEAD.ActivitiesLog, {
      Waktu: now_(),
      Email: email,
      Role: u ? String(u.Role) : '-',
      Modul: modul,
      Aksi: aksi,
      Detail: detail || ''
    });
  } catch (err) {
    // log tidak boleh menggagalkan operasi utama
  }
}

/* =============================== AUTENTIKASI =============================== */

/**
 * Status sesi:
 *   READY    — boleh masuk dashboard
 *   LOGIN    — akun punya kata sandi, minta email + sandi
 *   REGISTER — email Google belum terdaftar
 *   PENDING  — sudah registrasi, menunggu aktivasi Admin
 *   NOEMAIL  — email sesi tidak terbaca (deployment salah)
 */
function checkSession() {
  ensureSetup_();
  var email = currentEmail_();
  if (!email) {
    return { stage: 'NOEMAIL', googleEmail: '' };
  }

  var users = objs_(SH.USERS);

  if (users.length === 0) {
    var hotels = objs_(SH.HOTELS);
    appendObj_(SH.USERS, HEAD.Users, {
      Email: email,
      Nama: email.split('@')[0],
      Role: 'Admin',
      Unit: hotels.length ? String(hotels[0].Kode) : 'APK',
      Departemen: 'AG',
      FotoURL: '',
      PasswordHash: '',
      Status: 'Aktif',
      Dibuat: now_(),
      DiubahOleh: 'sistem'
    });
    logAct_('Autentikasi', 'Admin pertama dibuat otomatis', email);
    return { stage: 'READY', googleEmail: email, user: publicUser_(findUser_(email)), bootstrapped: true };
  }

  var u = findUser_(email);
  if (!u) {
    /* Akun Google pertama kali dikenali sistem (bukan yang pertama secara
       keseluruhan — itu sudah ditangani cabang bootstrap Admin di atas).
       Sesuai ketentuan: klik pertama = Admin (bootstrap), klik berikutnya
       dari siapa pun yang belum terdaftar = otomatis aktif sebagai User,
       tanpa menunggu aktivasi manual. Role hanya bisa diubah oleh Admin
       lewat menu Add User (lihat saveUser). */
    var hotelList = objs_(SH.HOTELS);
    var deptList = objs_(SH.DEPTS);
    var defUnit = hotelList.length ? String(hotelList[0].Kode) : 'APK';
    var defDept = deptList.length ? String(deptList[0].Kode) : 'OTHERS';
    appendObj_(SH.USERS, HEAD.Users, {
      Email: email, Nama: email.split('@')[0], Role: 'User', Unit: defUnit, Departemen: defDept,
      FotoURL: '', PasswordHash: '', Status: 'Aktif', Dibuat: now_(), DiubahOleh: 'auto-google'
    });
    logAct_('Autentikasi', 'User baru dibuat otomatis via Google', email);
    notifyAdmins_('Pengguna baru bergabung ke HAIMS',
      'Akun baru otomatis aktif sebagai User melalui tombol "Lanjut dengan akun Google":\n\n' +
      'Email : ' + email + '\nUnit  : ' + defUnit + '\nDept  : ' + defDept + '\n\n' +
      'Ubah role, unit, atau departemennya lewat menu Add User bila perlu.');
    return { stage: 'READY', googleEmail: email, user: publicUser_(findUser_(email)), autoProvisioned: true };
  }
  if (String(u.Status) === 'Menunggu') return { stage: 'PENDING', googleEmail: email };
  if (String(u.Status) !== 'Aktif') return { stage: 'PENDING', googleEmail: email, nonaktif: true };
  if (String(u.PasswordHash || '').trim() !== '') return { stage: 'LOGIN', googleEmail: email };
  return { stage: 'READY', googleEmail: email, user: publicUser_(u) };
}

function loginWithPassword(email, password) {
  ensureSetup_();
  var sesi = currentEmail_();
  var typed = String(email || '').toLowerCase().trim();
  if (!typed || !password) throw new Error('Email dan kata sandi wajib diisi.');
  if (!sesi) throw new Error('Sesi Google tidak terbaca. Buka aplikasi lewat URL Web App.');
  if (typed !== sesi) throw new Error('Email yang diisi harus sama dengan akun Google yang aktif (' + sesi + ').');

  var u = findUser_(typed);
  if (!u) throw new Error('Akun belum terdaftar. Silakan daftar dengan akun Google.');
  if (String(u.Status) !== 'Aktif') throw new Error('Akun Anda belum diaktifkan oleh Admin.');
  if (String(u.PasswordHash || '').trim() === '') return { stage: 'READY', user: publicUser_(u) };
  if (hash_(typed, password) !== String(u.PasswordHash).trim()) throw new Error('Kata sandi salah.');

  logAct_('Autentikasi', 'Login kata sandi', typed);
  return { stage: 'READY', user: publicUser_(u) };
}

function registerUser(payload) {
  ensureSetup_();
  var p = payload || {};
  var email = currentEmail_();
  if (!email) throw new Error('Sesi Google tidak terbaca. Buka aplikasi lewat URL Web App.');
  if (findUser_(email)) throw new Error('Email ini sudah terdaftar.');

  var nama = String(p.nama || '').trim();
  var unit = String(p.unit || '').trim();
  var dept = String(p.departemen || '').trim();
  if (!nama) throw new Error('Nama lengkap wajib diisi.');
  if (!unit) throw new Error('Unit hotel wajib dipilih.');
  if (!dept) throw new Error('Departemen wajib dipilih.');

  var foto = '';
  if (p.fotoBase64) foto = savePhoto_(p.fotoBase64, 'user_' + email.split('@')[0] + '.jpg', CONFIG.DRIVE_ROOT + '_Users');

  appendObj_(SH.USERS, HEAD.Users, {
    Email: email,
    Nama: nama,
    Role: 'User',
    Unit: unit,
    Departemen: dept,
    FotoURL: foto,
    PasswordHash: p.password ? hash_(email, p.password) : '',
    Status: 'Menunggu',
    Dibuat: now_(),
    DiubahOleh: email
  });

  logAct_('Autentikasi', 'Registrasi pengguna baru', nama + ' (' + email + ') unit ' + unit);
  notifyAdmins_('Registrasi HAIMS menunggu aktivasi',
    'Pengguna baru mendaftar di HAIMS:\n\nNama: ' + nama + '\nEmail: ' + email + '\nUnit: ' + unit +
    '\nDepartemen: ' + dept + '\n\nAktifkan lewat menu Add User.');

  return { stage: 'PENDING' };
}

function requestOtp(email) {
  ensureSetup_();
  var target = String(email || '').toLowerCase().trim() || currentEmail_();
  if (!target) throw new Error('Email wajib diisi.');
  var u = findUser_(target);
  if (!u) throw new Error('Email tidak terdaftar di HAIMS.');

  var code = String(Math.floor(100000 + Math.random() * 900000));
  var exp = new Date(new Date().getTime() + CONFIG.OTP_MINUTES * 60 * 1000);

  appendObj_(SH.OTP, HEAD.OTP_Log, {
    Email: target,
    Kode: code,
    Kedaluwarsa: Utilities.formatDate(exp, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
    Dipakai: 'Belum'
  });

  MailApp.sendEmail({
    to: target,
    subject: 'Kode akses HAIMS: ' + code,
    body: 'Halo ' + String(u.Nama || '') + ',\n\n' +
      'Kode akses sekali pakai Anda: ' + code + '\n' +
      'Kode berlaku ' + CONFIG.OTP_MINUTES + ' menit sejak email ini dikirim.\n\n' +
      'Masukkan kode tersebut di halaman login HAIMS, lalu tetapkan kata sandi baru.\n\n' +
      'Jika Anda tidak meminta kode ini, abaikan email ini.\n\n— HAIMS, Hotel Asset Inventory'
  });

  logAct_('Autentikasi', 'Kode OTP dikirim', target);
  return { ok: true, menit: CONFIG.OTP_MINUTES };
}

function verifyOtpAndLogin(email, code, newPassword) {
  ensureSetup_();
  var target = String(email || '').toLowerCase().trim();
  var kode = String(code || '').trim();
  if (!target || !kode) throw new Error('Email dan kode wajib diisi.');

  var u = findUser_(target);
  if (!u) throw new Error('Email tidak terdaftar di HAIMS.');

  var list = objs_(SH.OTP);
  var found = null;
  for (var i = list.length - 1; i >= 0; i--) {
    if (String(list[i].Email).toLowerCase().trim() === target && String(list[i].Kode).trim() === kode) {
      found = list[i];
      break;
    }
  }
  if (!found) throw new Error('Kode tidak cocok. Periksa kembali email Anda.');
  if (String(found.Dipakai) === 'Sudah') throw new Error('Kode ini sudah dipakai. Minta kode baru.');

  var exp = found.Kedaluwarsa instanceof Date ? found.Kedaluwarsa : new Date(String(found.Kedaluwarsa).replace(' ', 'T'));
  if (isNaN(exp.getTime()) || exp.getTime() < new Date().getTime()) throw new Error('Kode sudah kedaluwarsa. Minta kode baru.');

  var sh = ss_().getSheetByName(SH.OTP);
  sh.getRange(found.__row, HEAD.OTP_Log.indexOf('Dipakai') + 1).setValue('Sudah');

  if (newPassword) {
    updateByKey_(SH.USERS, 'Email', target, { PasswordHash: hash_(target, newPassword), DiubahOleh: target });
  }
  if (String(u.Status) !== 'Aktif') throw new Error('Kode benar, tetapi akun Anda belum diaktifkan Admin.');

  logAct_('Autentikasi', 'Login via OTP', target);
  return { stage: 'READY', user: publicUser_(findUser_(target)) };
}

function notifyAdmins_(subject, body) {
  try {
    var list = objs_(SH.USERS);
    var to = [];
    for (var i = 0; i < list.length; i++) {
      if (ROLE_FULL.indexOf(String(list[i].Role)) > -1 && String(list[i].Status) === 'Aktif') to.push(String(list[i].Email));
    }
    var extra = getSettingValue_('emailNotifikasi');
    if (extra) to = to.concat(String(extra).split(/[;,\s]+/));
    var clean = [];
    for (var j = 0; j < to.length; j++) {
      var e = String(to[j]).trim();
      if (e && clean.indexOf(e) < 0) clean.push(e);
    }
    if (!clean.length) return;
    MailApp.sendEmail({ to: clean.join(','), subject: subject, body: body });
  } catch (err) {
    // notifikasi bersifat opsional
  }
}

/* =============================== DRIVE / FOTO =============================== */

function rootFolder_() {
  var it = DriveApp.getFoldersByName(CONFIG.DRIVE_ROOT);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.DRIVE_ROOT);
}

function subFolder_(name) {
  var root = rootFolder_();
  var target = String(name || CONFIG.DRIVE_ROOT);
  if (target === CONFIG.DRIVE_ROOT) return root;
  var it = root.getFoldersByName(target);
  return it.hasNext() ? it.next() : root.createFolder(target);
}

/**
 * Menyimpan foto ke Drive. Kompresi/resize dilakukan di sisi browser (canvas)
 * sebelum base64 dikirim ke sini; di server hanya divalidasi ukurannya.
 */
function savePhoto_(base64Data, filename, folderName) {
  if (!base64Data) return '';
  var str = String(base64Data);
  var mime = 'image/jpeg';
  var m = str.match(/^data:([^;]+);base64,/);
  if (m) mime = m[1];
  var data = str.indexOf(',') > -1 ? str.substring(str.indexOf(',') + 1) : str;
  if (!data) return '';

  var bytes;
  try {
    bytes = Utilities.base64Decode(data);
  } catch (err) {
    throw new Error('Format foto tidak dikenali.');
  }
  if (bytes.length > CONFIG.MAX_UPLOAD_BYTES) {
    throw new Error('Ukuran foto masih terlalu besar (maksimal ' + Math.round(CONFIG.MAX_UPLOAD_BYTES / 1024) + ' KB setelah dikompres).');
  }

  var blob = Utilities.newBlob(bytes, mime, filename || ('foto_' + new Date().getTime() + '.jpg'));
  var file = subFolder_(folderName).createFile(blob);

  /* Foto hanya tampil di halaman display kalau izin bacanya berhasil dipasang.
     Banyak domain Workspace memblokir ANYONE_WITH_LINK, jadi turun bertingkat:
     publik → sedomain → biarkan default (pemilik saja) sambil dicatat di log. */
  var akses = 'ANYONE_WITH_LINK';
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err1) {
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      akses = 'DOMAIN_WITH_LINK';
    } catch (err2) {
      akses = 'PRIVATE';
      logAct_('Drive', 'Foto tersimpan tanpa izin baca publik',
        file.getName() + ' — kebijakan domain memblokir sharing, foto mungkin tidak tampil bagi pengguna lain');
    }
  }
  if (akses === 'PRIVATE') return 'https://drive.google.com/uc?id=' + file.getId();
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

/* =============================== BOOTSTRAP APLIKASI =============================== */

function getBootstrap() {
  var u = requireUser_();
  return {
    user: publicUser_(u),
    hotels: getHotels(),
    departments: getDepartments(),
    settings: getSettings()
  };
}

function getHotels() {
  ensureSetup_();
  var list = objs_(SH.HOTELS);
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (!String(list[i].Kode).trim()) continue;
    out.push({
      kode: String(list[i].Kode).trim(),
      nama: String(list[i].Nama || '').trim(),
      alamat: String(list[i].Alamat || ''),
      fotoURL: String(list[i].FotoURL || ''),
      status: String(list[i].Status || 'Aktif')
    });
  }
  return out;
}

function getDepartments() {
  ensureSetup_();
  var list = objs_(SH.DEPTS);
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (!String(list[i].Kode).trim()) continue;
    out.push({
      kode: String(list[i].Kode).trim().toUpperCase(),
      nama: String(list[i].Nama || '').trim(),
      unit: String(list[i].Unit || 'ALL'),
      kepala: String(list[i].Kepala || ''),
      status: String(list[i].Status || 'Aktif')
    });
  }
  return out;
}

function getSettings() {
  ensureSetup_();
  var list = objs_(SH.SETTINGS);
  var out = {};
  for (var i = 0; i < SEED_SETTINGS.length; i++) out[SEED_SETTINGS[i][0]] = SEED_SETTINGS[i][1];
  for (var j = 0; j < list.length; j++) {
    if (String(list[j].Kunci).trim()) out[String(list[j].Kunci).trim()] = String(list[j].Nilai === undefined ? '' : list[j].Nilai);
  }
  return out;
}

function getSettingValue_(key) {
  var s = getSettings();
  return s[key] === undefined ? '' : s[key];
}

/** Upsert satu atau beberapa pasangan Kunci/Nilai ke sheet Settings. Dipakai oleh
 *  saveSettings() dan saveBranding() supaya logikanya tidak digandakan. */
function settingsUpsert_(patch) {
  var sh = sheet_(SH.SETTINGS, HEAD.Settings);
  var existing = objs_(SH.SETTINGS);
  var keys = Object.keys(patch);
  for (var i = 0; i < keys.length; i++) {
    var found = false;
    for (var j = 0; j < existing.length; j++) {
      if (String(existing[j].Kunci).trim() === keys[i]) {
        sh.getRange(existing[j].__row, 2).setValue(patch[keys[i]]);
        found = true;
        break;
      }
    }
    if (!found) sh.appendRow([keys[i], patch[keys[i]]]);
  }
}

function saveSettings(payload) {
  requireRole_(ROLE_FULL);
  var p = payload || {};
  settingsUpsert_(p);
  logAct_('Pengaturan', 'Menyimpan pengaturan', Object.keys(p).join(', '));
  return getSettings();
}

/** Identitas aplikasi: judul, logo, dan teks halaman login yang bisa diedit manual. */
function saveBranding(payload) {
  requireRole_(ROLE_FULL);
  var p = payload || {};
  var patch = {
    appTitle: String(p.appTitle || '').trim() || 'HAIMS',
    loginHeroTitle: String(p.loginHeroTitle || ''),
    loginHeroSub: String(p.loginHeroSub || '')
  };
  if (p.fotoBase64) {
    patch.logoURL = savePhoto_(p.fotoBase64, 'logo_' + new Date().getTime() + '.png', CONFIG.DRIVE_ROOT + '_Branding');
  } else if (p.removeLogo === true) {
    patch.logoURL = '';
  }
  settingsUpsert_(patch);
  logAct_('Pengaturan', 'Ubah identitas aplikasi', 'judul=' + patch.appTitle +
    (patch.logoURL !== undefined ? ' · logo diperbarui' : ''));
  return getSettings();
}

/* =============================== UNIT HOTEL =============================== */

function saveHotel(payload) {
  requireRole_(ROLE_FULL);
  var p = payload || {};
  var kode = String(p.kode || '').trim().toUpperCase();
  var nama = String(p.nama || '').trim();
  if (!kode) throw new Error('Kode unit wajib diisi (contoh: APK).');
  if (!nama) throw new Error('Nama unit hotel wajib diisi.');

  var foto = String(p.fotoURL || '');
  if (p.fotoBase64) foto = savePhoto_(p.fotoBase64, 'unit_' + kode + '.jpg', CONFIG.DRIVE_ROOT + '_Hotels');

  var existing = null;
  var list = objs_(SH.HOTELS);
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].Kode).trim().toUpperCase() === kode) existing = list[i];
  }

  if (existing) {
    updateByKey_(SH.HOTELS, 'Kode', kode, {
      Nama: nama,
      Alamat: String(p.alamat || ''),
      FotoURL: foto,
      Status: String(p.status || 'Aktif')
    });
    logAct_('Pengaturan', 'Ubah unit hotel', kode + ' — ' + nama);
  } else {
    appendObj_(SH.HOTELS, HEAD.Hotels, {
      Kode: kode, Nama: nama, Alamat: String(p.alamat || ''), FotoURL: foto, Status: String(p.status || 'Aktif')
    });
    logAct_('Pengaturan', 'Tambah unit hotel', kode + ' — ' + nama);
  }
  return getHotels();
}

function deleteHotel(kode) {
  requireRole_(['Admin']);
  var k = String(kode || '').trim().toUpperCase();
  if (!k) throw new Error('Kode unit tidak valid.');
  updateByKey_(SH.HOTELS, 'Kode', k, { Status: 'Nonaktif' });
  logAct_('Pengaturan', 'Nonaktifkan unit hotel', k);
  return getHotels();
}

/* =============================== SUB-DEPARTEMEN =============================== */

function saveDepartment(payload) {
  requireRole_(ROLE_FULL);
  var p = payload || {};
  var kode = String(p.kode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  var nama = String(p.nama || '').trim();
  if (!kode) throw new Error('Kode departemen wajib diisi (huruf/angka, contoh: ENG).');
  if (!nama) throw new Error('Nama departemen wajib diisi.');

  var list = objs_(SH.DEPTS);
  var existing = null;
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].Kode).trim().toUpperCase() === kode) existing = list[i];
  }

  if (existing) {
    updateByKey_(SH.DEPTS, 'Kode', kode, {
      Nama: nama, Unit: String(p.unit || 'ALL'), Kepala: String(p.kepala || ''), Status: String(p.status || 'Aktif')
    });
    logAct_('Pengaturan', 'Ubah sub-departemen', kode + ' — ' + nama);
  } else {
    appendObj_(SH.DEPTS, HEAD.Departments, {
      Kode: kode, Nama: nama, Unit: String(p.unit || 'ALL'), Kepala: String(p.kepala || ''), Status: 'Aktif'
    });
    logAct_('Pengaturan', 'Tambah sub-departemen', kode + ' — ' + nama);
  }
  sheet_(asetSheet_(kode), HEAD.Aset);
  sheet_(mplSheet_(kode), HEAD.Mpl);              // FASE 2
  return getDepartments();
}

function deleteDepartment(kode) {
  requireRole_(['Admin']);
  var k = String(kode || '').trim().toUpperCase();
  if (!k) throw new Error('Kode departemen tidak valid.');
  updateByKey_(SH.DEPTS, 'Kode', k, { Status: 'Nonaktif' });
  logAct_('Pengaturan', 'Nonaktifkan sub-departemen', k + ' (sheet aset tetap tersimpan)');
  return getDepartments();
}

/* =============================== PENGGUNA =============================== */

function getUsers() {
  requireRole_(ROLE_FULL);
  var list = objs_(SH.USERS);
  var out = [];
  for (var i = 0; i < list.length; i++) {
    out.push({
      email: String(list[i].Email || ''),
      nama: String(list[i].Nama || ''),
      role: String(list[i].Role || 'User'),
      unit: String(list[i].Unit || ''),
      departemen: String(list[i].Departemen || ''),
      fotoURL: String(list[i].FotoURL || ''),
      status: String(list[i].Status || ''),
      dibuat: String(list[i].Dibuat || ''),
      punyaSandi: String(list[i].PasswordHash || '').trim() !== ''
    });
  }
  return out;
}

function saveUser(payload) {
  var me = requireRole_(ROLE_FULL);
  var p = payload || {};
  var email = String(p.email || '').toLowerCase().trim();
  var nama = String(p.nama || '').trim();
  if (!email || email.indexOf('@') < 0) throw new Error('Email pengguna tidak valid.');
  if (!nama) throw new Error('Nama pengguna wajib diisi.');

  var role = String(p.role || 'User');
  if (['Admin', 'Manager', 'User'].indexOf(role) < 0) role = 'User';
  if (role === 'Admin' && String(me.Role) !== 'Admin') throw new Error('Hanya Admin yang boleh menetapkan role Admin.');

  var existingForRole = findUser_(email);
  if (existingForRole && role !== String(existingForRole.Role) && String(me.Role) !== 'Admin') {
    throw new Error('Hanya Admin yang boleh mengubah role pengguna.');
  }

  var foto = String(p.fotoURL || '');
  if (p.fotoBase64) foto = savePhoto_(p.fotoBase64, 'user_' + email.split('@')[0] + '.jpg', CONFIG.DRIVE_ROOT + '_Users');

  var existing = findUser_(email);
  if (existing) {
    var patch = {
      Nama: nama,
      Role: role,
      Unit: String(p.unit || existing.Unit || ''),
      Departemen: String(p.departemen || existing.Departemen || ''),
      Status: String(p.status || existing.Status || 'Aktif'),
      DiubahOleh: String(me.Email)
    };
    if (foto) patch.FotoURL = foto;
    if (p.password) patch.PasswordHash = hash_(email, p.password);
    if (p.resetSandi === true) patch.PasswordHash = '';
    updateByKey_(SH.USERS, 'Email', email, patch);
    logAct_('Add User', 'Ubah pengguna', email + ' → role ' + role + ', status ' + patch.Status);
  } else {
    appendObj_(SH.USERS, HEAD.Users, {
      Email: email,
      Nama: nama,
      Role: role,
      Unit: String(p.unit || ''),
      Departemen: String(p.departemen || ''),
      FotoURL: foto,
      PasswordHash: p.password ? hash_(email, p.password) : '',
      Status: String(p.status || 'Aktif'),
      Dibuat: now_(),
      DiubahOleh: String(me.Email)
    });
    logAct_('Add User', 'Tambah pengguna', email + ' → role ' + role);
    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Akses HAIMS Anda sudah dibuat',
        body: 'Halo ' + nama + ',\n\nAkun HAIMS Anda sudah dibuat dengan role ' + role + '.\n' +
          'Masuk memakai akun Google ' + email + ' pada URL Web App HAIMS.\n\n— HAIMS'
      });
    } catch (err) { /* email opsional */ }
  }
  return getUsers();
}

function setUserStatus(email, status) {
  var me = requireRole_(ROLE_FULL);
  var e = String(email || '').toLowerCase().trim();
  var s = String(status || '').trim();
  if (['Aktif', 'Menunggu', 'Nonaktif'].indexOf(s) < 0) throw new Error('Status tidak valid.');
  if (e === String(me.Email).toLowerCase() && s !== 'Aktif') throw new Error('Anda tidak dapat menonaktifkan akun sendiri.');
  updateByKey_(SH.USERS, 'Email', e, { Status: s, DiubahOleh: String(me.Email) });
  logAct_('Add User', 'Ubah status pengguna', e + ' → ' + s);
  if (s === 'Aktif') {
    try {
      MailApp.sendEmail({ to: e, subject: 'Akses HAIMS diaktifkan', body: 'Akun HAIMS Anda sudah diaktifkan. Silakan masuk lewat URL Web App HAIMS.\n\n— HAIMS' });
    } catch (err) { /* opsional */ }
  }
  return getUsers();
}

function deleteUser(email) {
  var me = requireRole_(['Admin']);
  var e = String(email || '').toLowerCase().trim();
  if (e === String(me.Email).toLowerCase()) throw new Error('Anda tidak dapat menghapus akun sendiri.');
  updateByKey_(SH.USERS, 'Email', e, { Status: 'Nonaktif', DiubahOleh: String(me.Email) });
  logAct_('Add User', 'Nonaktifkan pengguna', e);
  return getUsers();
}

/* =============================== ASET PER DEPARTEMEN =============================== */

function nextAssetId_(unit, deptKode) {
  var sheetName = asetSheet_(deptKode);
  var list = objs_(sheetName);
  var yy = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yy');
  var prefix = String(unit || 'APK').toUpperCase() + '-' + String(deptKode).toUpperCase() + '-' + yy + '-';
  var max = 0;
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].IDAset || '');
    if (id.indexOf(prefix) === 0) {
      var n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

function getAssets(deptKode, opts) {
  var u = requireUser_();
  var kode = String(deptKode || '').trim().toUpperCase();
  if (!kode) throw new Error('Departemen tidak valid.');
  sheet_(asetSheet_(kode), HEAD.Aset);

  var o = opts || {};
  var q = String(o.q || '').toLowerCase().trim();
  var sort = String(o.sort || 'terbaru');
  var unitFilter = String(o.unit || '').toUpperCase();

  var list = objs_(asetSheet_(kode));
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (String(a.Status || '') === 'Dihapus' || String(a.Status || '') === 'Write-off') continue;   // FASE 5
    if (!String(a.IDAset || '').trim()) continue;
    if (unitFilter && String(a.IDAset).toUpperCase().indexOf(unitFilter + '-') !== 0) continue;
    if (q) {
      var hay = [a.IDAset, a.Nama, a.Kategori, a.Merk, a.Lokasi, a.PIC, a.Vendor, a.Keterangan].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push({
      idAset: String(a.IDAset || ''),
      nama: String(a.Nama || ''),
      kategori: String(a.Kategori || ''),
      merk: String(a.Merk || ''),
      tglPembelian: fmtDate_(a.TglPembelian),
      garansi: fmtDate_(a.Garansi),
      harga: Number(a.Harga || 0),
      lokasi: String(a.Lokasi || ''),
      pic: String(a.PIC || ''),
      kondisi: String(a.Kondisi || ''),
      fotoURL: String(a.FotoURL || ''),
      vendor: String(a.Vendor || ''),
      keterangan: String(a.Keterangan || ''),
      dibuat: String(a.Dibuat || ''),
      dibuatOleh: String(a.DibuatOleh || '')
    });
  }

  out.sort(function (a, b) {
    if (sort === 'az') return a.nama.localeCompare(b.nama);
    if (sort === 'za') return b.nama.localeCompare(a.nama);
    if (sort === 'terlama') return String(a.dibuat).localeCompare(String(b.dibuat));
    if (sort === 'termahal') return b.harga - a.harga;
    return String(b.dibuat).localeCompare(String(a.dibuat));
  });

  return { dept: kode, canEdit: true, canDelete: ROLE_FULL.indexOf(String(u.Role)) > -1, items: out };
}

function fmtDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  return String(v);
}

function saveAsset(payload) {
  var me = requireUser_();
  var p = payload || {};
  var kode = String(p.dept || '').trim().toUpperCase();
  if (!kode) throw new Error('Departemen tidak valid.');
  var nama = String(p.nama || '').trim();
  if (!nama) throw new Error('Nama aset wajib diisi.');

  var sheetName = asetSheet_(kode);
  sheet_(sheetName, HEAD.Aset);

  var unit = String(p.unit || me.Unit || 'APK').toUpperCase();
  var foto = String(p.fotoURL || '');
  if (p.fotoBase64) foto = savePhoto_(p.fotoBase64, 'aset_' + kode + '_' + new Date().getTime() + '.jpg', CONFIG.DRIVE_ROOT + '_' + kode);

  var isEdit = String(p.idAset || '').trim() !== '' && p.mode === 'edit';

  if (isEdit) {
    var patch = {
      Nama: nama,
      Kategori: String(p.kategori || ''),
      Merk: String(p.merk || ''),
      TglPembelian: String(p.tglPembelian || ''),
      Garansi: String(p.garansi || ''),
      Harga: Number(p.harga || 0),
      Lokasi: String(p.lokasi || ''),
      PIC: String(p.pic || ''),
      Kondisi: String(p.kondisi || 'Baik'),
      Vendor: String(p.vendor || ''),
      Keterangan: String(p.keterangan || ''),
      Diubah: now_(),
      DiubahOleh: String(me.Email)
    };
    if (foto) patch.FotoURL = foto;
    var ok = updateByKey_(sheetName, 'IDAset', String(p.idAset).trim(), patch);
    if (!ok) throw new Error('Aset ' + p.idAset + ' tidak ditemukan.');
    logAct_('Departemen ' + kode, 'Ubah aset', p.idAset + ' — ' + nama);
    return { idAset: String(p.idAset).trim(), mode: 'edit', unit: unit };
  }

  var id = nextAssetId_(unit, kode);
  appendObj_(sheetName, HEAD.Aset, {
    IDAset: id,
    Nama: nama,
    Kategori: String(p.kategori || ''),
    Merk: String(p.merk || ''),
    TglPembelian: String(p.tglPembelian || ''),
    Garansi: String(p.garansi || ''),
    Harga: Number(p.harga || 0),
    Lokasi: String(p.lokasi || ''),
    PIC: String(p.pic || ''),
    Kondisi: String(p.kondisi || 'Baik'),
    FotoURL: foto,
    Vendor: String(p.vendor || ''),
    Keterangan: String(p.keterangan || ''),
    Status: 'Aktif',
    Dibuat: now_(),
    DibuatOleh: String(me.Email),
    Diubah: '',
    DiubahOleh: ''
  });
  logAct_('Departemen ' + kode, 'Tambah aset', id + ' — ' + nama);
  return { idAset: id, mode: 'baru', unit: unit };
}

function deleteAsset(deptKode, idAset) {
  var me = requireRole_(ROLE_FULL);
  var kode = String(deptKode || '').trim().toUpperCase();
  var id = String(idAset || '').trim();
  if (!kode || !id) throw new Error('Data aset tidak lengkap.');
  var ok = updateByKey_(asetSheet_(kode), 'IDAset', id, {
    Status: 'Dihapus', Diubah: now_(), DiubahOleh: String(me.Email)
  });
  if (!ok) throw new Error('Aset ' + id + ' tidak ditemukan.');
  logAct_('Departemen ' + kode, 'Hapus aset (soft delete)', id);
  return { ok: true };
}

/* =============================== MPL ASSET (FASE 2) =============================== */

function nextMplId_(unit, deptKode) {
  var list = objs_(mplSheet_(deptKode));
  var yy = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yy');
  var prefix = String(unit || 'APK').toUpperCase() + '-MPL-' + String(deptKode).toUpperCase() + '-' + yy + '-';
  var max = 0;
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].IDAset || '');
    if (id.indexOf(prefix) === 0) {
      var n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

function getMplAssets(deptKode, opts) {
  var u = requireUser_();
  var kode = String(deptKode || '').trim().toUpperCase();
  if (!kode) throw new Error('Departemen tidak valid.');
  sheet_(mplSheet_(kode), HEAD.Mpl);

  var o = opts || {};
  var q = String(o.q || '').toLowerCase().trim();
  var sort = String(o.sort || 'terbaru');
  var unitFilter = String(o.unit || '').toUpperCase();

  var list = objs_(mplSheet_(kode));
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (String(a.Status || '') === 'Dihapus' || String(a.Status || '') === 'Write-off') continue;   // FASE 5
    if (!String(a.IDAset || '').trim()) continue;
    if (unitFilter && String(a.IDAset).toUpperCase().indexOf(unitFilter + '-') !== 0) continue;
    if (q) {
      var hay = [a.IDAset, a.Jenis, a.Merk, a.Lokasi, a.PIC, a.Vendor, a.Keterangan].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push({
      idAset: String(a.IDAset || ''),
      jenis: String(a.Jenis || ''),
      merk: String(a.Merk || ''),
      tglPembelian: fmtDate_(a.TglPembelian),
      garansi: fmtDate_(a.Garansi),
      harga: Number(a.Harga || 0),
      lokasi: String(a.Lokasi || ''),
      pic: String(a.PIC || ''),
      vendor: String(a.Vendor || ''),
      kondisi: String(a.Kondisi || ''),
      fotoURL: String(a.FotoURL || ''),
      keterangan: String(a.Keterangan || ''),
      dibuat: String(a.Dibuat || ''),
      dibuatOleh: String(a.DibuatOleh || '')
    });
  }

  out.sort(function (a, b) {
    if (sort === 'az') return a.jenis.localeCompare(b.jenis);
    if (sort === 'za') return b.jenis.localeCompare(a.jenis);
    if (sort === 'terlama') return String(a.dibuat).localeCompare(String(b.dibuat));
    if (sort === 'termahal') return b.harga - a.harga;
    return String(b.dibuat).localeCompare(String(a.dibuat));
  });

  return { dept: kode, canEdit: true, canDelete: ROLE_FULL.indexOf(String(u.Role)) > -1, items: out };
}

function saveMplAsset(payload) {
  var me = requireUser_();
  var p = payload || {};
  var kode = String(p.dept || '').trim().toUpperCase();
  if (!kode) throw new Error('Departemen tidak valid.');
  var jenis = String(p.jenis || '').trim();
  if (!jenis) throw new Error('Jenis aset MPL wajib diisi.');

  var sheetName = mplSheet_(kode);
  sheet_(sheetName, HEAD.Mpl);

  var unit = String(p.unit || me.Unit || 'APK').toUpperCase();
  var foto = String(p.fotoURL || '');
  if (p.fotoBase64) {
    foto = savePhoto_(p.fotoBase64, 'mpl_' + kode + '_' + new Date().getTime() + '.jpg',
      CONFIG.DRIVE_ROOT + '_MPL_' + kode);
  }

  var isEdit = String(p.idAset || '').trim() !== '' && p.mode === 'edit';

  if (isEdit) {
    var patch = {
      Jenis: jenis,
      Merk: String(p.merk || ''),
      TglPembelian: String(p.tglPembelian || ''),
      Garansi: String(p.garansi || ''),
      Harga: Number(p.harga || 0),
      Lokasi: String(p.lokasi || ''),
      PIC: String(p.pic || ''),
      Vendor: String(p.vendor || ''),
      Kondisi: String(p.kondisi || 'Baik'),
      Keterangan: String(p.keterangan || ''),
      Diubah: now_(),
      DiubahOleh: String(me.Email)
    };
    if (foto) patch.FotoURL = foto;
    var ok = updateByKey_(sheetName, 'IDAset', String(p.idAset).trim(), patch);
    if (!ok) throw new Error('Aset MPL ' + p.idAset + ' tidak ditemukan.');
    logAct_('MPL ' + kode, 'Ubah aset MPL', p.idAset + ' — ' + jenis);
    return { idAset: String(p.idAset).trim(), mode: 'edit', unit: unit };
  }

  var id = nextMplId_(unit, kode);
  appendObj_(sheetName, HEAD.Mpl, {
    IDAset: id,
    Jenis: jenis,
    Merk: String(p.merk || ''),
    TglPembelian: String(p.tglPembelian || ''),
    Garansi: String(p.garansi || ''),
    Harga: Number(p.harga || 0),
    Lokasi: String(p.lokasi || ''),
    PIC: String(p.pic || ''),
    Vendor: String(p.vendor || ''),
    Kondisi: String(p.kondisi || 'Baik'),
    FotoURL: foto,
    Keterangan: String(p.keterangan || ''),
    Status: 'Aktif',
    Dibuat: now_(),
    DibuatOleh: String(me.Email),
    Diubah: '',
    DiubahOleh: ''
  });
  logAct_('MPL ' + kode, 'Tambah aset MPL', id + ' — ' + jenis);
  return { idAset: id, mode: 'baru', unit: unit };
}

function deleteMplAsset(deptKode, idAset) {
  var me = requireRole_(ROLE_FULL);
  var kode = String(deptKode || '').trim().toUpperCase();
  var id = String(idAset || '').trim();
  if (!kode || !id) throw new Error('Data aset MPL tidak lengkap.');
  var ok = updateByKey_(mplSheet_(kode), 'IDAset', id, {
    Status: 'Dihapus', Diubah: now_(), DiubahOleh: String(me.Email)
  });
  if (!ok) throw new Error('Aset MPL ' + id + ' tidak ditemukan.');
  logAct_('MPL ' + kode, 'Hapus aset MPL (soft delete)', id);
  return { ok: true };
}

/* =============================== MUTASI ASET (FASE 3) =============================== */

function sumberSheet_(sumber, deptKode) {
  return String(sumber).toUpperCase() === 'MPL' ? mplSheet_(deptKode) : asetSheet_(deptKode);
}

function nextMutasiId_() {
  var list = objs_(SH.MUTASI);
  var yy = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yy');
  var prefix = 'MUT-' + yy + '-';
  var max = 0;
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].IDMutasi || '');
    if (id.indexOf(prefix) === 0) {
      var n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

function findAsetRow_(sumber, deptKode, idAset) {
  var list = objs_(sumberSheet_(sumber, deptKode));
  var id = String(idAset).trim().toUpperCase();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].Status || '') === 'Dihapus') continue;
    if (String(list[i].IDAset || '').trim().toUpperCase() === id) return list[i];
  }
  return null;
}

function requestMutasi(payload) {
  var me = requireUser_();
  ensureSetup_();
  var p = payload || {};
  var sumber = String(p.sumber || 'DEPT').toUpperCase() === 'MPL' ? 'MPL' : 'DEPT';
  var dept = String(p.dept || '').trim().toUpperCase();
  var idAset = String(p.idAset || '').trim();
  var keLokasi = String(p.keLokasi || '').trim();
  var kePIC = String(p.kePIC || '').trim();
  var alasan = String(p.alasan || '').trim();

  if (!dept || !idAset) throw new Error('Data aset tidak lengkap.');
  if (!keLokasi && !kePIC) throw new Error('Isi minimal lokasi baru atau PIC baru.');
  if (!alasan) throw new Error('Alasan mutasi wajib diisi.');

  var aset = findAsetRow_(sumber, dept, idAset);
  if (!aset) throw new Error('Aset ' + idAset + ' tidak ditemukan di ' + sumberSheet_(sumber, dept) + '.');

  var existing = objs_(SH.MUTASI);
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].IDAset || '').trim().toUpperCase() === idAset.toUpperCase() &&
        String(existing[i].Status) === 'Pending') {
      throw new Error('Aset ini masih punya pengajuan mutasi yang menunggu keputusan (' + existing[i].IDMutasi + ').');
    }
  }

  var idm = nextMutasiId_();
  appendObj_(SH.MUTASI, HEAD.Mutasi, {
    IDMutasi: idm,
    IDAset: idAset,
    Sumber: sumber,
    Dept: dept,
    DariLokasi: String(aset.Lokasi || ''),
    KeLokasi: keLokasi,
    DariPIC: String(aset.PIC || ''),
    KePIC: kePIC,
    Alasan: alasan,
    Pemohon: String(me.Email),
    Status: 'Pending',
    Penyetuju: '',
    CatatanPenyetuju: '',
    TglAju: now_(),
    TglPutus: ''
  });

  logAct_('Mutasi Aset', 'Ajukan mutasi', idm + ' · ' + idAset + ' → ' + (keLokasi || '-') + ' / ' + (kePIC || '-'));
  notifyAdmins_('Pengajuan mutasi aset menunggu persetujuan',
    'Pengajuan mutasi baru di HAIMS:\n\n' +
    'No. pengajuan : ' + idm + '\n' +
    'Aset          : ' + idAset + ' (' + (sumber === 'MPL' ? 'MPL ' : '') + dept + ')\n' +
    'Lokasi        : ' + (aset.Lokasi || '-') + ' → ' + (keLokasi || '(tidak berubah)') + '\n' +
    'PIC           : ' + (aset.PIC || '-') + ' → ' + (kePIC || '(tidak berubah)') + '\n' +
    'Alasan        : ' + alasan + '\n' +
    'Pemohon       : ' + me.Nama + ' (' + me.Email + ')\n\n' +
    'Buka menu Mutasi Aset di HAIMS untuk menyetujui atau menolak.');

  return { idMutasi: idm };
}

function getMutasi(filter) {
  var me = requireUser_();
  ensureSetup_();
  sheet_(SH.MUTASI, HEAD.Mutasi);

  var f = String(filter || 'Pending');
  var full = ROLE_FULL.indexOf(String(me.Role)) > -1;
  var email = String(me.Email).toLowerCase();
  var list = objs_(SH.MUTASI);

  var out = [];
  var pending = 0;
  for (var i = list.length - 1; i >= 0; i--) {
    var m = list[i];
    if (!String(m.IDMutasi || '').trim()) continue;
    if (!full && String(m.Pemohon || '').toLowerCase() !== email) continue;   // User hanya melihat pengajuannya
    if (String(m.Status) === 'Pending') pending++;
    if (f !== 'Semua' && String(m.Status) !== f) continue;
    out.push({
      idMutasi: String(m.IDMutasi || ''),
      idAset: String(m.IDAset || ''),
      sumber: String(m.Sumber || 'DEPT'),
      dept: String(m.Dept || ''),
      dariLokasi: String(m.DariLokasi || ''),
      keLokasi: String(m.KeLokasi || ''),
      dariPIC: String(m.DariPIC || ''),
      kePIC: String(m.KePIC || ''),
      alasan: String(m.Alasan || ''),
      pemohon: String(m.Pemohon || ''),
      status: String(m.Status || ''),
      penyetuju: String(m.Penyetuju || ''),
      catatan: String(m.CatatanPenyetuju || ''),
      tglAju: String(m.TglAju || ''),
      tglPutus: String(m.TglPutus || '')
    });
  }
  return { items: out, pending: pending, canDecide: full };
}

function decideMutasi(idMutasi, keputusan, catatan) {
  var me = requireRole_(ROLE_FULL);
  var idm = String(idMutasi || '').trim();
  var kep = String(keputusan || '').trim();
  if (['Disetujui', 'Ditolak'].indexOf(kep) < 0) throw new Error('Keputusan tidak valid.');

  var list = objs_(SH.MUTASI);
  var row = null;
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].IDMutasi || '').trim() === idm) { row = list[i]; break; }
  }
  if (!row) throw new Error('Pengajuan ' + idm + ' tidak ditemukan.');
  if (String(row.Status) !== 'Pending') throw new Error('Pengajuan ini sudah berstatus ' + row.Status + '.');

  if (kep === 'Disetujui') {
    var sheetName = sumberSheet_(row.Sumber, row.Dept);
    var patch = { Diubah: now_(), DiubahOleh: String(me.Email) };
    if (String(row.KeLokasi || '').trim()) patch.Lokasi = String(row.KeLokasi);
    if (String(row.KePIC || '').trim()) patch.PIC = String(row.KePIC);
    var ok = updateByKey_(sheetName, 'IDAset', String(row.IDAset), patch);
    if (!ok) throw new Error('Aset ' + row.IDAset + ' tidak ditemukan lagi di ' + sheetName + '. Mutasi tidak diproses.');
  }

  updateByKey_(SH.MUTASI, 'IDMutasi', idm, {
    Status: kep,
    Penyetuju: String(me.Email),
    CatatanPenyetuju: String(catatan || ''),
    TglPutus: now_()
  });

  logAct_('Mutasi Aset', kep + ' mutasi', idm + ' · ' + row.IDAset +
    (kep === 'Disetujui' ? ' → lokasi/PIC aset diperbarui' : ''));

  try {
    MailApp.sendEmail({
      to: String(row.Pemohon),
      subject: 'Mutasi aset ' + row.IDAset + ' — ' + kep,
      body: 'Pengajuan mutasi Anda sudah diputuskan.\n\n' +
        'No. pengajuan : ' + idm + '\n' +
        'Aset          : ' + row.IDAset + '\n' +
        'Keputusan     : ' + kep + '\n' +
        'Diputuskan oleh : ' + me.Nama + ' (' + me.Email + ')\n' +
        (catatan ? 'Catatan       : ' + catatan + '\n' : '') +
        (kep === 'Disetujui' ? '\nLokasi dan PIC aset sudah diperbarui di database.\n' : '') +
        '\n— HAIMS, Hotel Asset Inventory'
    });
  } catch (err) { /* email opsional */ }

  return { ok: true, status: kep };
}

/* =============================== UTIL ID ASET (FASE 4) =============================== */

/**
 * Membaca kembali UNIT dan DEPT dari kode aset yang dihasilkan nextAssetId_/nextMplId_.
 * Format Departemen : UNIT-DEPT-YY-SEQ      (mis. APK-ENG-26-0001)
 * Format MPL         : UNIT-MPL-DEPT-YY-SEQ  (mis. APK-MPL-ENG-26-0001)
 */
function parseAssetId_(idAset) {
  var parts = String(idAset || '').toUpperCase().split('-');
  if (parts.length < 3) return null;
  if (parts[1] === 'MPL' && parts.length >= 4) {
    return { unit: parts[0], sumber: 'MPL', dept: parts[2] };
  }
  return { unit: parts[0], sumber: 'DEPT', dept: parts[1] };
}

/** Mengumpulkan semua aset aktif (Departemen + MPL) untuk unit tertentu, dengan filter lokasi opsional. */
function collectActiveAssets_(unitFilter, lokasiFilter) {
  var depts = getDepartments();
  var unit = String(unitFilter || '').toUpperCase();
  var lok = String(lokasiFilter || '').toLowerCase().trim();
  var out = [];

  /* Status 'Write-off' (FASE 5) disembunyikan dari semua daftar aktif, sama
     seperti 'Dihapus' — datanya tetap ada di sheet untuk jejak audit, hanya
     tidak lagi dianggap aset yang beroperasi. */
  function nonaktif_(st) { return st === 'Dihapus' || st === 'Write-off'; }

  for (var i = 0; i < depts.length; i++) {
    if (depts[i].status === 'Nonaktif') continue;
    var kode = depts[i].kode;

    var dl = objs_(asetSheet_(kode));
    for (var a = 0; a < dl.length; a++) {
      var x = dl[a];
      if (nonaktif_(String(x.Status || '')) || !String(x.IDAset || '').trim()) continue;
      if (unit && String(x.IDAset).toUpperCase().indexOf(unit + '-') !== 0) continue;
      if (lok && String(x.Lokasi || '').toLowerCase().indexOf(lok) < 0) continue;
      out.push({
        idAset: String(x.IDAset), sumber: 'DEPT', dept: kode, nama: String(x.Nama || ''),
        lokasi: String(x.Lokasi || ''), harga: Number(x.Harga || 0), tglPembelian: fmtDate_(x.TglPembelian),
        kondisi: String(x.Kondisi || 'Baik'), pic: String(x.PIC || ''), vendor: String(x.Vendor || ''),
        dibuat: String(x.Dibuat || '')
      });
    }

    var ml = objs_(mplSheet_(kode));
    for (var m = 0; m < ml.length; m++) {
      var y = ml[m];
      if (nonaktif_(String(y.Status || '')) || !String(y.IDAset || '').trim()) continue;
      if (unit && String(y.IDAset).toUpperCase().indexOf(unit + '-') !== 0) continue;
      if (lok && String(y.Lokasi || '').toLowerCase().indexOf(lok) < 0) continue;
      out.push({
        idAset: String(y.IDAset), sumber: 'MPL', dept: kode, nama: String(y.Jenis || ''),
        lokasi: String(y.Lokasi || ''), harga: Number(y.Harga || 0), tglPembelian: fmtDate_(y.TglPembelian),
        kondisi: String(y.Kondisi || 'Baik'), pic: String(y.PIC || ''), vendor: String(y.Vendor || ''),
        dibuat: String(y.Dibuat || '')
      });
    }
  }
  return out;
}

/* =============================== STOCK OPNAME (FASE 4) =============================== */

function nextOpnameId_() {
  var list = objs_(SH.OPNAME);
  var yy = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yy');
  var prefix = 'OP-' + yy + '-';
  var max = 0;
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].IDSesi || '');
    if (id.indexOf(prefix) === 0) {
      var n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 3) seq = '0' + seq;
  return prefix + seq;
}

function startOpname(payload) {
  var me = requireUser_();
  ensureSetup_();
  var p = payload || {};
  var unit = String(p.unit || '').trim().toUpperCase();
  if (!unit) throw new Error('Unit hotel wajib dipilih.');
  var lokasi = String(p.lokasi || '').trim();

  var existing = objs_(SH.OPNAME);
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].Status) === 'Berjalan' && String(existing[i].Petugas).toLowerCase() === String(me.Email).toLowerCase()) {
      throw new Error('Anda masih punya sesi opname berjalan (' + existing[i].IDSesi + '). Tutup sesi itu dulu.');
    }
  }

  var target = collectActiveAssets_(unit, lokasi).length;
  var id = nextOpnameId_();
  appendObj_(SH.OPNAME, HEAD.Opname, {
    IDSesi: id, Unit: unit, Lokasi: lokasi, Petugas: String(me.Email),
    Mulai: now_(), Selesai: '', TotalTarget: target, TotalScan: 0,
    Ditemukan: 0, TidakDitemukan: 0, Akurasi: '', Status: 'Berjalan'
  });
  logAct_('Stock Opname', 'Mulai sesi', id + ' · ' + unit + (lokasi ? ' · ' + lokasi : '') + ' · target ' + target);
  return getOpnameSession(id);
}

function getOpnameSession(idSesi) {
  var me = requireUser_();
  var id = String(idSesi || '').trim();
  var list = objs_(SH.OPNAME);
  var row = null;
  for (var i = 0; i < list.length; i++) if (String(list[i].IDSesi || '').trim() === id) { row = list[i]; break; }
  if (!row) throw new Error('Sesi opname ' + id + ' tidak ditemukan.');

  var det = objs_(SH.OPNAME_DETAIL);
  var items = [];
  for (var j = 0; j < det.length; j++) {
    if (String(det[j].IDSesi || '').trim() === id) {
      items.push({
        idAset: String(det[j].IDAset || ''), sumber: String(det[j].Sumber || ''),
        dept: String(det[j].Dept || ''), nama: String(det[j].Nama || ''),
        kondisiFisik: String(det[j].KondisiFisik || ''), catatan: String(det[j].Catatan || ''),
        waktu: String(det[j].Waktu || '')
      });
    }
  }
  items.sort(function (a, b) { return String(b.waktu).localeCompare(String(a.waktu)); });

  return {
    idSesi: String(row.IDSesi), unit: String(row.Unit), lokasi: String(row.Lokasi || ''),
    petugas: String(row.Petugas), mulai: String(row.Mulai), selesai: String(row.Selesai || ''),
    totalTarget: Number(row.TotalTarget || 0), totalScan: Number(row.TotalScan || 0),
    ditemukan: Number(row.Ditemukan || 0), tidakDitemukan: Number(row.TidakDitemukan || 0),
    akurasi: row.Akurasi === '' ? null : Number(row.Akurasi), status: String(row.Status || ''),
    items: items,
    canDecide: ROLE_FULL.indexOf(String(me.Role)) > -1 || String(row.Petugas).toLowerCase() === String(me.Email).toLowerCase()
  };
}

function scanOpnameAsset(idSesi, kodeAset, kondisiFisik, catatan) {
  var me = requireUser_();
  var id = String(idSesi || '').trim();
  var kode = String(kodeAset || '').trim().toUpperCase();
  if (!id || !kode) throw new Error('Kode sesi dan kode aset wajib diisi.');

  var sesiList = objs_(SH.OPNAME);
  var sesi = null;
  for (var i = 0; i < sesiList.length; i++) if (String(sesiList[i].IDSesi || '').trim() === id) { sesi = sesiList[i]; break; }
  if (!sesi) throw new Error('Sesi opname tidak ditemukan.');
  if (String(sesi.Status) !== 'Berjalan') throw new Error('Sesi ini sudah ditutup.');

  var det = objs_(SH.OPNAME_DETAIL);
  for (var d = 0; d < det.length; d++) {
    if (String(det[d].IDSesi || '').trim() === id && String(det[d].IDAset || '').trim().toUpperCase() === kode) {
      throw new Error('Aset ' + kode + ' sudah dipindai pada sesi ini.');
    }
  }

  var info = parseAssetId_(kode);
  if (!info) throw new Error('Format kode aset tidak dikenali: ' + kode);
  var aset = findAsetRow_(info.sumber, info.dept, kode);
  var nama = aset ? String(info.sumber === 'MPL' ? aset.Jenis : aset.Nama) : '(tidak ditemukan di database)';

  appendObj_(SH.OPNAME_DETAIL, HEAD.OpnameDetail, {
    IDSesi: id, IDAset: kode, Sumber: info.sumber, Dept: info.dept, Nama: nama,
    KondisiFisik: String(kondisiFisik || 'Baik'), Catatan: String(catatan || ''), Waktu: now_()
  });

  var ditemukanBaru = Number(sesi.Ditemukan || 0) + (aset ? 1 : 0);
  var totalScanBaru = Number(sesi.TotalScan || 0) + 1;
  updateByKey_(SH.OPNAME, 'IDSesi', id, { TotalScan: totalScanBaru, Ditemukan: ditemukanBaru });

  logAct_('Stock Opname', 'Pindai aset', id + ' · ' + kode + (aset ? '' : ' (tidak ada di database)'));
  return { idAset: kode, nama: nama, ditemukan: !!aset };
}

function closeOpname(idSesi) {
  var me = requireUser_();
  var id = String(idSesi || '').trim();
  var list = objs_(SH.OPNAME);
  var row = null;
  for (var i = 0; i < list.length; i++) if (String(list[i].IDSesi || '').trim() === id) { row = list[i]; break; }
  if (!row) throw new Error('Sesi opname tidak ditemukan.');
  if (String(row.Status) !== 'Berjalan') throw new Error('Sesi ini sudah ditutup.');
  if (ROLE_FULL.indexOf(String(me.Role)) < 0 && String(row.Petugas).toLowerCase() !== String(me.Email).toLowerCase()) {
    throw new Error('Hanya petugas sesi ini, Admin, atau Manager yang dapat menutupnya.');
  }

  var target = Number(row.TotalTarget || 0);
  var ditemukan = Number(row.Ditemukan || 0);
  var tidakDitemukan = Math.max(target - ditemukan, 0);
  var akurasi = target > 0 ? Math.round((ditemukan / target) * 1000) / 10 : 0;

  updateByKey_(SH.OPNAME, 'IDSesi', id, {
    Selesai: now_(), TidakDitemukan: tidakDitemukan, Akurasi: akurasi, Status: 'Selesai'
  });
  logAct_('Stock Opname', 'Tutup sesi', id + ' · akurasi ' + akurasi + '%');
  return getOpnameSession(id);
}

function listOpnameSessions() {
  requireUser_();
  var list = objs_(SH.OPNAME);
  var out = [];
  for (var i = list.length - 1; i >= 0; i--) {
    var r = list[i];
    if (!String(r.IDSesi || '').trim()) continue;
    out.push({
      idSesi: String(r.IDSesi), unit: String(r.Unit), lokasi: String(r.Lokasi || ''),
      petugas: String(r.Petugas), mulai: String(r.Mulai), selesai: String(r.Selesai || ''),
      totalTarget: Number(r.TotalTarget || 0), ditemukan: Number(r.Ditemukan || 0),
      tidakDitemukan: Number(r.TidakDitemukan || 0),
      akurasi: r.Akurasi === '' ? null : Number(r.Akurasi), status: String(r.Status || '')
    });
  }
  return out;
}

/* =============================== MAINTENANCE (FASE 4) =============================== */

function nextMaintId_() {
  var list = objs_(SH.MAINT);
  var yy = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yy');
  var prefix = 'SVC-' + yy + '-';
  var max = 0;
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].IDServis || '');
    if (id.indexOf(prefix) === 0) {
      var n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

function saveMaintenance(payload) {
  var me = requireUser_();
  ensureSetup_();
  var p = payload || {};
  var idAset = String(p.idAset || '').trim().toUpperCase();
  if (!idAset) throw new Error('Kode aset wajib diisi.');
  var jenis = String(p.jenis || '').trim();
  if (!jenis) throw new Error('Jenis pekerjaan wajib diisi.');
  var tglJadwal = String(p.tglJadwal || '').trim();
  if (!tglJadwal) throw new Error('Tanggal jadwal wajib diisi.');

  var info = parseAssetId_(idAset);
  if (!info) throw new Error('Format kode aset tidak dikenali: ' + idAset);
  var aset = findAsetRow_(info.sumber, info.dept, idAset);
  if (!aset) throw new Error('Aset ' + idAset + ' tidak ditemukan di database.');

  var isEdit = String(p.idServis || '').trim() !== '' && p.mode === 'edit';
  if (isEdit) {
    var patch = {
      Jenis: jenis, TglJadwal: tglJadwal, Vendor: String(p.vendor || '')
    };
    var ok = updateByKey_(SH.MAINT, 'IDServis', String(p.idServis).trim(), patch);
    if (!ok) throw new Error('Jadwal ' + p.idServis + ' tidak ditemukan.');
    logAct_('Maintenance', 'Ubah jadwal', p.idServis + ' · ' + idAset);
    return { idServis: String(p.idServis).trim(), mode: 'edit' };
  }

  var id = nextMaintId_();
  appendObj_(SH.MAINT, HEAD.Maintenance, {
    IDServis: id, IDAset: idAset, Sumber: info.sumber, Dept: info.dept, Jenis: jenis,
    TglJadwal: tglJadwal, TglRealisasi: '', Vendor: String(p.vendor || ''), Biaya: 0, Hasil: '',
    Status: 'Terjadwal', Dibuat: now_(), DibuatOleh: String(me.Email)
  });
  logAct_('Maintenance', 'Jadwalkan servis', id + ' · ' + idAset + ' · ' + tglJadwal);
  return { idServis: id, mode: 'baru' };
}

function completeMaintenance(idServis, payload) {
  var me = requireUser_();
  var id = String(idServis || '').trim();
  var p = payload || {};
  var list = objs_(SH.MAINT);
  var row = null;
  for (var i = 0; i < list.length; i++) if (String(list[i].IDServis || '').trim() === id) { row = list[i]; break; }
  if (!row) throw new Error('Jadwal ' + id + ' tidak ditemukan.');

  updateByKey_(SH.MAINT, 'IDServis', id, {
    TglRealisasi: String(p.tglRealisasi || now_().split(' ')[0]),
    Vendor: String(p.vendor || row.Vendor || ''),
    Biaya: Number(p.biaya || 0),
    Hasil: String(p.hasil || ''),
    Status: 'Selesai'
  });
  logAct_('Maintenance', 'Selesaikan servis', id + ' · ' + row.IDAset);
  return { ok: true };
}

function cancelMaintenance(idServis) {
  requireRole_(ROLE_FULL);
  var id = String(idServis || '').trim();
  var ok = updateByKey_(SH.MAINT, 'IDServis', id, { Status: 'Dibatalkan' });
  if (!ok) throw new Error('Jadwal ' + id + ' tidak ditemukan.');
  logAct_('Maintenance', 'Batalkan jadwal', id);
  return { ok: true };
}

function getMaintenance(filter) {
  requireUser_();
  ensureSetup_();
  var f = String(filter || 'Aktif');
  var list = objs_(SH.MAINT);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  var out = [];
  var akanDatang = 0, terlambat = 0;

  for (var i = list.length - 1; i >= 0; i--) {
    var r = list[i];
    if (!String(r.IDServis || '').trim()) continue;
    var tgl = fmtDate_(r.TglJadwal);
    var status = String(r.Status || 'Terjadwal');
    var terlambatFlag = status === 'Terjadwal' && tgl && tgl < today;
    if (status === 'Terjadwal') { if (terlambatFlag) terlambat++; else akanDatang++; }

    if (f === 'Aktif' && status !== 'Terjadwal') continue;
    if (f === 'Selesai' && status !== 'Selesai') continue;
    if (f === 'Terlambat' && !terlambatFlag) continue;

    out.push({
      idServis: String(r.IDServis), idAset: String(r.IDAset), sumber: String(r.Sumber || ''),
      dept: String(r.Dept || ''), jenis: String(r.Jenis || ''), tglJadwal: tgl,
      tglRealisasi: fmtDate_(r.TglRealisasi), vendor: String(r.Vendor || ''),
      biaya: Number(r.Biaya || 0), hasil: String(r.Hasil || ''), status: status, terlambat: terlambatFlag
    });
  }
  return { items: out, akanDatang: akanDatang, terlambat: terlambat };
}

/** Dipanggil manual atau lewat trigger harian — kirim ringkasan H-7 dan H-1. */
function sendMaintenanceReminders() {
  ensureSetup_();
  var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var h7 = Utilities.formatDate(new Date(new Date().getTime() + 7 * 86400000), tz, 'yyyy-MM-dd');
  var list = objs_(SH.MAINT);
  var due7 = [], due1 = [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (String(r.Status) !== 'Terjadwal') continue;
    var tgl = fmtDate_(r.TglJadwal);
    if (tgl === h7) due7.push(r);
    if (tgl === today) due1.push(r);
  }
  if (!due7.length && !due1.length) return { sent: false };

  var body = '';
  if (due1.length) {
    body += 'Jadwal HARI INI:\n' + due1.map(function (r) { return '- ' + r.IDAset + ' · ' + r.Jenis; }).join('\n') + '\n\n';
  }
  if (due7.length) {
    body += 'Jadwal 7 hari lagi:\n' + due7.map(function (r) { return '- ' + r.IDAset + ' · ' + r.Jenis; }).join('\n') + '\n\n';
  }
  notifyAdmins_('Pengingat jadwal maintenance HAIMS', body + '— HAIMS, Hotel Asset Inventory');
  logAct_('Maintenance', 'Kirim pengingat', due1.length + ' hari ini, ' + due7.length + ' H-7');
  return { sent: true, due1: due1.length, due7: due7.length };
}

/**
 * Jalankan SEKALI dari editor Apps Script untuk memasang pengingat harian jam 07:00.
 * Menghapus trigger lama bernama sama dulu supaya tidak dobel bila dijalankan ulang.
 */
function installDailyReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendMaintenanceReminders') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('sendMaintenanceReminders').timeBased().everyDays(1).atHour(7).create();
  return 'Trigger harian jam 07:00 terpasang untuk sendMaintenanceReminders().';
}

/* =============================== DEPRESIASI (FASE 4) =============================== */

function hitungDepresiasiSatu_(harga, tglPembelianStr, metode, masaManfaatBulan) {
  var harga_ = Number(harga || 0);
  var masa = Math.max(Number(masaManfaatBulan || 48), 1);
  var beli = tglPembelianStr ? new Date(tglPembelianStr) : null;
  if (!beli || isNaN(beli.getTime()) || harga_ <= 0) {
    return { umurBulan: 0, penyusutanBulan: 0, akumulasi: 0, nilaiBuku: harga_ };
  }
  var now = new Date();
  var umurBulan = (now.getFullYear() - beli.getFullYear()) * 12 + (now.getMonth() - beli.getMonth());
  if (umurBulan < 0) umurBulan = 0;
  var umurTerhitung = Math.min(umurBulan, masa);

  var penyusutanBulan, akumulasi;
  if (String(metode) === 'Saldo Menurun') {
    var rate = 2 / masa; // metode saldo menurun ganda (double declining balance)
    var buku = harga_;
    var akum = 0;
    for (var b = 0; b < umurTerhitung; b++) {
      var susut = buku * rate;
      if (akum + susut > harga_) susut = harga_ - akum;
      akum += susut;
      buku -= susut;
    }
    akumulasi = akum;
    penyusutanBulan = umurTerhitung > 0 ? (harga_ - buku) / umurTerhitung : 0;
  } else {
    penyusutanBulan = harga_ / masa;
    akumulasi = Math.min(penyusutanBulan * umurTerhitung, harga_);
  }
  var nilaiBuku = Math.max(harga_ - akumulasi, 0);
  return {
    umurBulan: umurBulan,
    penyusutanBulan: Math.round(penyusutanBulan),
    akumulasi: Math.round(akumulasi),
    nilaiBuku: Math.round(nilaiBuku)
  };
}

function refreshDepresiasi() {
  requireRole_(ROLE_FULL);
  ensureSetup_();
  var settings = getSettings();
  var metode = String(settings.metodeDepresiasi || 'Garis Lurus');
  var masa = Number(settings.masaManfaatBulan || 48);

  var semua = collectActiveAssets_('', '');
  var sh = sheet_(SH.DEPR, HEAD.Depresiasi);
  var existing = objs_(SH.DEPR);
  var byId = {};
  for (var e = 0; e < existing.length; e++) byId[String(existing[e].IDAset)] = existing[e].__row;

  var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  var cap = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');

  for (var i = 0; i < semua.length; i++) {
    var a = semua[i];
    var hasil = hitungDepresiasiSatu_(a.harga, a.tglPembelian, metode, masa);
    var rowVals = [
      a.idAset, a.sumber, a.dept, metode, a.harga, a.tglPembelian, hasil.umurBulan,
      hasil.penyusutanBulan, hasil.akumulasi, hasil.nilaiBuku, cap
    ];
    if (byId[a.idAset]) {
      sh.getRange(byId[a.idAset], 1, 1, rowVals.length).setValues([rowVals]);
    } else {
      sh.appendRow(rowVals);
    }
  }

  logAct_('Depresiasi', 'Hitung ulang', semua.length + ' aset · metode ' + metode + ' · masa manfaat ' + masa + ' bulan');
  return { ok: true, jumlah: semua.length, metode: metode, masaManfaatBulan: masa };
}

function getDepresiasi(deptKode) {
  requireUser_();
  var kode = String(deptKode || '').trim().toUpperCase();
  var list = objs_(SH.DEPR);
  var out = [];
  var totalPerolehan = 0, totalBuku = 0;
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (!String(r.IDAset || '').trim()) continue;
    if (kode && String(r.Dept || '').toUpperCase() !== kode) continue;
    totalPerolehan += Number(r.NilaiPerolehan || 0);
    totalBuku += Number(r.NilaiBuku || 0);
    out.push({
      idAset: String(r.IDAset), sumber: String(r.Sumber), dept: String(r.Dept),
      metode: String(r.Metode), nilaiPerolehan: Number(r.NilaiPerolehan || 0),
      umurBulan: Number(r.UmurBulan || 0), penyusutanBulan: Number(r.PenyusutanBulan || 0),
      akumulasi: Number(r.AkumulasiPenyusutan || 0), nilaiBuku: Number(r.NilaiBuku || 0),
      dihitungPada: String(r.DihitungPada || '')
    });
  }
  out.sort(function (a, b) { return String(b.dihitungPada).localeCompare(String(a.dihitungPada)); });
  return { items: out, totalPerolehan: totalPerolehan, totalBuku: totalBuku, dihitungPada: out.length ? out[0].dihitungPada : '' };
}

/* =============================== WRITE-OFF (FASE 5) =============================== */

/**
 * Karena sistem hanya mengenal 3 role (Admin/Manager/User), tiga tahap
 * persetujuan dipetakan begini supaya tetap berjenjang dan tercatat:
 *   Tahap Departemen — Manager dari departemen aset tsb, atau Admin (selalu boleh)
 *   Tahap GM         — Admin
 *   Tahap Finance    — Admin
 * Admin dengan demikian bisa menuntaskan seluruh tahap sendirian bila perlu,
 * tapi setiap tahap tetap tercatat terpisah dengan penyetuju & waktunya sendiri.
 */
function canDecideWriteOffStage_(me, wo, tahap) {
  if (String(me.Role) === 'Admin') return true;
  if (tahap === 'Dept') {
    return String(me.Role) === 'Manager' && String(me.Departemen).toUpperCase() === String(wo.Dept).toUpperCase();
  }
  return false; // tahap GM & Finance: Admin saja
}

function nextWriteOffId_() {
  var list = objs_(SH.WRITEOFF);
  var yy = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yy');
  var prefix = 'WO-' + yy + '-';
  var max = 0;
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].IDWO || '');
    if (id.indexOf(prefix) === 0) {
      var n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

function lastBookValue_(idAset) {
  var list = objs_(SH.DEPR);
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].IDAset || '').trim().toUpperCase() === String(idAset).toUpperCase()) {
      return Number(list[i].NilaiBuku || 0);
    }
  }
  return null;
}

function requestWriteOff(payload) {
  var me = requireUser_();
  ensureSetup_();
  var p = payload || {};
  var sumber = String(p.sumber || 'DEPT').toUpperCase() === 'MPL' ? 'MPL' : 'DEPT';
  var dept = String(p.dept || '').trim().toUpperCase();
  var idAset = String(p.idAset || '').trim();
  var alasan = String(p.alasan || '').trim();
  if (!dept || !idAset) throw new Error('Data aset tidak lengkap.');
  if (!alasan) throw new Error('Alasan penghapusan wajib diisi.');

  var aset = findAsetRow_(sumber, dept, idAset);
  if (!aset) throw new Error('Aset ' + idAset + ' tidak ditemukan atau sudah tidak aktif.');

  var existing = objs_(SH.WRITEOFF);
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].IDAset || '').trim().toUpperCase() === idAset.toUpperCase() &&
        ['Diajukan', 'Menunggu GM', 'Menunggu Finance'].indexOf(String(existing[i].Status)) > -1) {
      throw new Error('Aset ini masih punya pengajuan write-off berjalan (' + existing[i].IDWO + ').');
    }
  }

  var nilaiBuku = lastBookValue_(idAset);
  if (nilaiBuku === null) nilaiBuku = Number(aset.Harga || 0);

  var id = nextWriteOffId_();
  appendObj_(SH.WRITEOFF, HEAD.WriteOff, {
    IDWO: id, IDAset: idAset, Sumber: sumber, Dept: dept, Alasan: alasan,
    NilaiBukuTerakhir: nilaiBuku, Pemohon: String(me.Email),
    StatusDept: 'Menunggu', PenyetujuDept: '', CatatanDept: '',
    StatusGM: 'Menunggu', PenyetujuGM: '', CatatanGM: '',
    StatusFinance: 'Menunggu', PenyetujuFinance: '', CatatanFinance: '',
    Status: 'Diajukan', BAURL: '', TglAju: now_(), TglSelesai: ''
  });

  logAct_('Write-Off', 'Ajukan write-off', id + ' · ' + idAset + ' · ' + alasan);
  notifyAdmins_('Pengajuan write-off aset menunggu persetujuan',
    'Pengajuan write-off baru di HAIMS:\n\nNo. pengajuan : ' + id + '\nAset          : ' + idAset +
    ' (' + (sumber === 'MPL' ? 'MPL ' : '') + dept + ')\nNilai buku    : Rp ' + nilaiBuku +
    '\nAlasan        : ' + alasan + '\nPemohon       : ' + me.Nama + ' (' + me.Email + ')\n\n' +
    'Buka menu Write-Off Aset di HAIMS untuk memutuskan tahap Departemen.');
  return { idWO: id };
}

function getWriteOffs(filter) {
  var me = requireUser_();
  ensureSetup_();
  sheet_(SH.WRITEOFF, HEAD.WriteOff);
  var f = String(filter || 'Aktif');
  var full = ROLE_FULL.indexOf(String(me.Role)) > -1;
  var email = String(me.Email).toLowerCase();
  var list = objs_(SH.WRITEOFF);

  var out = [];
  for (var i = list.length - 1; i >= 0; i--) {
    var w = list[i];
    if (!String(w.IDWO || '').trim()) continue;
    if (!full && String(w.Pemohon || '').toLowerCase() !== email) continue;
    var status = String(w.Status || '');
    if (f === 'Aktif' && ['Diajukan', 'Menunggu GM', 'Menunggu Finance'].indexOf(status) < 0) continue;
    if (f === 'Selesai' && status !== 'Selesai') continue;
    if (f === 'Ditolak' && status !== 'Ditolak') continue;

    out.push({
      idWO: String(w.IDWO), idAset: String(w.IDAset), sumber: String(w.Sumber),
      dept: String(w.Dept), alasan: String(w.Alasan), nilaiBuku: Number(w.NilaiBukuTerakhir || 0),
      pemohon: String(w.Pemohon),
      statusDept: String(w.StatusDept), penyetujuDept: String(w.PenyetujuDept || ''), catatanDept: String(w.CatatanDept || ''),
      statusGM: String(w.StatusGM), penyetujuGM: String(w.PenyetujuGM || ''), catatanGM: String(w.CatatanGM || ''),
      statusFinance: String(w.StatusFinance), penyetujuFinance: String(w.PenyetujuFinance || ''), catatanFinance: String(w.CatatanFinance || ''),
      status: status, baURL: String(w.BAURL || ''), tglAju: String(w.TglAju), tglSelesai: String(w.TglSelesai || ''),
      canDept: canDecideWriteOffStage_(me, { Dept: w.Dept }, 'Dept') && String(w.StatusDept) === 'Menunggu' && status === 'Diajukan',
      canGM: canDecideWriteOffStage_(me, { Dept: w.Dept }, 'GM') && String(w.StatusGM) === 'Menunggu' && status === 'Menunggu GM',
      canFinance: canDecideWriteOffStage_(me, { Dept: w.Dept }, 'Finance') && String(w.StatusFinance) === 'Menunggu' && status === 'Menunggu Finance'
    });
  }
  return { items: out };
}

function decideWriteOff(idWO, tahap, keputusan, catatan) {
  var me = requireUser_();
  var id = String(idWO || '').trim();
  var stage = String(tahap || '').trim();
  var kep = String(keputusan || '').trim();
  if (['Dept', 'GM', 'Finance'].indexOf(stage) < 0) throw new Error('Tahap tidak valid.');
  if (['Setuju', 'Tolak'].indexOf(kep) < 0) throw new Error('Keputusan tidak valid.');

  var list = objs_(SH.WRITEOFF);
  var row = null;
  for (var i = 0; i < list.length; i++) if (String(list[i].IDWO || '').trim() === id) { row = list[i]; break; }
  if (!row) throw new Error('Pengajuan ' + id + ' tidak ditemukan.');
  if (!canDecideWriteOffStage_(me, row, stage)) throw new Error('Anda tidak berwenang memutuskan tahap ini.');

  var expectStatus = stage === 'Dept' ? 'Diajukan' : (stage === 'GM' ? 'Menunggu GM' : 'Menunggu Finance');
  if (String(row.Status) !== expectStatus) throw new Error('Pengajuan ini sedang berstatus ' + row.Status + ', bukan giliran tahap ' + stage + '.');

  var patch = {};
  patch['Status' + stage] = kep === 'Setuju' ? 'Disetujui' : 'Ditolak';
  patch['Penyetuju' + stage] = String(me.Email);
  patch['Catatan' + stage] = String(catatan || '');

  if (kep === 'Tolak') {
    patch.Status = 'Ditolak';
    patch.TglSelesai = now_();
  } else if (stage === 'Dept') {
    patch.Status = 'Menunggu GM';
  } else if (stage === 'GM') {
    patch.Status = 'Menunggu Finance';
  } else {
    patch.Status = 'Selesai';
    patch.TglSelesai = now_();
  }

  updateByKey_(SH.WRITEOFF, 'IDWO', id, patch);
  logAct_('Write-Off', kep + ' tahap ' + stage, id + ' · ' + row.IDAset);

  if (kep === 'Setuju' && stage === 'Finance') {
    // seluruh tahap lolos — nonaktifkan aset & terbitkan berita acara
    updateByKey_(sumberSheet_(row.Sumber, row.Dept), 'IDAset', String(row.IDAset), {
      Status: 'Write-off', Diubah: now_(), DiubahOleh: String(me.Email)
    });
    var full = Object.assign({}, row, patch);
    var baURL = '';
    try {
      baURL = generateBeritaAcaraWriteOff_(full);
      updateByKey_(SH.WRITEOFF, 'IDWO', id, { BAURL: baURL });
    } catch (err) {
      logAct_('Write-Off', 'Gagal membuat berita acara PDF', id + ' · ' + String(err && err.message ? err.message : err));
    }
    try {
      MailApp.sendEmail({
        to: String(row.Pemohon),
        subject: 'Write-off aset ' + row.IDAset + ' — Selesai',
        body: 'Write-off aset ' + row.IDAset + ' sudah disetujui seluruh tahap dan aset dinonaktifkan.\n\n' +
          (baURL ? 'Berita acara: ' + baURL + '\n\n' : '') + '— HAIMS, Hotel Asset Inventory'
      });
    } catch (err) { /* email opsional */ }
  } else if (kep === 'Tolak') {
    try {
      MailApp.sendEmail({
        to: String(row.Pemohon),
        subject: 'Write-off aset ' + row.IDAset + ' — Ditolak pada tahap ' + stage,
        body: 'Pengajuan write-off Anda ditolak pada tahap ' + stage + '.\n' +
          (catatan ? 'Catatan: ' + catatan + '\n' : '') + '\n— HAIMS, Hotel Asset Inventory'
      });
    } catch (err) { /* email opsional */ }
  }

  return { ok: true, status: patch.Status };
}

/** Menyusun dan menyimpan berita acara penghapusan aset sebagai PDF di Drive. */
function generateBeritaAcaraWriteOff_(wo) {
  var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  var doc = DocumentApp.create('BA-WriteOff-' + wo.IDWO);
  var body = doc.getBody();
  body.setMarginTop(56).setMarginBottom(56).setMarginLeft(56).setMarginRight(56);

  body.appendParagraph('BERITA ACARA PENGHAPUSAN ASET')
    .setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('Nomor: ' + wo.IDWO).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph(' ');
  body.appendParagraph('Pada hari ini, ' + Utilities.formatDate(new Date(), tz, 'dd MMMM yyyy') +
    ', telah dilakukan penghapusan aset milik hotel dengan rincian sebagai berikut:');
  body.appendParagraph(' ');

  var rows = [
    ['Kode Aset', String(wo.IDAset)],
    ['Sumber', wo.Sumber === 'MPL' ? 'MPL Asset' : 'Master Aset Departemen'],
    ['Departemen', String(wo.Dept)],
    ['Alasan Penghapusan', String(wo.Alasan)],
    ['Nilai Buku Terakhir', 'Rp ' + Number(wo.NilaiBukuTerakhir || 0).toLocaleString('id-ID')],
    ['Diajukan oleh', String(wo.Pemohon)],
    ['Disetujui Departemen', String(wo.PenyetujuDept || '-')],
    ['Disetujui General Manager', String(wo.PenyetujuGM || '-')],
    ['Disetujui Finance', String(wo.PenyetujuFinance || '-')],
    ['Tanggal Selesai', Utilities.formatDate(new Date(), tz, 'dd MMMM yyyy')]
  ];
  var table = body.appendTable(rows);
  for (var r = 0; r < table.getNumRows(); r++) {
    table.getRow(r).getCell(0).setWidth(180);
    table.getRow(r).getCell(0).editAsText().setBold(true);
  }

  body.appendParagraph(' ');
  body.appendParagraph('Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.');
  body.appendParagraph(' ');
  body.appendParagraph(' ');

  var sigTable = body.appendTable([['Departemen', 'General Manager', 'Finance'],
    ['', '', ''], ['', '', ''],
    ['( ' + (wo.PenyetujuDept || '_______________') + ' )',
     '( ' + (wo.PenyetujuGM || '_______________') + ' )',
     '( ' + (wo.PenyetujuFinance || '_______________') + ' )']]);
  for (var c = 0; c < 3; c++) sigTable.getRow(0).getCell(c).editAsText().setBold(true);

  doc.saveAndClose();
  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getAs('application/pdf').setName('BA-' + wo.IDWO + '.pdf');
  var folder = subFolder_(CONFIG.DRIVE_ROOT + '_WriteOff');
  var pdfFile = folder.createFile(pdfBlob);
  docFile.setTrashed(true); // dokumen sumber tidak perlu disimpan, cukup hasil PDF-nya
  try { pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) { /* opsional */ }
  return 'https://drive.google.com/file/d/' + pdfFile.getId() + '/view';
}

/* =============================== NOTIFIKASI BEL (FASE 5) =============================== */

function getNotifications() {
  var me = requireUser_();
  ensureSetup_();
  var full = ROLE_FULL.indexOf(String(me.Role)) > -1;
  var out = [];

  if (full) {
    var mut = objs_(SH.MUTASI);
    var mutPending = 0;
    for (var i = 0; i < mut.length; i++) if (String(mut[i].Status) === 'Pending') mutPending++;
    if (mutPending) out.push({ view: 'mutasi', label: 'Mutasi menunggu persetujuan', count: mutPending });

    var maint = getMaintenance('Terlambat');
    if (maint.items.length) out.push({ view: 'maint', label: 'Maintenance terlambat', count: maint.items.length });

    var users = objs_(SH.USERS);
    var menunggu = 0;
    for (var j = 0; j < users.length; j++) if (String(users[j].Status) === 'Menunggu') menunggu++;
    if (menunggu) out.push({ view: 'users', label: 'Pengguna menunggu aktivasi', count: menunggu });
  }

  var wo = objs_(SH.WRITEOFF);
  var woMine = 0;
  for (var k = 0; k < wo.length; k++) {
    var row = wo[k];
    if (canDecideWriteOffStage_(me, row, 'Dept') && String(row.StatusDept) === 'Menunggu' && String(row.Status) === 'Diajukan') woMine++;
    else if (canDecideWriteOffStage_(me, row, 'GM') && String(row.StatusGM) === 'Menunggu' && String(row.Status) === 'Menunggu GM') woMine++;
    else if (canDecideWriteOffStage_(me, row, 'Finance') && String(row.StatusFinance) === 'Menunggu' && String(row.Status) === 'Menunggu Finance') woMine++;
  }
  if (woMine) out.push({ view: 'writeoff', label: 'Write-off menunggu persetujuan', count: woMine });

  var total = 0;
  for (var n = 0; n < out.length; n++) total += out[n].count;
  return { items: out, total: total };
}

/* =============================== LAPORAN GABUNGAN (FASE 5) =============================== */

function getCombinedReport(opts) {
  requireUser_();
  ensureSetup_();
  var o = opts || {};
  var q = String(o.q || '').toLowerCase().trim();
  var sort = String(o.sort || 'terbaru');
  var unit = String(o.unit || '').toUpperCase();
  var sumberFilter = String(o.sumber || '').toUpperCase(); // '', 'DEPT', 'MPL'

  var all = collectActiveAssets_(unit, '');
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var a = all[i];
    if (sumberFilter && a.sumber !== sumberFilter) continue;
    if (q) {
      var hay = [a.idAset, a.nama, a.dept, a.lokasi, a.pic, a.vendor].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push(a);
  }

  out.sort(function (a, b) {
    if (sort === 'az') return a.nama.localeCompare(b.nama);
    if (sort === 'za') return b.nama.localeCompare(a.nama);
    if (sort === 'terlama') return String(a.dibuat).localeCompare(String(b.dibuat));
    if (sort === 'termahal') return b.harga - a.harga;
    return String(b.dibuat).localeCompare(String(a.dibuat));
  });

  var totalNilai = 0;
  for (var j = 0; j < out.length; j++) totalNilai += out[j].harga;

  return { items: out, total: out.length, totalNilai: totalNilai };
}

/* =============================== DASHBOARD =============================== */

function getDashboard(unitFilter) {
  requireUser_();
  var unit = String(unitFilter || '').toUpperCase();
  var depts = getDepartments();
  var perDept = [];
  var totalAset = 0;
  var totalNilai = 0;
  var perluServis = 0;
  var recent = [];
  var recentMpl = [];        // FASE 2
  var totalMpl = 0;          // FASE 2
  var totalNilaiMpl = 0;     // FASE 2

  for (var i = 0; i < depts.length; i++) {
    if (depts[i].status === 'Nonaktif') continue;
    var kode = depts[i].kode;
    var list = objs_(asetSheet_(kode));
    var jumlah = 0;
    var nilai = 0;
    for (var j = 0; j < list.length; j++) {
      var a = list[j];
      if (String(a.Status || '') === 'Dihapus') continue;
      if (!String(a.IDAset || '').trim()) continue;
      if (unit && String(a.IDAset).toUpperCase().indexOf(unit + '-') !== 0) continue;
      jumlah++;
      nilai += Number(a.Harga || 0);
      var kondisi = String(a.Kondisi || '');
      if (kondisi === 'Perlu Servis' || kondisi === 'Rusak') perluServis++;
      recent.push({
        idAset: String(a.IDAset || ''),
        nama: String(a.Nama || ''),
        dept: kode,
        lokasi: String(a.Lokasi || ''),
        harga: Number(a.Harga || 0),
        kondisi: kondisi || 'Baik',
        dibuat: String(a.Dibuat || '')
      });
    }
    /* FASE 2 — hitung aset MPL pada departemen yang sama */
    var mplList = objs_(mplSheet_(kode));
    var jumlahMpl = 0;
    var nilaiMpl = 0;
    for (var m = 0; m < mplList.length; m++) {
      var b = mplList[m];
      if (String(b.Status || '') === 'Dihapus') continue;
      if (!String(b.IDAset || '').trim()) continue;
      if (unit && String(b.IDAset).toUpperCase().indexOf(unit + '-') !== 0) continue;
      jumlahMpl++;
      nilaiMpl += Number(b.Harga || 0);
      var kondisiMpl = String(b.Kondisi || '');
      if (kondisiMpl === 'Perlu Servis' || kondisiMpl === 'Rusak') perluServis++;
      recentMpl.push({
        idAset: String(b.IDAset || ''),
        jenis: String(b.Jenis || ''),
        dept: kode,
        lokasi: String(b.Lokasi || ''),
        harga: Number(b.Harga || 0),
        kondisi: kondisiMpl || 'Baik',
        dibuat: String(b.Dibuat || '')
      });
    }
    totalMpl += jumlahMpl;
    totalNilaiMpl += nilaiMpl;

    totalAset += jumlah;
    totalNilai += nilai;
    perDept.push({
      kode: kode, nama: depts[i].nama, jumlah: jumlah, nilai: nilai,
      jumlahMpl: jumlahMpl, nilaiMpl: nilaiMpl
    });
  }

  recent.sort(function (a, b) { return String(b.dibuat).localeCompare(String(a.dibuat)); });
  recentMpl.sort(function (a, b) { return String(b.dibuat).localeCompare(String(a.dibuat)); });

  /* FASE 3 — jumlah pengajuan mutasi yang menunggu keputusan */
  var mutList = objs_(SH.MUTASI);
  var mutasiPending = 0;
  for (var mi = 0; mi < mutList.length; mi++) {
    if (String(mutList[mi].Status) === 'Pending') mutasiPending++;
  }

  /* FASE 4 — ringkasan maintenance & opname terakhir untuk dashboard */
  var maintRingkas = getMaintenance('Aktif');
  var sesiList = objs_(SH.OPNAME);
  var opnameTerakhir = null;
  for (var oi = sesiList.length - 1; oi >= 0; oi--) {
    if (String(sesiList[oi].Status) === 'Selesai') {
      opnameTerakhir = {
        idSesi: String(sesiList[oi].IDSesi), akurasi: Number(sesiList[oi].Akurasi || 0),
        selesai: String(sesiList[oi].Selesai || '')
      };
      break;
    }
  }

  var users = objs_(SH.USERS);
  var menunggu = 0;
  for (var k = 0; k < users.length; k++) if (String(users[k].Status) === 'Menunggu') menunggu++;

  return {
    totalAset: totalAset,
    totalNilai: totalNilai,
    perluServis: perluServis,
    jumlahDept: perDept.length,
    userMenunggu: menunggu,
    perDept: perDept,
    recent: recent.slice(0, 8),
    totalMpl: totalMpl,               // FASE 2
    totalNilaiMpl: totalNilaiMpl,     // FASE 2
    recentMpl: recentMpl.slice(0, 8), // FASE 2
    mutasiPending: mutasiPending,     // FASE 3
    maintTerlambat: maintRingkas.terlambat,   // FASE 4
    maintAkanDatang: maintRingkas.akanDatang,
    opnameTerakhir: opnameTerakhir
  };
}

/* =============================== ACTIVITIES LOG =============================== */

function getActivities(limit) {
  requireRole_(ROLE_FULL);
  var n = Number(limit || 200);
  var list = objs_(SH.LOG);
  var out = [];
  for (var i = list.length - 1; i >= 0 && out.length < n; i--) {
    out.push({
      waktu: String(list[i].Waktu || ''),
      email: String(list[i].Email || ''),
      role: String(list[i].Role || ''),
      modul: String(list[i].Modul || ''),
      aksi: String(list[i].Aksi || ''),
      detail: String(list[i].Detail || '')
    });
  }
  return out;
}

function logLogout() {
  try {
    logAct_('Autentikasi', 'Logout', currentEmail_());
  } catch (err) { /* diabaikan */ }
  return { ok: true };
}

/* =============================== DIAGNOSTIK =============================== */

/** Jalankan dari editor bila ada kejanggalan data/koneksi. */
function debugDiagnostic() {
  var out = { ok: true };
  try {
    var ss = ss_();
    out.spreadsheetId = ss.getId();
    out.spreadsheetName = ss.getName();
    out.url = ss.getUrl();
    var sheets = ss.getSheets();
    out.sheets = [];
    for (var i = 0; i < sheets.length; i++) out.sheets.push(sheets[i].getName() + ' (' + sheets[i].getLastRow() + ' baris)');
    out.executingUser = currentEmail_();
    out.hotels = getHotels();
    out.departments = getDepartments().length;
    out.users = objs_(SH.USERS).length;
    out.setupFlag = PropertiesService.getScriptProperties().getProperty(CONFIG.SETUP_FLAG);
  } catch (err) {
    out.ok = false;
    out.error = String(err && err.message ? err.message : err);
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}