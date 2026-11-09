# 02 - THE REALITY AUDIT

Tujuan dokumen: menyampaikan fakta tanpa basa-basi soal apa yang kuat, apa yang rapuh, dan apa yang TIDAK diselesaikan desain ini. Baca sebelum mulai, dan baca ulang sebelum go-live.

Catatan: angka batas layanan gratis (kapasitas, jeda tidur project, backup) dapat berubah. **Verifikasi di halaman pricing/ dokumentasi resmi Supabase dan GitHub saat setup.**

## 1. Vonis singkat
Desain ini **layak dan cukup untuk data internal** (belasan divisi, ratusan sampai ribuan baris) dengan biaya nol. Ia **bukan** sistem dengan keamanan setingkat aplikasi ber-login. Keamanannya bergantung pada disiplin PIN, kebersihan konfigurasi database, dan tidak menyebar link ke luar. Satu kesalahan konfigurasi (RLS tidak aktif) bisa membuka seluruh data.

## 2. Yang sudah kuat
- Postgres asli: relasi, constraint, dan agregasi Overview mudah dan akurat.
- Semua logika penting (validasi, total, tanggal, log) di database, bukan di browser.
- Skala data kecil; performa bukan masalah.
- Biaya Rp0 dan tanpa server yang harus dirawat.

## 3. Yang rapuh (urut tingkat keparahan)

### R-01 [Critical] Anon key publik + kesalahan RLS = data terbuka
Repo publik berarti URL dan anon key terlihat semua orang (memang by design). Jika satu tabel lupa di-RLS atau hak `anon` tidak dicabut, siapa pun bisa membaca/ menghapus seluruh data lewat REST API.
Mitigasi: RLS aktif di semua tabel tanpa policy, `REVOKE ALL` dari `anon`/`authenticated`, tes S-01 s.d. S-04 wajib lulus sebelum data asli masuk, dan diulang setiap ada perubahan skema.

### R-02 [Critical] `service_role`/ secret key bocor ke repo
Key ini melewati RLS. Kalau ter-commit, seluruh pengamanan hilang.
Mitigasi: tidak pernah dipakai di proyek ini; `.gitignore`; periksa riwayat commit; bila bocor -> rotasi key di Supabase segera.

### R-03 [High] Tanpa login = tidak ada identitas orang
Log hanya tahu "divisi X" (dan nama yang diketik bila fitur nama pengisi dipakai). PIN bisa dibagikan, ditebak, atau diketahui mantan karyawan.
Mitigasi: PIN dirotasi Finance saat ada perubahan orang; kolom `actor_name` opsional di login; kunci percobaan salah (lockout). Terima kenyataannya: ini kontrol kepemilikan sederhana, bukan autentikasi kuat.

### R-04 [High] Project free tertidur / tidak ada backup otomatis
Project Supabase free dapat di-pause jika tidak aktif beberapa hari, dan paket free tidak menyediakan backup harian otomatis seperti paket berbayar (verifikasi).
Mitigasi: keepalive terjadwal + backup manual terjadwal oleh Finance (`pg_dump` mingguan dan export Excel). Lakukan satu simulasi restore sebelum go-live.

### R-05 [High] Hard delete + akses publik
Divisi boleh menghapus programnya sendiri (keputusan bisnis). Siapa pun yang memegang PIN dapat menghapus semua data divisi itu.
Mitigasi: log menyimpan snapshot JSON lengkap (header + item) sebelum dihapus; fitur "pulihkan dari log" (P2) atau pemulihan manual lewat SQL; backup mingguan. Dialog konfirmasi wajib.

### R-06 [Medium] Lockout bisa dipakai untuk mengganggu
Karena kunci percobaan per divisi, orang iseng bisa sengaja salah PIN dan mengunci divisi lain.
Mitigasi: kunci singkat (10 menit), Finance dapat membuka kunci dengan master PIN. Trade-off diterima.

### R-07 [Medium] Master PIN Finance adalah titik tunggal
Siapa pun yang tahu master PIN dapat melihat semua data, mengganti PIN, dan menghapus.
Mitigasi: PIN panjang (min. 10 karakter), tidak dibagikan, diganti berkala; lockout ketat; log setiap aksi finance.

### R-08 [Medium] Pengguna non-teknis dan tabel kebutuhan di HP
Mengisi tabel lebar di layar kecil melelahkan dan rawan salah. Pengisian anggaran satu tahun bisa puluhan baris.
Mitigasi: tampilan kartu per baris di HP, bar total yang menempel, autosave, dan fitur "Tempel dari Excel" (P1) agar bisa menyalin tabel yang sudah disiapkan di Excel.

### R-09 [Medium] Konflik edit
Dua orang memakai PIN yang sama bisa saling menimpa.
Mitigasi: optimistic locking (`updated_at`) -> pesan konflik.

### R-10 [Low-Medium] Alert "mirip" bisa salah (false positive/ negative)
Kemiripan nama pakai trigram, bukan kecerdasan sebenarnya.
Mitigasi: hanya peringatan, tidak memblokir; ambang dapat disetel.

### R-11 [Low] Data pribadi minimal
Nama PIC (dan nama pengisi) adalah data pribadi ringan. Simpan seperlunya, jangan tambahkan NIK/ kontak pribadi.

### R-12 [Low] Ketergantungan layanan pihak ketiga
Perubahan kebijakan gratis Supabase/ GitHub bisa memaksa migrasi.
Mitigasi: karena Postgres standar, data mudah dipindahkan (`pg_dump`). Simpan backup.

## 4. Asumsi yang bisa salah
- Semua divisi bisa mengakses internet stabil saat mengisi.
- Satu orang per divisi yang mengisi (Physiotherapist dipegang satu senior).
- Volume: jauh di bawah batas free tier.
- Finance sanggup menjadi pengelola PIN dan backup mingguan.
- Tahun anggaran hanya 2027.

## 5. Yang SENGAJA tidak diselesaikan
- Autentikasi per orang, SSO, 2FA.
- Approval berjenjang, budget vs realisasi, plafon (ditunda sampai fase budgeting).
- Lampiran file (belum ada file).
- Pemetaan COA (ditunda; kategori bebas dulu).
- Deadline pengisian otomatis (ditunda; bila perlu, saklar manual P2).

## 6. Realitas bekerja dengan Claude Pro di VS Code
- Ada batas pemakaian per periode; sesi panjang dapat habis di tengah jalan. Karena itu kerja dibagi **fase kecil** dan `PROGRESS.md` mencatat posisi terakhir.
- Konteks bisa terpotong pada percakapan panjang: dokumen dibuat mandiri; saat sesi baru, suruh Claude membaca `10_DECISIONS_LOG.md` dan `PROGRESS.md` dulu.
- Claude dapat salah. Jangan percaya "sudah aman" tanpa tes S-xx dijalankan nyata.
- Jangan menempel password/ key ke chat.

## 7. Kriteria berhenti/ pindah desain
Pertimbangkan pindah ke sistem ber-login (Supabase Auth atau Google Workspace SSO) bila: data berubah menjadi sensitif (gaji/ individu), pengguna >100 orang, ada insiden PIN bocor berulang, atau audit mensyaratkan identitas individu.

## 8. Checklist sebelum go-live (ringkas)
- [ ] Tes S-01..S-14 lulus di PROD.
- [ ] RLS aktif semua tabel; `anon` tak bisa SELECT/INSERT/UPDATE/DELETE langsung.
- [ ] Tidak ada secret di repo atau riwayat git.
- [ ] Keepalive berjalan; backup + restore pernah dicoba.
- [ ] Master PIN diganti dari PIN awal; PIN divisi didistribusikan terpisah dari link.
- [ ] UAT pilot 2-3 divisi selesai; bug Critical/High = 0.
