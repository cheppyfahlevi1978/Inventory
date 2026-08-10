const db = require('../sheetsDb');
const drive = require('../drive');
const auth = require('./auth');
const { CONFIG, HEAD, ROLE_FULL, mplSheet, now } = require('../schema');
const { fmtDate } = require('./assets');

async function nextMplId(unit, deptKode) {
  const list = await db.objs(mplSheet(deptKode));
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `${String(unit || 'APK').toUpperCase()}-MPL-${String(deptKode).toUpperCase()}-${yy}-`;
  let max = 0;
  for (const row of list) {
    const id = String(row.IDAset || '');
    if (id.indexOf(prefix) === 0) {
      const n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  let seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

async function getMplAssets(ctx, deptKode, opts) {
  const u = await auth.requireUser(ctx);
  const kode = String(deptKode || '').trim().toUpperCase();
  if (!kode) throw new Error('Departemen tidak valid.');
  await db.ensureSheet(mplSheet(kode), HEAD.Mpl);

  const o = opts || {};
  const q = String(o.q || '').toLowerCase().trim();
  const sort = String(o.sort || 'terbaru');
  const unitFilter = String(o.unit || '').toUpperCase();

  const list = await db.objs(mplSheet(kode));
  let out = [];
  for (const a of list) {
    if (String(a.Status || '') === 'Dihapus' || String(a.Status || '') === 'Write-off') continue;
    if (!String(a.IDAset || '').trim()) continue;
    if (unitFilter && String(a.IDAset).toUpperCase().indexOf(unitFilter + '-') !== 0) continue;
    if (q) {
      const hay = [a.IDAset, a.Jenis, a.Merk, a.Lokasi, a.PIC, a.Vendor, a.Keterangan].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push({
      idAset: String(a.IDAset || ''),
      jenis: String(a.Jenis || ''),
      merk: String(a.Merk || ''),
      tglPembelian: fmtDate(a.TglPembelian),
      garansi: fmtDate(a.Garansi),
      harga: Number(a.Harga || 0),
      lokasi: String(a.Lokasi || ''),
      pic: String(a.PIC || ''),
      vendor: String(a.Vendor || ''),
      kondisi: String(a.Kondisi || ''),
      fotoURL: String(a.FotoURL || ''),
      keterangan: String(a.Keterangan || ''),
      dibuat: String(a.Dibuat || ''),
      dibuatOleh: String(a.DibuatOleh || ''),
    });
  }

  out.sort((a, b) => {
    if (sort === 'az') return a.jenis.localeCompare(b.jenis);
    if (sort === 'za') return b.jenis.localeCompare(a.jenis);
    if (sort === 'terlama') return String(a.dibuat).localeCompare(String(b.dibuat));
    if (sort === 'termahal') return b.harga - a.harga;
    return String(b.dibuat).localeCompare(String(a.dibuat));
  });

  return { dept: kode, canEdit: true, canDelete: ROLE_FULL.indexOf(String(u.Role)) > -1, items: out };
}

async function saveMplAsset(ctx, payload) {
  const me = await auth.requireUser(ctx);
  const p = payload || {};
  const kode = String(p.dept || '').trim().toUpperCase();
  if (!kode) throw new Error('Departemen tidak valid.');
  const jenis = String(p.jenis || '').trim();
  if (!jenis) throw new Error('Jenis aset MPL wajib diisi.');

  const sheetName = mplSheet(kode);
  await db.ensureSheet(sheetName, HEAD.Mpl);

  const unit = String(p.unit || me.Unit || 'APK').toUpperCase();
  let foto = String(p.fotoURL || '');
  if (p.fotoBase64) {
    foto = await drive.savePhoto(p.fotoBase64, `mpl_${kode}_${Date.now()}.jpg`, `${CONFIG.DRIVE_ROOT}_MPL_${kode}`);
  }

  const isEdit = String(p.idAset || '').trim() !== '' && p.mode === 'edit';

  if (isEdit) {
    const patch = {
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
      Diubah: now(),
      DiubahOleh: String(me.Email),
    };
    if (foto) patch.FotoURL = foto;
    const ok = await db.updateByKey(sheetName, 'IDAset', String(p.idAset).trim(), patch);
    if (!ok) throw new Error(`Aset MPL ${p.idAset} tidak ditemukan.`);
    await auth.logAct(ctx, `MPL ${kode}`, 'Ubah aset MPL', `${p.idAset} — ${jenis}`);
    return { idAset: String(p.idAset).trim(), mode: 'edit', unit };
  }

  const id = await nextMplId(unit, kode);
  await db.appendObj(sheetName, HEAD.Mpl, {
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
    Dibuat: now(),
    DibuatOleh: String(me.Email),
    Diubah: '',
    DiubahOleh: '',
  });
  await auth.logAct(ctx, `MPL ${kode}`, 'Tambah aset MPL', `${id} — ${jenis}`);
  return { idAset: id, mode: 'baru', unit };
}

async function deleteMplAsset(ctx, deptKode, idAset) {
  const me = await auth.requireRole(ctx, ROLE_FULL);
  const kode = String(deptKode || '').trim().toUpperCase();
  const id = String(idAset || '').trim();
  if (!kode || !id) throw new Error('Data aset MPL tidak lengkap.');
  const ok = await db.updateByKey(mplSheet(kode), 'IDAset', id, {
    Status: 'Dihapus', Diubah: now(), DiubahOleh: String(me.Email),
  });
  if (!ok) throw new Error(`Aset MPL ${id} tidak ditemukan.`);
  await auth.logAct(ctx, `MPL ${kode}`, 'Hapus aset MPL (soft delete)', id);
  return { ok: true };
}

module.exports = { nextMplId, getMplAssets, saveMplAsset, deleteMplAsset };
