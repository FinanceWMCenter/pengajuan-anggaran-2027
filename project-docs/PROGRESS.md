# PROGRESS

Baca file ini + `10_DECISIONS_LOG.md` dulu setiap memulai sesi baru.

## Posisi saat ini (2026-11-09)
- **Selesai (lokal, teruji):** Fase 0, 1, 2, 4, 5, 6, 7, 8, 9 dan bagian kode Fase 11 (workflow deploy + keepalive). Tampilan memakai design kit WM Center (D-36), jadi Fase 12 praktis sudah tergabung.
- **Fase 3 selesai (2026-11-09):** Supabase DEV `anggaran-2027-dev` terpasang (SQL 01-06 + data demo), audit angka SEMUA COCOK, uji keamanan REST SEMUA LULUS, `web/config.js` menunjuk DEV.
- **Belum bisa dikerjakan Claude (butuh akun Finance):** Fase 10 (UAT 2-3 divisi pilot), Fase 11 (deploy nyata, keepalive, backup + latihan restore).
- **Sudah di-push** (commit d0d6ee8) dan web tayang di https://financewmcenter.github.io/pengajuan-anggaran-2027/ (belum terhubung database sampai `web/config.js` diisi). `project-docs/` tidak bisa dibuka lewat web (R-01 lulus).

## Menunggu Finance (urut)
1. ~~Cek hasil lalu commit + push~~ (selesai 2026-11-09; GitHub Pages Source: GitHub Actions sudah aktif).
2. Buat project Supabase DEV (`08_SETUP_GUIDE.md` bagian C) -> jalankan SQL (bagian D: 01-05, `06_bootstrap.sql`, lalu `99_test_seed.sql` untuk data demo) -> isi `web/config.js` (bagian E).
3. Jalankan `tests\rest_security_check.ps1` (bagian D2) -> kirim hasilnya ke Claude (Fase 3).
4. Coba web: `node tools/serve.mjs` -> http://localhost:8080 (bagian F).
5. GitHub: Settings -> Pages -> Source: GitHub Actions; isi Variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` (bagian G, H).
6. Pilih 2-3 divisi pilot untuk UAT (Fase 10).

## Isi repo (ringkas)
- `db/`: 01 skema, 02 data master, 03 fungsi RPC, 04 keamanan, 05 overview, 06 PIN awal acak, 98 hapus data uji, 99 data uji.
- `web/`: aplikasi (Home, PIN gate, Ringkasan, Form 2 langkah + impor Excel, Detail, Overview, Finance: Overview/Semua Program/Divisi & PIN/Kategori/Log/Export).
- `tests/`: `sql/run_all.sql` (128 cek), `run_db_tests.ps1`, `rest_security_check.ps1`, `js/utils.test.mjs` (38 cek).
- `tools/serve.mjs`, `.github/workflows/deploy-pages.yml`, `.github/workflows/keepalive.yml`.

## Hasil uji terakhir (2026-11-09, lokal)
- SQL: 128/128 lulus. Utilitas JS: 38/38 lulus. Browser end-to-end (Chrome 1366px + 360px): 85/85 lulus.
- Rincian per ID tes: `07_THE_SAFETY_NET_TESTING.md` bagian 10. Bug & perbaikan: `06_ERROR_LOG_BUG.md` (BUG-001..013; tidak ada Critical/High terbuka; BUG-004 menunggu verifikasi di Supabase).

## Catatan lingkungan
- Repo remote: github.com/FinanceWMCenter/pengajuan-anggaran-2027.
- PostgreSQL 18 di `C:\Program Files\PostgreSQL\18` (psql tidak di PATH; skrip memakai alamat lengkap). Node.js v24 tersedia.

## Riwayat
| Tanggal | Fase | Catatan |
|---|---|---|
| 2026-11-09 | 0 | Semua dokumen dibaca; keputusan D-27..D-35, A-14, T-01..T-06 |
| 2026-11-09 | 1-9, 11 (kode) | Repo, database, keamanan, web lengkap dengan design kit WM Center; diuji lokal (SQL + browser). Keputusan D-36, D-37, T-07..T-13 |
| 2026-11-09 | Data demo | `99_test_seed.sql` diganti data demo realistis (158 program, semua divisi Jan-Des, beberapa bulan >1 program); tidak lagi mengatur PIN; `98_clear_test_data.sql` kini butuh konfirmasi 'YA'; tes SQL mengembalikan PIN asli setelah selesai. SQL 128/128, browser 85/85 lulus |
| 2026-11-09 | Audit angka | `tests/sql/reconcile.sql` (1.406 angka DB) + audit tampilan (3.683 angka di layar, semua 158 program) = 0 selisih. Perbaikan BUG-014 (baris TOTAL kini hanya Diajukan), BUG-015, BUG-016. Data demo ditambah qty desimal untuk uji pembulatan |
| 2026-11-09 | Push & deploy | Commit d0d6ee8 di-push; GitHub Pages sukses; web tayang; R-01 (dokumen tidak terbuka di web) lulus |
| 2026-11-09 | 3 | Supabase DEV aktif; reconcile SEMUA COCOK; rest_security_check SEMUA LULUS; config.js diisi (URL + publishable key DEV); BUG-017 (seed tanpa tabel sementara), BUG-018 (skrip cek PS 5.1) |
| 2026-11-10 | Fitur | Login PIN langsung + PIN Finance 6 digit + PIN unik (D-38), pita divisi berjalan (D-39); `db/07_reset_semua_pin.sql`; BUG-019, BUG-020. Lokal: SQL 142/142, e2e 94/94, audit tampilan 3.682/0 selisih. Menunggu: Finance menjalankan 03, 04, 07 di Supabase DEV, lalu push web |
| 2026-11-10 | Rilis D-38/D-39 | Supabase DEV: 03, 04, 07 dijalankan (13 PIN baru 6 digit disimpan Finance); web e741214 tayang; cek online: pita 12 divisi bergerak, PIN salah ditolak, login PIN salah +/- 0,9 dtk (termasuk jeda 0,5 dtk) |
| 2026-11-10 | D-40 | Divisi Project Expansion (grup sendiri) + data demo (12 bulan). Lokal: SQL lulus, e2e 94/94, audit tampilan 3.993/0. Menunggu: Finance menjalankan 02, 06, 99 di Supabase DEV |
| 2026-11-10 | D-40 | 99 ditolak di DEV (ada program hasil uji coba) -> dibuat `db/99b_demo_project_expansion.sql` (tambah saja, teruji: data lain utuh, tidak dobel, reconcile SEMUA COCOK) |
| 2026-11-10 | D-40 selesai di DEV | 02, 06 (PIN Project Expansion), 99b dijalankan Finance; web online menampilkan 13 divisi/8 grup. 99b dihapus dari repo (data demo kembali di satu tempat: 99_test_seed.sql) |
| 2026-11-10 | Keepalive | Variables GitHub terisi; Keepalive Supabase #1 Success (R-02 lulus). Berikutnya: latihan backup & restore (R-03/R-04), UAT pilot, PROD |
| 2026-11-10 | Backup & restore | tools/backup.ps1 + tools/restore_test.ps1 (teruji). Backup DEV 119 KB; restore 172 program, total Rp3.455.406.404, reconcile SEMUA COCOK (R-03/R-04 lulus). Berikutnya: UAT pilot, lalu PROD |
| 2026-11-10 | UAT trial & error | Claude menguji semua proses pada salinan data DEV (63 skenario baru + e2e 94 + audit 4.020 angka). Diperbaiki: BUG-021 klik dobel, BUG-022 tabel terpotong di laptop 1280-1366px, BUG-023 keamanan setelah restore. Berikutnya: animasi selamat datang (pilih desain), lalu PROD |
| 2026-11-10 | Animasi selamat datang | D-41 opsi D (gerbang navy -> menyusut ke ikon akun), dipercepat ~18%. Tes animasi 17/17 + regresi penuh lulus. Berikutnya: PROD |
