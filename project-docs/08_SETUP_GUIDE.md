# 08 - SETUP GUIDE (langkah demi langkah, untuk Finance)

Panduan ini untuk Anda (bukan programmer). Claude di VS Code akan menulis kodenya; bagian ini adalah hal-hal yang harus Anda lakukan sendiri. Detail tampilan menu Supabase/ GitHub bisa berubah sedikit; ikuti namanya.

## A. Yang perlu disiapkan
1. Komputer dengan **VS Code** + extension **Claude** (sudah ada).
2. **Git** terpasang. Cek di terminal VS Code: `git --version`. Jika belum, unduh dari git-scm.com dan pasang (pilihan bawaan).
3. **PostgreSQL** (sudah ada, versi 18 di `C:\Program Files\PostgreSQL\18`). Catatan: `psql` belum dikenal terminal (belum masuk PATH), jadi panggil dengan alamat lengkapnya, contoh: `& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version`. Skrip di folder `tests/` sudah memakai alamat lengkap ini.
3b. **Node.js** (sudah ada, v24) untuk menjalankan web di komputer sendiri.
4. Akun **GitHub** (gratis) dan akun **Supabase** (gratis; login pakai GitHub boleh).
5. Password manager (atau buku catatan aman) untuk menyimpan: password database, master PIN. **Jangan** tulis di file repo atau chat.

## B. Buat repo GitHub
> Sudah selesai: repo `github.com/FinanceWMCenter/pengajuan-anggaran-2027` sudah terhubung ke folder ini. Lewati bagian B.

1. GitHub -> New repository -> nama contoh `pengajuan-anggaran-2027` -> **Public** -> centang "Add a README" -> Create.
2. Di VS Code: `Ctrl+Shift+P` -> "Git: Clone" -> tempel URL repo -> pilih folder -> Open.
3. Buat folder `project-docs/` dan salin semua file 00-11 ke sana.
4. Commit dan push (Source Control di VS Code: tulis pesan "tambah dokumen proyek" -> Commit -> Sync/ Push).

## C. Buat project Supabase (DEV dulu, PROD nanti)
1. supabase.com -> New project.
2. Nama: `anggaran-2027-dev`. Database password: buat yang kuat, simpan di password manager.
3. Region: **Southeast Asia (Singapore)**. Plan: **Free**. Create.
4. Tunggu hingga siap. Buka **Project Settings -> API** (atau "Data API"). Catat:
   - **Project URL**
   - **anon / publishable key** (aman untuk dipakai di web)
   - **JANGAN** pakai/ salin `service_role` / secret key ke file mana pun.
5. Ulangi untuk project `anggaran-2027-prod` saat siap go-live (akun free biasanya mengizinkan 2 project; cek kebijakan terbaru).
6. Cek di halaman pricing Supabase: batas ukuran database, kebijakan project tidur, dan backup untuk paket Free.

## D. Menjalankan SQL di Supabase
**Di Supabase (DEV dulu):**
1. Buka project `anggaran-2027-dev` -> menu kiri **SQL Editor** -> **New query**.
2. Di VS Code buka file `db/01_schema.sql`, tekan `Ctrl+A` lalu `Ctrl+C`. Di SQL Editor tempel (`Ctrl+V`) lalu klik **Run**. Harus muncul "Success".
3. Ulangi langkah 2 (query baru setiap file) berurutan untuk: `02_seed_master.sql` -> `03_functions.sql` -> `04_security.sql` -> `05_overview.sql`.
4. **PIN (DEV dan PROD):** jalankan `06_bootstrap.sql`. Database membuat PIN **acak 6 digit** untuk Finance dan tiap divisi (semuanya berbeda, karena PIN menentukan siapa yang masuk - D-38), ditampilkan **satu kali** di tabel hasil di bawah editor. Salin semuanya ke password manager sekarang juga. (Bila dijalankan lagi, PIN yang sudah ada tidak berubah.) Master PIN bisa diganti nanti di halaman Finance -> Divisi & PIN.
4b. **Hanya DEV:** jalankan `99_test_seed.sql` untuk data demo realistis (158 program, semua divisi terisi Januari-Desember, sebagian draft). File ini tidak mengubah PIN.
5. Cek menu **Table Editor**: ada 10 tabel, masing-masing berlabel "RLS enabled".
6. **JANGAN** menjalankan `99_test_seed.sql` di PROD. Bila data uji terlanjur masuk sebelum go-live, jalankan `98_clear_test_data.sql` lalu `06_bootstrap.sql`.

**Uji SQL di Postgres lokal (opsional, disarankan setiap ada perubahan SQL):**
Terminal VS Code (PowerShell), dari folder repo:
```
powershell -ExecutionPolicy Bypass -File tests\run_db_tests.ps1
```
Ketik password user `postgres` bila diminta (bisa beberapa kali). Hasil akhir harus "SEMUA TES SQL LULUS". Skrip ini membuat/menimpa database bernama `anggaran_test` saja, tidak menyentuh database lain.

## D1b. Bila memperbarui database yang SUDAH berjalan (mis. perubahan login PIN langsung D-38)
Jalankan ulang file yang berubah, berurutan, di SQL Editor: `03_functions.sql` -> `04_security.sql`. Keduanya aman diulang dan tidak menyentuh data program.
Khusus perubahan D-38 (PIN Finance 8 -> 6 digit): jalankan `07_reset_semua_pin.sql` setelah mengganti kata 'TIDAK' menjadi 'YA'; salin 13 PIN baru yang tampil (sekali saja) ke password manager, lalu bagikan ulang ke PIC.

## D1c. Menambah divisi baru (contoh: Project Expansion, D-40)
1. Claude menambahkan divisi di `db/02_seed_master.sql` (dan contoh datanya di `99_test_seed.sql` untuk DEV).
2. Di SQL Editor jalankan berurutan: `02_seed_master.sql` (hanya menambah yang belum ada) -> `06_bootstrap.sql` (hanya membuat PIN untuk divisi baru; PIN lain tidak berubah) -> (DEV saja) `99_test_seed.sql`. Bila 99 menolak karena DEV sudah berisi program hasil uji coba, minta Claude membuat skrip TAMBAH khusus divisi baru (hanya menambah, tidak menghapus, tidak dobel) - contoh: 99b untuk Project Expansion (2026-11-10, dipakai sekali lalu dihapus dari repo).
3. Simpan PIN divisi baru dari hasil 06, lalu bagikan ke PIC-nya. Web otomatis menampilkan divisi baru (pita, Overview, export) tanpa perlu deploy.

## D2. Uji keamanan di Supabase (Fase 3 - WAJIB sebelum data asli masuk)
1. Siapkan Project URL dan anon/publishable key DEV (Project Settings -> API / Data API).
2. Terminal VS Code, dari folder repo (ganti isi tanda kutip):
```
powershell -ExecutionPolicy Bypass -File tests\rest_security_check.ps1 -Url "https://ISI.supabase.co" -AnonKey "ISI-ANON-KEY"
```
3. Hasil akhir harus "SEMUA CEK KEAMANAN LULUS". Bila ada GAGAL: jangan pakai project itu untuk data asli; salin hasilnya ke Claude (key anon boleh terlihat, tetapi jangan pernah menempel secret key/password).
4. Ulangi langkah ini di PROD pada hari go-live.

## E. Isi `web/config.js`
1. Buka `web/config.js` di VS Code.
2. Ganti `https://ISI-PROJECT-ID.supabase.co` dengan Project URL, dan `ISI-ANON-ATAU-PUBLISHABLE-KEY` dengan anon/publishable key. Simpan (`Ctrl+S`).
3. Hanya dua nilai ini. Keduanya memang publik. Jangan pernah menaruh secret key di file ini (deploy otomatis menolak bila menemukannya).
4. Untuk go-live, ganti kedua nilai ke project PROD.

## F. Jalankan web di komputer sendiri
1. Terminal VS Code, dari folder repo: `node tools/serve.mjs`
2. Buka `http://localhost:8080` di browser.
3. Uji alur: pilih divisi -> PIN -> Tambah Program -> Submit; lalu "Masuk sebagai Finance".
4. Berhenti: klik terminal lalu tekan `Ctrl+C`.

## G. Deploy ke GitHub Pages
1. Pastikan file workflow `.github/workflows/deploy-pages.yml` sudah dibuat Claude dan di-push.
2. GitHub repo -> **Settings -> Pages** -> **Build and deployment -> Source: GitHub Actions**.
3. Push ke `main`; lihat tab **Actions** hingga hijau.
4. Alamat web biasanya `https://<username>.github.io/<nama-repo>/`. Uji: halaman Home tampil, dan `project-docs` **tidak** bisa diakses lewat URL (tes R-01).

## H. Keepalive (agar project tidak tertidur)
1. Workflow `keepalive.yml` memanggil `rpc_ping` tiap ~3 hari.
2. GitHub -> Settings -> Secrets and variables -> Actions -> tab **Variables** -> tambahkan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (nilai ini memang publik).
3. Tab Actions -> pilih workflow keepalive -> **Run workflow** (uji manual) -> harus hijau.
4. Catatan: GitHub dapat menonaktifkan workflow terjadwal pada repo tanpa aktivitas lama (sekitar 60 hari). Cek tab Actions berkala; push kecil membangunkannya lagi.

## I. Backup (wajib, mingguan selama masa pengumpulan)
1. **Export dari web Finance** (xlsx) - cepat dan mudah dibaca.
2. **Backup database penuh** (Terminal VS Code, dari folder repo):
   ```
   powershell -ExecutionPolicy Bypass -File tools\backup.ps1
   ```
   - `Connection string:` tempel dari Supabase -> **Connect** -> Connection String -> **Shared/Session pooler** (port 5432). Bagian `[YOUR-PASSWORD]` biarkan apa adanya.
   - `Password:` tempel password database Supabase (klik kanan sekali; tidak terlihat, itu normal) -> Enter.
   - Hasil: **BACKUP BERHASIL**, file di `Dokumen\Backup-Anggaran2027` (di luar repo). Simpan salinan juga di tempat lain (mis. Google Drive Finance). **Jangan commit file .dump.**
   - Untuk PROD tambahkan `-Label PROD`.
   - Lupa password database Supabase? Connect -> **Reset database password** (aman: web & keepalive tidak memakai password ini).
3. **Latihan restore** (minimal sekali sebelum go-live, lalu sesekali):
   ```
   powershell -ExecutionPolicy Bypass -File tools\restore_test.ps1
   ```
   Memulihkan backup terbaru ke Postgres lokal (database `anggaran_restore`) lalu menjalankan audit angka; hasil harus **RESTORE BERHASIL** + SEMUA COCOK. Butuh password Postgres lokal (bila lupa, minta Claude menjalankannya atau memandu reset).
4. **Pemulihan sungguhan ke Supabase** (hanya bila data rusak/hilang; minta Claude memandu): pulihkan file backup ke project Supabase, lalu **wajib** jalankan ulang `db/04_security.sql` di SQL Editor (backup tidak membawa hak akses; tanpa langkah ini fungsi internal terbuka untuk publik), lalu `tests/rest_security_check.ps1` harus SEMUA LULUS sebelum web dipakai lagi.

## J. Checklist go-live
- [ ] Semua tes P0 lulus (file 07); `tests/rest_security_check.ps1` lulus di PROD; S-14 (tidak ada secret di repo) diulang.
- [ ] Project PROD dibuat; SQL dijalankan; PIN asli dibuat; **data uji tidak ada**.
- [ ] `config.js` menunjuk PROD; web ter-deploy.
- [ ] Master PIN diganti dari PIN awal (halaman Finance -> Divisi & PIN -> Master PIN Finance).
- [ ] PIN divisi dibagikan **terpisah** dari link (mis. WA pribadi ke PIC masing-masing).
- [ ] Keepalive hijau; backup pertama selesai dan restore pernah dicoba.
- [ ] Kontak Finance di footer benar.
- [ ] Pengumuman ke divisi: link, cara masuk (PIN), panduan singkat 5 langkah.

## K. Operasional harian/ mingguan
- Harian: cek halaman Finance Overview dan status pengisian; balas permintaan kategori baru (tambah lewat halaman Kategori).
- Mingguan: backup, cek tab Actions (keepalive), tinjau Log untuk penghapusan tak wajar, dan jalankan audit angka: Supabase -> SQL Editor -> tempel isi `tests/sql/reconcile.sql` -> Run -> semua baris harus "COCOK" (hanya membaca, aman).
- Saat PIC berganti: reset PIN divisinya.

## L. Penutupan masa pengumpulan
1. Export final (xlsx + dump).
2. Simpan salinan di lokasi aman. 
3. (Opsional, bila disetujui) minta Claude menambah saklar "kunci semua divisi (read-only)" agar data tidak berubah setelah final.
4. Lanjut ke FP&A: gunakan export sebagai sumber data.

## M. Bila ada masalah
| Gejala | Cek |
|---|---|
| Web kosong/ error di konsol | `config.js` URL/ key benar? |
| "PIN salah" padahal benar | Divisi terkunci? Reset oleh Finance; PIN baru sudah diset? |
| Data tidak muncul | Project tertidur? Buka dashboard -> Restore/ Resume |
| Deploy gagal | Tab Actions -> baca log merah -> tempel ke Claude (tanpa key rahasia) |
| Curiga kebocoran | Ikuti tabel respons insiden di `05_SECURITY_MODEL.md` |
