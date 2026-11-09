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
| R-03 | P0 | Backup `pg_dump` dijalankan; file tersimpan di luar repo | Ada | Belum |
| R-04 | P0 | **Simulasi restore** backup ke Postgres lokal/ project kosong | Data sama | Belum |
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
