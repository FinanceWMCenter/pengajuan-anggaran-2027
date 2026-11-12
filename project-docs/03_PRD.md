# 03 - PRD: Portal Pengajuan Anggaran 2027

Versi 1.0. Bahasa UI: Indonesia. Prioritas: **P0** wajib rilis awal, **P1** sangat disarankan, **P2** nanti.

## 1. Latar belakang dan tujuan
Setelah Raker 2027, Finance mengumpulkan pengajuan anggaran dari tiap divisi. Saat ini manual dan tersebar. Tujuan:
1. Setiap divisi mengisi pengajuan program/ event 2027 secara terstruktur, per bulan.
2. Finance mendapat data terpusat dan Overview (total, per kuartal, per bulan, per kategori, per divisi).
3. Gratis, tanpa Google Apps Script, tanpa login akun, mudah dipakai dari HP.

Bukan tujuan (saat ini): budgeting/ plafon, approval berjenjang, realisasi, lampiran file, pemetaan COA, deadline otomatis.

## 2. Pengguna
| Peran | Deskripsi | Akses |
|---|---|---|
| PIC Divisi | Orang di divisi yang mengisi program | PIN divisi; hanya data divisinya |
| Finance (admin) | Tim Finance WM Center | Master PIN; semua data; kelola PIN, kategori, log, hapus, export |

Divisi (12) dalam 7 grup: lihat `09_MASTER_DATA.md`.

## 3. Cerita pengguna
PIC Divisi:
- U-01 (P0) Memilih divisinya di Home dan masuk dengan PIN.
- U-02 (P0) Melihat daftar program divisinya + total.
- U-03 (P0) Menambah program: isi info wajib lalu tabel kebutuhan.
- U-04 (P0) Menyimpan sebagai draft, lanjut nanti.
- U-05 (P0) Submit pengajuan; tanggal pengajuan terisi otomatis saat submit.
- U-06 (P0) Mengedit dan menghapus program miliknya.
- U-07 (P0) Melihat Overview divisinya.
- U-08 (P1) Menduplikat program, dengan peringatan bila mirip.
- U-09 (P1) Menempel baris dari Excel ke tabel kebutuhan.
- U-10 (P0) Diberi tahu cara meminta kategori baru bila tidak ada.

Finance:
- F-01 (P0) Login dengan master PIN.
- F-02 (P0) Mengatur/ reset PIN tiap divisi dan mengganti master PIN.
- F-03 (P0) Melihat Overview semua divisi (kartu + tabel).
- F-04 (P0) Melihat semua program, memfilter, dan menghapus dengan alasan wajib.
- F-05 (P0) Melihat log riwayat.
- F-06 (P0) Mengekspor data ke Excel/ CSV.
- F-07 (P0) Menambah/ menonaktifkan kategori (tidak menghapus).
- F-08 (P1) Membuka kunci divisi yang terkunci karena salah PIN.
- F-09 (P2) Memberi komentar per program; pulihkan program dari log.

## 4. Aturan bisnis
- BR-01 Tahun anggaran = 2027 (disimpan sebagai pengaturan, bukan di-hardcode berulang).
- BR-02 Info program wajib semua: **Nama program**, **Kategori program**, **Periode (bulan)**, **PIC/ Penanggung jawab**. Tanggal pengajuan otomatis.
- BR-03 Tabel kebutuhan baru bisa diisi setelah info program lengkap.
- BR-04 Tiap baris kebutuhan wajib: uraian, **kategori baris (dropdown, wajib)**, qty > 0, satuan, harga satuan >= 0. Catatan opsional. Subtotal = qty x harga.
- BR-05 **Submit** butuh minimal 1 baris dan semua baris valid. Tanpa kategori baris -> tidak bisa submit.
- BR-06 **Tanggal pengajuan** = tanggal (WIB) saat submit pertama, dikunci, tidak bisa diedit. Contoh: form dibuka hari ini, submit besok -> tanggal pengajuan = besok. Edit setelahnya tidak mengubah tanggal itu; `terakhir diubah` tersimpan terpisah. (Asumsi, lihat `10_DECISIONS_LOG.md` A-02.)
- BR-07 Draft tersimpan di database bila info program lengkap; baris boleh belum lengkap. Draft **tidak dihitung** di total Overview (ditampilkan sebagai jumlah draft). (A-03)
- BR-08 1 program = 1 anggaran = 1 bulan. Dalam bulan yang sama boleh banyak program. Event lintas bulan diinput sebagai beberapa program (gunakan Duplikat).
- BR-09 Alert mirip: saat nama program sama/ hampir sama dalam divisi yang sama (lebih kuat bila bulan sama), tampilkan peringatan dengan daftar program mirip. Boleh lanjut ("Tetap simpan").
- BR-10 Kategori program dan kategori baris dipilih dari daftar. Tidak ada "Lain-lain". Bila tidak ada yang cocok -> alert + kontak Finance. Kategori awal tidak dihapus, hanya ditambah/ dinonaktifkan Finance.
- BR-11 Penghapusan: PIC boleh hapus programnya sendiri (dialog konfirmasi); Finance wajib mengisi alasan (min. 10 karakter). Semua penghapusan tercatat di log dengan snapshot.
- BR-12 Divisi hanya melihat data divisinya. Finance melihat semua.
- BR-13 Batas: nama program 3-150 karakter; PIC 2-100; uraian 3-200; satuan 1-30; catatan <= 300; maksimal 200 baris per program; harga satuan <= 1.000.000.000.000.
- BR-14 Rupiah bilangan bulat. Qty maksimal 2 desimal.
- BR-15 Konflik edit ditangani dengan pengecekan `updated_at`.
- BR-16 Sesi 8 jam; 5 PIN salah dalam 10 menit -> terkunci 10 menit (master PIN: 15 menit). Finance dapat membuka kunci divisi.

## 5. Spesifikasi halaman

### 5.1 Home - Pilih Divisi (U-01)
- Judul: "Pengajuan Anggaran 2027". Sub: "Pilih divisi Anda untuk mengisi program dan anggaran."
- Kartu divisi dikelompokkan per grup (Human Resource, Marketing, dst; grup 1 divisi tampil tanpa sub-judul grup).
- Kotak cari divisi. Kartu hanya berisi nama (tanpa angka, tanpa status, agar tidak membocorkan data).
- Tautan kecil "Finance" menuju `#/finance`.
- Footer: kontak Finance (email dan WhatsApp).

### 5.2 PIN gate
- Modal: "Masukkan PIN {nama divisi}". Input tipe password + tombol tampilkan. ~~Input opsional "Nama Anda" (A-04) yang dicatat di log.~~ Dihapus oleh D-46: cukup PIN.
- Pesan: "PIN salah. Sisa percobaan: N", "Divisi terkunci sementara, coba lagi dalam N menit atau hubungi Finance".
- Lupa PIN -> teks: "Hubungi Finance" + tautan WA/ email.

### 5.3 Ringkasan Program divisi (U-02) - menu "Ringkasan Program"
- Header: nama divisi, tombol "+ Tambah Program", tab: **Ringkasan Program** | **Overview**, tombol Keluar.
- Kartu kecil: Total anggaran (diajukan), Jumlah program diajukan, Jumlah draft.
- Tabel: No | Nama Program | Kategori | Bulan | PIC | Total (Rp) | Status (Draft/Diajukan) | Tgl Pengajuan | Aksi (Lihat, Edit, Duplikat, Hapus).
- Filter: bulan, kategori program, status, cari nama. Urut default: bulan lalu nama. Baris total di bawah.
- Empty state: "Belum ada program. Klik + Tambah Program untuk mulai."

### 5.4 Form program (U-03, U-04, U-05)
Langkah 1 - Info Program (semua wajib):
| Field | Tipe | Aturan |
|---|---|---|
| Nama event/ program | teks | 3-150; alert mirip saat selesai mengetik |
| Kategori program | dropdown | wajib; alert bila kategori tidak ada |
| Tanggal pengajuan | read-only | tampil "Terisi otomatis saat Anda submit"; (setelah submit tampil tanggalnya) |
| Periode event | dropdown | Januari-Desember 2027 |
| PIC / Penanggung jawab | teks | 2-100 |
Tombol "Lanjut" nonaktif sampai lengkap; error per field di bawah input.

Langkah 2 - Daftar Kebutuhan (tabel editable):
Kolom: No | Uraian kebutuhan | Kategori (dropdown wajib) | Qty | Satuan (saran: pcs, paket, orang, hari, kali, unit, bulan, lembar, set, porsi; boleh ketik) | Harga satuan (Rp) | Subtotal (otomatis) | Catatan | Aksi (duplikat baris, hapus).
- Tombol: "+ Tambah baris", "Tempel dari Excel" (P1), "Simpan Draft", "Submit Pengajuan", "Kembali ke info".
- Bar total menempel di bawah: Total anggaran program (real-time).
- Baris tanpa kategori diberi tanda merah dan pesan "Pilih kategori".
- Submit -> dialog ringkasan (nama, bulan, total, jumlah baris) -> konfirmasi -> toast "Pengajuan berhasil dikirim".
- Autosave lokal; peringatan saat keluar dengan perubahan belum tersimpan.
- Alert kategori tidak ada (di bawah dropdown): "Kategori tidak ditemukan? Hubungi Finance untuk menambahkan." + tautan.

### 5.5 Detail program
Info program + tabel kebutuhan (read-only) + total + tombol Edit, Duplikat, Hapus, Kembali. Menampilkan "Diajukan pada ..." dan "Terakhir diubah ...".

### 5.6 Overview divisi (U-07) - menu "Overview"
Kartu: Total setahun | Jumlah program | Rata-rata per program | Bulan paling besar (nama + nominal) | Kategori program terbesar | Kategori baris terbesar | Program terbesar.
Tabel: per bulan (Jan-Des: jumlah program, total, % dari total) | per kuartal (Q1-Q4) | per kategori program | per kategori baris | daftar 5 program terbesar. Sorot bulan paling besar.
Hanya program berstatus Diajukan yang dihitung; tampilkan catatan "N draft belum dihitung".

### 5.7 Finance
- Login: input master PIN.
- Overview Finance: semua kartu di atas versi seluruh perusahaan + tabel per divisi (jumlah program, total, %), per grup (rollup, mis. total HR), **status pengisian** (divisi yang belum punya pengajuan), top 10 program.
- Semua Program: tabel lintas divisi + filter (divisi, bulan, kategori, status) + hapus dengan alasan.
- Divisi: daftar divisi, jumlah program, tanggal PIN terakhir diganti, status kunci; aksi Atur PIN, Buka kunci.
- Kategori: dua daftar (kategori program, kategori baris) dengan tambah dan aktif/ nonaktif.
- Log: tabel waktu, aktor (divisi/ finance/ nama), aksi, entitas, alasan; filter; lihat detail JSON ringkas.
- Export: Excel (.xlsx) dan CSV; kolom: divisi, grup, nama program, kategori program, bulan, kuartal, PIC, status, tanggal pengajuan, kategori baris, uraian, qty, satuan, harga, subtotal, catatan.

## 6. Pesan penting (microcopy)
- Wajib diisi: "Wajib diisi"
- Kategori baris kosong: "Pilih kategori untuk baris ini"
- Submit tanpa baris: "Tambahkan minimal satu kebutuhan sebelum submit"
- Mirip: "Ada program yang mirip: {nama} ({bulan}). Pastikan ini bukan duplikat."
- Hapus (divisi): "Hapus program ini? Tindakan ini tercatat di log dan tidak bisa dibatalkan dari layar ini."
- Konflik: "Program ini sudah diubah oleh orang lain. Muat ulang untuk melihat versi terbaru."
- Sesi habis: "Sesi berakhir. Masukkan PIN lagi."
- Koneksi: "Koneksi bermasalah. Data Anda aman di perangkat ini, coba lagi."

## 7. Kebutuhan non-fungsional
- Responsif: nyaman di HP 360px, tablet, desktop.
- Performa: daftar dan Overview muncul < 2 detik pada data normal.
- Keamanan: sesuai `05_SECURITY_MODEL.md`.
- Ketersediaan: project tidak tertidur (keepalive); backup mingguan.
- Aksesibilitas dasar: label form, fokus terlihat, kontras cukup, navigasi keyboard.
- Browser: Chrome, Edge, Safari, Firefox versi terbaru.

## 8. Metrik keberhasilan
- 100% divisi (12/12) sudah punya minimal satu pengajuan Diajukan.
- Finance dapat mengekspor seluruh data dalam < 1 menit.
- Angka Overview = hasil query mentah (rekonsiliasi 0 selisih).
- Nol insiden data hilang tanpa jejak log.

## 9. Pertanyaan terbuka
Lihat `10_DECISIONS_LOG.md` bagian Q.
