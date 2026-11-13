# Reminder Me

Personal Information Organizer & Reminder. Simpan link, catatan, gambar, dan dokumen, atur pengingat, lalu terima notifikasi di aplikasi dan email.

## Fitur

- Item: link, catatan, gambar, dan dokumen dengan metadata link otomatis.
- Organisasi: folder, tag, favorit, arsip, pencarian, prioritas, dan Trash 30 hari.
- Pengingat: sekali atau berulang (harian, mingguan, bulanan, tahunan), snooze, dan selesai.
- Notifikasi in-app dan email, pengingat sampah otomatis, serta ekstraksi teks dokumen.
- Dashboard penyimpanan, pengaturan profil, export ZIP, dan admin dashboard.
- Autentikasi email/password (verifikasi email) dan Google OAuth.

## Stack

- Bun, Express 5, EJS
- PostgreSQL 16
- Worker terpisah untuk pengingat, email, ekstraksi dokumen, dan pembersihan data

## Kebutuhan

- Bun >= 1.2
- PostgreSQL 16 (lokal atau Docker)

## Mulai Cepat

```bash
bun install
cp .env.example .env
```

Sesuaikan `DATABASE_URL` di `.env`. Dua opsi umum:

**PostgreSQL lokal**

```env
DATABASE_URL=postgres://postgres@localhost:5432/reminder_me
```

**Docker Compose (port 5433)**

```bash
docker compose up -d
```

```env
DATABASE_URL=postgres://reminder:reminder@localhost:5433/reminder_me
```

Jalankan migrasi lalu aplikasi:

```bash
bun run db:migrate
bun run dev
```

`bun run dev` menjalankan web server dan worker sekaligus dengan watch mode.

- Web: `http://localhost:3004`
- Worker: proses terpisah, poll setiap `WORKER_POLL_MS`
- Health check: `GET /api/health`

Untuk produksi, jalankan web dan worker secara terpisah:

```bash
bun run start
bun run start:worker
```

## Data Demo

```bash
bun run db:seed
```

Akun demo:

- Email: `demo@reminder.me`
- Password: `demo12345`

Seed hanya membuat data jika akun demo belum ada.

## Membuat Admin

```bash
bun run admin:create --email=admin@example.com --password=passwordku --name=Administrator
```

Jika email sudah terdaftar, akun tersebut diubah menjadi admin, diaktifkan, dan emailnya ditandai terverifikasi.

## Environment Variables

| Variabel                            | Default                               | Keterangan                                                               |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                          | `development`                         | `production` mengaktifkan HSTS, cache statis, dan cookie policy produksi |
| `PORT`                              | `3004`                                | Port web server                                                          |
| `APP_URL`                           | `http://localhost:3004`               | URL publik, dipakai untuk link email dan OAuth                           |
| `DATABASE_URL`                      | wajib                                 | Koneksi PostgreSQL                                                       |
| `COOKIE_SECURE`                     | `false`                               | Set `true` jika memakai HTTPS                                            |
| `TRUST_PROXY`                       | `0`                                   | Jumlah hop reverse proxy                                                 |
| `STORAGE_DIR`                       | `./storage`                           | Lokasi file upload dan cache                                             |
| `DEFAULT_STORAGE_QUOTA_BYTES`       | `1073741824`                          | Kuota default 1 GB                                                       |
| `DEFAULT_FOLDER_LIMIT`              | `50`                                  | Maksimal folder per pengguna                                             |
| `DEFAULT_TAG_LIMIT`                 | `100`                                 | Maksimal tag per pengguna                                                |
| `STORAGE_WARN_PERCENT`              | `80`                                  | Ambang peringatan storage                                                |
| `STORAGE_CRITICAL_PERCENT`          | `95`                                  | Ambang kritis storage                                                    |
| `MAIL_DRIVER`                       | `console`                             | `console`, `resend`, atau `smtp`                                         |
| `RESEND_API_KEY`                    | kosong                                | Wajib jika `MAIL_DRIVER=resend`                                          |
| `MAIL_FROM`                         | `Reminder Me <onboarding@resend.dev>` | Pengirim email untuk driver Resend                                       |
| `SMTP_HOST`                         | kosong                                | Wajib jika `MAIL_DRIVER=smtp`                                            |
| `SMTP_PORT`                         | `587`                                 | Port SMTP                                                                |
| `SMTP_SECURE`                       | `false`                               | `true` untuk koneksi TLS langsung, biasanya port 465                     |
| `SMTP_USER`                         | kosong                                | Username SMTP                                                            |
| `SMTP_PASS`                         | kosong                                | Password atau app password SMTP                                          |
| `SMTP_FROM`                         | `MAIL_FROM`                           | Alamat pengirim email untuk driver SMTP                                  |
| `GOOGLE_CLIENT_ID`                  | kosong                                | OAuth Google                                                             |
| `GOOGLE_CLIENT_SECRET`              | kosong                                | OAuth Google                                                             |
| `GOOGLE_REDIRECT_URI`               | `${APP_URL}/api/auth/google/callback` | Redirect OAuth                                                           |
| `WORKER_POLL_MS`                    | `15000`                               | Interval poll worker                                                     |
| `EMAIL_MAX_ATTEMPTS`                | `5`                                   | Maksimal percobaan kirim email                                           |
| `EMAIL_STALE_LOCK_MINUTES`          | `15`                                  | Batas lock email yang macet                                              |
| `NOTIFICATION_RETENTION_DAYS`       | `90`                                  | Retensi notifikasi                                                       |
| `DOCUMENT_EXTRACTION_MAX_ATTEMPTS`  | `3`                                   | Maksimal percobaan ekstraksi                                             |
| `DOCUMENT_EXTRACTION_STALE_MINUTES` | `15`                                  | Batas lock ekstraksi                                                     |
| `DOCUMENT_EXTRACTION_MAX_CHARS`     | `2000000`                             | Maksimal karakter hasil ekstraksi                                        |
| `DOCUMENT_EXTRACTION_TIMEOUT_MS`    | `30000`                               | Timeout ekstraksi                                                        |

## Google OAuth

1. Buat OAuth Client (Web application) di Google Cloud Console.
2. Tambahkan redirect URI: `{APP_URL}/api/auth/google/callback`.
3. Isi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `APP_URL`.
4. Pastikan email Google sudah terverifikasi.

## Email (Resend / SMTP)

Driver `console` hanya mencatat email ke log, cocok untuk development. Untuk pengiriman sungguhan lewat Resend:

```env
MAIL_DRIVER=resend
RESEND_API_KEY=re_xxxxxxxxx
MAIL_FROM=Reminder Me <noreply@domain-anda.com>
```

Domain pengirim harus terverifikasi di Resend. Worker mengirim email dari `email_outbox` dengan retry dan backoff.

Untuk SMTP biasa (termasuk Gmail app password atau SMTP provider):

```env
MAIL_DRIVER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=alamat@example.com
SMTP_PASS=app-password
SMTP_FROM=Reminder Me <alamat@example.com>
```

Driver SMTP dipakai langsung oleh `sendMail`, termasuk email reset password. Jika autentikasi gagal, detail error dicatat di log server tanpa membocorkan password.

## Worker

Worker menangani:

- Pengingat yang jatuh tempo dan snooze
- Peringatan item di Trash (hari ke-27) dan pembersihan otomatis (30 hari)
- Ekstraksi teks dokumen
- Pengiriman email dari outbox
- Pembersihan notifikasi, sesi, token, dan email lama

Jangan menjalankan lebih dari satu worker untuk satu database. Worker menulis heartbeat yang dipakai admin dashboard untuk status layanan.

## Storage

File disimpan di `STORAGE_DIR`. Jika angka pemakaian storage tidak sinkron (misalnya setelah restore database), jalankan:

```bash
bun run storage:reconcile
```

Perintah ini menghitung ulang `storage_used_bytes` setiap pengguna dari total ukuran file item.

## Testing dan Lint

```bash
bun run test
bun run lint
```

`bun run test` otomatis:

1. Membuat database uji `<nama_database>_test` jika belum ada.
2. Menjalankan migrasi pada database uji.
3. Menjalankan unit test dan integration test dengan `NODE_ENV=test`.

Integration test membutuhkan PostgreSQL yang sedang berjalan. Database uji memakai `STORAGE_DIR=./storage-test` agar tidak mengganggu data development.

Menjalankan `bun test` langsung akan melewati integration test jika `DATABASE_URL` bukan database `_test`.

## Struktur Proyek

```text
src/
  app.js              Express app dan routing
  server.js           Entrypoint web
  worker.js           Entrypoint worker dan job queue
  config.js           Validasi environment
  db/                 Pool, migrasi, query
  middleware/         Auth, CSRF, upload, rate limit, error
  routes/             Route API dan halaman
  services/           Logika bisnis
  views/              Template EJS
public/               CSS dan JavaScript client
scripts/              Seed, admin, reconcile, test runner
tests/                Unit dan integration test
docs/PRD.md           Product requirements
```

## Keamanan

- Password di-hash dengan Argon2id.
- Session token disimpan sebagai hash; cookie `httpOnly` dan `sameSite=lax`.
- Semua request mutasi memakai CSRF token.
- File upload divalidasi berdasarkan isi file dan ekstensi.
- Metadata link menolak alamat private/internal.
- Set `COOKIE_SECURE=true` dan `TRUST_PROXY` sesuai topologi saat produksi.

## Troubleshooting

- **Gagal konek database**: pastikan PostgreSQL berjalan dan `DATABASE_URL` benar. Docker Compose memakai port `5433`.
- **Pengingat tidak terkirim**: pastikan worker berjalan dan heartbeat muncul di admin dashboard.
- **Email tidak terkirim**: cek `MAIL_DRIVER`; driver `console` tidak mengirim email sungguhan.
- **Upload gagal karena storage penuh**: cek kuota pengguna atau jalankan `bun run storage:reconcile`.
- **Lint gagal karena konfigurasi Biome**: jalankan `bunx biome migrate`.
