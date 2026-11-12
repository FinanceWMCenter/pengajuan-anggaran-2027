# 07 - THE SAFETY NET: RENCANA PENGUJIAN

Tujuan: memastikan keamanan, kebenaran angka, dan kenyamanan pakai sebelum data asli masuk. Setiap tes punya ID; hasilnya dicatat di kolom Status (Belum / Lulus / Gagal -> catat di `06_ERROR_LOG_BUG.md`).

Prioritas: **P0** wajib lulus sebelum go-live, **P1** sangat disarankan, **P2** bila sempat.

## 0. Persiapan
- Dua project Supabase: DEV (uji) dan PROD. Semua tes dijalankan dulu di DEV, tes keamanan diulang di PROD sebelum go-live.
- Jalankan `db/06_bootstrap.sql` (PIN) lalu `db/99_test_seed.sql` (data demo realistis, 158 program, semua divisi terisi Jan-Des, campuran Draft/ Diajukan) di DEV.
- Siapkan variabel: `URL` (Project URL), `ANON` (anon key). Contoh pemanggilan REST (Windows PowerShell gunakan `curl.exe`):
  `curl -s "$URL/rest/v1/programs?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"`
- Catat versi dan tanggal tiap putaran uji.

## 1. Keamanan (S) - semua P0

| ID | Skenario | Langkah | Hasil diharapkan | Status |
|---|---|---|---|---|
| S-01 | Anon tidak bisa baca tabel | REST GET ke tiap tabel (programs, program_items, divisions, sessions, audit_log, login_attempts, app_settings, dst) dengan anon key | Ditolak (401/403) atau array kosong tanpa data; TIDAK ada baris | Belum |
| S-02 | Anon tidak bisa tulis | REST POST/PATCH/DELETE ke `programs`, `divisions`, `app_settings` | Ditolak; data tidak berubah | Belum |
| S-03 | Hash PIN tidak terbaca | Coba baca `divisions.pin_hash`, `app_settings` lewat REST | Tidak bisa | Belum |
| S-04 | RLS aktif di semua tabel | Query `select relname, relrowsecurity from pg_class ...` untuk semua tabel public | Semua `true`; tidak ada tabel baru tanpa RLS | Belum |
| S-05 | Fungsi tanpa token ditolak | Panggil `rpc_list_programs` dengan token kosong/ acak | `AUTH_REQUIRED`/ `AUTH_EXPIRED` | Belum |
| S-06 | Isolasi antar divisi | Login divisi A; panggil `rpc_get_program` memakai id program divisi B | `FORBIDDEN`/ `NOT_FOUND`; tidak ada data B | Belum |
| S-07 | Divisi tidak bisa memakai fungsi finance | Token divisi memanggil `rpc_f_overview`, `rpc_f_set_division_pin` | `FORBIDDEN` | Belum |
| S-08 | Lockout | 5 PIN salah berturut-turut pada satu divisi | `LOCKED`; PIN benar pun ditolak sampai waktu habis; log `lockout` ada | Belum |
| S-09 | SQL injection | Isi nama program `'; drop table programs;--`, PIN `' or '1'='1` | Tersimpan sebagai teks biasa / ditolak; tabel utuh | Belum |
| S-10 | XSS | Nama program `<img src=x onerror=alert(1)>` dan uraian `<script>alert(1)</script>` | Tampil sebagai teks; tidak ada skrip jalan di semua halaman termasuk Overview & log | Belum |
| S-11 | Formula injection export | Uraian `=HYPERLINK("http://x","klik")` lalu export Excel/CSV | Sel diawali `'`, tidak menjadi formula | Belum |
| S-12 | Token kedaluwarsa | Ubah `expires_at` di DEV ke masa lalu lalu panggil RPC | `AUTH_EXPIRED`; UI minta PIN lagi | Belum |
| S-13 | Ganti PIN mencabut sesi | Login divisi, Finance reset PIN divisi, panggil RPC dengan token lama | Ditolak | Belum |
| S-14 | Tidak ada secret di repo | Cari pola `service_role`, `eyJ` (selain anon key), password, PIN asli di seluruh repo dan riwayat git | Tidak ada selain URL dan anon key | Belum |
| S-15 | Token tidak tersimpan plain | Periksa `sessions` | Hanya hash; tidak ada token mentah | Belum |
| S-16 | Master PIN lockout | 5 master PIN salah | Terkunci 15 menit; tercatat | Belum |

## 2. Database & fungsi (D) - P0

| ID | Skenario | Hasil diharapkan | Status |
|---|---|---|---|
| D-01 | Constraint panjang/ rentang (nama 2 huruf, bulan 13, qty 0, harga negatif) | Ditolak dengan `VALIDATION:*` | Belum |
| D-02 | Submit tanpa baris | Ditolak | Belum |
| D-03 | Submit dengan baris tanpa kategori | Ditolak; tidak ada perubahan status | Belum |
| D-04 | Subtotal dihitung DB (qty 2,5 x 100.000) | 250.000 | Belum |
| D-05 | Tanggal pengajuan WIB: submit pukul 23:30 WIB dan 00:30 WIB | Tanggal sesuai WIB, bukan UTC | Belum |
| D-06 | Total dari klien dimanipulasi | Diabaikan; total dihitung ulang | Belum |
| D-07 | Hapus program menghapus item (cascade) dan log menyimpan snapshot lengkap | Item hilang; `audit_log.old_data` berisi header + semua item | Belum |
| D-08 | Atomik: payload dengan 1 baris invalid di tengah | Seluruh simpan dibatalkan (tidak setengah tersimpan) | Belum |
| D-09 | Kategori nonaktif tidak bisa dipilih untuk baris baru, tetapi data lama tetap tampil | Sesuai | Belum |
| D-10 | `rpc_check_similar` | "Workshop Hiring Q1" mirip "Workshop Hiring Q1 2027" -> terdeteksi; nama jauh berbeda -> tidak | Belum |
| D-11 | Optimistic locking | Dua simpan dengan `expected_updated_at` lama | Yang kedua `CONFLICT` | Belum |
| D-12 | Skrip SQL jalan ulang di database kosong tanpa error (lokal dan Supabase) | Bersih | Belum |

## 3. Fungsional UI (F)

| ID | Prio | Skenario | Hasil diharapkan | Status |
|---|---|---|---|---|
| F-01 | P0 | Home menampilkan 12 divisi per grup, tanpa angka | Sesuai `09_MASTER_DATA.md` | Belum |
| F-02 | P0 | PIN benar -> masuk; PIN salah -> pesan + sisa percobaan | Sesuai | Belum |
| F-03 | P0 | Form: tombol Lanjut mati sampai 4 field wajib terisi | Sesuai | Belum |
| F-04 | P0 | Tabel kebutuhan tidak bisa diisi sebelum info lengkap | Sesuai | Belum |
| F-05 | P0 | Tambah/ hapus/ duplikat baris; subtotal dan total real-time | Benar | Belum |
| F-06 | P0 | Submit tanpa kategori baris -> diblok dengan penanda per baris | Sesuai | Belum |
| F-07 | P0 | Submit berhasil -> status Diajukan; tanggal pengajuan = tanggal submit | Sesuai | Belum |
| F-08 | P0 | Buka form hari ini, submit besok (ubah jam/ simulasi) | Tanggal pengajuan = hari submit | Belum |
| F-09 | P0 | Simpan Draft lalu buka lagi dari daftar | Data utuh | Belum |
| F-10 | P0 | Autosave: isi form, tutup tab, buka lagi | Ada tawaran memulihkan draft lokal | Belum |
| F-11 | P0 | Keluar dengan perubahan belum tersimpan | Peringatan muncul | Belum |
| F-12 | P0 | Edit program yang sudah diajukan; tanggal pengajuan tidak berubah; "terakhir diubah" berubah | Sesuai | Belum |
| F-13 | P0 | Hapus program (divisi): dialog konfirmasi; hilang dari daftar; log tercatat | Sesuai | Belum |
| F-14 | P0 | Hapus oleh Finance tanpa alasan -> diblok; dengan alasan >= 10 karakter -> berhasil + log berisi alasan | Sesuai | Belum |
| F-15 | P0 | Alert kategori tidak ada tampil di bawah dropdown dengan tautan WA/ email Finance | Sesuai | Belum |
| F-16 | P0 | Tidak ada opsi "Lain-lain" di kedua dropdown | Sesuai | Belum |
| F-17 | P1 | Duplikat program: form terisi, alert bila mirip, bisa lanjut | Sesuai | Belum |
| F-18 | P1 | Tempel dari Excel: tempel 10 baris (tab-separated) | 10 baris terisi; baris tak valid ditandai | Belum |
| F-19 | P0 | Filter bulan/ kategori/ status/ cari di Ringkasan | Hasil benar | Belum |
| F-20 | P0 | Konflik edit (dua tab satu PIN) | Dialog konflik; tidak menimpa diam-diam | Belum |
| F-21 | P0 | Sesi habis di tengah mengisi | Data form aman (autosave), diminta PIN, kembali ke form | Belum |
| F-22 | P0 | Finance: atur PIN divisi, PIN baru tampil sekali, PIN lama tak berlaku | Sesuai | Belum |
| F-23 | P0 | Finance: tambah kategori baru -> muncul di dropdown divisi; nonaktifkan -> hilang dari pilihan baru | Sesuai | Belum |
| F-24 | P0 | Finance: log menampilkan aksi create/ submit/ update/ delete/ pin_reset dengan filter | Sesuai | Belum |
| F-25 | P0 | Export xlsx dan csv: jumlah baris dan total sama dengan database | Sama | Belum |
| F-26 | P0 | Angka Rupiah: ketik 1250000 -> tampil 1.250.000; tempel "Rp 1.250.000" dibersihkan | Sesuai | Belum |
| F-27 | P0 | Batas karakter dan pesan error per field | Sesuai | Belum |
| F-28 | P0 | Divisi A tidak bisa membuka URL divisi B tanpa PIN B | PIN gate muncul | Belum |

## 4. Overview & rekonsiliasi (O) - P0

| ID | Skenario | Hasil diharapkan | Status |
|---|---|---|---|
| O-01 | Total setahun Overview = `sum(subtotal)` program Diajukan (query di `04_ERD.md`) | Selisih 0 | Belum |
| O-02 | Per bulan: 12 baris, total cocok dengan query | Selisih 0 | Belum |
| O-03 | Per kuartal = jumlah 3 bulan terkait | Selisih 0 | Belum |
| O-04 | Per kategori program dan kategori baris | Selisih 0 | Belum |
| O-05 | Draft tidak ikut total; teks "N draft belum dihitung" benar | Sesuai | Belum |
| O-06 | Overview Finance per divisi dan per grup (rollup HR = 5 sub-divisi); daftar divisi belum mengisi benar | Sesuai | Belum |
| O-07 | Bulan/ kategori/ program terbesar benar; seri sama besar ditangani konsisten | Sesuai | Belum |
| O-08 | Overview divisi hanya berisi data divisinya | Sesuai | Belum |

## 5. UI/UX & perangkat (U)

| ID | Prio | Skenario | Hasil diharapkan | Status |
|---|---|---|---|---|
| U-01 | P0 | Layar 360px: semua halaman bisa dipakai, tanpa scroll horizontal halaman | Sesuai | Belum |
| U-02 | P0 | Tabel kebutuhan di HP tampil sebagai kartu per baris, bar total menempel | Sesuai | Belum |
| U-03 | P0 | Tombol dan input berukuran nyaman disentuh; input angka memunculkan keyboard numerik | Sesuai | Belum |
| U-04 | P1 | Navigasi keyboard di desktop (Tab, Enter menambah baris) | Sesuai | Belum |
| U-05 | P1 | Kontras dan fokus terlihat; label terbaca pembaca layar dasar | Sesuai | Belum |
| U-06 | P0 | Chrome, Edge, Firefox, Safari (iOS) | Konsisten | Belum |
| U-07 | P1 | Koneksi lambat/ putus: pesan ramah, data form tidak hilang | Sesuai | Belum |
| U-08 | P0 | Empty state, loading, dan error tampil di semua daftar | Sesuai | Belum |

## 6. Operasional (R)

| ID | Prio | Skenario | Hasil diharapkan | Status |
|---|---|---|---|---|
| R-01 | P0 | Deploy Pages dari folder `web/` saja; `project-docs/` tidak terbuka di URL publik | Sesuai | Belum |
| R-02 | P0 | Keepalive dijalankan manual (`workflow_dispatch`) | Sukses, `rpc_ping` ok | Belum |
| R-03 | P0 | Backup `pg_dump` dijalankan; file tersimpan di luar repo | Ada | Lulus |
| R-04 | P0 | **Simulasi restore** backup ke Postgres lokal/ project kosong | Data sama | Lulus |
| R-05 | P1 | Cek kapasitas penyimpanan database di dashboard | Jauh dari batas | Belum |
| R-06 | P0 | Ganti `config.js` ke PROD; seluruh alur dasar diuji dengan data uji lalu dibersihkan | Sesuai | Belum |
| R-07 | P0 | Pembersihan data uji sebelum go-live (program palsu, log uji, sesi) | Kosong, PIN asli aktif | Belum |

## 7. UAT (pilot)
1. Pilih 2-3 divisi (disarankan satu HR, Marketing, Physiotherapist).
2. Beri PIN uji, 30-60 menit, tugas: buat 3 program (satu draft, satu dengan 8+ baris, satu duplikat), edit, hapus satu.
3. Kumpulkan: hambatan, istilah membingungkan, waktu pengisian, perangkat yang dipakai.
4. Catat semua temuan di `06_ERROR_LOG_BUG.md`; perbaiki; ulangi tes terkait.
5. Hapus data pilot sebelum go-live.

## 8. Kriteria lulus
- Semua P0 pada S, D, F, O, U, R = Lulus.
- Tidak ada bug Critical/ High terbuka.
- UAT pilot menyelesaikan tugas tanpa bantuan teknis.
- Tes S-01..S-04 dan S-14 dijalankan ulang di PROD pada hari go-live.

## 9. Regresi
Setelah setiap perubahan skema/ fungsi: ulang S-01..S-07, D-01..D-03, O-01..O-03. Setelah perubahan UI form: ulang F-03..F-10.

## 10. Hasil putaran uji 1 (2026-11-09, lingkungan lokal)

Lingkungan: PostgreSQL 18 lokal (database uji terpisah, role `anon`/`authenticated` meniru Supabase) + server uji yang meniru API Supabase + Chrome otomatis (desktop 1366px dan HP 360px). **Belum** di Supabase DEV: tes S-xx wajib diulang di sana (Fase 3).

Alat uji di repo:
- `tests/sql/run_all.sql` (dijalankan via `tests/run_db_tests.ps1`): 128 cek otomatis S/D/O/F, **semua lulus**.
- `tests/js/utils.test.mjs` (`node tests/js/utils.test.mjs`): 38 cek format Rupiah/qty/tanggal/anti-formula, **semua lulus**.
- `tests/rest_security_check.ps1`: cek S-01..S-05 lewat internet ke Supabase (dijalankan Finance setelah project DEV dibuat).
- Uji browser end-to-end (skrip di luar repo, dijalankan Claude): 85 cek, **semua lulus**.

| ID | Status | Catatan |
|---|---|---|
| S-01, S-02, S-03, S-04 | Lulus (lokal) | Ulang di Supabase DEV + PROD dengan `rest_security_check.ps1` |
| S-05, S-06, S-07, S-09, S-12, S-13, S-15 | Lulus (lokal) | |
| S-08, S-16 | Dibatalkan | D-28 tanpa lockout; diganti cek "PIN benar tetap diterima setelah 5x salah" (lulus) |
| S-10 | Lulus | Nama/uraian berisi HTML tampil sebagai teks; tidak ada alert |
| S-11 | Lulus | CSV dan Excel: sel `=`/`+`/`-`/`@` diberi awalan `'`, tidak ada formula |
| S-14 | Lulus (sebelum commit) | Ulang setelah commit pertama dan sebelum go-live |
| D-01 s.d. D-12 | Lulus (lokal) | D-12: semua skrip SQL dijalankan 2x berturut-turut tanpa error |
| F-01 s.d. F-17, F-19, F-21 s.d. F-28 | Lulus (lokal, e2e) | F-02 tanpa "sisa percobaan" (D-28) |
| F-18 | Lulus | Versi D-34: unggah file Excel 10 baris, 2 baris tak valid ditandai |
| F-20 | Sebagian | Konflik diuji di database (D-11); uji dua tab manual saat UAT |
| O-01 s.d. O-08 | Lulus (lokal) | Overview = query mentah, selisih 0 |
| U-01, U-02, U-03, U-08 | Lulus (Chrome 360px & 1366px) | |
| U-04, U-05, U-07 | Sebagian | Label/fokus/keyboard sudah dibuat; cek manual saat UAT |
| U-06 | Belum | Uji di Edge, Firefox, Safari iOS saat UAT |
| R-01 s.d. R-07 | Belum | Butuh project Supabase + GitHub Pages (Fase 3 & 11) |

## 11. Audit angka (2026-11-09, data demo 158 program)

Tujuan: memastikan SEMUA angka benar, dari subtotal baris sampai Overview Finance dan export.

| Lapisan | Cara | Jumlah angka | Hasil |
|---|---|---|---|
| Database | `tests/sql/reconcile.sql`: hitung ulang dari qty x harga mentah (rumus pembulatan terpisah) lalu bandingkan dengan subtotal, total program, Overview tiap divisi (bulan, kuartal, kategori program, kategori kebutuhan, %, rata-rata, kartu terbesar, top 5), Overview Finance (per divisi, per grup, %, top 10, status pengisian), export | 1.406 | 0 selisih |
| Tampilan | Browser membuka 12 divisi + Finance, membaca angka di layar: kartu, tabel Ringkasan, baris TOTAL, semua tabel Overview, detail & form edit SEMUA 158 program, file Excel export (per divisi x per bulan) | 3.683 | 0 selisih (setelah perbaikan BUG-014/016) |
| Uji kepekaan | Perhitungan sengaja dirusak dalam transaksi yang dibatalkan (draft ikut dihitung; export kosong) | - | Selisih langsung terdeteksi; data asli tidak berubah |

Termasuk qty desimal: 127,5 m2 x Rp55.000; 2,5 botol x Rp33.333 = Rp83.332,5 -> Rp83.333; 37,75 liter x Rp12.333 = Rp465.570,75 -> Rp465.571 (database, form, dan export sama).

Cara mengulang: `tests/run_db_tests.ps1` (lokal, langkah 4 otomatis), atau tempel `tests/sql/reconcile.sql` di Supabase SQL Editor (hanya membaca; aman di PROD) -> semua baris harus "COCOK".

## 12. Fase 3: uji keamanan di Supabase DEV (2026-11-09)

Project `anggaran-2027-dev` (Singapore, Free). SQL 01-05, 06_bootstrap, 99_test_seed dijalankan via SQL Editor; `reconcile.sql` = SEMUA COCOK (1.406 angka). `tests/rest_security_check.ps1` dengan publishable key: **SEMUA CEK KEAMANAN LULUS** (S-01 baca 10 tabel ditolak, S-02 tulis ditolak, S-03 pin_hash tidak terbaca, fungsi internal tertutup, S-05 tanpa token/token acak ditolak). Web lokal memuat 12 divisi dari Supabase tanpa error (CSP + publishable key OK).

## 13. Perubahan login PIN langsung (D-38/D-39), 2026-11-10

| Lapisan | Hasil |
|---|---|
| SQL (`run_all.sql`) | 142 cek lulus, termasuk baru: PIN menentukan divisi, PIN Finance 6 digit, PIN 5/7 digit ditolak, PIN milik divisi lain/Finance ditolak saat diatur, PIN kembar -> login ditolak (PIN_DUPLICATE), 13 PIN acak unik, fungsi pembantu PIN tertutup dari browser, login lama tetap berfungsi |
| Bootstrap & reset | `06_bootstrap.sql` 13 PIN 6 digit unik, aman diulang; `07_reset_semua_pin.sql` tidak berbuat apa-apa sebelum konfirmasi 'YA', setelahnya 13 PIN baru unik |
| Kecepatan | Login 1 PIN dicek ke 13 akun: +/- 0,05-0,07 detik (lokal) |
| Browser (e2e) | 94 cek lulus: pita 12 divisi urut & bergerak kanan->kiri, PIN langsung masuk divisi/Finance, tautan divisi + PIN -> kembali ke halaman tujuan, logout -> halaman masuk, "kurangi gerakan", tanpa scroll ke samping di 360/768/1366x650/1920 |
| Audit angka tampilan | 3.682 angka, 0 selisih |

## 14. Divisi ke-13 Project Expansion (D-40), 2026-11-10

Simulasi pembaruan DEV (database versi sebelumnya -> 02, 06, 99 baru): 06 hanya membuat 1 PIN (Project Expansion), PIN 12 divisi lama & Finance tidak berubah; data demo 170 program, 13/13 divisi terisi 12 bulan; reconcile 1.531 angka SEMUA COCOK. Tes penuh: SQL lulus (8 grup/13 divisi), e2e 94/94 (pita 13 nama), audit tampilan 3.993 angka 0 selisih.

## 15. Operasional (R), 2026-11-10

| ID | Status | Catatan |
|---|---|---|
| R-01 | Lulus | Pages hanya dari `web/`; `project-docs/` 404 di URL publik |
| R-02 | Lulus | Keepalive dijalankan manual (workflow_dispatch) -> Success, rpc_ping ok; Variables SUPABASE_URL & SUPABASE_ANON_KEY terisi |
| R-03 | Lulus | `tools/backup.ps1` dari Supabase DEV (Session pooler): 10 tabel, 119 KB, disimpan di `Dokumen\Backup-Anggaran2027` (di luar repo) |
| R-04 | Lulus | `tools/restore_test.ps1`: backup asli dipulihkan ke Postgres lokal; 172 program, 437 baris, 31 log, total diajukan Rp3.455.406.404; reconcile 1.541 angka SEMUA COCOK |
| R-05..R-07 | Belum | Saat persiapan PROD |

## 16. UAT "trial & error" oleh Claude pada salinan data DEV, 2026-11-10

Pengganti UAT divisi pilot (Finance tidak sempat melibatkan divisi). Dijalankan pada **salinan persis DEV** (hasil restore backup asli + 04 + PIN uji lokal), bukan di Supabase, supaya data DEV tidak terganggu.

| Uji | Hasil |
|---|---|
| Kode database DEV vs repo | 41 fungsi, 67 kolom, 82 constraint, trigger, RLS 10/10 sama persis |
| E2E lama (94 cek) pada data dummy & salinan DEV | 94/94 dan 94/94 |
| Audit angka tampilan vs database (13 divisi + Finance) | 4.020 angka, selisih 0 |
| Pembulatan subtotal layar vs database | 30.013 pasang angka (termasuk kasus x,5) sama persis |
| Cara ketik qty/harga (2,5 / 2.500 / Rp 1.500.000 / 1,5jt) | Dikenali benar; yang tidak valid ditolak |
| Form dengan angka rawan (6 baris): layar = dialog = database = detail | Sama |
| Salah ketik angka raksasa | Ditolak: "Total program terlalu besar" |
| Klik dobel (mouse sungguhan & program) Submit/Kirim/Draft/Hapus | 1 dialog, 1 program (setelah BUG-021) |
| Edit bersamaan di 2 tab | Tab kedua diperingatkan, tidak menimpa; "Muat ulang" menampilkan versi terbaru |
| Koneksi putus saat simpan | Pesan koneksi, isian tetap; setelah pulih tersimpan 1x |
| Batas isian (nama 150, qty >100.000, qty 0, 3 desimal, emoji/kutip) | Sesuai |
| Draft lama disubmit | Tanggal pengajuan = hari submit (WIB) |
| Kategori dinonaktifkan | Program lama tetap tampil & bisa disimpan; tidak bisa dipilih di program baru |
| Divisi tanpa program | Ringkasan & Overview rapi, tanpa NaN/undefined |
| Token sesi dirusak / Keluar lalu Back | Diminta PIN lagi, data tidak tampil |
| Ganti PIN Finance & reset PIN divisi bentrok | PIN lama salah/bentrok/ulangan beda ditolak; PIN baru berlaku |
| Semua halaman Finance + 13 divisi di HP 390px | Tanpa teks rusak, tanpa geser samping |
| Tabel di laptop 1280-1920px | Semua kolom terlihat (setelah BUG-022) |
| Restore + keamanan | 04 dipasang ulang otomatis (BUG-023) |

Total UAT baru: 63/63 lulus. Tes SQL 143 lulus; utils 38/38.

## 17. Animasi selamat datang (D-41), 2026-11-10

| Uji | Hasil |
|---|---|
| Divisi: "Selamat datang, HR-PD" + "Human Resource · Anggaran 2027"; halaman divisi dimuat di belakang | Lulus |
| Selesai sendiri < 3,6 detik; setelahnya halaman bisa diklik (tidak ada lapisan tertinggal) | Lulus |
| Klik / tombol keyboard saat animasi -> langsung menutup | Lulus |
| Finance: "Selamat datang, Finance" -> Overview Finance | Lulus |
| PIN salah: tidak ada animasi | Lulus |
| HP 390px, nama panjang (Brand and Communication): tidak terpotong di tengah kata | Lulus |
| "Kurangi gerakan": versi fade < 2 detik | Lulus |
| Masuk lewat tautan form (sesi habis saat mengisi): tanpa animasi, langsung ke form | Lulus |
| Tautan Overview: animasi lalu ke halaman tujuan | Lulus |
| Tanpa error JavaScript (termasuk mode gelap) | Lulus |

17/17 lulus. Regresi: e2e 94/94 (data dummy & salinan DEV), UAT 63/63, audit tampilan 4.020 angka selisih 0, utils 38/38.

## 18. Pop-up rincian Overview Finance (D-42), 2026-11-11

Diuji pada salinan data DEV; `05_overview.sql` dijalankan sebagai satu Run, dua kali berturut-turut (aman diulang).

| Uji | Hasil |
|---|---|
| Semua baris yang bisa diklik (bulan, kuartal, top program, kedua kategori, grup, divisi) dan 6 kartu: angka Overview = TOTAL pop-up = jumlah kolom = hitungan langsung database | 383 angka cocok |
| Kolom tabel Overview tidak berubah; kartu Rata-rata tidak bisa diklik | Lulus |
| Sesi divisi / token acak ditolak; rincian tanpa draft; pembantu internal tetap tertutup | Lulus (tes SQL) |
| Overview divisi: tidak ada yang bisa diklik, tautan tetap | Lulus |
| Enter/Esc, klik dobel mouse = 1 pop-up, Back & tautan menutup pop-up | Lulus |
| Daftar panjang: judul kolom dan baris TOTAL tetap terlihat | Lulus |
| Koneksi putus: pesan + Coba lagi; data berubah: peringatan + Muat ulang | Lulus |
| Nama berisi HTML tampil sebagai teks; layar HP 390px muat | Lulus |

511 cek lulus. Regresi: SQL 150, e2e 94/94 (data dummy & salinan DEV), UAT 63/63, animasi 17/17, audit tampilan 4.020 angka selisih 0, reconcile SEMUA COCOK, utils 38/38.

Revisi (kolom pertama Bulan, tanpa Tgl Pengajuan, kelompok + subtotal per divisi): isi setiap baris (bulan, divisi, nama, kategori, PIC, nilai; untuk kebutuhan juga uraian, satuan, harga, catatan) dicocokkan dengan database; setiap subtotal = jumlah barisnya = database; jumlah subtotal = TOTAL; urutan divisi = tabel Per divisi. 3.018 cek lulus (1.750 nilai). Regresi diulang: SQL 150, e2e 94/94 (data dummy & salinan DEV), UAT 63/63, animasi 17/17, audit tampilan 4.020 angka selisih 0, utils 38/38, reconcile SEMUA COCOK (4 kali: setelah e2e dummy, e2e DEV, UAT, dan pada data salinan DEV).

## 19. Revisi Finance per item, riwayat, notifikasi (D-43), 2026-11-11

Diuji pada database bersih dan salinan data DEV. Pembaruan DEV disimulasikan: 01, 03, 04, 05 masing-masing dijalankan dua kali berturut-turut.

| Uji | Hasil |
|---|---|
| Pembaruan database tidak mengubah data: jumlah program/item, total, dan sidik isi item & program sebelum = sesudah | 172 program, 437 item, identik |
| SQL: identitas item tetap, riwayat hanya sejak Diajukan, ubah/tambah/hapus tercatat, urutan dan simpan tanpa perubahan tidak tercatat, id asing/dobel jadi item baru | Lulus |
| SQL: penolakan revisi (sesi divisi, token acak, tanpa/kurang alasan, konflik versi, item asing/dobel, tidak berubah, qty 0, hapus semua item, draft); satu item salah = seluruh revisi batal | Lulus |
| SQL: total, status, tanggal pengajuan, Log Riwayat, penanda daftar, akses riwayat & notifikasi hanya pemilik, riwayat tetap ada setelah program dihapus, tabel & pembantu tertutup | Lulus |
| Klik sungguhan: Finance merevisi (validasi di layar, klik dobel = sekali simpan, peringatan keluar halaman, batalkan), angka halaman = database = perubahan Overview, teks HTML aman | Lulus |
| Klik sungguhan: divisi menerima notifikasi, melihat penanda & riwayat, mengedit lagi item yang sama (riwayat menyambung), duplikat baris, form lama tidak menimpa revisi; Finance menerima notifikasi; layar HP | Lulus |

SQL 227, klik revisi 83/83, e2e 94/94 (data dummy & salinan DEV), UAT 63/63, animasi 17/17, audit tampilan 4.020 angka selisih 0, utils 38/38, pop-up 3.018 cek, reconcile SEMUA COCOK (5 kali). Satu kali uji pop-up berhenti karena kesalahan otomasi browser ("detached Frame"); diulang 4 kali, semuanya lulus penuh.

D-44 (detail Log Riwayat): setiap entri di salinan DEV dibuka satu per satu (update, revise, submit, pin_reset, export, master_pin_change): ringkasan tampil, tidak ada JSON terlihat, data teknis tertutup dan lengkap saat dibuka, total sebelum → sesudah dan alasan per item sesuai database. 162 cek lulus.

D-45 (pop-up Overview divisi) dan D-46 (login tanpa nama): SQL +12 tes (rincian = total & jumlah Overview divisi, hanya program divisi sendiri, divisi lain FORBIDDEN, token acak AUTH_EXPIRED, Finance boleh lihat divisi pilihan, pembantu tertutup). Rincian Finance sebelum/sesudah perubahan identik (md5 sama di salinan DEV). `drill-division-test.mjs`: ke-13 divisi masuk dengan PIN masing-masing + Finance membuka 2 divisi; 531 pop-up dibuka, 3.465 angka dicocokkan 3 arah (angka Overview = TOTAL pop-up = jumlah baris = database), isi setiap baris = database divisi itu, tanpa kolom Divisi, kuartal per bulan dengan subtotal, tautan ke halaman program divisi, sesi divisi tidak bisa meminta rincian divisi lain atau rincian Finance lewat API, peringatan saat data berubah, XSS tampil sebagai teks, HP 390px. Login: tidak ada kolom nama, nama lama di browser terhapus, permintaan login tanpa nama. 4.899 cek lulus.
