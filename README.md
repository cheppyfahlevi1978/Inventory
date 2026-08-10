# HAIMS — Hotel Asset Inventory Management System

Port dari Google Apps Script ke **Next.js di Vercel**. Spreadsheet Google tetap
menjadi database — hanya hosting & logic backend yang berpindah dari Apps
Script ke serverless functions di Vercel, diakses lewat Google Sheets API.

Kode Apps Script asli disimpan sebagai referensi di `legacy-gas/` (tidak lagi
dipakai untuk deploy).

## Arsitektur

- **Frontend**: `frontend/index.html` (hasil adaptasi `Index.html` GAS — satu
  perubahan utama: `google.script.run` diganti bridge `fetch()` ke
  `/api/rpc`), disajikan di `/` lewat `pages/index.js`.
- **Backend**: `pages/api/rpc.js` — satu endpoint yang menerima
  `{ fn, args }` dan memanggil fungsi yang sesuai di `lib/api/*.js`, mengikuti
  nama fungsi Apps Script apa adanya (`getAssets`, `saveAsset`, `checkSession`, dst).
- **Database**: Google Sheets, diakses via `googleapis` dengan **service
  account** (`lib/sheetsDb.js`, `lib/googleAuth.js`).
- **Upload foto**: Google Drive, juga lewat service account (`lib/drive.js`).
- **Login**: dulu identitas Google didapat otomatis dari `Session` Apps
  Script; sekarang lewat OAuth2 sungguhan (`pages/api/auth/google/*`),
  hasilnya disimpan sebagai cookie JWT httpOnly (`lib/session.js`).
- **Email** (OTP, notifikasi admin): opsional lewat Resend API
  (`lib/mailer.js`) — kalau tidak dikonfigurasi, dilewati saja (dicatat di log).

## Setup sebelum deploy

1. **Service account untuk Sheets/Drive**
   - Buat project di Google Cloud Console, aktifkan **Google Sheets API** dan
     **Google Drive API**.
   - Buat *Service Account*, unduh key JSON-nya.
   - Share spreadsheet HAIMS (`SPREADSHEET_ID` di `.env`) ke email service
     account tsb sebagai **Editor**.
   - Buat folder Drive untuk upload foto, share juga ke service account
     sebagai Editor, catat folder ID-nya untuk `HAIMS_DRIVE_ROOT_FOLDER_ID`.
     (Service account tidak punya kuota Drive sendiri, jadi foldernya wajib
     dibuat & dibagikan dari akun manusia terlebih dahulu.)

2. **OAuth client untuk tombol "Lanjut dengan akun Google"**
   - Di project Cloud Console yang sama (atau berbeda), buat **OAuth 2.0
     Client ID** tipe *Web application*.
   - Authorized redirect URI: `https://<domain-vercel-anda>/api/auth/google/callback`.

3. **Environment variables** — salin `.env.example` ke Vercel Project
   Settings → Environment Variables (lihat komentar di file tsb untuk tiap
   variabel).

4. **Deploy** — hubungkan repo ini ke proyek Vercel (Import Git Repository),
   Vercel otomatis mendeteksi Next.js. Set env vars di atas, lalu Deploy.

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local   # isi semua variabel
npm run dev
```

## Catatan migrasi

- Semua nama fungsi & bentuk data sengaja dipertahankan sama dengan
  `legacy-gas/Code.gs` supaya `frontend/index.html` tidak perlu ditulis ulang
  secara luas.
- Trigger harian `installDailyReminderTrigger()` (pengingat maintenance) di
  GAS digantikan Vercel Cron di `vercel.json` yang memanggil
  `/api/cron/maintenance-reminders`.
- `SETUP_FLAG` (penanda "sheet sudah di-setup") sebelumnya disimpan di
  `PropertiesService`; versi ini memeriksa langsung apakah sheet master
  sudah berisi data setiap request pertama pada proses serverless yang dingin.
