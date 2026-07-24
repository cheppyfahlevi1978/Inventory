/*******************************************************
 * HAIMS - Hotel Asset Inventory Management System
 * FASE 1 + 2 + 3 + 4 + 5 (GABUNGAN) - Code.gs
 * Fase 1: Auth & Registrasi, Multi-Hotel, Pengaturan (Bahasa),
 *         Add User, Upload Foto+Resize, Master Aset, Lokasi, Dashboard
 * Fase 2: Mutasi Aset & Approval, ActivitiesLog, Modul Departement
 *         (sheet+folder Drive terpisah per sub-departemen)
 * Fase 3: Stock Opname (scan QR), statistik per departemen di Dashboard
 * Fase 4: Maintenance & Depresiasi Otomatis, Pengaturan Font & Tema
 * Fase 5: Write-Off + Berita Acara (PDF) + Notifikasi,
 *         Modul MPL (sheet+folder Drive terpisah per sub-MPL),
 *         Sorting A-Z / berdasarkan tanggal input di semua fitur
 *******************************************************/

// ID Spreadsheet database HAIMS — diambil dari URL yang diberikan:
// https://docs.google.com/spreadsheets/d/1tU6MJczT6T98X40nm2EVzHBuaSuq9gYHyVX8yo1zXSU/edit
var SPREADSHEET_ID = '1tU6MJczT6T98X40nm2EVzHBuaSuq9gYHyVX8yo1zXSU';
var SS = SpreadsheetApp.openById(SPREADSHEET_ID);
var DRIVE_FOLDER_NAME = 'HAIMS_Uploads';
var MAX_PHOTO_KB = 800;
var SUB_DEPARTEMEN = ['FO','HK','ENG','IT','FBP','FBS','SM','A&G','HR','ACCT','OTHERS'];
var DEPT_ASET_HEADERS = ['id_asset','departemen','qr_asset','tgl_pembelian','jenis_asset','garansi_asset',
  'lokasi_asset','merk_asset','harga_asset','pic_asset','description_asset','foto_url','hotel','dibuat_oleh','tgl_input'];
var MPL_ASET_HEADERS = ['id_asset','mpl','tgl_pembelian','jenis_asset','garansi_asset','merk_asset',
  'harga_asset','pic_asset','vendor_asset','foto_url','description_asset','hotel','dibuat_oleh','tgl_input'];

/* ============ ENTRY POINT ============ */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('HAIMS - Hotel Asset Inventory Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============ HELPER: nama sheet & folder per sub-departemen / sub-MPL ============ */
function sanitizeDeptCode_(dept) { return String(dept).replace(/[^A-Za-z0-9]/g, ''); }
function getDeptSheetName_(dept) { return 'Aset_' + sanitizeDeptCode_(dept); }
function getDeptFolderName_(dept) { return DRIVE_FOLDER_NAME + '_' + sanitizeDeptCode_(dept); }
function getMplSheetName_(dept) { return 'MPL_' + sanitizeDeptCode_(dept); }
function getMplFolderName_(dept) { return DRIVE_FOLDER_NAME + '_MPL_' + sanitizeDeptCode_(dept); }

/* ============ SETUP SPREADSHEET ============ */
function setupSpreadsheet() {
  createSheetIfMissing_('Users', ['email','nama','role','hotel_akses','foto_url','status','tgl_daftar']);
  createSheetIfMissing_('Hotels', ['kode_hotel','nama_hotel','alamat','foto_url','tgl_dibuat','dibuat_oleh']);
  createSheetIfMissing_('Settings', ['key','value']);
  createSheetIfMissing_('Kategori', ['nama_kategori','metode_depresiasi_default','umur_default_bulan']);
  createSheetIfMissing_('Lokasi', ['hotel','gedung','lantai','ruangan_outlet']);
  createSheetIfMissing_('Master_Aset', ['kode_aset','nama_aset','foto_url','kategori','brand_model','serial_number',
    'tgl_beli','harga_beli','vendor','hotel','gedung','lantai','ruangan','departemen','umur_ekonomis_bulan',
    'metode_depresiasi','status','qr_code','catatan']);
  createSheetIfMissing_('Riwayat_Mutasi', ['id_mutasi','kode_aset','dari_lokasi','ke_lokasi','diajukan_oleh',
    'tgl_pengajuan','alasan','status_approval','disetujui_oleh','tgl_approval','catatan']);
  createSheetIfMissing_('ActivitiesLog', ['timestamp','email','nama','aksi','detail']);

  SUB_DEPARTEMEN.forEach(function(dept){ createSheetIfMissing_(getDeptSheetName_(dept), DEPT_ASET_HEADERS); });
  migrasiAsetDepartemenLama_();

  createSheetIfMissing_('Stock_Opname_Sesi', ['id_sesi','nama_sesi','hotel','departemen','tgl_mulai','tgl_selesai','status','dibuat_oleh']);
  createSheetIfMissing_('Stock_Opname_Detail', ['id_sesi','kode_aset','ditemukan','kondisi_terbaru','foto_kondisi','catatan','waktu_scan','discan_oleh']);

  createSheetIfMissing_('Maintenance_Log', ['kode_aset','tgl_servis','jenis','biaya','vendor_teknisi','catatan','tgl_servis_berikutnya','dicatat_oleh']);
  createSheetIfMissing_('Depresiasi_Log', ['kode_aset','periode','nilai_awal','penyusutan_bulanan','nilai_buku','metode','tgl_hitung']);

  // FASE 5
  SUB_DEPARTEMEN.forEach(function(dept){ createSheetIfMissing_(getMplSheetName_(dept), MPL_ASET_HEADERS); });
  createSheetIfMissing_('WriteOff_Request', ['id_request','kode_aset','alasan','foto_bukti','diajukan_oleh','tgl_pengajuan',
    'status_dept','status_gm','status_finance','tgl_final','nomor_ba','link_ba']);
  createSheetIfMissing_('Notifikasi_Log', ['id_notif','tgl','ke_role','jenis','isi','dibaca']);

  seedDefaultHotels_();
  var setSh = SS.getSheetByName('Settings');
  if (setSh.getLastRow() < 2) setSh.appendRow(['default_language', 'id']);

  SpreadsheetApp.flush();
  return 'Setup selesai';
}

function migrasiAsetDepartemenLama_() {
  var oldSh = SS.getSheetByName('Aset_Departemen');
  if (!oldSh) return;
  var data = oldSh.getDataRange().getValues();
  if (data.length <= 1) return;
  for (var i = 1; i < data.length; i++) {
    var dept = data[i][1];
    if (!dept) continue;
    var targetSh = SS.getSheetByName(getDeptSheetName_(dept));
    if (!targetSh) continue;
    targetSh.appendRow([data[i][0], data[i][1], data[i][2], data[i][3], data[i][4], data[i][5], data[i][6],
      data[i][7], data[i][8], data[i][9], data[i][10], '', data[i][11], data[i][12], data[i][13]]);
  }
  oldSh.setName('Aset_Departemen_OLD_MIGRATED');
}

function createSheetIfMissing_(name, headers) {
  var sh = SS.getSheetByName(name);
  if (!sh) {
    sh = SS.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    var lastCol = sh.getLastColumn();
    if (lastCol < headers.length) sh.getRange(1, lastCol+1, 1, headers.length-lastCol).setValues([headers.slice(lastCol)]);
  }
  return sh;
}

function getRequiredSheetNames_() {
  var names = ['Users','Hotels','Settings','Kategori','Lokasi','Master_Aset','Riwayat_Mutasi',
    'ActivitiesLog','Stock_Opname_Sesi','Stock_Opname_Detail','Maintenance_Log',
    'Depresiasi_Log','WriteOff_Request','Notifikasi_Log'];
  SUB_DEPARTEMEN.forEach(function(dept){
    names.push(getDeptSheetName_(dept));
    names.push(getMplSheetName_(dept));
  });
  return names;
}

function readHotels_() {
  var sh = SS.getSheetByName('Hotels');
  if (!sh || sh.getLastRow() < 2) return [];
  var width = Math.max(sh.getLastColumn(), 6);
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, width).getDisplayValues();
  var out = [];
  var seen = {};
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var kode = String(row[0] || '').trim();
    var nama = String(row[1] || '').trim();
    if (!kode && !nama) continue;
    if (!nama) nama = kode;
    if (!kode) kode = (sanitizeDeptCode_(nama).substring(0, 6).toUpperCase() || ('HTL' + (out.length + 1)));
    var key = (kode + '|' + nama).toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push({
      kode: kode,
      nama: nama,
      alamat: String(row[2] || '').trim(),
      fotoUrl: String(row[3] || '').trim(),
      tglDibuat: row[4] || ''
    });
  }
  return out;
}

function seedDefaultHotels_() {
  var sh = SS.getSheetByName('Hotels') || createSheetIfMissing_('Hotels', ['kode_hotel','nama_hotel','alamat','foto_url','tgl_dibuat','dibuat_oleh']);
  if (readHotels_().length > 0) return;
  var now = new Date();
  sh.appendRow(['APK', 'ASTON Pekalongan', 'Pekalongan, Jawa Tengah', '', now, 'system']);
  sh.appendRow(['AMP', 'ASTON Mampang', 'Jakarta Selatan', '', now, 'system']);
}

function getSheetDataCount_(sheetName) {
  var sh = SS.getSheetByName(sheetName);
  return sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
}

function getSyncCounts_() {
  var counts = {
    users: getSheetDataCount_('Users'),
    hotels: readHotels_().length,
    lokasi: getSheetDataCount_('Lokasi'),
    masterAset: getSheetDataCount_('Master_Aset'),
    mutasi: getSheetDataCount_('Riwayat_Mutasi'),
    stockOpnameSesi: getSheetDataCount_('Stock_Opname_Sesi'),
    maintenance: getSheetDataCount_('Maintenance_Log'),
    depresiasi: getSheetDataCount_('Depresiasi_Log'),
    writeOff: getSheetDataCount_('WriteOff_Request'),
    notifikasi: getSheetDataCount_('Notifikasi_Log')
  };
  SUB_DEPARTEMEN.forEach(function(dept){
    counts['aset_' + sanitizeDeptCode_(dept)] = getSheetDataCount_(getDeptSheetName_(dept));
    counts['mpl_' + sanitizeDeptCode_(dept)] = getSheetDataCount_(getMplSheetName_(dept));
  });
  return counts;
}

function autoSync() {
  ensureSetup_();
  var hotels = readHotels_();
  if (hotels.length === 0) {
    seedDefaultHotels_();
    SpreadsheetApp.flush();
    hotels = readHotels_();
  }
  return {
    success: true,
    spreadsheetId: SPREADSHEET_ID,
    syncedAt: new Date(),
    hotels: hotels,
    settings: getSettings(),
    subDepartemen: SUB_DEPARTEMEN.slice(),
    counts: getSyncCounts_()
  };
}

/* ============ ACTIVITIES LOG ============ */
function logActivity_(aksi, detail) {
  try {
    var email = Session.getEffectiveUser().getEmail();
    var nama = email;
    var usersSh = SS.getSheetByName('Users');
    var data = usersSh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) { if (data[i][0] === email) { nama = data[i][1]; break; } }
    SS.getSheetByName('ActivitiesLog').appendRow([new Date(), email, nama, aksi, detail || '']);
  } catch (e) { }
}
function getActivitiesLog(limit) {
  var sh = SS.getSheetByName('ActivitiesLog');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = data.length - 1; i >= 1; i--) {
    out.push({ timestamp: data[i][0], email: data[i][1], nama: data[i][2], aksi: data[i][3], detail: data[i][4] });
    if (limit && out.length >= limit) break;
  }
  return out;
}

/* ============ AUTH & REGISTRASI ============ */
function checkSession() {
  ensureSetup_(); // auto-provisioning: pastikan semua sheet (termasuk Hotels berisi seed data) selalu ada
  var email = Session.getEffectiveUser().getEmail();
  if (!email) return { loggedIn: false };
  var usersSh = SS.getSheetByName('Users');
  var data = usersSh.getDataRange().getValues();
  var isFirstUser = (data.length <= 1);
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      if (data[i][5] !== 'Aktif') return { loggedIn: false, blocked: true };
      logActivity_('Login', 'User masuk ke aplikasi');
      return { loggedIn: true, registered: true,
        user: { email: data[i][0], nama: data[i][1], role: data[i][2], hotelAkses: data[i][3], fotoUrl: data[i][4] } };
    }
  }
  return { loggedIn: true, registered: false, email: email, isFirstUser: isFirstUser };
}
// Dipanggil otomatis setiap checkSession() — memastikan sheet Hotels (dan sheet inti lain) selalu
// tersedia + berisi seed data, sehingga dropdown "Unit Hotel" TIDAK PERNAH kosong meski spreadsheet
// yang dihubungkan (via SPREADSHEET_ID) masih baru / belum pernah dijalankan setupSpreadsheet() manual.
function ensureSetup_() {
  var missing = getRequiredSheetNames_().some(function(name){ return !SS.getSheetByName(name); });
  var hotelSh = SS.getSheetByName('Hotels');
  if (missing || !hotelSh || hotelSh.getLastRow() < 2) {
    setupSpreadsheet();
  }
}
function registerUser(payload) {
  payload = payload || {}; // guard: hindari crash jika dipanggil tanpa argumen (mis. testing manual di editor)
  var usersSh = SS.getSheetByName('Users');
  var data = usersSh.getDataRange().getValues();
  var isFirstUser = (data.length <= 1);
  var email = Session.getEffectiveUser().getEmail();
  for (var i = 1; i < data.length; i++) { if (data[i][0] === email) return { success: false, message: 'Email sudah terdaftar.' }; }
  var role = isFirstUser ? 'Admin' : payload.role;
  var fotoUrl = payload.fotoBase64 ? saveFotoToDrive_(payload.fotoBase64, payload.fotoName, DRIVE_FOLDER_NAME) : '';
  usersSh.appendRow([email, payload.nama || '', role, payload.hotelAkses || '', fotoUrl, 'Aktif', new Date()]);
  logActivity_('Registrasi', 'User baru mendaftar sebagai ' + role);
  return { success: true, role: role };
}
function doLogout() { logActivity_('Logout', 'User keluar dari aplikasi'); return true; }

/* ============ UPLOAD FOTO (auto resize di client + auto-sync Drive & Sheet) ============ */
function saveFotoToDrive_(base64Data, fileName, folderName) {
  // guard: hindari crash "Cannot read properties of undefined (reading 'substring')"
  // jika dipanggil tanpa data foto (mis. testing manual, atau field foto memang dikosongkan)
  if (!base64Data || typeof base64Data !== 'string' || base64Data.indexOf(',') === -1) return '';
  var folder = getOrCreateFolder_(folderName || DRIVE_FOLDER_NAME);
  var contentType = base64Data.substring(base64Data.indexOf(':')+1, base64Data.indexOf(';'));
  var bytes = Utilities.base64Decode(base64Data.split(',')[1]);
  var blob = Utilities.newBlob(bytes, contentType, fileName || ('foto_' + new Date().getTime() + '.jpg'));
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}
function uploadFotoPublic(base64Data, fileName) {
  if (!base64Data) return { success: false, message: 'Tidak ada data foto yang dikirim.' };
  var url = saveFotoToDrive_(base64Data, fileName, DRIVE_FOLDER_NAME);
  if (!url) return { success: false, message: 'Gagal memproses foto — format data tidak valid.' };
  return { success: true, url: url };
}
function getOrCreateFolder_(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

/* ============ MANAJEMEN USER ============ */
function getUsers() {
  var sh = SS.getSheetByName('Users');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    out.push({ row: i+1, email: data[i][0], nama: data[i][1], role: data[i][2],
      hotelAkses: data[i][3], fotoUrl: data[i][4], status: data[i][5], tglDaftar: data[i][6] });
  }
  return out;
}
function addUser(payload) {
  requireRole_(['Admin','Manager']);
  var sh = SS.getSheetByName('Users');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if (data[i][0] === payload.email) return { success: false, message: 'Email sudah terdaftar.' }; }
  var fotoUrl = payload.fotoBase64 ? saveFotoToDrive_(payload.fotoBase64, payload.fotoName, DRIVE_FOLDER_NAME) : '';
  sh.appendRow([payload.email, payload.nama, payload.role, payload.hotelAkses || '', fotoUrl, 'Aktif', new Date()]);
  logActivity_('Tambah User', payload.nama + ' (' + payload.role + ')');
  return { success: true };
}
function updateUserStatus(email, status) {
  requireRole_(['Admin','Manager']);
  var sh = SS.getSheetByName('Users');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) { sh.getRange(i+1, 6).setValue(status); logActivity_('Ubah Status User', email + ' -> ' + status); return { success: true }; }
  }
  return { success: false };
}
function requireRole_(allowedRoles) {
  var email = Session.getEffectiveUser().getEmail();
  var sh = SS.getSheetByName('Users');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      if (allowedRoles.indexOf(data[i][2]) === -1) throw new Error('Akses ditolak untuk role ini.');
      return true;
    }
  }
  throw new Error('User tidak terdaftar.');
}
function getCurrentUserInfo_() {
  var email = Session.getEffectiveUser().getEmail();
  var sh = SS.getSheetByName('Users');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if (data[i][0] === email) return { email: email, nama: data[i][1], role: data[i][2] }; }
  return { email: email, nama: email, role: null };
}

/* ============ MULTI-UNIT HOTEL ============ */
function getHotels() {
  ensureSetup_();
  var hotels = readHotels_();
  if (hotels.length === 0) {
    seedDefaultHotels_();
    SpreadsheetApp.flush();
    hotels = readHotels_();
  }
  return hotels;
}
function addHotel(payload) {
  ensureSetup_();
  requireRole_(['Admin','Manager']);
  var sh = SS.getSheetByName('Hotels');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if (data[i][0] === payload.kode) return { success: false, message: 'Kode unit sudah dipakai.' }; }
  var fotoUrl = payload.fotoBase64 ? saveFotoToDrive_(payload.fotoBase64, payload.fotoName, DRIVE_FOLDER_NAME) : '';
  sh.appendRow([payload.kode, payload.nama, payload.alamat || '', fotoUrl, new Date(), Session.getEffectiveUser().getEmail()]);
  SpreadsheetApp.flush();
  logActivity_('Tambah Unit Hotel', payload.nama);
  return { success: true };
}

/* ============ PENGATURAN ============ */
function getSettings() {
  var sh = SS.getSheetByName('Settings');
  var data = sh.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < data.length; i++) out[data[i][0]] = data[i][1];
  return out;
}
function updateSetting(key, value) {
  var sh = SS.getSheetByName('Settings');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if (data[i][0] === key) { sh.getRange(i+1, 2).setValue(value); return { success: true }; } }
  sh.appendRow([key, value]);
  return { success: true };
}

/* ============ MASTER LOKASI ============ */
function getLokasi() {
  var sh = SS.getSheetByName('Lokasi');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) out.push({ row:i+1, hotel:data[i][0], gedung:data[i][1], lantai:data[i][2], ruangan:data[i][3] });
  return out;
}
function addLokasi(payload) {
  var sh = SS.getSheetByName('Lokasi');
  sh.appendRow([payload.hotel, payload.gedung, payload.lantai, payload.ruangan]);
  logActivity_('Tambah Lokasi', payload.gedung + ' / ' + payload.lantai + ' / ' + payload.ruangan);
  return { success: true };
}

/* ============ MASTER ASET ============ */
function getAsetList(hotelFilter) {
  var sh = SS.getSheetByName('Master_Aset');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (hotelFilter && data[i][9] !== hotelFilter) continue;
    out.push({
      row: i+1, kode: data[i][0], nama: data[i][1], foto: data[i][2], kategori: data[i][3],
      brand: data[i][4], serial: data[i][5], tglBeli: data[i][6], harga: data[i][7], vendor: data[i][8],
      hotel: data[i][9], gedung: data[i][10], lantai: data[i][11], ruangan: data[i][12], departemen: data[i][13],
      umur: data[i][14], metodeDepresiasi: data[i][15], status: data[i][16], qr: data[i][17], catatan: data[i][18]
    });
  }
  return out;
}
function addAset(payload) {
  var sh = SS.getSheetByName('Master_Aset');
  var kode = generateKodeAset_(payload.hotel, payload.departemen, payload.kategori);
  var fotoUrl = payload.fotoBase64 ? saveFotoToDrive_(payload.fotoBase64, payload.fotoName, DRIVE_FOLDER_NAME) : '';
  sh.appendRow([kode, payload.nama, fotoUrl, payload.kategori, payload.brand, payload.serial,
    payload.tglBeli, payload.harga, payload.vendor, payload.hotel, payload.gedung, payload.lantai,
    payload.ruangan, payload.departemen, payload.umur, payload.metodeDepresiasi, 'Aktif', kode, payload.catatan || '']);
  logActivity_('Tambah Aset', kode + ' - ' + payload.nama);
  return { success: true, kode: kode };
}
function generateKodeAset_(hotel, dept, kategori) {
  var sh = SS.getSheetByName('Master_Aset');
  var data = sh.getDataRange().getValues();
  var prefix = (hotel||'HTL').substring(0,3).toUpperCase() + '-' + (dept||'GEN').substring(0,3).toUpperCase() + '-' + (kategori||'AST').substring(0,3).toUpperCase();
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).indexOf(prefix) === 0) {
      var num = parseInt(String(data[i][0]).split('-').pop(), 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return prefix + '-' + ('00000' + (maxNum+1)).slice(-5);
}

/* ============ DASHBOARD ============ */
function getDashboardData(hotelFilter) {
  var aset = getAsetList(hotelFilter);
  var totalNilai = 0, totalAset = aset.length, perDept = {};
  aset.forEach(function(a){ totalNilai += Number(a.harga) || 0; perDept[a.departemen] = (perDept[a.departemen] || 0) + 1; });
  var pendingMutasi = getMutasiList('Pending').length;
  return { totalNilai: totalNilai, totalAset: totalAset, perDept: perDept, hotels: getHotels(), pendingMutasi: pendingMutasi };
}
function getDeptStatistik() {
  var out = [];
  SUB_DEPARTEMEN.forEach(function(dept){
    var sh = SS.getSheetByName(getDeptSheetName_(dept));
    var jumlah = 0, totalNilai = 0;
    if (sh) {
      var data = sh.getDataRange().getValues();
      jumlah = data.length - 1;
      for (var i = 1; i < data.length; i++) totalNilai += Number(data[i][8]) || 0;
    }
    out.push({ departemen: dept, jumlah: jumlah, totalNilai: totalNilai });
  });
  return out;
}

/* =========================================================
 * FASE 2 — MUTASI ASET & APPROVAL WORKFLOW
 * ========================================================= */
function getMutasiList(statusFilter) {
  var sh = SS.getSheetByName('Riwayat_Mutasi');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (statusFilter && data[i][7] !== statusFilter) continue;
    out.push({ row:i+1, id: data[i][0], kodeAset: data[i][1], dari: data[i][2], ke: data[i][3],
      diajukanOleh: data[i][4], tglPengajuan: data[i][5], alasan: data[i][6], status: data[i][7],
      disetujuiOleh: data[i][8], tglApproval: data[i][9], catatan: data[i][10] });
  }
  return out.reverse();
}
function ajukanMutasi(payload) {
  var sh = SS.getSheetByName('Riwayat_Mutasi');
  var id = 'MUT-' + new Date().getTime();
  sh.appendRow([id, payload.kodeAset, payload.dariLokasi, payload.keLokasi, Session.getEffectiveUser().getEmail(),
    new Date(), payload.alasan, 'Pending', '', '', '']);
  logActivity_('Ajukan Mutasi', payload.kodeAset + ' -> ' + payload.keLokasi);
  pushNotifikasi_('Admin', 'Mutasi', 'Mutasi baru menunggu approval: ' + payload.kodeAset);
  return { success: true, id: id };
}
function prosesApprovalMutasi(idMutasi, keputusan, catatan) {
  requireRole_(['Admin','Manager']);
  var sh = SS.getSheetByName('Riwayat_Mutasi');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === idMutasi) {
      sh.getRange(i+1, 8).setValue(keputusan);
      sh.getRange(i+1, 9).setValue(Session.getEffectiveUser().getEmail());
      sh.getRange(i+1, 10).setValue(new Date());
      sh.getRange(i+1, 11).setValue(catatan || '');
      if (keputusan === 'Disetujui') updateLokasiAsetSetelahMutasi_(data[i][1], data[i][3]);
      logActivity_('Approval Mutasi', idMutasi + ' - ' + keputusan);
      return { success: true };
    }
  }
  return { success: false, message: 'Data mutasi tidak ditemukan.' };
}
function updateLokasiAsetSetelahMutasi_(kodeAset, keLokasi) {
  var sh = SS.getSheetByName('Master_Aset');
  var data = sh.getDataRange().getValues();
  var bagian = String(keLokasi).split('/');
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === kodeAset) {
      if (bagian[0] !== undefined) sh.getRange(i+1, 11).setValue(bagian[0].trim());
      if (bagian[1] !== undefined) sh.getRange(i+1, 12).setValue(bagian[1].trim());
      if (bagian[2] !== undefined) sh.getRange(i+1, 13).setValue(bagian[2].trim());
      break;
    }
  }
}

/* =========================================================
 * FASE 2 — MODUL DEPARTEMENT
 * ========================================================= */
function getSubDepartemenList() { return SUB_DEPARTEMEN; }

function getAsetDepartemen(departemen, hotelFilter, sortMode) {
  var sh = SS.getSheetByName(getDeptSheetName_(departemen));
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (hotelFilter && data[i][12] !== hotelFilter) continue;
    out.push({
      row: i+1, idAsset: data[i][0], departemen: data[i][1], qrAsset: data[i][2], tglPembelian: data[i][3],
      jenisAsset: data[i][4], garansi: data[i][5], lokasi: data[i][6], merk: data[i][7], harga: data[i][8],
      pic: data[i][9], description: data[i][10], fotoUrl: data[i][11], hotel: data[i][12], dibuatOleh: data[i][13], tglInput: data[i][14]
    });
  }
  return applySort_(out, sortMode, 'idAsset', 'tglInput');
}
function addAsetDepartemen(payload) {
  var sheetName = getDeptSheetName_(payload.departemen);
  var sh = SS.getSheetByName(sheetName);
  if (!sh) sh = createSheetIfMissing_(sheetName, DEPT_ASET_HEADERS);
  var idAsset = generateIdAssetDept_(payload.departemen);
  var fotoUrl = payload.fotoBase64 ? saveFotoToDrive_(payload.fotoBase64, payload.fotoName, getDeptFolderName_(payload.departemen)) : '';
  sh.appendRow([idAsset, payload.departemen, idAsset, payload.tglPembelian, payload.jenisAsset,
    payload.garansi, payload.lokasi, payload.merk, payload.harga, payload.pic, payload.description,
    fotoUrl, payload.hotel || '', Session.getEffectiveUser().getEmail(), new Date()]);
  SpreadsheetApp.flush();
  logActivity_('Tambah Aset Departemen', idAsset + ' (' + payload.departemen + ') -> sheet ' + sheetName);
  return { success: true, idAsset: idAsset };
}
function generateIdAssetDept_(departemen) {
  var sh = SS.getSheetByName(getDeptSheetName_(departemen));
  var data = sh.getDataRange().getValues();
  var prefix = 'AST-' + sanitizeDeptCode_(departemen);
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).indexOf(prefix) === 0) {
      var num = parseInt(String(data[i][0]).split('-').pop(), 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return prefix + '-' + ('0000' + (maxNum+1)).slice(-4);
}

/* =========================================================
 * FASE 5 — MODUL MPL (sheet & folder Drive terpisah per sub-MPL)
 * Field: ID ASSET, TGL PEMBELIAN, JENIS, GARANSI, MERK, HARGA,
 *        PIC, VENDOR, FOTO (auto resize+sync), DESCRIPTION
 * ========================================================= */
function getAsetMpl(mpl, hotelFilter, sortMode) {
  var sh = SS.getSheetByName(getMplSheetName_(mpl));
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (hotelFilter && data[i][11] !== hotelFilter) continue;
    out.push({
      row: i+1, idAsset: data[i][0], mpl: data[i][1], tglPembelian: data[i][2], jenisAsset: data[i][3],
      garansi: data[i][4], merk: data[i][5], harga: data[i][6], pic: data[i][7], vendor: data[i][8],
      fotoUrl: data[i][9], description: data[i][10], hotel: data[i][11], dibuatOleh: data[i][12], tglInput: data[i][13]
    });
  }
  return applySort_(out, sortMode, 'idAsset', 'tglInput');
}
function addAsetMpl(payload) {
  var sheetName = getMplSheetName_(payload.mpl);
  var sh = SS.getSheetByName(sheetName);
  if (!sh) sh = createSheetIfMissing_(sheetName, MPL_ASET_HEADERS);
  var idAsset = generateIdAssetMpl_(payload.mpl);
  var fotoUrl = payload.fotoBase64 ? saveFotoToDrive_(payload.fotoBase64, payload.fotoName, getMplFolderName_(payload.mpl)) : '';
  sh.appendRow([idAsset, payload.mpl, payload.tglPembelian, payload.jenisAsset, payload.garansi, payload.merk,
    payload.harga, payload.pic, payload.vendor, fotoUrl, payload.description, payload.hotel || '',
    Session.getEffectiveUser().getEmail(), new Date()]);
  SpreadsheetApp.flush(); // auto-sync ke sheet & Drive MPL terkait
  logActivity_('Tambah Aset MPL', idAsset + ' (' + payload.mpl + ') -> sheet ' + sheetName);
  return { success: true, idAsset: idAsset, fotoUrl: fotoUrl };
}
function generateIdAssetMpl_(mpl) {
  var sh = SS.getSheetByName(getMplSheetName_(mpl));
  var data = sh.getDataRange().getValues();
  var prefix = 'MPL-' + sanitizeDeptCode_(mpl);
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).indexOf(prefix) === 0) {
      var num = parseInt(String(data[i][0]).split('-').pop(), 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return prefix + '-' + ('0000' + (maxNum+1)).slice(-4);
}

/* ============ SORTING HELPER (A-Z & berdasarkan tanggal input) — dipakai di semua fitur ============ */
// sortMode: 'az' (alfabet A-Z berdasar field nama/kode), 'za', 'date_asc', 'date_desc' (default)
function applySort_(list, sortMode, nameField, dateField) {
  if (!sortMode || sortMode === 'date_desc') {
    return list.sort(function(a,b){ return new Date(b[dateField]) - new Date(a[dateField]); });
  }
  if (sortMode === 'date_asc') {
    return list.sort(function(a,b){ return new Date(a[dateField]) - new Date(b[dateField]); });
  }
  if (sortMode === 'az') {
    return list.sort(function(a,b){ return String(a[nameField]).localeCompare(String(b[nameField])); });
  }
  if (sortMode === 'za') {
    return list.sort(function(a,b){ return String(b[nameField]).localeCompare(String(a[nameField])); });
  }
  return list;
}
function getAllAssetsUnified_() {
  var out = [];
  var masterSh = SS.getSheetByName('Master_Aset');
  var masterData = masterSh.getDataRange().getValues();
  for (var i = 1; i < masterData.length; i++) out.push({ kode: masterData[i][0], nama: masterData[i][1], sumber: 'Master_Aset' });
  SUB_DEPARTEMEN.forEach(function(dept){
    var sh = SS.getSheetByName(getDeptSheetName_(dept));
    if (sh) {
      var data = sh.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) out.push({ kode: data[i][0], nama: data[i][4] || dept, sumber: getDeptSheetName_(dept) });
    }
    var mplSh = SS.getSheetByName(getMplSheetName_(dept));
    if (mplSh) {
      var mplData = mplSh.getDataRange().getValues();
      for (var j = 1; j < mplData.length; j++) out.push({ kode: mplData[j][0], nama: mplData[j][3] || dept, sumber: getMplSheetName_(dept) });
    }
  });
  return out;
}

/* =========================================================
 * FASE 3 — STOCK OPNAME
 * ========================================================= */
function buatSesiOpname(payload) {
  requireRole_(['Admin','Manager']);
  var sh = SS.getSheetByName('Stock_Opname_Sesi');
  var idSesi = 'OPN-' + new Date().getTime();
  sh.appendRow([idSesi, payload.namaSesi, payload.hotel || '', payload.departemen || '', payload.tglMulai,
    payload.tglSelesai || '', 'Aktif', Session.getEffectiveUser().getEmail()]);
  logActivity_('Buat Sesi Opname', payload.namaSesi);
  return { success: true, idSesi: idSesi };
}
function getSesiOpnameList() {
  var sh = SS.getSheetByName('Stock_Opname_Sesi');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    out.push({ id: data[i][0], nama: data[i][1], hotel: data[i][2], departemen: data[i][3],
      tglMulai: data[i][4], tglSelesai: data[i][5], status: data[i][6], dibuatOleh: data[i][7] });
  }
  return out.reverse();
}
function tutupSesiOpname(idSesi) {
  requireRole_(['Admin','Manager']);
  var sh = SS.getSheetByName('Stock_Opname_Sesi');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === idSesi) {
      sh.getRange(i+1, 7).setValue('Selesai');
      sh.getRange(i+1, 6).setValue(new Date());
      logActivity_('Tutup Sesi Opname', idSesi);
      return { success: true };
    }
  }
  return { success: false };
}
function scanOpname(payload) {
  var semuaAset = getAllAssetsUnified_();
  var ditemukan = semuaAset.some(function(a){ return a.kode === payload.kodeAset; });
  var fotoUrl = payload.fotoBase64 ? saveFotoToDrive_(payload.fotoBase64, payload.fotoName, DRIVE_FOLDER_NAME + '_Opname') : '';
  var sh = SS.getSheetByName('Stock_Opname_Detail');
  sh.appendRow([payload.idSesi, payload.kodeAset, ditemukan ? 'Y' : 'N', payload.kondisi || '', fotoUrl,
    payload.catatan || '', new Date(), Session.getEffectiveUser().getEmail()]);
  logActivity_('Scan Opname', payload.kodeAset + ' (' + (ditemukan ? 'ditemukan' : 'tidak dikenali') + ')');
  return { success: true, ditemukan: ditemukan };
}
function getHasilOpname(idSesi) {
  var sh = SS.getSheetByName('Stock_Opname_Detail');
  var data = sh.getDataRange().getValues();
  var scanned = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === idSesi) scanned.push({ kodeAset: data[i][1], ditemukan: data[i][2], kondisi: data[i][3], catatan: data[i][5], waktu: data[i][6] });
  }
  var totalScan = scanned.length;
  var totalDitemukan = scanned.filter(function(s){ return s.ditemukan === 'Y'; }).length;
  var akurasi = totalScan > 0 ? Math.round((totalDitemukan / totalScan) * 100) : 0;
  if (totalScan > 0 && (100 - akurasi) > 5) pushNotifikasi_('Admin', 'Opname', 'Selisih opname signifikan pada sesi ' + idSesi + ' (' + (100-akurasi) + '%)');
  return { scanned: scanned, totalScan: totalScan, totalDitemukan: totalDitemukan, akurasi: akurasi };
}

/* =========================================================
 * FASE 4 — MAINTENANCE & DEPRESIASI
 * ========================================================= */
function addMaintenance(payload) {
  var sh = SS.getSheetByName('Maintenance_Log');
  sh.appendRow([payload.kodeAset, payload.tglServis, payload.jenis, payload.biaya, payload.vendor,
    payload.catatan || '', payload.tglServisBerikutnya || '', Session.getEffectiveUser().getEmail()]);
  logActivity_('Catat Maintenance', payload.kodeAset + ' - ' + payload.jenis);
  return { success: true };
}
function getMaintenanceList() {
  var sh = SS.getSheetByName('Maintenance_Log');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    out.push({ row:i+1, kodeAset: data[i][0], tglServis: data[i][1], jenis: data[i][2], biaya: data[i][3],
      vendor: data[i][4], catatan: data[i][5], tglBerikutnya: data[i][6], dicatatOleh: data[i][7] });
  }
  return out.reverse();
}
function getMaintenanceDueSoon() {
  var list = getMaintenanceList();
  var now = new Date();
  var in7days = new Date(now.getTime() + 7*24*60*60*1000);
  var out = [];
  list.forEach(function(m){
    if (!m.tglBerikutnya) return;
    var tgl = new Date(m.tglBerikutnya);
    if (isNaN(tgl)) return;
    if (tgl <= in7days) out.push({ kodeAset: m.kodeAset, tglBerikutnya: m.tglBerikutnya, overdue: tgl < now });
  });
  if (out.length > 0) pushNotifikasi_('ChiefEngineering', 'Maintenance', out.length + ' aset butuh perhatian servis (H-7 / overdue)');
  return out;
}
function hitungDepresiasiBulanan() {
  var sh = SS.getSheetByName('Master_Aset');
  var data = sh.getDataRange().getValues();
  var depSh = SS.getSheetByName('Depresiasi_Log');
  var existing = depSh.getDataRange().getValues();
  var periode = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+7', 'yyyy-MM');
  var sudahDihitung = {};
  for (var j = 1; j < existing.length; j++) { if (existing[j][1] === periode) sudahDihitung[existing[j][0]] = true; }

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var kode = data[i][0], harga = Number(data[i][7]) || 0, umur = Number(data[i][14]) || 0, metode = data[i][15] || 'Garis Lurus';
    if (sudahDihitung[kode] || umur <= 0 || harga <= 0 || data[i][16] === 'Write-Off') continue;

    var penyusutanBulanan, nilaiBukuSaatIni;
    if (metode === 'Saldo Menurun') {
      var lastBookValue = getLastBookValue_(kode, harga);
      var rate = 2 / umur;
      penyusutanBulanan = lastBookValue * rate;
      nilaiBukuSaatIni = Math.max(0, lastBookValue - penyusutanBulanan);
    } else {
      penyusutanBulanan = harga / umur;
      var bulanBerjalan = getJumlahBulanTerhitung_(kode) + 1;
      nilaiBukuSaatIni = Math.max(0, harga - (penyusutanBulanan * bulanBerjalan));
    }
    depSh.appendRow([kode, periode, harga, penyusutanBulanan, nilaiBukuSaatIni, metode, new Date()]);
    count++;
  }
  logActivity_('Hitung Depresiasi', 'Periode ' + periode + ' - ' + count + ' aset diproses');
  return { success: true, periode: periode, jumlahDiproses: count };
}
function getLastBookValue_(kode, hargaAwal) {
  var depSh = SS.getSheetByName('Depresiasi_Log');
  var data = depSh.getDataRange().getValues();
  var last = hargaAwal;
  for (var i = 1; i < data.length; i++) { if (data[i][0] === kode) last = Number(data[i][4]) || last; }
  return last;
}
function getJumlahBulanTerhitung_(kode) {
  var depSh = SS.getSheetByName('Depresiasi_Log');
  var data = depSh.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) { if (data[i][0] === kode) count++; }
  return count;
}
function getDepresiasiSummary(hotelFilter) {
  var aset = getAsetList(hotelFilter);
  var depSh = SS.getSheetByName('Depresiasi_Log');
  var depData = depSh.getDataRange().getValues();
  var lastBookValueByKode = {};
  for (var i = 1; i < depData.length; i++) lastBookValueByKode[depData[i][0]] = Number(depData[i][4]);
  var totalHargaAwal = 0, totalNilaiBuku = 0;
  aset.forEach(function(a){
    totalHargaAwal += Number(a.harga) || 0;
    var nb = lastBookValueByKode.hasOwnProperty(a.kode) ? lastBookValueByKode[a.kode] : (Number(a.harga) || 0);
    totalNilaiBuku += nb;
  });
  return { totalHargaAwal: totalHargaAwal, totalNilaiBuku: totalNilaiBuku, totalPenyusutan: totalHargaAwal - totalNilaiBuku };
}
function getDepresiasiLogList(limit) {
  var sh = SS.getSheetByName('Depresiasi_Log');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = data.length - 1; i >= 1; i--) {
    out.push({ kode: data[i][0], periode: data[i][1], nilaiAwal: data[i][2], penyusutan: data[i][3], nilaiBuku: data[i][4], metode: data[i][5] });
    if (limit && out.length >= limit) break;
  }
  return out;
}
function buatTriggerDepresiasiBulanan() {
  ScriptApp.newTrigger('hitungDepresiasiBulanan').timeBased().onMonthDay(1).atHour(2).create();
  return 'Trigger bulanan berhasil dibuat (setiap tanggal 1 jam 02:00)';
}

/* =========================================================
 * FASE 5 — WRITE-OFF + BERITA ACARA (PDF) + NOTIFIKASI
 * ========================================================= */
function ajukanWriteOff(payload) {
  var sh = SS.getSheetByName('WriteOff_Request');
  var id = 'WO-' + new Date().getTime();
  var fotoUrl = payload.fotoBase64 ? saveFotoToDrive_(payload.fotoBase64, payload.fotoName, DRIVE_FOLDER_NAME + '_WriteOff') : '';
  sh.appendRow([id, payload.kodeAset, payload.alasan, fotoUrl, Session.getEffectiveUser().getEmail(), new Date(),
    'Pending', 'Pending', 'Pending', '', '', '']);
  logActivity_('Ajukan Write-Off', payload.kodeAset);
  pushNotifikasi_('Admin', 'WriteOff', 'Pengajuan write-off baru: ' + payload.kodeAset);
  return { success: true, id: id };
}
function getWriteOffList() {
  var sh = SS.getSheetByName('WriteOff_Request');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    out.push({ row:i+1, id: data[i][0], kodeAset: data[i][1], alasan: data[i][2], fotoUrl: data[i][3],
      diajukanOleh: data[i][4], tglPengajuan: data[i][5], statusDept: data[i][6], statusGm: data[i][7],
      statusFinance: data[i][8], tglFinal: data[i][9], nomorBa: data[i][10], linkBa: data[i][11] });
  }
  return out.reverse();
}
// tahap: 'dept' | 'gm' | 'finance'; keputusan: 'Disetujui' | 'Ditolak'
function approveWriteOff(id, tahap, keputusan) {
  requireRole_(['Admin','Manager']);
  var sh = SS.getSheetByName('WriteOff_Request');
  var data = sh.getDataRange().getValues();
  var colMap = { dept: 7, gm: 8, finance: 9 }; // 1-indexed kolom sheet
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sh.getRange(i+1, colMap[tahap]).setValue(keputusan);
      logActivity_('Approval Write-Off', id + ' (' + tahap + ') - ' + keputusan);

      var rowNow = sh.getRange(i+1, 1, 1, sh.getLastColumn()).getValues()[0];
      if (rowNow[6] === 'Disetujui' && rowNow[7] === 'Disetujui' && rowNow[8] === 'Disetujui') {
        finalisasiWriteOff_(i+1, rowNow[1]);
      }
      return { success: true };
    }
  }
  return { success: false, message: 'Data write-off tidak ditemukan.' };
}
function finalisasiWriteOff_(rowIndex, kodeAset) {
  var sh = SS.getSheetByName('WriteOff_Request');
  var hotel = getHotelFromKodeAset_(kodeAset);
  var nomorBa = generateNomorBa_(hotel);
  var linkBa = buatBeritaAcaraPdf_(kodeAset, nomorBa);

  sh.getRange(rowIndex, 10).setValue(new Date());
  sh.getRange(rowIndex, 11).setValue(nomorBa);
  sh.getRange(rowIndex, 12).setValue(linkBa);

  nonaktifkanAsetSetelahWriteOff_(kodeAset);
  logActivity_('Write-Off Final', kodeAset + ' -> BA ' + nomorBa);
  pushNotifikasi_('Admin', 'WriteOff', 'Write-off ' + kodeAset + ' selesai, BA: ' + nomorBa);
}
function getHotelFromKodeAset_(kodeAset) {
  var sh = SS.getSheetByName('Master_Aset');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if (data[i][0] === kodeAset) return data[i][9]; }
  return 'HTL';
}
function generateNomorBa_(hotel) {
  var tahun = new Date().getFullYear();
  var sh = SS.getSheetByName('WriteOff_Request');
  var data = sh.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) { if (String(data[i][10]).indexOf('BA/') === 0) count++; }
  var kodeHotel = sanitizeDeptCode_(hotel).substring(0,3).toUpperCase() || 'HTL';
  return 'BA/' + kodeHotel + '/' + tahun + '/' + ('000' + (count+1)).slice(-3);
}
function nonaktifkanAsetSetelahWriteOff_(kodeAset) {
  var sh = SS.getSheetByName('Master_Aset');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === kodeAset) { sh.getRange(i+1, 17).setValue('Write-Off'); break; }
  }
  var depSh = SS.getSheetByName('Depresiasi_Log');
  var periode = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+7', 'yyyy-MM');
  depSh.appendRow([kodeAset, periode, 0, 0, 0, 'Write-Off', new Date()]);
}
// Membuat dokumen Berita Acara sederhana lalu mengekspornya sebagai PDF ke Drive, mengembalikan link
function buatBeritaAcaraPdf_(kodeAset, nomorBa) {
  var aset = null;
  var sh = SS.getSheetByName('Master_Aset');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if (data[i][0] === kodeAset) { aset = data[i]; break; } }

  var doc = DocumentApp.create('Berita Acara Write-Off - ' + nomorBa);
  var body = doc.getBody();
  body.appendParagraph('BERITA ACARA PEMUSNAHAN / PELEPASAN ASET').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Nomor: ' + nomorBa);
  body.appendParagraph('Tanggal: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+7', 'dd MMMM yyyy'));
  body.appendParagraph(' ');
  body.appendParagraph('Kode Aset: ' + kodeAset);
  if (aset) {
    body.appendParagraph('Nama Aset: ' + aset[1]);
    body.appendParagraph('Hotel: ' + aset[9]);
    body.appendParagraph('Departemen: ' + aset[13]);
    body.appendParagraph('Harga Beli: Rp ' + aset[7]);
  }
  body.appendParagraph(' ');
  body.appendParagraph('Dengan ini dinyatakan bahwa aset tersebut di atas telah disetujui untuk dilepas/dimusnahkan ' +
    'melalui proses persetujuan berjenjang (Departemen, General Manager, Finance) sesuai prosedur HAIMS.');
  body.appendParagraph(' ');
  body.appendParagraph('Disetujui oleh: Departemen, General Manager, Finance');
  doc.saveAndClose();

  var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
  var folder = getOrCreateFolder_(DRIVE_FOLDER_NAME + '_BeritaAcara');
  var pdfFile = folder.createFile(pdfBlob).setName('BA_' + nomorBa.replace(/\//g,'_') + '.pdf');
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  DriveApp.getFileById(doc.getId()).setTrashed(true); // buang file Google Docs mentah, sisakan PDF saja
  return pdfFile.getUrl();
}

/* ============ NOTIFIKASI ============ */
function pushNotifikasi_(keRole, jenis, isi) {
  try {
    var sh = SS.getSheetByName('Notifikasi_Log');
    sh.appendRow(['NOTIF-' + new Date().getTime(), new Date(), keRole, jenis, isi, 'N']);
  } catch (e) { }
}
function getNotifikasi(limit) {
  var sh = SS.getSheetByName('Notifikasi_Log');
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = data.length - 1; i >= 1; i--) {
    out.push({ id: data[i][0], tgl: data[i][1], keRole: data[i][2], jenis: data[i][3], isi: data[i][4], dibaca: data[i][5] });
    if (limit && out.length >= limit) break;
  }
  return out;
}
function getUnreadNotifCount() {
  var sh = SS.getSheetByName('Notifikasi_Log');
  var data = sh.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) { if (data[i][5] !== 'Y') count++; }
  return count;
}
function markAllNotifRead() {
  var sh = SS.getSheetByName('Notifikasi_Log');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if (data[i][5] !== 'Y') sh.getRange(i+1, 6).setValue('Y'); }
  return { success: true };
}

/* ============ LAPORAN GABUNGAN TERURUT (A-Z / Tanggal) — semua fitur ============ */
// Menggabungkan seluruh hasil input (Master Aset, tiap sub-Departemen, tiap sub-MPL) menjadi satu daftar,
// bisa diurutkan A-Z (nama/kode) atau berdasarkan tanggal input, untuk keperluan audit/laporan.
function getGabunganSemuaInput(sortMode) {
  var out = [];
  var master = getAsetList(null);
  master.forEach(function(a){ out.push({ sumber: 'Master Aset', kode: a.kode, nama: a.nama, tglInput: a.tglBeli }); });

  SUB_DEPARTEMEN.forEach(function(dept){
    getAsetDepartemen(dept, null, 'date_desc').forEach(function(a){
      out.push({ sumber: 'Departement - ' + dept, kode: a.idAsset, nama: a.jenisAsset || a.idAsset, tglInput: a.tglInput });
    });
    getAsetMpl(dept, null, 'date_desc').forEach(function(a){
      out.push({ sumber: 'MPL - ' + dept, kode: a.idAsset, nama: a.jenisAsset || a.idAsset, tglInput: a.tglInput });
    });
  });

  return applySort_(out, sortMode, 'nama', 'tglInput');
}
