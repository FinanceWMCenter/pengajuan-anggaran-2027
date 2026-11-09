# 11 - UI/UX HANDOFF

Status (2026-11-09): **sudah memakai design kit WM Center** (folder `C:\Aset WM Center\design-kit`, D-36). Token di `web/css/tokens.css` dan komponen di `web/css/components.css` disalin apa adanya dari design kit; tambahan khusus portal di `web/css/app.css`. Semua gaya tetap lewat CSS variables, jadi penyesuaian tampilan berikutnya tidak perlu mengubah logika. Catatan di bawah tetap berlaku sebagai panduan.

## 1. Prinsip
1. Mobile-first (360px), lalu tablet (768px), lalu desktop (1024px+).
2. Satu tujuan per layar; tombol utama selalu jelas.
3. Pemisahan tegas: **struktur (HTML)**, **gaya (CSS tokens + komponen)**, **perilaku (JS)**. Tidak ada warna/ ukuran yang ditulis langsung di JS atau di HTML.
4. Semua teks UI Bahasa Indonesia, ramah, singkat, memberi langkah berikutnya.
5. Jangan bergantung pada warna saja untuk makna (tambahkan ikon/ teks pada status dan error).

## 2. Design tokens (`web/css/tokens.css`)
Definisikan di `:root` (nilai sementara netral; akan diganti template):
```
--color-bg, --color-surface, --color-text, --color-text-muted, --color-border,
--color-primary, --color-primary-contrast, --color-accent,
--color-success, --color-warning, --color-danger, --color-info,
--color-status-draft, --color-status-submitted,
--font-family, --font-size-base, --font-size-sm, --font-size-lg, --font-size-xl,
--space-1..--space-8, --radius-sm, --radius-md, --radius-lg,
--shadow-sm, --shadow-md, --focus-ring, --max-width-content
```
Dukung mode terang saja dulu; siapkan struktur agar mode gelap mudah ditambah.

## 3. Inventaris komponen (beserta statusnya)
| Komponen | Status/ varian yang harus ada |
|---|---|
| Tombol | primary, secondary, danger, ghost; disabled; loading |
| Input teks/ angka/ Rupiah | normal, fokus, error (dengan pesan), disabled, read-only |
| Dropdown | normal, error, kosong + alert "kategori tidak ada" |
| Kartu divisi | normal, hover/ fokus |
| Kartu ringkasan (angka) | normal, loading (skeleton), kosong |
| Tabel data | header lengket, baris hover, baris total, kosong, loading, error |
| Tabel kebutuhan (editable) | desktop: tabel; HP: kartu per baris; baris error; baris total |
| Badge status | Draft, Diajukan |
| Modal/ dialog | konfirmasi, destruktif (hapus), PIN gate, konflik |
| Toast | sukses, error, info |
| Alert/ banner | peringatan mirip, kategori tidak ada, koneksi bermasalah |
| Tab | Ringkasan Program, Overview |
| Stepper 2 langkah | Info Program -> Daftar Kebutuhan |
| Bar total menempel | selalu terlihat di langkah 2 |
| Filter bar | bulan, kategori, status, cari |
| Footer kontak | email + WA (tautan) |

## 4. Wireframe teks

### 4.1 Home
```
[Logo/ Judul]  Pengajuan Anggaran 2027
Pilih divisi Anda untuk mengisi program dan anggaran.
[ Cari divisi...            ]

Human Resource
 [HR-PD] [HR-EB] [HR-TA]
 [HR-GA / Purchasing] [HR-OPS]
Business Development   [Business Development]
Operation              [Operation]
Marketing              [Brand and Communication] [Creative]
...
Finance (tautan kecil)      Footer: kontak Finance
```

### 4.2 Ringkasan Program (desktop)
```
HR-PD                                   [Keluar]
[Ringkasan Program] [Overview]          [+ Tambah Program]
Total diajukan: Rp ...  | Program: N | Draft: N
Filter: [Bulan v] [Kategori v] [Status v] [Cari...]
No | Nama Program | Kategori | Bulan | PIC | Total | Status | Tgl Pengajuan | Aksi
...
                                          TOTAL  Rp ...
```

### 4.3 Form langkah 1
```
Langkah 1 dari 2: Info Program
Nama event/ program *      [__________________]
  (alert mirip bila ada)
Kategori program *         [Pilih v]  (alert bila tidak ada)
Tanggal pengajuan          Terisi otomatis saat submit  (read-only)
Periode event *            [Januari ... Desember 2027 v]
PIC / Penanggung jawab *   [__________________]
                                   [Batal]  [Lanjut]
```

### 4.4 Form langkah 2 (desktop)
```
Program: {nama} - {bulan 2027} - PIC {nama}          [Ubah info]
No | Uraian | Kategori* | Qty | Satuan | Harga satuan | Subtotal | Catatan | Aksi
1  | ...    | [Pilih v] | 2   | pcs    | 50.000       | 100.000  | ...     | [dup][x]
[+ Tambah baris] [Tempel dari Excel]
-----------------------------------------------------------------
Total anggaran program: Rp 1.250.000     [Simpan Draft] [Submit Pengajuan]
```
Di HP: tiap baris menjadi kartu (Uraian, Kategori, Qty x Harga, Subtotal), bar total menempel di bawah.

### 4.5 Overview
```
Kartu: [Total setahun] [Jumlah program] [Rata-rata/program] [Bulan terbesar]
       [Kategori terbesar] [Program terbesar]
Tabel: Per Bulan (Jan-Des) | Per Kuartal | Per Kategori Program | Per Kategori Baris
       Top 5 Program
Catatan: N draft belum dihitung.
(Finance: + Per Divisi, Per Grup, Status Pengisian, Top 10)
```

## 5. Perilaku penting (UX)
- Format Rupiah otomatis saat mengetik; kursor tidak melompat.
- Input angka memakai `inputmode="numeric"`/ `decimal`.
- Enter di baris terakhir menambah baris baru (desktop); Tab berpindah antar sel.
- Fokus otomatis ke field error pertama saat validasi gagal.
- Tombol aksi yang sedang bekerja menampilkan loading dan mencegah klik ganda.
- Dialog destruktif (hapus) memakai tombol merah dan teks jelas; fokus awal di "Batal".
- Peringatan keluar halaman bila ada perubahan belum tersimpan.
- Autosave: indikator kecil "Tersimpan di perangkat ini pukul HH:MM".
- Konsisten: label status Draft (netral) vs Diajukan (positif).

## 6. Aksesibilitas dasar
Label terhubung ke input, `aria-live` untuk toast/ error, fokus terlihat, kontras teks minimal 4.5:1, target sentuh >= 44px, urutan tab logis, tidak ada jebakan fokus di modal.

## 7. Integrasi template UI (Fase 12)
Saat Finance memberikan template (HTML/ CSS/ gambar/ Figma/ screenshot):
1. Taruh di folder `ui-template/` (di luar `web/` sampai dipakai).
2. Petakan warna/ font/ spasi template ke token di `tokens.css`.
3. Sesuaikan `components.css` per komponen pada bagian 3; **jangan mengubah logika JS atau nama fungsi RPC**.
4. Uji ulang U-01..U-08 dan F-03..F-10 (tampilan form) serta cek kontras.
5. Catat selisih antara template dan implementasi di `06_ERROR_LOG_BUG.md` bila ada.

## 8. Yang perlu Finance siapkan untuk Fase 12
Logo (SVG/ PNG), palet warna, font yang diinginkan, contoh tampilan/ screenshot referensi, nada bahasa (formal/ santai), nama menu final bila ingin diganti (saat ini: "Ringkasan Program", "Overview").
