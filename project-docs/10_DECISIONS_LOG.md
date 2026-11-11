# 10 - DECISIONS LOG (sumber kebenaran tertinggi)

Bila ada konflik dengan dokumen lain, dokumen ini menang. Bila Claude menemukan keputusan yang belum tercatat, tanyakan ke Finance lalu tambahkan di sini.

## D - Keputusan final dari Finance
| ID | Keputusan |
|---|---|
| D-01 | Tujuan: mengumpulkan pengajuan anggaran 2027 tiap divisi, 1 program = 1 anggaran, dapat lebih dari 1 pengajuan per bulan |
| D-02 | Tanpa login akun; Home memilih divisi; akses dengan PIN |
| D-03 | Web tanpa Apps Script; data di database; harus gratis; hosting via GitHub publik boleh |
| D-04 | Pakai **Supabase** (PostgreSQL). Postgres lokal + VS Code dipakai untuk pengembangan/ uji, bukan server produksi |
| D-05 | **Finance** memegang master PIN dan mengelola PIN semua divisi |
| D-06 | Divisi **tidak boleh** melihat data divisi lain; masing-masing punya data sendiri |
| D-07 | Physiotherapist = **1 divisi** (diisi satu senior yang ikut Raker) |
| D-08 | Divisi (12): HR-PD, HR-EB, HR-TA, HR-GA/Purchasing, HR-OPS, Business Development, Operation, Brand and Communication, Creative, Legal and Compliance, Finance & Data Analyst, Physiotherapist |
| D-09 | Field wajib info program: nama event/ program, tanggal pengajuan (otomatis), periode (Jan-Des 2027), PIC; tabel kebutuhan diisi setelahnya |
| D-10 | **Tanggal pengajuan terkunci dan mengikuti tanggal submit** (bukan tanggal membuka form) |
| D-11 | Periode per bulan; Overview: total setahun, per program, per kuartal, per bulan, per kategori |
| D-12 | Kategori besar program dipilih di awal (bersama nama program): Event, Training + tambahan |
| D-13 | Kategori per baris kebutuhan wajib dipilih sebelum submit: Jasa, Konsumsi, Transport, Operasional, Marketing + tambahan |
| D-14 | Kategori awal tidak boleh dihapus (hanya ditambah). **Tidak ada "Lain-lain"**; bila kategori tidak ada -> alert agar request ke Finance |
| D-15 | Hard delete boleh asal ada log; kepemilikan RAB ada di divisi; divisi boleh edit/ hapus programnya; Finance boleh hapus dengan **alasan wajib** |
| D-16 | Log riwayat wajib |
| D-17 | Deadline pengisian belum dipakai (terlalu ribet) |
| D-18 | Budgeting/ plafon belum; dibahas nanti |
| D-19 | Draft, autosave, validasi, alert keluar form, responsif, empty state: disetujui |
| D-20 | Duplikat program disetujui, dengan alert bila program sama/ hampir sama |
| D-21 | Warna/ UI: Finance akan menyediakan template UI sendiri (tugas terpisah); fungsi dulu |
| D-22 | Kontak Finance di footer: finance.wmcenter@gmail.com, finance@wmcenter.id, WA +62 852-8454-5564 |
| D-23 | Fokus komentar: pengumpulan data dulu; komentar Finance boleh tetapi prioritas rendah |
| D-24 | Data hanya list/ tabel; belum ada file/ lampiran |
| D-25 | Komponen kategori tidak dipetakan ke COA dulu (bebas) |
| D-26 | Fitur Overview berupa tabel + kartu ringkasan, termasuk jumlah program, angka, dan periode yang paling banyak menghabiskan dana; juga ditampilkan ke divisi (data milik divisi sendiri) |
| D-27 | (2026-11-09) Data bersifat internal biasa (setara spreadsheet), bukan rahasia tinggi. Keamanan dibuat "aman sewajarnya": RLS + RPC, isolasi antar divisi, anti-XSS, anti formula injection tetap wajib; pengamanan PIN tambahan tidak diprioritaskan |
| D-28 | (2026-11-09) **Tidak ada lockout PIN** (tidak ada "divisi terkunci"). Menggantikan bagian lockout di A-05, BR-16, `05_SECURITY_MODEL.md` 3.2, PRD F-08, dan tes S-08, S-16; pesan "sisa percobaan" di F-02 tidak dipakai. Percobaan login tetap dicatat untuk informasi; PIN salah diberi jeda singkat (sekitar 1 detik) di server, tanpa mengunci |
| D-29 | (2026-11-09) Tampilan input PIN seperti PIN HP: kotak/titik per digit + keypad angka (di HP memunculkan keyboard angka) |
| D-30 | (2026-11-09) Program yang sudah **Diajukan tetap Diajukan** (tidak bisa kembali ke Draft). Edit program Diajukan wajib lolos validasi penuh; tombolnya "Simpan Perubahan". Tanggal pengajuan tetap tanggal submit pertama |
| D-31 | (2026-11-09) Kategori (termasuk kategori awal) **boleh dinonaktifkan**, **tidak boleh dihapus dan tidak boleh diganti nama**. Data lama dengan kategori nonaktif tetap tampil dan tetap boleh disimpan selama kategorinya tidak diubah |
| D-32 | ~~(2026-11-09) Finance yang masuk area divisi dengan master PIN **hanya dapat melihat dan menghapus dengan alasan** (tidak menambah/ mengedit program divisi)~~ -> diganti D-43: Finance boleh merevisi item program Diajukan dari halaman detail; form divisi tetap tidak bisa dipakai Finance |
| D-33 | (2026-11-09) Aturan teknis detail (batas angka, validasi draft, dsb.) dipercayakan ke Claude, dicatat di bagian T |
| D-34 | (2026-11-09) **Bukan copy-paste**, melainkan **Impor dari file Excel**: di langkah 2 form ada tombol "Unduh Template Excel" dan "Unggah File Excel". File dibaca di browser (SheetJS), baris masuk ke tabel kebutuhan untuk dicek dulu sebelum disimpan; baris tidak valid ditandai merah. File **tidak disimpan** di server (D-24 tetap: tanpa lampiran). Menggantikan "Tempel dari Excel" (PRD U-09, Usulan U-01); tes F-18 disesuaikan |
| D-35 | (2026-11-09) `project-docs/` ikut di-commit ke repo publik (menjawab Q-07 / temuan no. 5). Larangan tetap: tidak ada PIN/ password/ key asli di file mana pun |
| D-36 | (2026-11-09) UI/UX memakai **design kit WM Center** (`C:\Aset WM Center\design-kit`: logo, warna, tabel, komponen, mode gelap) sejak awal. Fase 12 dipercepat dan digabung ke Fase 4-9. Bila ada beda dengan design kit: keputusan di file ini menang (mis. design kit "tidak ada tombol hapus" vs D-15 hard delete dengan log -> D-15 berlaku; "aksi ubah wajib beralasan" -> hanya hapus oleh Finance yang wajib alasan, sesuai PRD) |
| D-37 | (2026-11-09) Finance meminta seluruh sistem dibangun dulu, lalu dicek sebelum push ke GitHub (fase dikerjakan berurutan tanpa berhenti per fase). Fase yang butuh akun Supabase/GitHub tetap menunggu Finance |
| D-38 | (2026-11-10) **Login PIN langsung** (seperti SSO): tidak ada lagi pilih divisi. Satu halaman masuk; PIN 6 digit menentukan akun (divisi atau Finance). **PIN Finance menjadi 6 digit** (sama cara masuknya). Semua PIN wajib unik; PIN kembar ditolak saat diatur, dan bila ada PIN kembar lama, login ditolak (tidak pernah salah masuk divisi). Konsekuensi diterima Finance: tebakan PIN acak sekitar 12x lebih mudah (D-27). Menggantikan A-01 (pilih divisi di Home) dan A-14 (Finance 8 digit) |
| D-39 | (2026-11-10) Halaman masuk dihias **pita nama divisi berjalan** dari kanan ke kiri (pelan, berhenti saat disentuh/disorot, diam bila perangkat meminta "kurangi gerakan", diabaikan pembaca layar). Layar lebar 2 kolom, HP/tablet bertumpuk; komposisi & responsif dicek di 360px, 768px, 1366x650, 1920px, mode gelap |
| D-40 | (2026-11-10) **Divisi ke-13: Project Expansion**, berdiri sendiri di grup "Project Expansion" (tidak di bawah HR/grup lain). Total 13 divisi dalam 8 grup. Menambah D-08 |
| D-41 | (2026-11-10) **Animasi selamat datang setelah PIN benar** (opsi D pilihan Finance): buka seperti gerbang (dua panel navy menutup, logo putih, centang oranye, nama divisi + grup huruf demi huruf), tutup dengan layar menyusut menjadi bulatan ke ikon akun di kanan atas lalu ikon berdenyut oranye. Dipercepat ~18% (+/- 2,5 detik total). Halaman tujuan dimuat di belakang selama animasi. Bisa dilewati (klik/tombol apa pun); "kurangi gerakan" = fade singkat; tidak tampil saat kembali ke form (sesi habis/tautan form); lapisan dibuang otomatis maks. 6 detik. Hanya tampilan (`web/js/ui/welcome.js`), tanpa perubahan database |
| D-42 | (2026-11-11) **Overview Finance bisa diklik**: kartu dan baris membuka pop-up rincian + baris TOTAL; tampilan Overview tidak berubah. Kuartal = rekap divisi + 3 kolom bulan; grup = rekap divisi; bulan, divisi, kategori program, kartu total = daftar program; kategori kebutuhan = daftar baris; top program = rincian 1 program. Tidak bisa diklik: Rata-rata, baris TOTAL, Status pengisian, baris bernilai nol. Hanya program Diajukan. Total pop-up dicocokkan dengan angka yang diklik; bila beda tampil peringatan + Muat ulang. Khusus Finance (Overview divisi tidak berubah); tanpa tombol export di pop-up. Fungsi baru `rpc_f_overview_detail` hanya membaca. Revisi Finance: tabel pop-up tanpa kolom Tgl Pengajuan, kolom pertama Bulan (mis. "Maret 2027"), baris dikelompokkan per divisi (urutan tabel Per divisi) dengan subtotal tiap divisi |
| D-43 | (2026-11-11) **Revisi Finance per item + riwayat per item + notifikasi.** Finance mengubah, menambah, atau menghapus item program Diajukan dari halaman detail; alasan wajib per item (min. 10 karakter); semua perubahan tersimpan sekaligus lewat Submit Revisi (semua atau tidak sama sekali), tanpa persetujuan divisi. Info program (nama, bulan, PIC, kategori) tidak bisa diubah Finance. Divisi tetap bisa mengedit tanpa alasan, termasuk item yang sudah direvisi. Riwayat dicatat sejak program Diajukan (draft tidak), berisi pelaku ("Finance" atau nama divisi, tanpa nama orang), waktu, nilai lama/baru, alasan; terlihat oleh Finance dan divisi pemilik; item yang dihapus tetap punya riwayat. Identitas item dipertahankan saat simpan (tidak lagi hapus-buat ulang); upload Excel "Ganti semua baris" tercatat sebagai hapus + tambah. Penanda "Direvisi Finance" di daftar dan detail. Lonceng notifikasi tiap akun: divisi tahu revisi/hapus oleh Finance; Finance tahu perubahan divisi pada program Diajukan (item, info program, hapus) |

## A - Asumsi Claude/ penyusun (belum dikonfirmasi; ubah bila salah)
| ID | Asumsi | Dampak jika salah |
|---|---|---|
| A-01 | Karena divisi tidak boleh melihat divisi lain (D-06), **membuka divisi apa pun butuh PIN** (bukan hanya edit/ hapus); Home tidak menampilkan angka | Sedikit ubah akses baca |
| A-02 | Edit setelah submit diperbolehkan (sesuai D-15); `tanggal_pengajuan` = tanggal submit **pertama**; perubahan berikutnya hanya mengubah "terakhir diubah" | Ubah aturan tanggal |
| A-03 | Total Overview hanya menghitung program **Diajukan**; Draft dihitung terpisah | Ubah query overview |
| A-04 | Ada input opsional "Nama Anda" saat masuk PIN untuk dicatat di log (akuntabilitas tanpa login) | Hapus field |
| A-05 | Sesi 8 jam. ~~Lockout 5 gagal/ 10 menit (master PIN 15 menit)~~ -> dibatalkan oleh D-28 | Setel ulang parameter |
| A-06 | Dua project Supabase (DEV dan PROD) | Satu project + pembersihan data uji |
| A-07 | Frontend HTML/CSS/JS murni tanpa build step; hash routing | Bila ingin framework, perlu persetujuan |
| A-08 | Deploy via GitHub Actions dari folder `web/`; dokumen tidak ikut publik | Pages dari root = dokumen terbuka |
| A-09 | Master PIN Finance dapat masuk ke divisi mana pun (dukungan), tercatat di log | Perketat |
| A-10 | Satuan boleh ketik bebas dengan saran | Jadikan dropdown tetap |
| A-11 | Daftar kategori tambahan di `09_MASTER_DATA.md` disetujui (usulan penyusun) | Ubah seed |
| A-12 | Export Excel/ CSV oleh Finance termasuk dalam rilis awal | - |
| A-13 | Satu program maksimal 200 baris; batas karakter seperti di PRD | Longgarkan |
| A-14 | ~~**Dikonfirmasi Finance 2026-11-09.** PIN divisi = 6 digit angka; master PIN Finance = 8 digit angka~~ -> diganti D-38 (PIN Finance 6 digit) (agar cocok dengan tampilan PIN HP, D-29). Menggantikan "master PIN min. 10 karakter" di `05_SECURITY_MODEL.md` 3.1 | Ubah panjang PIN |

## T - Aturan teknis yang ditetapkan Claude (D-33; Finance boleh mengubah)
| ID | Aturan |
|---|---|
| T-01 | Saat Simpan Draft, baris kebutuhan boleh belum lengkap, termasuk uraian kosong. Saat Submit/ Simpan Perubahan, semua baris divalidasi penuh (uraian 3-200, kategori, qty, satuan, harga) |
| T-02 | Qty: > 0, maksimal 100.000, maksimal 2 desimal. Harga satuan: 0 s.d. Rp1.000.000.000.000 (bilangan bulat). Mencegah angka meluap di database |
| T-03 | Subtotal = qty x harga, dibulatkan ke rupiah terdekat oleh database |
| T-04 | Fungsi internal dan tabel dicabut aksesnya dari `anon` dan `authenticated` secara eksplisit, termasuk default untuk objek baru (Supabase memberi akses otomatis) |
| T-05 | Login gagal dikembalikan sebagai hasil biasa (bukan error) supaya pencatatan percobaan tidak ikut dibatalkan |
| T-06 | Rujukan ID ditulis lengkap bila bisa rancu: "PRD U-01" vs "Usulan U-01", "PRD F-01" vs "tes F-01" |
| T-07 | Browser memanggil Supabase langsung dengan `fetch` ke `/rest/v1/rpc/<fungsi>` (tanpa pustaka supabase-js): lebih sedikit kode pihak ketiga, CSP lebih ketat. Kunci anon lama (eyJ...) dan publishable baru (sb_publishable_...) sama-sama didukung |
| T-08 | Pustaka Excel SheetJS 0.20.3 disimpan di `web/vendor/` (bukan CDN) agar tidak bergantung pada CDN dan CSP cukup `script-src 'self'`; dimuat hanya saat dibutuhkan |
| T-09 | `updated_at` memakai `clock_timestamp()` (jam asli) agar deteksi konflik edit selalu bekerja (BUG-007) |
| T-10 | Nama kategori seperti "Lain-lain", "lainnya", "dll", "others", "umum" ditolak oleh database (D-14) |
| T-11 | Finance melihat area divisi memakai sesi Finance (login master PIN di `#/finance`), bukan dengan mengetik master PIN di PIN gate divisi. Penyempurnaan A-09 |
| T-12 | PIN gate tidak mengunci (D-28). Sebagai ganti: jeda 1 detik di server setiap PIN salah, semua percobaan tercatat di `login_attempts` |
| T-13 | Tabel kebutuhan menyesuaikan lebar area (container query): tabel di layar lebar, kartu per baris di HP/tablet |
| T-14 | Hash PIN memakai bcrypt tingkat 6 (sebelumnya 10) agar login PIN langsung (1 PIN dicek ke 13 akun) selesai < 0,3 detik di Supabase (batas 3 detik). Untuk PIN 6 digit, tingkat hash praktis tidak mengubah keamanan; hash tidak pernah keluar dari database |
| T-15 | `db/04_security.sql` aman dijalankan ulang kapan saja: izin fungsi Overview (dibuat di 05) dipasang lagi bila sudah ada (BUG-019) |

## Q - Pertanyaan terbuka
| ID | Pertanyaan | Default sementara |
|---|---|---|
| Q-01 | Apakah divisi boleh tahu status pengisian divisi lain (sekadar "sudah/belum")? | Tidak (D-06) |
| Q-02 | Perlu saklar "kunci semua divisi (read-only)" saat masa pengumpulan berakhir (bukan deadline otomatis)? | Ditunda (P2) |
| Q-03 | Setelah submit, apakah Finance perlu status "Perlu revisi"/ "Disetujui"? | Belum (fokus pengumpulan) |
| Q-04 | Apakah satu PIC boleh mengisi untuk lebih dari satu divisi? | Tidak; PIN per divisi |
| Q-05 | Perlu satuan mata uang selain Rupiah? | Tidak |
| Q-06 | Perlu pemetaan ke COA di tahap berikutnya? | Ya, nanti (D-25); skema dibuat mudah ditambah kolom |
| Q-07 | Hosting repo tetap publik (gratis) atau Finance rela pindah ke opsi lain yang menyembunyikan repo? | Publik |

## U - Usulan tambahan (tunggu persetujuan)
| ID | Usulan | Prioritas |
|---|---|---|
| U-01 | ~~"Tempel dari Excel" pada tabel kebutuhan~~ -> diganti Impor file Excel, disetujui (D-34) | P1 |
| U-02 | "Pulihkan dari log" untuk program terhapus | P2 |
| U-03 | Komentar Finance per program | P2 |
| U-04 | Grafik sederhana di Overview | P2 |
| U-05 | Form permintaan kategori baru (tersimpan di DB) menggantikan sekadar kontak | P2 |

## Riwayat perubahan dokumen
| Tanggal | Perubahan |
|---|---|
| 2026-11-09 | Versi awal paket dokumen |
| 2026-11-09 | Fase 0: tambah D-27..D-33, A-14, bagian T; A-05 lockout dibatalkan |
| 2026-11-09 | Fase 0: tambah D-34 (impor file Excel), D-35 (dokumen di repo publik); A-14 dikonfirmasi |
| 2026-11-09 | Pembangunan Fase 1-11 (bagian lokal): tambah D-36, D-37, T-07..T-13 |
| 2026-11-10 | Login PIN langsung + pita divisi: D-38, D-39, T-14, T-15; A-14 diganti |
| 2026-11-10 | D-40: divisi Project Expansion |
| 2026-11-10 | D-41: animasi selamat datang (opsi D) |
| 2026-11-11 | D-42: pop-up rincian Overview Finance |
| 2026-11-11 | D-43: revisi Finance per item, riwayat per item, notifikasi; D-32 diganti |
