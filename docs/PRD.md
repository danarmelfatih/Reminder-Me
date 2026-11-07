# PRODUCT REQUIREMENTS DOCUMENT (PRD)

# Personal Information Organizer & Reminder

**Versi:** 1.0 – Draft
**Status:** Product Discovery Completed – Initial PRD
**Platform:** Web Application
**Target:** Multi-user / Public Access
**Prioritas:** MVP (Minimum Viable Product)

---

# 1. Product Overview

## 1.1 Nama Produk

Nama produk sementara: **Personal Information Organizer & Reminder**.

Nama final akan ditentukan kemudian.

## 1.2 Deskripsi Produk

Personal Information Organizer & Reminder adalah aplikasi web yang dirancang untuk membantu pengguna menyimpan, mengelola, mengorganisasi, mencari, dan mengingat informasi penting dalam satu tempat.

Aplikasi ini mengatasi permasalahan informasi penting yang sering tersimpan di berbagai tempat, seperti WhatsApp, browser, galeri, dan folder perangkat, sehingga sulit ditemukan kembali atau terlupakan.

Pengguna dapat menyimpan berbagai jenis informasi, seperti:

- Link atau URL website.
- Catatan dan teks.
- Foto dan gambar.
- Dokumen digital.

Selain sebagai tempat penyimpanan, aplikasi menyediakan sistem pengingat yang dapat diaktifkan secara opsional pada setiap item.

**Prinsip utama produk:**

Pengguna bebas memilih apakah sebuah informasi hanya ingin disimpan atau ingin disimpan sekaligus diberikan pengingat.

## 1.3 Tujuan Produk

1. Menyediakan tempat penyimpanan informasi pribadi yang terorganisasi.
2. Mempermudah pengguna menemukan informasi yang pernah disimpan.
3. Mengurangi risiko melupakan informasi penting.
4. Menyediakan pengingat otomatis melalui aplikasi dan email.
5. Menjaga privasi dan keamanan data setiap pengguna.
6. Memberikan pengelolaan informasi yang sederhana dan terstruktur.

---

# 2. Target Pengguna

## 2.1 Target Utama

Aplikasi ditujukan untuk masyarakat umum yang membutuhkan tempat untuk menyimpan informasi penting dan mengatur pengingat.

Contoh pengguna:

- Pelajar dan mahasiswa.
- Pekerja kantoran.
- Freelancer.
- Pengembang software.
- Pengguna internet yang sering menyimpan referensi.
- Masyarakat umum yang membutuhkan pengelolaan informasi pribadi.

## 2.2 Permasalahan Pengguna

Permasalahan yang ingin diselesaikan:

1. Informasi penting tersebar di berbagai aplikasi.
2. Link dan pesan yang disimpan sulit ditemukan kembali.
3. Pengguna sering lupa membuka informasi yang pernah disimpan.
4. Tidak tersedia pengingat khusus untuk setiap informasi.
5. File dan dokumen sulit dikelompokkan.
6. Informasi penting tertimbun oleh informasi baru.

---

# 3. Product Scope

## 3.1 Ruang Lingkup MVP

MVP mencakup:

1. Authentication dan Account Management.
2. Personal Information Storage.
3. Automatic Link Metadata Extraction.
4. Folder dan Tag Management.
5. Search dan Full-Text Search.
6. Reminder Management.
7. Notification System.
8. Favorite dan Archive.
9. Trash Management.
10. Storage Management.
11. User Dashboard.
12. Admin Dashboard.
13. Export Personal Data.
14. Account Deletion.
15. Responsive Web Application.

## 3.2 Di Luar Ruang Lingkup MVP

Fitur berikut belum menjadi prioritas:

- Integrasi langsung dengan WhatsApp.
- Share to App.
- Upload video.
- Browser Push Notification.
- OCR untuk membaca gambar atau PDF hasil scan.
- Berbagi informasi antar pengguna.
- Folder bertingkat atau subfolder.
- Paket langganan Free dan Premium beserta pembayaran.
- Progressive Web App (PWA).
- Pengelolaan perangkat dan sesi login secara terperinci.
- Penggantian alamat email akun.

---

# 4. User Roles & Permissions

Aplikasi memiliki dua peran utama.

## 4.1 User

Pengguna dapat:

- Mengelola informasi pribadi.
- Membuat dan mengelola folder.
- Membuat dan mengelola tag.
- Mengatur pengingat.
- Mengelola favorit.
- Mengarsipkan informasi.
- Menghapus dan memulihkan informasi.
- Mengelola profil.
- Mengunduh data pribadi.
- Menghapus akun sendiri.
- Melihat penggunaan storage.

## 4.2 Admin

Admin dapat:

- Melihat seluruh daftar pengguna.
- Melihat status akun.
- Melihat tanggal registrasi.
- Melihat penggunaan storage setiap pengguna.
- Mengubah kapasitas storage pengguna.
- Menonaktifkan akun.
- Mengaktifkan kembali akun.
- Menghapus akun pengguna.
- Melihat statistik sistem.
- Memantau operasional sistem.

## 4.3 Privacy Restrictions

Admin tidak memiliki akses untuk membaca isi informasi pribadi pengguna.

Informasi yang tidak boleh dibaca admin:

- Isi catatan.
- URL yang disimpan beserta informasi privatnya.
- Foto.
- Dokumen.
- Isi file pengguna.

Admin hanya mengelola akun, kapasitas, statistik, dan operasional sistem.

Backend wajib memastikan setiap pengguna hanya dapat mengakses data miliknya sendiri.

---

# 5. Functional Requirements

## 5.1 Authentication & Account Management

### FR-AUTH-001: Registration

Pengguna dapat membuat akun menggunakan:

- Email.
- Password.

### FR-AUTH-002: Email Verification

Pengguna wajib melakukan verifikasi email untuk menyelesaikan registrasi email dan password.

### FR-AUTH-003: Google Login

Pengguna dapat melakukan registrasi dan login menggunakan akun Google melalui OAuth 2.0.

Email Google yang telah diverifikasi dapat digunakan tanpa proses verifikasi email ganda, setelah token Google divalidasi oleh backend.

### FR-AUTH-004: Login

Pengguna dapat login menggunakan email dan password atau Google Login.

### FR-AUTH-005: Remember Me

Tersedia opsi Remember Me pada halaman login.

Ketentuan:

- Menggunakan cookie berbasis token yang dikelola backend.
- Masa berlaku: 7 hari.
- Token divalidasi oleh backend.
- Token dapat dicabut ketika logout.
- Tidak menyimpan password atau token autentikasi di localStorage.

Cookie wajib menggunakan atribut keamanan yang sesuai, termasuk HttpOnly, Secure pada HTTPS, dan SameSite.

### FR-AUTH-006: Logout

Pengguna dapat keluar dari akun.

Logout harus mencabut sesi atau token yang bersangkutan dan menghapus cookie autentikasi.

### FR-AUTH-007: Password Recovery

Pengguna dapat meminta reset password melalui email.

### FR-AUTH-008: User Profile

Pengguna dapat:

- Melihat profil.
- Mengubah nama.
- Mengunggah atau mengganti foto profil.
- Mengubah password.
- Melihat tanggal registrasi.
- Melihat informasi akun.

Alamat email belum dapat diubah pada MVP.

---

## 5.2 Personal Information Storage

### FR-STORAGE-001: Add Information

Pengguna dapat menambahkan informasi melalui proses input manual.

### FR-STORAGE-002: Supported Content Types

Jenis informasi yang didukung:

| Jenis | Keterangan |
|---|---|
| Link | URL website |
| Text / Notes | Catatan pribadi |
| Image | Foto dan gambar |
| Document | Dokumen digital |

### FR-STORAGE-003: Supported File Formats

| Kategori | Format |
|---|---|
| Image | JPG, JPEG, PNG, WEBP |
| Document | PDF, DOC, DOCX, TXT |
| Spreadsheet | XLS, XLSX |
| Presentation | PPT, PPTX |

### FR-STORAGE-004: File Size Limit

| Jenis file | Maksimal ukuran |
|---|---:|
| Gambar | 10 MB |
| PDF | 25 MB |
| DOC / DOCX | 25 MB |
| TXT | 25 MB |
| XLS / XLSX | 25 MB |
| PPT / PPTX | 25 MB |

Validasi harus dilakukan pada frontend dan backend.

Backend wajib memeriksa MIME type dan ekstensi file, tidak hanya nama file.

### FR-STORAGE-005: Item Information

Setiap item memiliki informasi:

- ID item.
- Judul.
- Deskripsi atau catatan tambahan.
- Jenis konten.
- Lokasi file atau URL, sesuai jenis konten.
- Folder.
- Tag.
- Prioritas.
- Tanggal dibuat.
- Tanggal terakhir diperbarui.
- Status favorit.
- Status arsip.
- Informasi pengingat jika diaktifkan.

### FR-STORAGE-006: Item Management

Pengguna dapat:

- Melihat detail item.
- Mengedit item.
- Menghapus item.
- Memindahkan item ke folder lain.
- Menambahkan atau mengubah tag.
- Mengarsipkan item.
- Menandai item sebagai favorit.

### FR-STORAGE-007: Priority

Setiap item dapat memiliki prioritas:

- High.
- Medium.
- Low.

Default: Medium.

Prioritas dapat diubah setelah item disimpan.

---

## 5.3 Automatic Link Metadata Extraction

### FR-LINK-001: Automatic Metadata

Ketika pengguna memasukkan URL, backend secara otomatis mencoba mengambil metadata halaman website.

Metadata yang diambil:

- Title.
- Description.
- Open Graph Title.
- Open Graph Image.
- Favicon.

### FR-LINK-002: Manual Editing

Pengguna dapat mengubah:

- Judul.
- Deskripsi.
- Thumbnail.

Pengeditan dapat dilakukan sebelum maupun sesudah penyimpanan.

### FR-LINK-003: Metadata Failure

Jika pengambilan metadata gagal:

- URL tetap dapat disimpan.
- Pengguna dapat mengisi informasi secara manual.
- Sistem tidak boleh menggagalkan penyimpanan hanya karena metadata tidak tersedia.

### FR-LINK-004: Security

Proses pengambilan metadata wajib dilindungi dari SSRF, akses ke alamat IP internal, dan URL berbahaya lainnya.

Pengambilan metadata tidak menggunakan layanan API pihak ketiga pada MVP.

---

## 5.4 Folder Management

### FR-FOLDER-001: Create Folder

Pengguna dapat membuat folder sendiri.

### FR-FOLDER-002: Folder Structure

Folder hanya mendukung satu tingkat.

Subfolder belum tersedia.

### FR-FOLDER-003: Folder Limit

Maksimal 50 folder per akun secara default.

Admin dapat mengubah batas tersebut.

### FR-FOLDER-004: Unique Folder Name

Nama folder tidak boleh sama dalam satu akun.

Jika duplikat, sistem menampilkan pemberitahuan bahwa folder sudah tersedia.

### FR-FOLDER-005: Folder Operations

Pengguna dapat:

- Mengubah nama folder.
- Menghapus folder.
- Memindahkan item.
- Melihat seluruh item dalam folder.

Penghapusan folder tidak boleh menghapus isi item secara otomatis. Penanganan item yang sebelumnya berada dalam folder yang dihapus perlu ditetapkan dalam implementasi.

---

## 5.5 Tag Management

### FR-TAG-001: Create Tag

Pengguna dapat membuat tag sendiri.

### FR-TAG-002: Multiple Tags

Satu item dapat memiliki beberapa tag.

### FR-TAG-003: Tag Limit

Maksimal 100 tag per akun secara default.

Admin dapat mengubah batas tersebut.

### FR-TAG-004: Unique Tag Name

Nama tag tidak boleh sama dalam satu akun.

### FR-TAG-005: Tag Operations

Pengguna dapat:

- Mengubah nama tag.
- Menghapus tag.
- Menambahkan tag pada item.
- Menghapus tag dari item.

Jika tag dihapus, item tetap tersimpan dan hanya hubungan dengan tag tersebut yang dihapus.

### FR-TAG-006: Folder and Tag Namespace

Nama folder dan tag boleh sama karena keduanya merupakan kategori yang berbeda.

---

## 5.6 Search & Filtering

### FR-SEARCH-001: Basic Search

Pengguna dapat mencari informasi berdasarkan:

- Judul.
- Deskripsi.
- Nama file.

### FR-SEARCH-002: Advanced Filtering

Pencarian mendukung filter:

- Jenis konten.
- Folder.
- Tag.
- Tanggal penyimpanan.
- Status pengingat.

### FR-SEARCH-003: Full-Text Search

Sistem dapat mencari isi teks dalam dokumen.

Cakupan:

- TXT.
- PDF berbasis teks.
- DOC dan DOCX.
- XLS dan XLSX.
- PPT dan PPTX.

PDF hasil scan yang hanya berupa gambar belum didukung untuk pencarian isi.

### FR-SEARCH-004: Image Search

Gambar dapat ditemukan melalui judul, deskripsi, dan nama file.

OCR belum termasuk MVP.

### FR-SEARCH-005: Sorting

Pengguna dapat mengurutkan item berdasarkan:

1. Prioritas tertinggi.
2. Terbaru disimpan.
3. Terlama disimpan.
4. Terakhir diperbarui.
5. Nama A–Z.

---

## 5.7 Reminder Management

### FR-REMINDER-001: Optional Reminder

Pengingat bersifat opsional pada setiap item.

Pengguna dapat memilih:

- Hanya menyimpan informasi.
- Menyimpan informasi sekaligus mengaktifkan pengingat.

### FR-REMINDER-002: Reminder Creation

Pengguna dapat mengatur:

- Tanggal.
- Waktu.
- Jenis pengingat.
- Pola pengulangan jika menggunakan pengingat berulang.

### FR-REMINDER-003: Reminder Types

Dua jenis pengingat:

1. One-Time Reminder.
2. Recurring Reminder.

### FR-REMINDER-004: Reminder Actions

Ketika pengingat muncul, pengguna dapat:

- Selesai.
- Ingatkan lagi.
- Lihat detail.

### FR-REMINDER-005: Recurring Reminder Completion

Jika pengguna menekan Selesai pada pengingat berulang, seluruh rangkaian pengingat dihentikan.

### FR-REMINDER-006: Snooze

Jika pengguna memilih Ingatkan lagi, hanya notifikasi yang sedang berjalan yang ditunda.

### FR-REMINDER-007: Reminder Editing

Jika pengguna mengubah jadwal:

- Jadwal lama dibatalkan.
- Jadwal baru menggantikan jadwal lama.
- Sistem mencegah notifikasi ganda.

### FR-REMINDER-008: Archive Behavior

Pengingat tetap berjalan meskipun item diarsipkan.

### FR-REMINDER-009: Trash Behavior

Ketika item dipindahkan ke Trash:

- Pengingat langsung dinonaktifkan.
- Tidak ada pengingat berikutnya yang dikirim.

Jika item dipulihkan:

- Pengingat dipulihkan dalam keadaan nonaktif.
- Pengguna dapat mengaktifkannya kembali.

---

## 5.8 Notification System

### FR-NOTIF-001: Notification Channels

Notifikasi pengingat menggunakan dua saluran sekaligus:

1. In-App Notification.
2. Email Notification.

Pengguna tidak perlu memilih salah satu.

### FR-NOTIF-002: Offline Notification

Pengingat tetap berjalan meskipun pengguna tidak membuka aplikasi atau sedang offline.

Backend bertanggung jawab memproses jadwal pengingat.

Notifikasi In-App disimpan di database sehingga tetap tersedia saat pengguna kembali membuka aplikasi.

### FR-NOTIF-003: Email Retry

Jika pengiriman email gagal:

- Sistem mencatat kegagalan.
- Sistem mencoba mengirim ulang.
- Notifikasi In-App tetap tersimpan.
- Sistem mencegah duplikasi notifikasi.

Jumlah retry dan interval pengiriman akan ditentukan dalam spesifikasi teknis.

### FR-NOTIF-004: Trash Expiration Notification

Pada hari ke-27 setelah item masuk Trash, sistem mengirimkan pemberitahuan bahwa item akan dihapus permanen dalam 3 hari.

Notifikasi menggunakan In-App dan Email.

---

## 5.9 Favorite & Archive

### FR-ITEM-001: Favorite

Pengguna dapat memberikan tanda bintang pada item.

Tersedia halaman khusus untuk melihat item favorit.

Favorite tidak membuat duplikasi file atau menambah storage.

### FR-ITEM-002: Archive

Pengguna dapat mengarsipkan item.

Archive berbeda dari Trash.

Item yang diarsipkan tetap tersimpan dan pengingatnya tetap aktif.

---

## 5.10 Trash Management

### FR-TRASH-001: Soft Delete

Item yang dihapus masuk ke Trash.

### FR-TRASH-002: Retention Period

Item disimpan selama 30 hari.

### FR-TRASH-003: Restore

Pengguna dapat memulihkan item sebelum masa penyimpanan berakhir.

### FR-TRASH-004: Permanent Delete

Item dihapus permanen setelah 30 hari.

Pengguna juga dapat menghapus item secara permanen secara manual.

### FR-TRASH-005: Storage Calculation

File yang berada di Trash tetap menggunakan kapasitas penyimpanan sampai dihapus permanen.

---

## 5.11 Storage Management

### FR-QUOTA-001: Default Quota

Pengguna baru mendapatkan kuota penyimpanan sebesar 1 GB.

### FR-QUOTA-002: Admin Configuration

Admin dapat mengubah kuota setiap akun.

### FR-QUOTA-003: Storage Information

Pengguna dapat melihat:

- Total kapasitas.
- Kapasitas terpakai.
- Kapasitas tersisa.
- Ukuran file.

### FR-QUOTA-004: Storage Full

Jika kapasitas penuh:

- Pengguna tidak dapat mengunggah file baru.
- Sistem menampilkan pemberitahuan.
- Pengguna dapat menghapus file untuk membebaskan kapasitas.

### FR-QUOTA-005: Storage Warning

Sistem memberikan peringatan ketika kapasitas hampir penuh.

Ambang batas peringatan perlu ditentukan pada tahap teknis.

---

## 5.12 User Dashboard

### FR-DASH-001: User Dashboard

Dashboard pengguna menampilkan:

1. Total item tersimpan.
2. Jumlah pengingat aktif.
3. Jumlah folder.
4. Penggunaan storage.
5. Pengingat yang akan datang.
6. Item terbaru.
7. Akses cepat untuk menambahkan item.

Desain visual dashboard akan dibahas setelah PRD.

---

## 5.13 Admin Dashboard

### FR-ADMIN-001: User Management

Admin dapat:

- Melihat daftar pengguna.
- Melihat status akun.
- Melihat tanggal registrasi.
- Melihat penggunaan storage.
- Mengubah kuota.
- Menonaktifkan akun.
- Mengaktifkan akun.
- Menghapus akun.

### FR-ADMIN-002: Account Deactivation

Ketika akun dinonaktifkan:

- Pengguna tidak dapat login.
- Sesi login aktif dicabut.
- Data tetap tersimpan.
- Data tidak dihapus.

Ketika akun diaktifkan kembali, pengguna dapat mengakses data sebelumnya.

### FR-ADMIN-003: Admin Statistics

Dashboard admin menampilkan:

1. Total pengguna terdaftar.
2. Jumlah pengguna aktif.
3. Jumlah pengguna dinonaktifkan.
4. Pengguna baru berdasarkan periode.
5. Total storage yang digunakan.
6. Jumlah file tersimpan.
7. Jumlah pengingat terjadwal.
8. Status database.
9. Status penyimpanan file.
10. Status layanan email.

Statistik operasional tidak boleh menampilkan isi data pribadi.

---

## 5.14 Export Personal Data

### FR-EXPORT-001: Data Export

Pengguna dapat mengunduh seluruh data pribadinya.

Data yang diekspor:

- Link.
- Metadata link.
- Catatan.
- Foto.
- Dokumen.
- Folder.
- Tag.
- Informasi pengingat.
- Informasi profil.

### FR-EXPORT-002: Export Format

Hasil ekspor dikemas dalam ZIP.

File asli tetap menggunakan format aslinya.

Data terstruktur disertakan dalam JSON.

Detail struktur ZIP dan penanganan ekspor berukuran besar akan ditentukan kemudian.

---

## 5.15 Account Deletion

### FR-ACCOUNT-DELETE-001: Self Account Deletion

Pengguna dapat menghapus akun sendiri.

### FR-ACCOUNT-DELETE-002: Confirmation Modal

Sebelum penghapusan, sistem menampilkan modal konfirmasi yang menjelaskan bahwa penghapusan bersifat permanen dan tidak dapat dipulihkan.

Pilihan:

- Batalkan.
- Ya, Hapus Akun.

### FR-ACCOUNT-DELETE-003: Password Re-Authentication

Pengguna wajib melakukan verifikasi ulang sebelum penghapusan.

Untuk akun Google Login, sistem menggunakan mekanisme autentikasi ulang yang sesuai melalui Google.

### FR-ACCOUNT-DELETE-004: Permanent Deletion

Jika dikonfirmasi:

- Akun dihapus permanen.
- Data pribadi dihapus.
- File terkait dihapus.
- Folder dan tag dihapus.
- Pengingat dan notifikasi dihapus.
- Sesi login dicabut.

Tidak tersedia masa pemulihan.

---

# 6. Business Rules

| ID | Aturan |
|---|---|
| BR-001 | Setiap pengguna memiliki ruang pribadi. |
| BR-002 | Pengguna tidak dapat mengakses data pengguna lain. |
| BR-003 | Pengingat bersifat opsional. |
| BR-004 | Pengingat aktif mengirim In-App dan Email sekaligus. |
| BR-005 | Pengingat tetap berjalan pada item Archive. |
| BR-006 | Pengingat dinonaktifkan ketika item masuk Trash. |
| BR-007 | Pengingat pada item yang dipulihkan berstatus nonaktif. |
| BR-008 | Selesai menghentikan seluruh seri pengingat berulang. |
| BR-009 | Snooze hanya menunda kejadian pengingat saat ini. |
| BR-010 | Perubahan jadwal menggantikan jadwal lama. |
| BR-011 | Trash memiliki masa penyimpanan 30 hari. |
| BR-012 | Peringatan Trash dikirim pada hari ke-27. |
| BR-013 | File Trash tetap menggunakan storage. |
| BR-014 | Kuota default adalah 1 GB per akun. |
| BR-015 | Maksimal 50 folder per akun secara default. |
| BR-016 | Maksimal 100 tag per akun secara default. |
| BR-017 | Nama folder unik dalam akun. |
| BR-018 | Nama tag unik dalam akun. |
| BR-019 | Nama folder dan tag boleh sama. |
| BR-020 | Prioritas default adalah Medium. |
| BR-021 | Admin tidak boleh membaca isi data pribadi. |
| BR-022 | Penghapusan akun pengguna bersifat permanen. |
| BR-023 | Akun dinonaktifkan tidak kehilangan data. |

---

# 7. Non-Functional Requirements

## 7.1 Security

- Authentication wajib diterapkan pada endpoint privat.
- Otorisasi dilakukan di backend.
- Setiap akses data harus memeriksa kepemilikan.
- Password disimpan menggunakan password hashing yang aman.
- Cookie autentikasi menggunakan atribut keamanan.
- Token sesi tidak boleh disimpan di localStorage.
- Upload file harus divalidasi.
- File upload tidak boleh dieksekusi sebagai kode.
- Pengambilan metadata URL harus terlindungi dari SSRF.
- API harus memiliki perlindungan terhadap akses tidak sah.
- Admin memiliki pembatasan akses berdasarkan role.

## 7.2 Privacy

- Data bersifat private by default.
- Tidak ada fitur berbagi informasi pada MVP.
- Admin tidak memiliki akses membaca isi informasi pribadi.
- Data pengguna tidak boleh bocor melalui pencarian, API, atau URL file.

## 7.3 Reliability

- Pengingat harus tetap berjalan ketika pengguna offline.
- Pengiriman email harus memiliki mekanisme retry.
- Notifikasi harus memiliki pencegahan duplikasi.
- Kegagalan metadata tidak boleh menghalangi penyimpanan URL.
- Kegagalan email tidak boleh menghilangkan notifikasi In-App.

## 7.4 Performance

- Pencarian harus memberikan hasil secara responsif.
- Proses ekstraksi dokumen tidak boleh menghambat proses utama aplikasi.
- Pengiriman email dan pemrosesan pengingat harus berjalan melalui proses backend yang dapat dikelola secara terpisah.
- Penggunaan storage harus dihitung secara konsisten.

## 7.5 Scalability

- Sistem dirancang untuk banyak pengguna.
- Kuota penyimpanan harus dapat dikonfigurasi.
- Pemrosesan pengingat dan email harus mampu menangani peningkatan jumlah pengguna.
- Sistem pencarian harus mendukung pertumbuhan data.

## 7.6 Responsive

Aplikasi harus dapat digunakan pada:

- Desktop.
- Tablet.
- Smartphone.

Desain UI/UX akan ditentukan setelah PRD disetujui.

---

# 8. Main User Flows

## 8.1 Registration Flow

1. Pengguna membuka aplikasi.
2. Memilih registrasi.
3. Mengisi email dan password atau menggunakan Google Login.
4. Sistem memproses registrasi.
5. Untuk registrasi email/password, sistem mengirim verifikasi email.
6. Pengguna memverifikasi email.
7. Akun siap digunakan.

## 8.2 Save Information Flow

1. Pengguna login.
2. Memilih Add Information.
3. Memilih jenis konten.
4. Memasukkan teks, URL, atau mengunggah file.
5. Sistem mengambil metadata otomatis jika berupa URL.
6. Pengguna menentukan judul, deskripsi, folder, tag, dan prioritas.
7. Pengguna memilih apakah ingin mengaktifkan pengingat.
8. Sistem menyimpan item.

## 8.3 Reminder Flow

1. Pengguna membuka item.
2. Memilih pengaturan pengingat.
3. Menentukan tanggal dan waktu.
4. Memilih pengingat satu kali atau berulang.
5. Sistem menyimpan jadwal.
6. Backend memproses jadwal secara otomatis.
7. Sistem mengirim notifikasi In-App dan Email.
8. Pengguna memilih Selesai, Ingatkan lagi, atau Lihat detail.

## 8.4 Delete Item Flow

1. Pengguna memilih item.
2. Memilih Delete.
3. Item masuk Trash.
4. Pengingat dinonaktifkan.
5. Sistem menyimpan tanggal penghapusan.
6. Hari ke-27 sistem memberikan peringatan.
7. Setelah 30 hari item dihapus permanen.

## 8.5 Account Deletion Flow

1. Pengguna membuka pengaturan akun.
2. Memilih Hapus Akun.
3. Sistem menampilkan modal konfirmasi.
4. Pengguna melakukan autentikasi ulang.
5. Pengguna mengonfirmasi penghapusan.
6. Backend menghapus akun dan seluruh data terkait.
7. Sesi login dicabut.

## 8.6 Admin Deactivation Flow

1. Admin membuka daftar pengguna.
2. Memilih akun.
3. Memilih Nonaktifkan Akun.
4. Sistem mencabut sesi aktif.
5. Akun tidak dapat login.
6. Data pengguna tetap tersimpan.
7. Admin dapat mengaktifkan akun kembali.

---

# 9. Acceptance Criteria

MVP dinyatakan memenuhi kebutuhan produk apabila:

1. Pengguna dapat melakukan registrasi, verifikasi email, login, dan logout.
2. Google Login berfungsi.
3. Remember Me menggunakan cookie backend dengan masa berlaku 7 hari.
4. Setiap pengguna hanya dapat mengakses datanya sendiri.
5. Pengguna dapat menyimpan semua format konten yang didukung.
6. Batas ukuran file diterapkan pada backend.
7. Metadata URL dapat diambil otomatis tanpa API pihak ketiga.
8. Pengguna dapat mengedit metadata link.
9. Folder dan tag dapat dikelola sesuai batas yang ditentukan.
10. Pencarian dasar dan pencarian isi dokumen berfungsi sesuai cakupan.
11. Pengguna dapat mengatur pengingat satu kali dan berulang.
12. Pengingat mengirim In-App dan Email.
13. Pengingat tetap diproses ketika pengguna offline.
14. Sistem memiliki retry email dan pencegahan notifikasi ganda.
15. Archive, Favorite, dan Trash berfungsi sesuai aturan.
16. Penghapusan permanen Trash berjalan setelah 30 hari.
17. Kuota default pengguna adalah 1 GB.
18. Pengguna dapat melihat penggunaan storage.
19. Dashboard pengguna dan admin tersedia.
20. Admin dapat mengelola akun dan kuota tanpa membaca isi data pribadi.
21. Pengguna dapat mengekspor data.
22. Pengguna dapat menghapus akun secara permanen dengan autentikasi ulang.
23. Aplikasi dapat digunakan pada desktop, tablet, dan smartphone.

---

# 10. Pending Decisions

Hal-hal berikut belum diputuskan dan tidak boleh dianggap sebagai keputusan final.

| No. | Topik | Detail yang perlu ditentukan |
|---|---|---|
| 1 | Timezone | Zona waktu akun dan perubahan zona waktu |
| 2 | Recurring Reminder | Pilihan pola pengulangan dan tanggal akhir |
| 3 | Snooze | Durasi penundaan pengingat |
| 4 | Email Retry | Jumlah percobaan dan interval retry |
| 5 | Export | Struktur ZIP, JSON, dan penanganan file besar |
| 6 | Admin Delete | Prosedur penghapusan akun oleh admin |
| 7 | Folder Delete | Nasib item ketika folder dihapus |
| 8 | Storage Warning | Ambang batas peringatan storage |
| 9 | Document Extraction | Mekanisme ekstraksi isi dokumen |
| 10 | Email Service | Infrastruktur dan layanan pengiriman email |
| 11 | Monitoring | Detail pemantauan dan pencatatan operasional |
| 12 | Notification History | Masa penyimpanan riwayat notifikasi |

---

# 11. Future Development

Fitur yang dapat dipertimbangkan setelah MVP:

- WhatsApp integration.
- Share to App.
- Video upload.
- OCR.
- Browser Push Notification.
- PWA.
- Subfolder.
- Sharing informasi.
- Free dan Premium subscription.
- Payment gateway.
- Multi-email account.
- Session/device management.
- Integrasi penyimpanan cloud.
- Advanced analytics.

---

# 12. Product Success Metrics

Keberhasilan produk dapat dievaluasi melalui indikator:

1. Jumlah pengguna yang berhasil melakukan registrasi.
2. Jumlah item yang berhasil disimpan.
3. Frekuensi pengguna kembali menggunakan aplikasi.
4. Jumlah pengingat yang berhasil dikirim.
5. Tingkat keberhasilan pengiriman email.
6. Tingkat keberhasilan pencarian informasi.
7. Tingkat penggunaan fitur Favorite, Archive, dan Folder.
8. Jumlah kegagalan upload dan penggunaan storage.

Target angka keberhasilan akan ditentukan setelah tersedia data penggunaan awal.

---

# 13. Product Principles

Seluruh pengembangan harus berpegang pada prinsip berikut:

**1. Privacy First**

Informasi pengguna adalah milik pribadi dan tidak boleh diakses pengguna lain.

**2. Save First, Remind When Needed**

Pengguna bebas menyimpan informasi tanpa harus membuat pengingat.

**3. Reliable Reminder**

Pengingat harus tetap bekerja meskipun pengguna sedang offline atau tidak membuka aplikasi.

**4. Easy Organization**

Pengguna harus dapat mengatur dan menemukan informasi dengan mudah.

**5. Secure Storage**

File dan informasi harus disimpan dengan aman serta mengikuti batas kapasitas akun.

**6. User Control**

Pengguna memiliki kendali atas informasi pribadi, termasuk mengekspor dan menghapus akun.

---

**Dokumen PRD versi 1.0 – Draft selesai.**

Dokumen ini menjadi dasar pembahasan lanjutan, validasi kebutuhan, desain UI/UX, arsitektur sistem, dan pengembangan MVP.
