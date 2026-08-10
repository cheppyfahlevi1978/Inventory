const db = require('../sheetsDb');
const auth = require('./auth');
const { SH, HEAD, ROLE_FULL, now } = require('../schema');

/** Pure calculation, no sheet access. */
function hitungDepresiasiSatu(harga, tglPembelianStr, metode, masaManfaatBulan) {
  const harga_ = Number(harga || 0);
  const masa = Math.max(Number(masaManfaatBulan || 48), 1);
  const beli = tglPembelianStr ? new Date(tglPembelianStr) : null;
  if (!beli || isNaN(beli.getTime()) || harga_ <= 0) {
    return { umurBulan: 0, penyusutanBulan: 0, akumulasi: 0, nilaiBuku: harga_ };
  }
  const nowD = new Date();
  let umurBulan = (nowD.getFullYear() - beli.getFullYear()) * 12 + (nowD.getMonth() - beli.getMonth());
  if (umurBulan < 0) umurBulan = 0;
  const umurTerhitung = Math.min(umurBulan, masa);

  let penyusutanBulan;
  let akumulasi;
  if (String(metode) === 'Saldo Menurun') {
    const rate = 2 / masa; // metode saldo menurun ganda (double declining balance)
    let buku = harga_;
    let akum = 0;
    for (let b = 0; b < umurTerhitung; b++) {
      let susut = buku * rate;
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
  const nilaiBuku = Math.max(harga_ - akumulasi, 0);
  return {
    umurBulan,
    penyusutanBulan: Math.round(penyusutanBulan),
    akumulasi: Math.round(akumulasi),
    nilaiBuku: Math.round(nilaiBuku),
  };
}

async function refreshDepresiasi(ctx) {
  await auth.requireRole(ctx, ROLE_FULL);
  await auth.ensureSetup();
  const master = require('./master');
  const settings = await master.getSettings();
  const metode = String(settings.metodeDepresiasi || 'Garis Lurus');
  const masa = Number(settings.masaManfaatBulan || 48);

  const mutasi = require('./mutasi');
  const semua = await mutasi.collectActiveAssets('', '');
  await db.ensureSheet(SH.DEPR, HEAD.Depresiasi);
  const existing = await db.objs(SH.DEPR);
  const byId = {};
  for (const e of existing) byId[String(e.IDAset)] = e.__row;

  const cap = now();

  for (const a of semua) {
    const hasil = hitungDepresiasiSatu(a.harga, a.tglPembelian, metode, masa);
    const rowObj = {
      IDAset: a.idAset, Sumber: a.sumber, Dept: a.dept, Metode: metode,
      NilaiPerolehan: a.harga, TglPembelian: a.tglPembelian, UmurBulan: hasil.umurBulan,
      PenyusutanBulan: hasil.penyusutanBulan, AkumulasiPenyusutan: hasil.akumulasi,
      NilaiBuku: hasil.nilaiBuku, DihitungPada: cap,
    };
    if (byId[a.idAset]) {
      await db.updateRow(SH.DEPR, byId[a.idAset], rowObj);
    } else {
      await db.appendObj(SH.DEPR, HEAD.Depresiasi, rowObj);
    }
  }

  await auth.logAct(ctx, 'Depresiasi', 'Hitung ulang', `${semua.length} aset · metode ${metode} · masa manfaat ${masa} bulan`);
  return { ok: true, jumlah: semua.length, metode, masaManfaatBulan: masa };
}

async function getDepresiasi(ctx, deptKode) {
  await auth.requireUser(ctx);
  const kode = String(deptKode || '').trim().toUpperCase();
  const list = await db.objs(SH.DEPR);
  const out = [];
  let totalPerolehan = 0;
  let totalBuku = 0;
  for (const r of list) {
    if (!String(r.IDAset || '').trim()) continue;
    if (kode && String(r.Dept || '').toUpperCase() !== kode) continue;
    totalPerolehan += Number(r.NilaiPerolehan || 0);
    totalBuku += Number(r.NilaiBuku || 0);
    out.push({
      idAset: String(r.IDAset), sumber: String(r.Sumber), dept: String(r.Dept),
      metode: String(r.Metode), nilaiPerolehan: Number(r.NilaiPerolehan || 0),
      umurBulan: Number(r.UmurBulan || 0), penyusutanBulan: Number(r.PenyusutanBulan || 0),
      akumulasi: Number(r.AkumulasiPenyusutan || 0), nilaiBuku: Number(r.NilaiBuku || 0),
      dihitungPada: String(r.DihitungPada || ''),
    });
  }
  out.sort((a, b) => String(b.dihitungPada).localeCompare(String(a.dihitungPada)));
  return { items: out, totalPerolehan, totalBuku, dihitungPada: out.length ? out[0].dihitungPada : '' };
}

module.exports = { hitungDepresiasiSatu, refreshDepresiasi, getDepresiasi };
