const db = require('../sheetsDb');
const auth = require('./auth');
const { SH, HEAD, ROLE_FULL, now } = require('../schema');
const { fmtDate } = require('./assets');

function todayStr() {
  const tz = process.env.APP_TIMEZONE || 'Asia/Jakarta';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = {};
  fmt.formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateStrPlusDays(days) {
  const tz = process.env.APP_TIMEZONE || 'Asia/Jakarta';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = {};
  fmt.formatToParts(new Date(Date.now() + days * 86400000)).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function nextMaintId() {
  const list = await db.objs(SH.MAINT);
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `SVC-${yy}-`;
  let max = 0;
  for (const row of list) {
    const id = String(row.IDServis || '');
    if (id.indexOf(prefix) === 0) {
      const n = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  let seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

async function saveMaintenance(ctx, payload) {
  const me = await auth.requireUser(ctx);
  await auth.ensureSetup();
  const p = payload || {};
  const idAset = String(p.idAset || '').trim().toUpperCase();
  if (!idAset) throw new Error('Kode aset wajib diisi.');
  const jenis = String(p.jenis || '').trim();
  if (!jenis) throw new Error('Jenis pekerjaan wajib diisi.');
  const tglJadwal = String(p.tglJadwal || '').trim();
  if (!tglJadwal) throw new Error('Tanggal jadwal wajib diisi.');

  const mutasi = require('./mutasi');
  const info = mutasi.parseAssetId(idAset);
  if (!info) throw new Error(`Format kode aset tidak dikenali: ${idAset}`);
  const aset = await mutasi.findAsetRow(info.sumber, info.dept, idAset);
  if (!aset) throw new Error(`Aset ${idAset} tidak ditemukan di database.`);

  const isEdit = String(p.idServis || '').trim() !== '' && p.mode === 'edit';
  if (isEdit) {
    const patch = { Jenis: jenis, TglJadwal: tglJadwal, Vendor: String(p.vendor || '') };
    const ok = await db.updateByKey(SH.MAINT, 'IDServis', String(p.idServis).trim(), patch);
    if (!ok) throw new Error(`Jadwal ${p.idServis} tidak ditemukan.`);
    await auth.logAct(ctx, 'Maintenance', 'Ubah jadwal', `${p.idServis} · ${idAset}`);
    return { idServis: String(p.idServis).trim(), mode: 'edit' };
  }

  const id = await nextMaintId();
  await db.appendObj(SH.MAINT, HEAD.Maintenance, {
    IDServis: id, IDAset: idAset, Sumber: info.sumber, Dept: info.dept, Jenis: jenis,
    TglJadwal: tglJadwal, TglRealisasi: '', Vendor: String(p.vendor || ''), Biaya: 0, Hasil: '',
    Status: 'Terjadwal', Dibuat: now(), DibuatOleh: String(me.Email),
  });
  await auth.logAct(ctx, 'Maintenance', 'Jadwalkan servis', `${id} · ${idAset} · ${tglJadwal}`);
  return { idServis: id, mode: 'baru' };
}

async function completeMaintenance(ctx, idServis, payload) {
  await auth.requireUser(ctx);
  const id = String(idServis || '').trim();
  const p = payload || {};
  const list = await db.objs(SH.MAINT);
  let row = null;
  for (const r of list) if (String(r.IDServis || '').trim() === id) { row = r; break; }
  if (!row) throw new Error(`Jadwal ${id} tidak ditemukan.`);

  await db.updateByKey(SH.MAINT, 'IDServis', id, {
    TglRealisasi: String(p.tglRealisasi || now().split(' ')[0]),
    Vendor: String(p.vendor || row.Vendor || ''),
    Biaya: Number(p.biaya || 0),
    Hasil: String(p.hasil || ''),
    Status: 'Selesai',
  });
  await auth.logAct(ctx, 'Maintenance', 'Selesaikan servis', `${id} · ${row.IDAset}`);
  return { ok: true };
}

async function cancelMaintenance(ctx, idServis) {
  await auth.requireRole(ctx, ROLE_FULL);
  const id = String(idServis || '').trim();
  const ok = await db.updateByKey(SH.MAINT, 'IDServis', id, { Status: 'Dibatalkan' });
  if (!ok) throw new Error(`Jadwal ${id} tidak ditemukan.`);
  await auth.logAct(ctx, 'Maintenance', 'Batalkan jadwal', id);
  return { ok: true };
}

async function getMaintenance(ctx, filter) {
  await auth.requireUser(ctx);
  await auth.ensureSetup();
  const f = String(filter || 'Aktif');
  const list = await db.objs(SH.MAINT);
  const today = todayStr();
  const out = [];
  let akanDatang = 0;
  let terlambat = 0;

  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (!String(r.IDServis || '').trim()) continue;
    const tgl = fmtDate(r.TglJadwal);
    const status = String(r.Status || 'Terjadwal');
    const terlambatFlag = status === 'Terjadwal' && tgl && tgl < today;
    if (status === 'Terjadwal') { if (terlambatFlag) terlambat++; else akanDatang++; }

    if (f === 'Aktif' && status !== 'Terjadwal') continue;
    if (f === 'Selesai' && status !== 'Selesai') continue;
    if (f === 'Terlambat' && !terlambatFlag) continue;

    out.push({
      idServis: String(r.IDServis), idAset: String(r.IDAset), sumber: String(r.Sumber || ''),
      dept: String(r.Dept || ''), jenis: String(r.Jenis || ''), tglJadwal: tgl,
      tglRealisasi: fmtDate(r.TglRealisasi), vendor: String(r.Vendor || ''),
      biaya: Number(r.Biaya || 0), hasil: String(r.Hasil || ''), status, terlambat: terlambatFlag,
    });
  }
  return { items: out, akanDatang, terlambat };
}

/** Dipanggil manual atau lewat cron harian — kirim ringkasan H-7 dan H-1. */
async function sendMaintenanceReminders(ctx) {
  await auth.ensureSetup();
  const today = todayStr();
  const h7 = dateStrPlusDays(7);
  const list = await db.objs(SH.MAINT);
  const due7 = [];
  const due1 = [];
  for (const r of list) {
    if (String(r.Status) !== 'Terjadwal') continue;
    const tgl = fmtDate(r.TglJadwal);
    if (tgl === h7) due7.push(r);
    if (tgl === today) due1.push(r);
  }
  if (!due7.length && !due1.length) return { sent: false };

  let body = '';
  if (due1.length) {
    body += 'Jadwal HARI INI:\n' + due1.map((r) => `- ${r.IDAset} · ${r.Jenis}`).join('\n') + '\n\n';
  }
  if (due7.length) {
    body += 'Jadwal 7 hari lagi:\n' + due7.map((r) => `- ${r.IDAset} · ${r.Jenis}`).join('\n') + '\n\n';
  }
  await auth.notifyAdmins('Pengingat jadwal maintenance HAIMS', body + '— HAIMS, Hotel Asset Inventory');
  await auth.logAct(ctx || { email: '' }, 'Maintenance', 'Kirim pengingat', `${due1.length} hari ini, ${due7.length} H-7`);
  return { sent: true, due1: due1.length, due7: due7.length };
}

module.exports = {
  nextMaintId, saveMaintenance, completeMaintenance, cancelMaintenance, getMaintenance, sendMaintenanceReminders,
};
