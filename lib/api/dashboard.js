const db = require('../sheetsDb');
const auth = require('./auth');
const master = require('./master');
const { SH, ROLE_FULL, asetSheet, mplSheet } = require('../schema');

async function getDashboard(ctx, unitFilter) {
  await auth.requireUser(ctx);
  const unit = String(unitFilter || '').toUpperCase();
  const depts = await master.getDepartments();
  const perDept = [];
  let totalAset = 0;
  let totalNilai = 0;
  let perluServis = 0;
  let recent = [];
  let recentMpl = [];
  let totalMpl = 0;
  let totalNilaiMpl = 0;

  for (const d of depts) {
    if (d.status === 'Nonaktif') continue;
    const kode = d.kode;
    const list = await db.objs(asetSheet(kode));
    let jumlah = 0;
    let nilai = 0;
    for (const a of list) {
      if (String(a.Status || '') === 'Dihapus') continue;
      if (!String(a.IDAset || '').trim()) continue;
      if (unit && String(a.IDAset).toUpperCase().indexOf(unit + '-') !== 0) continue;
      jumlah++;
      nilai += Number(a.Harga || 0);
      const kondisi = String(a.Kondisi || '');
      if (kondisi === 'Perlu Servis' || kondisi === 'Rusak') perluServis++;
      recent.push({
        idAset: String(a.IDAset || ''),
        nama: String(a.Nama || ''),
        dept: kode,
        lokasi: String(a.Lokasi || ''),
        harga: Number(a.Harga || 0),
        kondisi: kondisi || 'Baik',
        dibuat: String(a.Dibuat || ''),
      });
    }

    const mplList = await db.objs(mplSheet(kode));
    let jumlahMpl = 0;
    let nilaiMpl = 0;
    for (const b of mplList) {
      if (String(b.Status || '') === 'Dihapus') continue;
      if (!String(b.IDAset || '').trim()) continue;
      if (unit && String(b.IDAset).toUpperCase().indexOf(unit + '-') !== 0) continue;
      jumlahMpl++;
      nilaiMpl += Number(b.Harga || 0);
      const kondisiMpl = String(b.Kondisi || '');
      if (kondisiMpl === 'Perlu Servis' || kondisiMpl === 'Rusak') perluServis++;
      recentMpl.push({
        idAset: String(b.IDAset || ''),
        jenis: String(b.Jenis || ''),
        dept: kode,
        lokasi: String(b.Lokasi || ''),
        harga: Number(b.Harga || 0),
        kondisi: kondisiMpl || 'Baik',
        dibuat: String(b.Dibuat || ''),
      });
    }
    totalMpl += jumlahMpl;
    totalNilaiMpl += nilaiMpl;

    totalAset += jumlah;
    totalNilai += nilai;
    perDept.push({ kode, nama: d.nama, jumlah, nilai, jumlahMpl, nilaiMpl });
  }

  recent.sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat)));
  recentMpl.sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat)));

  const mutList = await db.objs(SH.MUTASI);
  const mutasiPending = mutList.filter((m) => String(m.Status) === 'Pending').length;

  const maintenance = require('./maintenance');
  const maintRingkas = await maintenance.getMaintenance(ctx, 'Aktif');
  const sesiList = await db.objs(SH.OPNAME);
  let opnameTerakhir = null;
  for (let oi = sesiList.length - 1; oi >= 0; oi--) {
    if (String(sesiList[oi].Status) === 'Selesai') {
      opnameTerakhir = {
        idSesi: String(sesiList[oi].IDSesi),
        akurasi: Number(sesiList[oi].Akurasi || 0),
        selesai: String(sesiList[oi].Selesai || ''),
      };
      break;
    }
  }

  const users = await db.objs(SH.USERS);
  const menunggu = users.filter((u) => String(u.Status) === 'Menunggu').length;

  return {
    totalAset,
    totalNilai,
    perluServis,
    jumlahDept: perDept.length,
    userMenunggu: menunggu,
    perDept,
    recent: recent.slice(0, 8),
    totalMpl,
    totalNilaiMpl,
    recentMpl: recentMpl.slice(0, 8),
    mutasiPending,
    maintTerlambat: maintRingkas.terlambat,
    maintAkanDatang: maintRingkas.akanDatang,
    opnameTerakhir,
  };
}

async function getNotifications(ctx) {
  const me = await auth.requireUser(ctx);
  await auth.ensureSetup();
  const full = ROLE_FULL.indexOf(String(me.Role)) > -1;
  const out = [];

  if (full) {
    const mut = await db.objs(SH.MUTASI);
    const mutPending = mut.filter((m) => String(m.Status) === 'Pending').length;
    if (mutPending) out.push({ view: 'mutasi', label: 'Mutasi menunggu persetujuan', count: mutPending });

    const maintenance = require('./maintenance');
    const maint = await maintenance.getMaintenance(ctx, 'Terlambat');
    if (maint.items.length) out.push({ view: 'maint', label: 'Maintenance terlambat', count: maint.items.length });

    const users = await db.objs(SH.USERS);
    const menunggu = users.filter((u) => String(u.Status) === 'Menunggu').length;
    if (menunggu) out.push({ view: 'users', label: 'Pengguna menunggu aktivasi', count: menunggu });
  }

  const writeoff = require('./writeoff');
  const wo = await db.objs(SH.WRITEOFF);
  let woMine = 0;
  for (const row of wo) {
    if (writeoff.canDecideWriteOffStage(me, row, 'Dept') && String(row.StatusDept) === 'Menunggu' && String(row.Status) === 'Diajukan') woMine++;
    else if (writeoff.canDecideWriteOffStage(me, row, 'GM') && String(row.StatusGM) === 'Menunggu' && String(row.Status) === 'Menunggu GM') woMine++;
    else if (writeoff.canDecideWriteOffStage(me, row, 'Finance') && String(row.StatusFinance) === 'Menunggu' && String(row.Status) === 'Menunggu Finance') woMine++;
  }
  if (woMine) out.push({ view: 'writeoff', label: 'Write-off menunggu persetujuan', count: woMine });

  const total = out.reduce((s, r) => s + r.count, 0);
  return { items: out, total };
}

async function getCombinedReport(ctx, opts) {
  await auth.requireUser(ctx);
  await auth.ensureSetup();
  const o = opts || {};
  const q = String(o.q || '').toLowerCase().trim();
  const sort = String(o.sort || 'terbaru');
  const unit = String(o.unit || '').toUpperCase();
  const sumberFilter = String(o.sumber || '').toUpperCase();

  const mutasi = require('./mutasi');
  const all = await mutasi.collectActiveAssets(unit, '');
  let out = [];
  for (const a of all) {
    if (sumberFilter && a.sumber !== sumberFilter) continue;
    if (q) {
      const hay = [a.idAset, a.nama, a.dept, a.lokasi, a.pic, a.vendor].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push(a);
  }

  out.sort((a, b) => {
    if (sort === 'az') return a.nama.localeCompare(b.nama);
    if (sort === 'za') return b.nama.localeCompare(a.nama);
    if (sort === 'terlama') return String(a.dibuat).localeCompare(String(b.dibuat));
    if (sort === 'termahal') return b.harga - a.harga;
    return String(b.dibuat).localeCompare(String(a.dibuat));
  });

  const totalNilai = out.reduce((s, r) => s + r.harga, 0);
  return { items: out, total: out.length, totalNilai };
}

async function getActivities(ctx, limit) {
  await auth.requireRole(ctx, ROLE_FULL);
  const n = Number(limit || 200);
  const list = await db.objs(SH.LOG);
  const out = [];
  for (let i = list.length - 1; i >= 0 && out.length < n; i--) {
    out.push({
      waktu: String(list[i].Waktu || ''),
      email: String(list[i].Email || ''),
      role: String(list[i].Role || ''),
      modul: String(list[i].Modul || ''),
      aksi: String(list[i].Aksi || ''),
      detail: String(list[i].Detail || ''),
    });
  }
  return out;
}

module.exports = { getDashboard, getNotifications, getCombinedReport, getActivities };
