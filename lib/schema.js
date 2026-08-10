const CONFIG = {
  APP_NAME: 'HAIMS',
  DRIVE_ROOT: 'HAIMS_Uploads',
  OTP_MINUTES: 10,
  MAX_UPLOAD_BYTES: 1600 * 1024,
};

const SH = {
  USERS: 'Users',
  HOTELS: 'Hotels',
  DEPTS: 'Departments',
  SETTINGS: 'Settings',
  LOG: 'ActivitiesLog',
  OTP: 'OTP_Log',
  MUTASI: 'Mutasi',
  OPNAME: 'Opname',
  OPNAME_DETAIL: 'OpnameDetail',
  MAINT: 'Maintenance',
  DEPR: 'Depresiasi',
  WRITEOFF: 'WriteOff',
};

const HEAD = {
  Users: ['Email', 'Nama', 'Role', 'Unit', 'Departemen', 'FotoURL', 'PasswordHash', 'Status', 'Dibuat', 'DiubahOleh'],
  Hotels: ['Kode', 'Nama', 'Alamat', 'FotoURL', 'Status'],
  Departments: ['Kode', 'Nama', 'Unit', 'Kepala', 'Status'],
  Settings: ['Kunci', 'Nilai'],
  ActivitiesLog: ['Waktu', 'Email', 'Role', 'Modul', 'Aksi', 'Detail'],
  OTP_Log: ['Email', 'Kode', 'Kedaluwarsa', 'Dipakai'],
  Aset: [
    'IDAset', 'Nama', 'Kategori', 'Merk', 'TglPembelian', 'Garansi', 'Harga', 'Lokasi', 'PIC',
    'Kondisi', 'FotoURL', 'Vendor', 'Keterangan', 'Status', 'Dibuat', 'DibuatOleh', 'Diubah', 'DiubahOleh',
  ],
  Mutasi: [
    'IDMutasi', 'IDAset', 'Sumber', 'Dept', 'DariLokasi', 'KeLokasi', 'DariPIC', 'KePIC',
    'Alasan', 'Pemohon', 'Status', 'Penyetuju', 'CatatanPenyetuju', 'TglAju', 'TglPutus',
  ],
  Opname: [
    'IDSesi', 'Unit', 'Lokasi', 'Petugas', 'Mulai', 'Selesai', 'TotalTarget', 'TotalScan',
    'Ditemukan', 'TidakDitemukan', 'Akurasi', 'Status',
  ],
  OpnameDetail: ['IDSesi', 'IDAset', 'Sumber', 'Dept', 'Nama', 'KondisiFisik', 'Catatan', 'Waktu'],
  Maintenance: [
    'IDServis', 'IDAset', 'Sumber', 'Dept', 'Jenis', 'TglJadwal', 'TglRealisasi', 'Vendor',
    'Biaya', 'Hasil', 'Status', 'Dibuat', 'DibuatOleh',
  ],
  Depresiasi: [
    'IDAset', 'Sumber', 'Dept', 'Metode', 'NilaiPerolehan', 'TglPembelian', 'UmurBulan',
    'PenyusutanBulan', 'AkumulasiPenyusutan', 'NilaiBuku', 'DihitungPada',
  ],
  WriteOff: [
    'IDWO', 'IDAset', 'Sumber', 'Dept', 'Alasan', 'NilaiBukuTerakhir', 'Pemohon',
    'StatusDept', 'PenyetujuDept', 'CatatanDept',
    'StatusGM', 'PenyetujuGM', 'CatatanGM',
    'StatusFinance', 'PenyetujuFinance', 'CatatanFinance',
    'Status', 'BAURL', 'TglAju', 'TglSelesai',
  ],
  Mpl: [
    'IDAset', 'Jenis', 'Merk', 'TglPembelian', 'Garansi', 'Harga', 'Lokasi', 'PIC', 'Vendor',
    'Kondisi', 'FotoURL', 'Keterangan', 'Status', 'Dibuat', 'DibuatOleh', 'Diubah', 'DiubahOleh',
  ],
};

const SEED_HOTELS = [
  ['APK', 'ASTON Pekalongan', 'Pekalongan, Jawa Tengah', '', 'Aktif'],
  ['AMP', 'ASTON Mampang', 'Mampang Prapatan, Jakarta Selatan', '', 'Aktif'],
];

const SEED_DEPTS = [
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
  ['OTHERS', 'Lain-lain', 'ALL', '', 'Aktif'],
];

const SEED_SETTINGS = [
  ['bahasa', 'id'],
  ['font', 'Comfortaa'],
  ['tema', 'light'],
  ['emailNotifikasi', ''],
  ['metodeDepresiasi', 'Garis Lurus'],
  ['masaManfaatBulan', '48'],
  ['appTitle', 'HAIMS'],
  ['logoURL', ''],
  ['loginHeroTitle', ''],
  ['loginHeroSub', ''],
];

const ROLE_FULL = ['Admin', 'Manager'];

function asetSheet(kode) {
  return 'Aset_' + String(kode).toUpperCase();
}
function mplSheet(kode) {
  return 'MPL_' + String(kode).toUpperCase();
}
function now() {
  const tz = process.env.APP_TIMEZONE || 'Asia/Jakarta';
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = {};
  fmt.formatToParts(d).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

module.exports = {
  CONFIG, SH, HEAD, SEED_HOTELS, SEED_DEPTS, SEED_SETTINGS, ROLE_FULL,
  asetSheet, mplSheet, now,
};
