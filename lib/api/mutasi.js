const db = require('../sheetsDb');
const mailer = require('../mailer');
const auth = require('./auth');
const { SH, HEAD, ROLE_FULL, asetSheet, mplSheet, now } = require('../schema');
const { fmtDate } = require('./assets');

function sumberSheet(sumber, deptKode) {
  return String(sumber).toUpperCase() === 'MPL' ? mplSheet(deptKode) : asetSheet(deptKode);
}

async function nextMutasiId() {
  const list = await db.objs(SH.MUTASI);
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `MUT-${yy}-`;
  let max = 0;
  for (const row of list) {
    const id = String(row.IDMutasi || '');
    if (id.indexOf(prefix) === 0) {
      const n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  let seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

async function findAsetRow(sumber, deptKode, idAset) {
  const list = await db.objs(sumberSheet(sumber, deptKode));
  const id = String(idAset).trim().toUpperCase();
  for (const row of list) {
    if (String(row.Status || '') === 'Dihapus') continue;
    if (String(row.IDAset || '').trim().toUpperCase() === id) return row;
  }
  return null;
}

async function requestMutasi(ctx, payload) {
  const me = await auth.requireUser(ctx);
  await auth.ensureSetup();
  const p = payload || {};
  const sumber = String(p.sumber || 'DEPT').toUpperCase() === 'MPL' ? 'MPL' : 'DEPT';
  const dept = String(p.dept || '').trim().toUpperCase();
  const idAset = String(p.idAset || '').trim();
  const keLokasi = String(p.keLokasi || '').trim();
  const kePIC = String(p.kePIC || '').trim();
  const alasan = String(p.alasan || '').trim();

  if (!dept || !idAset) throw new Error('Data aset tidak lengkap.');
  if (!keLokasi && !kePIC) throw new Error('Isi minimal lokasi baru atau PIC baru.');
  if (!alasan) throw new Error('Alasan mutasi wajib diisi.');

  const aset = await findAsetRow(sumber, dept, idAset);
  if (!aset) throw new Error(`Aset ${idAset} tidak ditemukan di ${sumberSheet(sumber, dept)}.`);

  const existing = await db.objs(SH.MUTASI);
  for (const row of existing) {
    if (String(row.IDAset || '').trim().toUpperCase() === idAset.toUpperCase() && String(row.Status) === 'Pending') {
      throw new Error(`Aset ini masih punya pengajuan mutasi yang menunggu keputusan (${row.IDMutasi}).`);
    }
  }

  const idm = await nextMutasiId();
  await db.appendObj(SH.MUTASI, HEAD.Mutasi, {
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
    TglAju: now(),
    TglPutus: '',
  });

  await auth.logAct(ctx, 'Mutasi Aset', 'Ajukan mutasi', `${idm} · ${idAset} → ${keLokasi || '-'} / ${kePIC || '-'}`);
  await auth.notifyAdmins(
    'Pengajuan mutasi aset menunggu persetujuan',
    'Pengajuan mutasi baru di HAIMS:\n\n' +
      `No. pengajuan : ${idm}\n` +
      `Aset          : ${idAset} (${sumber === 'MPL' ? 'MPL ' : ''}${dept})\n` +
      `Lokasi        : ${aset.Lokasi || '-'} → ${keLokasi || '(tidak berubah)'}\n` +
      `PIC           : ${aset.PIC || '-'} → ${kePIC || '(tidak berubah)'}\n` +
      `Alasan        : ${alasan}\n` +
      `Pemohon       : ${me.Nama} (${me.Email})\n\n` +
      'Buka menu Mutasi Aset di HAIMS untuk menyetujui atau menolak.'
  );

  return { idMutasi: idm };
}

async function getMutasi(ctx, filter) {
  const me = await auth.requireUser(ctx);
  await auth.ensureSetup();
  await db.ensureSheet(SH.MUTASI, HEAD.Mutasi);

  const f = String(filter || 'Pending');
  const full = ROLE_FULL.indexOf(String(me.Role)) > -1;
  const email = String(me.Email).toLowerCase();
  const list = await db.objs(SH.MUTASI);

  const out = [];
  let pending = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!String(m.IDMutasi || '').trim()) continue;
    if (!full && String(m.Pemohon || '').toLowerCase() !== email) continue;
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
      tglPutus: String(m.TglPutus || ''),
    });
  }
  return { items: out, pending, canDecide: full };
}

async function decideMutasi(ctx, idMutasi, keputusan, catatan) {
  const me = await auth.requireRole(ctx, ROLE_FULL);
  const idm = String(idMutasi || '').trim();
  const kep = String(keputusan || '').trim();
  if (['Disetujui', 'Ditolak'].indexOf(kep) < 0) throw new Error('Keputusan tidak valid.');

  const list = await db.objs(SH.MUTASI);
  let row = null;
  for (const r of list) {
    if (String(r.IDMutasi || '').trim() === idm) { row = r; break; }
  }
  if (!row) throw new Error(`Pengajuan ${idm} tidak ditemukan.`);
  if (String(row.Status) !== 'Pending') throw new Error(`Pengajuan ini sudah berstatus ${row.Status}.`);

  if (kep === 'Disetujui') {
    const sheetName = sumberSheet(row.Sumber, row.Dept);
    const patch = { Diubah: now(), DiubahOleh: String(me.Email) };
    if (String(row.KeLokasi || '').trim()) patch.Lokasi = String(row.KeLokasi);
    if (String(row.KePIC || '').trim()) patch.PIC = String(row.KePIC);
    const ok = await db.updateByKey(sheetName, 'IDAset', String(row.IDAset), patch);
    if (!ok) throw new Error(`Aset ${row.IDAset} tidak ditemukan lagi di ${sheetName}. Mutasi tidak diproses.`);
  }

  await db.updateByKey(SH.MUTASI, 'IDMutasi', idm, {
    Status: kep,
    Penyetuju: String(me.Email),
    CatatanPenyetuju: String(catatan || ''),
    TglPutus: now(),
  });

  await auth.logAct(ctx, 'Mutasi Aset', `${kep} mutasi`, `${idm} · ${row.IDAset}` + (kep === 'Disetujui' ? ' → lokasi/PIC aset diperbarui' : ''));

  try {
    await mailer.sendMail(
      String(row.Pemohon),
      `Mutasi aset ${row.IDAset} — ${kep}`,
      'Pengajuan mutasi Anda sudah diputuskan.\n\n' +
        `No. pengajuan : ${idm}\n` +
        `Aset          : ${row.IDAset}\n` +
        `Keputusan     : ${kep}\n` +
        `Diputuskan oleh : ${me.Nama} (${me.Email})\n` +
        (catatan ? `Catatan       : ${catatan}\n` : '') +
        (kep === 'Disetujui' ? '\nLokasi dan PIC aset sudah diperbarui di database.\n' : '') +
        '\n— HAIMS, Hotel Asset Inventory'
    );
  } catch (err) { /* email opsional */ }

  return { ok: true, status: kep };
}

/**
 * Membaca kembali UNIT dan DEPT dari kode aset yang dihasilkan nextAssetId_/nextMplId_.
 * Format Departemen : UNIT-DEPT-YY-SEQ      (mis. APK-ENG-26-0001)
 * Format MPL         : UNIT-MPL-DEPT-YY-SEQ  (mis. APK-MPL-ENG-26-0001)
 */
function parseAssetId(idAset) {
  const parts = String(idAset || '').toUpperCase().split('-');
  if (parts.length < 3) return null;
  if (parts[1] === 'MPL' && parts.length >= 4) {
    return { unit: parts[0], sumber: 'MPL', dept: parts[2] };
  }
  return { unit: parts[0], sumber: 'DEPT', dept: parts[1] };
}

/** Mengumpulkan semua aset aktif (Departemen + MPL) untuk unit tertentu, dengan filter lokasi opsional. */
async function collectActiveAssets(unitFilter, lokasiFilter) {
  const master = require('./master');
  const depts = await master.getDepartments();
  const unit = String(unitFilter || '').toUpperCase();
  const lok = String(lokasiFilter || '').toLowerCase().trim();
  const out = [];

  function nonaktif(st) { return st === 'Dihapus' || st === 'Write-off'; }

  for (const d of depts) {
    if (d.status === 'Nonaktif') continue;
    const kode = d.kode;

    const dl = await db.objs(asetSheet(kode));
    for (const x of dl) {
      if (nonaktif(String(x.Status || '')) || !String(x.IDAset || '').trim()) continue;
      if (unit && String(x.IDAset).toUpperCase().indexOf(unit + '-') !== 0) continue;
      if (lok && String(x.Lokasi || '').toLowerCase().indexOf(lok) < 0) continue;
      out.push({
        idAset: String(x.IDAset), sumber: 'DEPT', dept: kode, nama: String(x.Nama || ''),
        lokasi: String(x.Lokasi || ''), harga: Number(x.Harga || 0), tglPembelian: fmtDate(x.TglPembelian),
        kondisi: String(x.Kondisi || 'Baik'), pic: String(x.PIC || ''), vendor: String(x.Vendor || ''),
        dibuat: String(x.Dibuat || ''),
      });
    }

    const ml = await db.objs(mplSheet(kode));
    for (const y of ml) {
      if (nonaktif(String(y.Status || '')) || !String(y.IDAset || '').trim()) continue;
      if (unit && String(y.IDAset).toUpperCase().indexOf(unit + '-') !== 0) continue;
      if (lok && String(y.Lokasi || '').toLowerCase().indexOf(lok) < 0) continue;
      out.push({
        idAset: String(y.IDAset), sumber: 'MPL', dept: kode, nama: String(y.Jenis || ''),
        lokasi: String(y.Lokasi || ''), harga: Number(y.Harga || 0), tglPembelian: fmtDate(y.TglPembelian),
        kondisi: String(y.Kondisi || 'Baik'), pic: String(y.PIC || ''), vendor: String(y.Vendor || ''),
        dibuat: String(y.Dibuat || ''),
      });
    }
  }
  return out;
}

module.exports = {
  sumberSheet, nextMutasiId, findAsetRow, requestMutasi, getMutasi, decideMutasi,
  parseAssetId, collectActiveAssets,
};
