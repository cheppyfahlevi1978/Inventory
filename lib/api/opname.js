const db = require('../sheetsDb');
const auth = require('./auth');
const { SH, HEAD, ROLE_FULL, now } = require('../schema');

async function nextOpnameId() {
  const list = await db.objs(SH.OPNAME);
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `OP-${yy}-`;
  let max = 0;
  for (const row of list) {
    const id = String(row.IDSesi || '');
    if (id.indexOf(prefix) === 0) {
      const n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  let seq = String(max + 1);
  while (seq.length < 3) seq = '0' + seq;
  return prefix + seq;
}

async function startOpname(ctx, payload) {
  const me = await auth.requireUser(ctx);
  await auth.ensureSetup();
  const p = payload || {};
  const unit = String(p.unit || '').trim().toUpperCase();
  if (!unit) throw new Error('Unit hotel wajib dipilih.');
  const lokasi = String(p.lokasi || '').trim();

  const existing = await db.objs(SH.OPNAME);
  for (const row of existing) {
    if (String(row.Status) === 'Berjalan' && String(row.Petugas).toLowerCase() === String(me.Email).toLowerCase()) {
      throw new Error(`Anda masih punya sesi opname berjalan (${row.IDSesi}). Tutup sesi itu dulu.`);
    }
  }

  const mutasi = require('./mutasi');
  const target = (await mutasi.collectActiveAssets(unit, lokasi)).length;
  const id = await nextOpnameId();
  await db.appendObj(SH.OPNAME, HEAD.Opname, {
    IDSesi: id, Unit: unit, Lokasi: lokasi, Petugas: String(me.Email),
    Mulai: now(), Selesai: '', TotalTarget: target, TotalScan: 0,
    Ditemukan: 0, TidakDitemukan: 0, Akurasi: '', Status: 'Berjalan',
  });
  await auth.logAct(ctx, 'Stock Opname', 'Mulai sesi', `${id} · ${unit}${lokasi ? ' · ' + lokasi : ''} · target ${target}`);
  return getOpnameSession(ctx, id);
}

async function getOpnameSession(ctx, idSesi) {
  const me = await auth.requireUser(ctx);
  const id = String(idSesi || '').trim();
  const list = await db.objs(SH.OPNAME);
  let row = null;
  for (const r of list) if (String(r.IDSesi || '').trim() === id) { row = r; break; }
  if (!row) throw new Error(`Sesi opname ${id} tidak ditemukan.`);

  const det = await db.objs(SH.OPNAME_DETAIL);
  const items = [];
  for (const d of det) {
    if (String(d.IDSesi || '').trim() === id) {
      items.push({
        idAset: String(d.IDAset || ''), sumber: String(d.Sumber || ''),
        dept: String(d.Dept || ''), nama: String(d.Nama || ''),
        kondisiFisik: String(d.KondisiFisik || ''), catatan: String(d.Catatan || ''),
        waktu: String(d.Waktu || ''),
      });
    }
  }
  items.sort((a, b) => String(b.waktu).localeCompare(String(a.waktu)));

  return {
    idSesi: String(row.IDSesi), unit: String(row.Unit), lokasi: String(row.Lokasi || ''),
    petugas: String(row.Petugas), mulai: String(row.Mulai), selesai: String(row.Selesai || ''),
    totalTarget: Number(row.TotalTarget || 0), totalScan: Number(row.TotalScan || 0),
    ditemukan: Number(row.Ditemukan || 0), tidakDitemukan: Number(row.TidakDitemukan || 0),
    akurasi: row.Akurasi === '' ? null : Number(row.Akurasi), status: String(row.Status || ''),
    items,
    canDecide: ROLE_FULL.indexOf(String(me.Role)) > -1 || String(row.Petugas).toLowerCase() === String(me.Email).toLowerCase(),
  };
}

async function scanOpnameAsset(ctx, idSesi, kodeAset, kondisiFisik, catatan) {
  await auth.requireUser(ctx);
  const id = String(idSesi || '').trim();
  const kode = String(kodeAset || '').trim().toUpperCase();
  if (!id || !kode) throw new Error('Kode sesi dan kode aset wajib diisi.');

  const sesiList = await db.objs(SH.OPNAME);
  let sesi = null;
  for (const r of sesiList) if (String(r.IDSesi || '').trim() === id) { sesi = r; break; }
  if (!sesi) throw new Error('Sesi opname tidak ditemukan.');
  if (String(sesi.Status) !== 'Berjalan') throw new Error('Sesi ini sudah ditutup.');

  const det = await db.objs(SH.OPNAME_DETAIL);
  for (const d of det) {
    if (String(d.IDSesi || '').trim() === id && String(d.IDAset || '').trim().toUpperCase() === kode) {
      throw new Error(`Aset ${kode} sudah dipindai pada sesi ini.`);
    }
  }

  const mutasi = require('./mutasi');
  const info = mutasi.parseAssetId(kode);
  if (!info) throw new Error(`Format kode aset tidak dikenali: ${kode}`);
  const aset = await mutasi.findAsetRow(info.sumber, info.dept, kode);
  const nama = aset ? String(info.sumber === 'MPL' ? aset.Jenis : aset.Nama) : '(tidak ditemukan di database)';

  await db.appendObj(SH.OPNAME_DETAIL, HEAD.OpnameDetail, {
    IDSesi: id, IDAset: kode, Sumber: info.sumber, Dept: info.dept, Nama: nama,
    KondisiFisik: String(kondisiFisik || 'Baik'), Catatan: String(catatan || ''), Waktu: now(),
  });

  const ditemukanBaru = Number(sesi.Ditemukan || 0) + (aset ? 1 : 0);
  const totalScanBaru = Number(sesi.TotalScan || 0) + 1;
  await db.updateByKey(SH.OPNAME, 'IDSesi', id, { TotalScan: totalScanBaru, Ditemukan: ditemukanBaru });

  await auth.logAct(ctx, 'Stock Opname', 'Pindai aset', `${id} · ${kode}${aset ? '' : ' (tidak ada di database)'}`);
  return { idAset: kode, nama, ditemukan: !!aset };
}

async function closeOpname(ctx, idSesi) {
  const me = await auth.requireUser(ctx);
  const id = String(idSesi || '').trim();
  const list = await db.objs(SH.OPNAME);
  let row = null;
  for (const r of list) if (String(r.IDSesi || '').trim() === id) { row = r; break; }
  if (!row) throw new Error('Sesi opname tidak ditemukan.');
  if (String(row.Status) !== 'Berjalan') throw new Error('Sesi ini sudah ditutup.');
  if (ROLE_FULL.indexOf(String(me.Role)) < 0 && String(row.Petugas).toLowerCase() !== String(me.Email).toLowerCase()) {
    throw new Error('Hanya petugas sesi ini, Admin, atau Manager yang dapat menutupnya.');
  }

  const target = Number(row.TotalTarget || 0);
  const ditemukan = Number(row.Ditemukan || 0);
  const tidakDitemukan = Math.max(target - ditemukan, 0);
  const akurasi = target > 0 ? Math.round((ditemukan / target) * 1000) / 10 : 0;

  await db.updateByKey(SH.OPNAME, 'IDSesi', id, {
    Selesai: now(), TidakDitemukan: tidakDitemukan, Akurasi: akurasi, Status: 'Selesai',
  });
  await auth.logAct(ctx, 'Stock Opname', 'Tutup sesi', `${id} · akurasi ${akurasi}%`);
  return getOpnameSession(ctx, id);
}

async function listOpnameSessions(ctx) {
  await auth.requireUser(ctx);
  const list = await db.objs(SH.OPNAME);
  const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (!String(r.IDSesi || '').trim()) continue;
    out.push({
      idSesi: String(r.IDSesi), unit: String(r.Unit), lokasi: String(r.Lokasi || ''),
      petugas: String(r.Petugas), mulai: String(r.Mulai), selesai: String(r.Selesai || ''),
      totalTarget: Number(r.TotalTarget || 0), ditemukan: Number(r.Ditemukan || 0),
      tidakDitemukan: Number(r.TidakDitemukan || 0),
      akurasi: r.Akurasi === '' ? null : Number(r.Akurasi), status: String(r.Status || ''),
    });
  }
  return out;
}

module.exports = { nextOpnameId, startOpname, getOpnameSession, scanOpnameAsset, closeOpname, listOpnameSessions };
