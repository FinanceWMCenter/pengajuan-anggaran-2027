# 06 - ERROR LOG & BUG TRACKER

Dipakai oleh Claude (saat mengembangkan) dan Finance (saat UAT/ operasional). Perbarui setiap ada temuan; jangan menghapus baris, ubah statusnya.

## 1. Tingkat keparahan
| Level | Arti | Contoh | Target penyelesaian |
|---|---|---|---|
| Critical | Data bocor/ hilang, keamanan jebol, sistem tak bisa dipakai | RLS mati; divisi A melihat divisi B | Segera, blok go-live |
| High | Fitur inti gagal atau angka salah | Total Overview selisih; submit gagal | Sebelum go-live |
| Medium | Fitur sebagian bermasalah ada jalan keluar | Filter bulan tidak bekerja di HP | Sebelum go-live bila mudah |
| Low | Kosmetik/ teks | Typo, spasi | Kapan sempat |

## 2. Status
`Baru` -> `Dianalisis` -> `Diperbaiki` -> `Menunggu verifikasi` -> `Selesai` (atau `Ditolak` / `Tidak akan diperbaiki` dengan alasan).

## 3. Alur
1. Catat temuan dengan langkah reproduksi yang jelas.
2. Tetapkan level dan area (DB, Keamanan, Form, Overview, Admin, UI, Deploy, Data).
3. Perbaiki -> catat commit/ file yang diubah.
4. Verifikasi dengan tes terkait (ID dari `07_THE_SAFETY_NET_TESTING.md`) -> ulangi tes regresi area itu.
5. Review mingguan oleh Finance selama pengumpulan data berjalan.

## 4. Tabel bug

| ID | Tanggal | Level | Area | Ringkasan | Langkah reproduksi | Seharusnya | Terjadi | Status | Perbaikan (commit/ file) | Diverifikasi (tes, tanggal) |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-000 | (contoh) | Low | UI | CONTOH: teks tombol terpotong di HP | 1) Buka form di 360px 2) Lihat tombol | Teks penuh | Terpotong | Selesai | contoh | U-03, - |
| BUG-001 | 2026-11-09 | Medium | Data | Dokumen: DDL `program_items.uraian` NOT NULL bertentangan dengan draft yang boleh belum lengkap | Simpan Draft dengan baris tanpa uraian | Draft tersimpan | Ditolak constraint | Selesai | T-01; `db/01_schema.sql` (uraian boleh kosong), validasi penuh di `rpc_save_program` | T-01 + D-03 (tests/sql/run_all.sql), F-09 (e2e), 2026-11-09 lokal |
| BUG-002 | 2026-11-09 | Medium | DB | Dokumen: check status vs tanggal_pengajuan menghapus tanggal bila program Diajukan kembali ke Draft | Edit program Diajukan lalu Simpan Draft | Tanggal pengajuan tetap | Tanggal hilang/ ditolak | Selesai | D-30; `rpc_save_program` (status Diajukan permanen, tanggal tetap) | D-30 + F-12 (SQL & e2e), 2026-11-09 lokal |
| BUG-003 | 2026-11-09 | High | DB | Dokumen: qty numeric(12,2) x harga 1 triliun bisa melebihi bigint -> error simpan | qty 9.999.999.999 x harga 1.000.000.000.000 | Ditolak dengan pesan validasi | Error overflow | Selesai | T-02; qty numeric(8,2) maks 100.000, total program maks Rp1.000 triliun | D-01 "qty > 100.000", 2026-11-09 lokal |
| BUG-004 | 2026-11-09 | High | Keamanan | Dokumen: "revoke from public" tidak cukup di Supabase (akses default ke anon/authenticated) | Buat fungsi pembantu tanpa revoke eksplisit | Tidak bisa dipanggil anon | Bisa dipanggil anon | Selesai | T-04; `db/04_security.sql` (revoke eksplisit + default privileges) | S-01..S-05 lulus di Supabase DEV via tests/rest_security_check.ps1, 2026-11-09 |
| BUG-005 | 2026-11-09 | Medium | Keamanan | Dokumen: login gagal dilempar sebagai exception membatalkan pencatatan percobaan | PIN salah | Percobaan tercatat | Catatan ter-rollback | Selesai | T-05; `rpc_login`/`rpc_login_finance` mengembalikan {ok:false} | T-05 "percobaan PIN salah tercatat", 2026-11-09 lokal |
| BUG-006 | 2026-11-09 | Low | Data | Dokumen: `07` dan `09` sempat tidak ada di folder | Buka `project-docs/` | 11 file lengkap | 2 file hilang | Selesai | Finance menambahkan file | Diperiksa manual 2026-11-09 |

| BUG-007 | 2026-11-09 | High | DB | Konflik edit tidak terdeteksi bila dua simpan terjadi dalam satu transaksi: `now()` tidak bergerak sehingga `updated_at` sama | Dua `rpc_save_program` dengan `expected_updated_at` lama dalam satu transaksi | `CONFLICT` | Simpan kedua menimpa | Selesai | T-09: `updated_at = clock_timestamp()` di `db/03_functions.sql` + trigger `db/01_schema.sql` | D-11 (SQL), 2026-11-09 lokal |
| BUG-008 | 2026-11-09 | Low | Data | ID kategori seed tidak urut sesuai daftar (aplikasi tetap benar karena memakai sort_order) | Jalankan 02_seed_master.sql di DB kosong | ID 1=Jasa, 2=Konsumsi, ... | Urutan ID acak | Selesai | `order by v.sort_order` di semua insert `db/02_seed_master.sql` | D-09 (SQL), 2026-11-09 |
| BUG-009 | 2026-11-09 | Medium | UI | Footer kontak meluber ke kanan di HP 360px (tidak ada titik potong baris) | Buka halaman mana pun di lebar 360px | Footer terbungkus rapi | Scroll horizontal | Selesai | Spasi antar bagian di `web/js/ui/components.js` (siteFooter) + `overflow-wrap` di `app.css` | U-01 (e2e, cek semua elemen), 2026-11-09 |
| BUG-010 | 2026-11-09 | Medium | UI | Saat sesi habis, dua permintaan gagal memicu dua kali toast + render ulang; render ulang kedua bisa mengosongkan PIN yang sedang diketik | Biarkan sesi habis saat di form, ubah bulan lalu pindah kolom | Satu kali "Sesi berakhir", PIN pad tidak di-reset | Dua toast; PIN pad ter-reset | Selesai | Jeda 3 detik di `web/js/app.js` (setAuthExpiredHandler) | F-21 (e2e), 2026-11-09 |
| BUG-011 | 2026-11-09 | Medium | Form | Di laptop 1366px dengan menu samping, tabel kebutuhan lebih lebar dari layar sehingga kolom Uraian terpotong/tergeser | Buka langkah 2 form di 1366x768 | Semua kolom terlihat | Kolom pertama tergeser | Selesai | T-13: container query di `web/css/app.css` (tabel/kartu mengikuti lebar area) | Tinjau screenshot e2e 1366px & 360px, 2026-11-09 |
| BUG-012 | 2026-11-09 | Low | UI | Toast muncul di bawah dan menutupi bar total/tombol Submit; bar total di HP terlalu tinggi (3 baris tombol) | Submit dengan baris salah di HP | Toast tidak menutupi tombol; bar ringkas | Tertutup; bar +/-25% layar | Selesai | Toast dipindah ke atas; bar total HP 2 baris (`web/css/app.css`) | U-02 (e2e) + screenshot, 2026-11-09 |
| BUG-013 | 2026-11-09 | Low | Tooling | Skrip PowerShell tes salah membaca NOTICE psql sebagai error dan "expect_error" sebagai ERROR | Jalankan tests/run_db_tests.ps1 | Laporan lulus | Laporan gagal palsu | Selesai | `$ErrorActionPreference=Continue`, `-cmatch` di `tests/run_db_tests.ps1` | 128 tes lulus via skrip, 2026-11-09 |
| BUG-014 | 2026-11-09 | Medium | UI | Baris TOTAL di bawah tabel Ringkasan Program & Semua Program ikut menjumlahkan Draft, sehingga beda dengan kartu "Total anggaran diajukan" dan Overview (membingungkan, terkesan salah hitung) | Buka Ringkasan divisi yang punya draft, bandingkan baris TOTAL dengan kartu total | Satu definisi total: hanya Diajukan | TOTAL = Diajukan + Draft | Selesai | Baris menjadi "TOTAL DIAJUKAN" + catatan "+ N draft Rp X (belum dihitung)" di `web/js/views/division-summary.js` dan `finance-programs.js` | Audit tampilan 3.683 angka, 0 selisih, 2026-11-09 |
| BUG-015 | 2026-11-09 | Low | Overview | Overview Finance "per divisi" hanya memuat divisi aktif, padahal total memuat semua program. Bila kelak ada divisi dinonaktifkan yang masih punya program, jumlah per divisi tidak sama dengan total (belum terjadi; semua divisi aktif) | Nonaktifkan divisi yang punya program diajukan lewat SQL | Per divisi = per grup = total | Per divisi < total | Selesai | `_overview_finance()` di `db/05_overview.sql` menyertakan divisi nonaktif yang masih punya program | reconcile.sql cek 25 & 28, 2026-11-09 |
| BUG-016 | 2026-11-09 | Low | UI | Label bulan terbesar tanpa spasi ("MaretTerbesar") untuk pembaca layar/salin teks | Buka Overview, salin baris bulan terbesar | "Maret Terbesar" | "MaretTerbesar" | Selesai | Spasi di luar badge, `web/js/views/overview-render.js` | Audit tampilan, 2026-11-09 |
| BUG-017 | 2026-11-09 | Medium | Data | 99_test_seed.sql gagal di Supabase SQL Editor: "relation _demo does not exist" (tabel sementara tidak bertahan antar perintah di SQL Editor; di psql lokal lolos) | Jalankan 99_test_seed.sql di Supabase SQL Editor | Data demo terbentuk | Error 42P01, tidak ada data yang tersimpan | Selesai | Ditulis ulang menjadi satu perintah WITH tanpa tabel sementara (isi data sama) | Uji kirim-sekaligus 2x: 158 program, total 2.635.871.404, reconcile SEMUA COCOK, 2026-11-09 |
| BUG-018 | 2026-11-09 | Low | Tooling | rest_security_check.ps1 membaca isi jawaban error sebagai kosong di PowerShell 5.1, sehingga S-05 tampil GAGAL padahal server benar (AUTH_REQUIRED/AUTH_EXPIRED, HTTP 400) | Jalankan skrip ke Supabase DEV | S-05 LULUS | GAGAL palsu | Selesai | Baca ErrorDetails.Message di `tests/rest_security_check.ps1` | Cek ulang: SEMUA CEK KEAMANAN LULUS, 2026-11-09 |

(Tambahkan baris baru di bawah. Penomoran BUG-001, BUG-002, ...)

## 5. Log error runtime (untuk pola berulang)
| Tanggal | Sumber | Kode/ pesan | Sering? | Tindakan |
|---|---|---|---|---|
| (contoh) | Frontend | `AUTH_EXPIRED` setelah 8 jam | Wajar | Pesan "Sesi berakhir" sudah ada |

## 6. Watchlist risiko (dari Reality Audit; pantau, bukan bug)
| ID | Risiko | Level | Pengecekan | Terakhir dicek | Status |
|---|---|---|---|---|---|
| R-01 | RLS/ hak anon salah | Critical | Jalankan S-01..S-04 | 2026-11-09 (lokal) | Lulus lokal; ulang di Supabase |
| R-02 | Secret ter-commit | Critical | Cari di repo + riwayat git | 2026-11-09 | Bersih (belum ada commit kode); workflow deploy memblokir pola rahasia |
| R-03 | PIN dibagikan | High | Tinjau log per divisi | - | Belum |
| R-04 | Project tertidur/ backup | High | Keepalive hijau; backup minggu ini ada | - | Belum |
| R-05 | Penghapusan tidak sengaja | High | Tinjau log `delete` | - | Belum |
| R-06 | Lockout dipakai iseng | Medium | Tidak berlaku (D-28: tanpa lockout) | 2026-11-09 | Tidak berlaku |
| R-08 | Form sulit di HP | Medium | Umpan balik UAT | - | Belum |
| R-09 | Konflik edit | Medium | Tes D-11 / F-20 | 2026-11-09 | D-11 lulus; F-20 (dua tab) belum diuji manual |

## 7. Aturan untuk Claude
- Setiap kali menemukan masalah (di kode, SQL, dokumen, atau tes yang gagal), tambahkan baris BUG baru sebelum memperbaikinya.
- Jangan menandai `Selesai` tanpa menyebut tes yang membuktikan.
- Bug Critical dan High menghentikan fase berikutnya sampai ditangani atau disetujui Finance secara eksplisit.
