const db = require('../sheetsDb');
const drive = require('../drive');
const auth = require('./auth');
const { CONFIG, HEAD, ROLE_FULL, asetSheet, now } = require('../schema');

function fmtDate(v) {
  if (!v) return '';
  return String(v);
}

async function nextAssetId(unit, deptKode) {
  const sheetName = asetSheet(deptKode);
  const list = await db.objs(sheetName);
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `${String(unit || 'APK').toUpperCase()}-${String(deptKode).toUpperCase()}-${yy}-`;
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

async function getAssets(ctx, deptKode, opts) {
  const u = await auth.requireUser(ctx);
  const kode = String(deptKode || '').trim().toUpperCase();
  if (!kode) throw new Error('Departemen tidak valid.');
  await db.ensureSheet(asetSheet(kode), HEAD.Aset);

  const o = opts || {};
  const q = String(o.q || '').toLowerCase().trim();
  const sort = String(o.sort || 'terbaru');
  const unitFilter = String(o.unit || '').toUpperCase();

  const list = await db.objs(asetSheet(kode));
  let out = [];
  for (const a of list) {
    if (String(a.Status || '') === 'Dihapus' || String(a.Status || '') === 'Write-off') continue;
    if (!String(a.IDAset || '').trim()) continue;
    if (unitFilter && String(a.IDAset).toUpperCase().indexOf(unitFilter + '-') !== 0) continue;
    if (q) {
      const hay = [a.IDAset, a.Nama, a.Kategori, a.Merk, a.Lokasi, a.PIC, a.Vendor, a.Keterangan].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push({
      idAset: String(a.IDAset || ''),
      nama: String(a.Nama || ''),
      kategori: String(a.Kategori || ''),
      merk: String(a.Merk || ''),
      tglPembelian: fmtDate(a.TglPembelian),
      garansi: fmtDate(a.Garansi),
      harga: Number(a.Harga || 0),
      lokasi: String(a.Lokasi || ''),
      pic: String(a.PIC || ''),
      kondisi: String(a.Kondisi || ''),
      fotoURL: String(a.FotoURL || ''),
      vendor: String(a.Vendor || ''),
      keterangan: String(a.Keterangan || ''),
      dibuat: String(a.Dibuat || ''),
      dibuatOleh: String(a.DibuatOleh || ''),
    });
  }

  out.sort((a, b) => {
    if (sort === 'az') return a.nama.localeCompare(b.nama);
    if (sort === 'za') return b.nama.localeCompare(a.nama);
    if (sort === 'terlama') return String(a.dibuat).localeCompare(String(b.dibuat));
    if (sort === 'termahal') return b.harga - a.harga;
    return String(b.dibuat).localeCompare(String(a.dibuat));
  });

  return { dept: kode, canEdit: true, canDelete: ROLE_FULL.indexOf(String(u.Role)) > -1, items: out };
}

async function saveAsset(ctx, payload) {
  const me = await auth.requireUser(ctx);
  const p = payload || {};
  const kode = String(p.dept || '').trim().toUpperCase();
  if (!kode) throw new Error('Departemen tidak valid.');
  const nama = String(p.nama || '').trim();
  if (!nama) throw new Error('Nama aset wajib diisi.');

  const sheetName = asetSheet(kode);
  await db.ensureSheet(sheetName, HEAD.Aset);

  const unit = String(p.unit || me.Unit || 'APK').toUpperCase();
  let foto = String(p.fotoURL || '');
  if (p.fotoBase64) foto = await drive.savePhoto(p.fotoBase64, `aset_${kode}_${Date.now()}.jpg`, `${CONFIG.DRIVE_ROOT}_${kode}`);

  const isEdit = String(p.idAset || '').trim() !== '' && p.mode === 'edit';

  if (isEdit) {
    const patch = {
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
      Diubah: now(),
      DiubahOleh: String(me.Email),
    };
    if (foto) patch.FotoURL = foto;
    const ok = await db.updateByKey(sheetName, 'IDAset', String(p.idAset).trim(), patch);
    if (!ok) throw new Error(`Aset ${p.idAset} tidak ditemukan.`);
    await auth.logAct(ctx, `Departemen ${kode}`, 'Ubah aset', `${p.idAset} — ${nama}`);
    return { idAset: String(p.idAset).trim(), mode: 'edit', unit };
  }

  const id = await nextAssetId(unit, kode);
  await db.appendObj(sheetName, HEAD.Aset, {
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
    Dibuat: now(),
    DibuatOleh: String(me.Email),
    Diubah: '',
    DiubahOleh: '',
  });
  await auth.logAct(ctx, `Departemen ${kode}`, 'Tambah aset', `${id} — ${nama}`);
  return { idAset: id, mode: 'baru', unit };
}

async function deleteAsset(ctx, deptKode, idAset) {
  const me = await auth.requireRole(ctx, ROLE_FULL);
  const kode = String(deptKode || '').trim().toUpperCase();
  const id = String(idAset || '').trim();
  if (!kode || !id) throw new Error('Data aset tidak lengkap.');
  const ok = await db.updateByKey(asetSheet(kode), 'IDAset', id, {
    Status: 'Dihapus', Diubah: now(), DiubahOleh: String(me.Email),
  });
  if (!ok) throw new Error(`Aset ${id} tidak ditemukan.`);
  await auth.logAct(ctx, `Departemen ${kode}`, 'Hapus aset (soft delete)', id);
  return { ok: true };
}

module.exports = { nextAssetId, getAssets, saveAsset, deleteAsset, fmtDate };
