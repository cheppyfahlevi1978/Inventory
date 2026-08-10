const db = require('../sheetsDb');
const mailer = require('../mailer');
const auth = require('./auth');
const { CONFIG, SH, HEAD, ROLE_FULL, now } = require('../schema');

/**
 * Karena sistem hanya mengenal 3 role (Admin/Manager/User), tiga tahap
 * persetujuan dipetakan begini supaya tetap berjenjang dan tercatat:
 *   Tahap Departemen — Manager dari departemen aset tsb, atau Admin (selalu boleh)
 *   Tahap GM         — Admin
 *   Tahap Finance    — Admin
 * Admin dengan demikian bisa menuntaskan seluruh tahap sendirian bila perlu,
 * tapi setiap tahap tetap tercatat terpisah dengan penyetuju & waktunya sendiri.
 *
 * Kept synchronous / no DB access — dashboard.js and dashboard's
 * getNotifications call this without awaiting.
 */
function canDecideWriteOffStage(me, wo, tahap) {
  if (String(me.Role) === 'Admin') return true;
  if (tahap === 'Dept') {
    return String(me.Role) === 'Manager' && String(me.Departemen).toUpperCase() === String(wo.Dept).toUpperCase();
  }
  return false; // tahap GM & Finance: Admin saja
}

async function nextWriteOffId() {
  const list = await db.objs(SH.WRITEOFF);
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `WO-${yy}-`;
  let max = 0;
  for (const row of list) {
    const id = String(row.IDWO || '');
    if (id.indexOf(prefix) === 0) {
      const n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  let seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

async function lastBookValue(idAset) {
  const list = await db.objs(SH.DEPR);
  for (const row of list) {
    if (String(row.IDAset || '').trim().toUpperCase() === String(idAset).toUpperCase()) {
      return Number(row.NilaiBuku || 0);
    }
  }
  return null;
}

async function requestWriteOff(ctx, payload) {
  const me = await auth.requireUser(ctx);
  await auth.ensureSetup();
  const p = payload || {};
  const sumber = String(p.sumber || 'DEPT').toUpperCase() === 'MPL' ? 'MPL' : 'DEPT';
  const dept = String(p.dept || '').trim().toUpperCase();
  const idAset = String(p.idAset || '').trim();
  const alasan = String(p.alasan || '').trim();
  if (!dept || !idAset) throw new Error('Data aset tidak lengkap.');
  if (!alasan) throw new Error('Alasan penghapusan wajib diisi.');

  const mutasi = require('./mutasi');
  const aset = await mutasi.findAsetRow(sumber, dept, idAset);
  if (!aset) throw new Error(`Aset ${idAset} tidak ditemukan atau sudah tidak aktif.`);

  const existing = await db.objs(SH.WRITEOFF);
  for (const row of existing) {
    if (String(row.IDAset || '').trim().toUpperCase() === idAset.toUpperCase() &&
        ['Diajukan', 'Menunggu GM', 'Menunggu Finance'].indexOf(String(row.Status)) > -1) {
      throw new Error(`Aset ini masih punya pengajuan write-off berjalan (${row.IDWO}).`);
    }
  }

  let nilaiBuku = await lastBookValue(idAset);
  if (nilaiBuku === null) nilaiBuku = Number(aset.Harga || 0);

  const id = await nextWriteOffId();
  await db.appendObj(SH.WRITEOFF, HEAD.WriteOff, {
    IDWO: id, IDAset: idAset, Sumber: sumber, Dept: dept, Alasan: alasan,
    NilaiBukuTerakhir: nilaiBuku, Pemohon: String(me.Email),
    StatusDept: 'Menunggu', PenyetujuDept: '', CatatanDept: '',
    StatusGM: 'Menunggu', PenyetujuGM: '', CatatanGM: '',
    StatusFinance: 'Menunggu', PenyetujuFinance: '', CatatanFinance: '',
    Status: 'Diajukan', BAURL: '', TglAju: now(), TglSelesai: '',
  });

  await auth.logAct(ctx, 'Write-Off', 'Ajukan write-off', `${id} · ${idAset} · ${alasan}`);
  await auth.notifyAdmins(
    'Pengajuan write-off aset menunggu persetujuan',
    `Pengajuan write-off baru di HAIMS:\n\nNo. pengajuan : ${id}\nAset          : ${idAset}` +
      ` (${sumber === 'MPL' ? 'MPL ' : ''}${dept})\nNilai buku    : Rp ${nilaiBuku}` +
      `\nAlasan        : ${alasan}\nPemohon       : ${me.Nama} (${me.Email})\n\n` +
      'Buka menu Write-Off Aset di HAIMS untuk memutuskan tahap Departemen.'
  );
  return { idWO: id };
}

async function getWriteOffs(ctx, filter) {
  const me = await auth.requireUser(ctx);
  await auth.ensureSetup();
  await db.ensureSheet(SH.WRITEOFF, HEAD.WriteOff);
  const f = String(filter || 'Aktif');
  const full = ROLE_FULL.indexOf(String(me.Role)) > -1;
  const email = String(me.Email).toLowerCase();
  const list = await db.objs(SH.WRITEOFF);

  const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    if (!String(w.IDWO || '').trim()) continue;
    if (!full && String(w.Pemohon || '').toLowerCase() !== email) continue;
    const status = String(w.Status || '');
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
      status, baURL: String(w.BAURL || ''), tglAju: String(w.TglAju), tglSelesai: String(w.TglSelesai || ''),
      canDept: canDecideWriteOffStage(me, { Dept: w.Dept }, 'Dept') && String(w.StatusDept) === 'Menunggu' && status === 'Diajukan',
      canGM: canDecideWriteOffStage(me, { Dept: w.Dept }, 'GM') && String(w.StatusGM) === 'Menunggu' && status === 'Menunggu GM',
      canFinance: canDecideWriteOffStage(me, { Dept: w.Dept }, 'Finance') && String(w.StatusFinance) === 'Menunggu' && status === 'Menunggu Finance',
    });
  }
  return { items: out };
}

async function decideWriteOff(ctx, idWO, tahap, keputusan, catatan) {
  const me = await auth.requireUser(ctx);
  const id = String(idWO || '').trim();
  const stage = String(tahap || '').trim();
  const kep = String(keputusan || '').trim();
  if (['Dept', 'GM', 'Finance'].indexOf(stage) < 0) throw new Error('Tahap tidak valid.');
  if (['Setuju', 'Tolak'].indexOf(kep) < 0) throw new Error('Keputusan tidak valid.');

  const list = await db.objs(SH.WRITEOFF);
  let row = null;
  for (const r of list) if (String(r.IDWO || '').trim() === id) { row = r; break; }
  if (!row) throw new Error(`Pengajuan ${id} tidak ditemukan.`);
  if (!canDecideWriteOffStage(me, row, stage)) throw new Error('Anda tidak berwenang memutuskan tahap ini.');

  const expectStatus = stage === 'Dept' ? 'Diajukan' : (stage === 'GM' ? 'Menunggu GM' : 'Menunggu Finance');
  if (String(row.Status) !== expectStatus) throw new Error(`Pengajuan ini sedang berstatus ${row.Status}, bukan giliran tahap ${stage}.`);

  const patch = {};
  patch['Status' + stage] = kep === 'Setuju' ? 'Disetujui' : 'Ditolak';
  patch['Penyetuju' + stage] = String(me.Email);
  patch['Catatan' + stage] = String(catatan || '');

  if (kep === 'Tolak') {
    patch.Status = 'Ditolak';
    patch.TglSelesai = now();
  } else if (stage === 'Dept') {
    patch.Status = 'Menunggu GM';
  } else if (stage === 'GM') {
    patch.Status = 'Menunggu Finance';
  } else {
    patch.Status = 'Selesai';
    patch.TglSelesai = now();
  }

  await db.updateByKey(SH.WRITEOFF, 'IDWO', id, patch);
  await auth.logAct(ctx, 'Write-Off', `${kep} tahap ${stage}`, `${id} · ${row.IDAset}`);

  const mutasi = require('./mutasi');

  if (kep === 'Setuju' && stage === 'Finance') {
    // seluruh tahap lolos — nonaktifkan aset & terbitkan berita acara
    await db.updateByKey(mutasi.sumberSheet(row.Sumber, row.Dept), 'IDAset', String(row.IDAset), {
      Status: 'Write-off', Diubah: now(), DiubahOleh: String(me.Email),
    });
    const full = Object.assign({}, row, patch);
    let baURL = '';
    try {
      baURL = await generateBeritaAcaraWriteOff(full);
      await db.updateByKey(SH.WRITEOFF, 'IDWO', id, { BAURL: baURL });
    } catch (err) {
      await auth.logAct(ctx, 'Write-Off', 'Gagal membuat berita acara PDF', `${id} · ${err && err.message ? err.message : err}`);
    }
    try {
      await mailer.sendMail(
        String(row.Pemohon),
        `Write-off aset ${row.IDAset} — Selesai`,
        `Write-off aset ${row.IDAset} sudah disetujui seluruh tahap dan aset dinonaktifkan.\n\n` +
          (baURL ? `Berita acara: ${baURL}\n\n` : '') + '— HAIMS, Hotel Asset Inventory'
      );
    } catch (err) { /* email opsional */ }
  } else if (kep === 'Tolak') {
    try {
      await mailer.sendMail(
        String(row.Pemohon),
        `Write-off aset ${row.IDAset} — Ditolak pada tahap ${stage}`,
        `Pengajuan write-off Anda ditolak pada tahap ${stage}.\n` +
          (catatan ? `Catatan: ${catatan}\n` : '') + '\n— HAIMS, Hotel Asset Inventory'
      );
    } catch (err) { /* email opsional */ }
  }

  return { ok: true, status: patch.Status };
}

/**
 * Menyusun dan menyimpan berita acara penghapusan aset di Drive.
 *
 * Simplification note: the GAS original used DocumentApp to build a
 * formatted Google Doc, converted it to PDF, saved that to Drive, and
 * trashed the source Doc. Recreating that with the Docs API (batchUpdate
 * with structural-edit requests for headings/tables/alignment, then a Drive
 * export-to-PDF round trip) is disproportionate for a "berita acara" that
 * is really just a formatted summary of fields already in the WriteOff row.
 * Instead we render the same information as a small self-contained HTML
 * document and upload that directly to Drive (mimeType text/html) in the
 * same `${CONFIG.DRIVE_ROOT}_WriteOff` folder, sharing it read-only the
 * same way lib/drive.js does for photos, and return its Drive view URL as
 * BAURL. Content and layout mirror the original table of fields and the
 * three-column signature block.
 */
async function generateBeritaAcaraWriteOff(wo) {
  const { driveClient } = require('../googleAuth');
  const tz = process.env.APP_TIMEZONE || 'Asia/Jakarta';
  const tglStr = new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  const rows = [
    ['Kode Aset', String(wo.IDAset)],
    ['Sumber', wo.Sumber === 'MPL' ? 'MPL Asset' : 'Master Aset Departemen'],
    ['Departemen', String(wo.Dept)],
    ['Alasan Penghapusan', String(wo.Alasan)],
    ['Nilai Buku Terakhir', `Rp ${Number(wo.NilaiBukuTerakhir || 0).toLocaleString('id-ID')}`],
    ['Diajukan oleh', String(wo.Pemohon)],
    ['Disetujui Departemen', String(wo.PenyetujuDept || '-')],
    ['Disetujui General Manager', String(wo.PenyetujuGM || '-')],
    ['Disetujui Finance', String(wo.PenyetujuFinance || '-')],
    ['Tanggal Selesai', tglStr],
  ];

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>BA-WriteOff-${esc(wo.IDWO)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:56px;color:#111}
h1{text-align:center;font-size:20px}
.center{text-align:center}
table{border-collapse:collapse;width:100%;margin:16px 0}
td{border:1px solid #999;padding:6px 10px;vertical-align:top}
td.label{font-weight:bold;width:220px}
.sig{margin-top:48px}
.sig td{text-align:center;border:none;padding:8px}
.sig .name{font-weight:bold}
</style></head>
<body>
<h1>BERITA ACARA PENGHAPUSAN ASET</h1>
<p class="center">Nomor: ${esc(wo.IDWO)}</p>
<p>Pada hari ini, ${esc(tglStr)}, telah dilakukan penghapusan aset milik hotel dengan rincian sebagai berikut:</p>
<table>
${rows.map(([k, v]) => `<tr><td class="label">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('\n')}
</table>
<p>Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
<table class="sig">
<tr><td><strong>Departemen</strong></td><td><strong>General Manager</strong></td><td><strong>Finance</strong></td></tr>
<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
<tr class="name"><td>( ${esc(wo.PenyetujuDept || '_______________')} )</td><td>( ${esc(wo.PenyetujuGM || '_______________')} )</td><td>( ${esc(wo.PenyetujuFinance || '_______________')} )</td></tr>
</table>
</body></html>`;

  const drive = driveClient();
  const { subFolderId } = require('../drive');
  const parent = await subFolderId(`${CONFIG.DRIVE_ROOT}_WriteOff`);

  const { Readable } = require('stream');
  const created = await drive.files.create({
    requestBody: { name: `BA-${wo.IDWO}.html`, parents: [parent], mimeType: 'text/html' },
    media: { mimeType: 'text/html', body: Readable.from(Buffer.from(html, 'utf8')) },
    fields: 'id',
  });
  const fileId = created.data.id;
  try {
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
  } catch (err) { /* opsional */ }
  return `https://drive.google.com/file/d/${fileId}/view`;
}

module.exports = { canDecideWriteOffStage, nextWriteOffId, lastBookValue, requestWriteOff, getWriteOffs, decideWriteOff };
