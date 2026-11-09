# 09 - MASTER DATA (seed awal)

Data awal untuk `db/02_seed_master.sql`. Finance dapat menambah/ menonaktifkan kategori dan divisi lewat admin. **Kategori awal dari Finance tidak boleh dihapus.** Tidak ada kategori "Lain-lain".

## 1. Grup dan divisi (12 divisi, 7 grup)

| Grup | Urut | Divisi (nama tampil) | Kode URL |
|---|---|---|---|
| Human Resource | 1 | HR-PD | `hr-pd` |
| Human Resource | 1 | HR-EB | `hr-eb` |
| Human Resource | 1 | HR-TA | `hr-ta` |
| Human Resource | 1 | HR-GA / Purchasing | `hr-ga-purchasing` |
| Human Resource | 1 | HR-OPS | `hr-ops` |
| Business Development | 2 | Business Development | `business-development` |
| Operation | 3 | Operation | `operation` |
| Marketing | 4 | Brand and Communication | `brand-communication` |
| Marketing | 4 | Creative | `creative` |
| Legal and Compliance | 5 | Legal and Compliance | `legal-compliance` |
| Finance & Data Analyst | 6 | Finance & Data Analyst | `finance-data-analyst` |
| Physiotherapist | 7 | Physiotherapist | `physiotherapist` |

Catatan:
- Singkatan HR-PD/EB/TA/OPS dipakai apa adanya (sesuai penyebutan Finance).
- Physiotherapist = satu divisi; diisi satu orang senior yang ikut Raker.
- Grup yang hanya punya satu divisi ditampilkan tanpa sub-judul.
- Overview Finance menampilkan rollup per grup (mis. total Human Resource = 5 sub-divisi).

## 2. Kategori program (kategori besar)
Awal dari Finance (wajib ada): **Event**, **Training**.
Tambahan yang disepakati: 
1. Rekrutmen
2. Kampanye & Promosi
3. Pengadaan Barang & Aset
4. Renovasi & Pemeliharaan
5. Pengembangan Sistem / IT
6. Perizinan, Legal & Kepatuhan
7. Kesejahteraan Karyawan
8. Riset & Pengembangan Layanan

Urutan tampil: Event, Training, lalu tambahan sesuai daftar di atas.

## 3. Kategori baris kebutuhan
Awal dari Finance (wajib ada): **Jasa**, **Konsumsi**, **Transport**, **Operasional**, **Marketing**.
Tambahan:
1. Akomodasi
2. Honorarium / Narasumber
3. Sewa (venue, alat)
4. ATK & Cetak
5. Perlengkapan & Merchandise
6. Peralatan / Aset
7. Perizinan & Legal
8. Software & Langganan

Urutan tampil: lima awal, lalu tambahan.

## 4. Satuan (saran di input, boleh diketik bebas)
pcs, paket, orang, hari, kali, unit, bulan, lembar, set, porsi

## 5. Bulan periode
Januari, Februari, Maret, April, Mei, Juni, Juli, Agustus, September, Oktober, November, Desember (tahun 2027).
Kuartal: Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Okt-Des.

## 6. Pengaturan aplikasi (`app_settings`)
| Key | Nilai |
|---|---|
| tahun_anggaran | 2027 |
| contact_email_1 | finance.wmcenter@gmail.com |
| contact_email_2 | finance@wmcenter.id |
| contact_wa | +62 852-8454-5564 (Finance WM Center) |
| finance_pin_hash | (diisi oleh `06_bootstrap.sql`; JANGAN taruh PIN asli di repo) |

Tautan WhatsApp: `https://wa.me/6285284545564` (nomor tanpa spasi/ tanda plus).

## 7. Teks alert kategori tidak ada
"Kategori tidak ditemukan? Hubungi Finance WM Center untuk menambahkannya: WhatsApp +62 852-8454-5564 atau email finance@wmcenter.id."
(Tampil di bawah dropdown kategori program dan kategori baris. Tautan WA dan email bisa diklik.)

## 8. Footer
"Kendala atau pertanyaan? Hubungi Finance WM Center - finance.wmcenter@gmail.com - finance@wmcenter.id - WhatsApp +62 852-8454-5564"

## 9. Data demo (`99_test_seed.sql`, hanya DEV)
- 158 program contoh yang realistis untuk klinik fisioterapi (mis. MCU karyawan, Job Fair kampus, alat shockwave, iklan digital bulanan), PIC dengan nama fiktif, 398 baris kebutuhan, total diajukan +/- Rp2,6 M.
- **Setiap divisi punya program di setiap bulan Januari-Desember.** HR-EB, HR-TA, HR-GA/Purchasing, Operation, dan Brand and Communication punya 2 program di beberapa bulan. 20 program masih Draft.
- Ada nama program yang sama di bulan berbeda (mis. "Servis AC Berkala Semua Cabang" Januari dan Juli) untuk menguji alert program mirip.
- Semua data demo ditandai `created_by_name = 'Data Demo'`. File ini **tidak** mengatur PIN (pakai `06_bootstrap.sql`). Hapus sebelum go-live dengan `98_clear_test_data.sql`.
