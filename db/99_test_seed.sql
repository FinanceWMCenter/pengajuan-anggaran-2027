-- =====================================================================
-- 99_test_seed.sql  -  DATA DEMO realistis. HANYA untuk project DEV / Postgres lokal.
--
-- Isi: program contoh realistis untuk grup klinik fisioterapi. SETIAP divisi punya program di
-- SETIAP bulan Januari-Desember (program khusus + program rutin bulanan); HR-TA, Operation, dan
-- Brand and Communication punya lebih dari 1 program di beberapa bulan. Sebagian masih Draft.
-- Semua nama orang FIKTIF. Semua data demo ditandai created_by_name = 'Data Demo'.
--
-- File ini TIDAK mengubah PIN. Atur PIN dengan 06_bootstrap.sql atau halaman Finance.
-- Aman dijalankan ulang: data demo lama dihapus lalu dibuat ulang.
-- Ditulis sebagai SATU perintah (tanpa tabel sementara) agar jalan di Supabase SQL Editor.
-- Pengaman: berhenti bila ada program yang BUKAN data demo (mis. data asli).
-- Hapus data demo / data uji sebelum go-live: 98_clear_test_data.sql
-- =====================================================================

do $$
begin
  if exists (select 1 from public.programs where created_by_name is distinct from 'Data Demo') then
    raise exception 'Ada program selain data demo di database ini. Data demo TIDAK dibuat. Bila ini DEV dan semua datanya boleh dihapus, jalankan 98_clear_test_data.sql dulu.';
  end if;
end;
$$;

delete from public.programs where created_by_name = 'Data Demo';
delete from public.program_item_history;
delete from public.notifications;

with
-- Program khusus per divisi.
-- Format kebutuhan: ["uraian", "kategori baris", qty, "satuan", harga_satuan, "catatan" | null]
demo_khusus (div, nama, kat, bulan, pic, status, items) as (values
-- HR-PD
('hr-pd', 'Training Service Excellence Batch 1', 'Training', 2, 'Dewi Lestari', 'diajukan', '[
  ["Honor trainer eksternal", "Honorarium / Narasumber", 2, "hari", 4500000, null],
  ["Sewa ruang meeting hotel", "Sewa (venue, alat)", 2, "hari", 3500000, null],
  ["Snack dan makan siang peserta", "Konsumsi", 60, "porsi", 85000, "30 peserta x 2 hari"],
  ["Modul dan sertifikat", "ATK & Cetak", 30, "set", 45000, null],
  ["Transport trainer", "Transport", 2, "kali", 350000, null]]'),
('hr-pd', 'Training Service Excellence Batch 2', 'Training', 7, 'Dewi Lestari', 'diajukan', '[
  ["Honor trainer eksternal", "Honorarium / Narasumber", 2, "hari", 4500000, null],
  ["Sewa ruang meeting hotel", "Sewa (venue, alat)", 2, "hari", 3500000, null],
  ["Snack dan makan siang peserta", "Konsumsi", 60, "porsi", 85000, "30 peserta x 2 hari"],
  ["Modul dan sertifikat", "ATK & Cetak", 30, "set", 45000, null]]'),
('hr-pd', 'Leadership Program Supervisor Klinik', 'Training', 4, 'Andi Pratama', 'diajukan', '[
  ["Fasilitator leadership", "Honorarium / Narasumber", 3, "hari", 6000000, null],
  ["Paket meeting fullboard", "Sewa (venue, alat)", 3, "hari", 9500000, "termasuk makan"],
  ["Hotel peserta luar kota", "Akomodasi", 8, "orang", 1650000, "2 malam"],
  ["Tiket pesawat peserta cabang", "Transport", 8, "orang", 1800000, null],
  ["Buku dan assessment DISC", "ATK & Cetak", 20, "set", 275000, null]]'),
('hr-pd', 'Onboarding Karyawan Baru Q1', 'Training', 3, 'Andi Pratama', 'diajukan', '[
  ["Welcome kit karyawan baru", "Perlengkapan & Merchandise", 25, "paket", 175000, null],
  ["Konsumsi sesi onboarding", "Konsumsi", 25, "porsi", 60000, null],
  ["Cetak buku panduan karyawan", "ATK & Cetak", 25, "pcs", 40000, null]]'),
('hr-pd', 'Langganan Platform E-Learning', 'Pengembangan Sistem / IT', 1, 'Dewi Lestari', 'diajukan', '[
  ["Lisensi LMS tahunan", "Software & Langganan", 1, "paket", 18000000, "150 pengguna"],
  ["Produksi video materi internal", "Jasa", 6, "kali", 1500000, null]]'),
('hr-pd', 'Workshop Public Speaking', 'Training', 9, 'Andi Pratama', 'draft', '[
  ["Honor narasumber", "Honorarium / Narasumber", 1, "hari", 3000000, null],
  ["Snack peserta", "Konsumsi", 25, "porsi", 35000, null],
  ["Sertifikat peserta", null, 25, "lembar", null, "harga belum dicek"]]'),
-- HR-EB
('hr-eb', 'Medical Check Up Tahunan Karyawan', 'Kesejahteraan Karyawan', 3, 'Rina Marlina', 'diajukan', '[
  ["Paket MCU basic", "Jasa", 180, "orang", 450000, null],
  ["Paket MCU eksekutif (manajer)", "Jasa", 15, "orang", 1250000, null],
  ["Transport tim MCU ke cabang", "Transport", 6, "kali", 500000, null]]'),
('hr-eb', 'Family Gathering 2027', 'Event', 6, 'Rina Marlina', 'diajukan', '[
  ["Sewa venue outdoor", "Sewa (venue, alat)", 1, "hari", 25000000, null],
  ["Konsumsi karyawan dan keluarga", "Konsumsi", 450, "porsi", 95000, null],
  ["Bus pariwisata", "Transport", 8, "unit", 3200000, null],
  ["Event organizer dan MC", "Jasa", 1, "paket", 18000000, null],
  ["Doorprize", "Perlengkapan & Merchandise", 1, "paket", 15000000, null],
  ["Kaos seragam acara", "Perlengkapan & Merchandise", 450, "pcs", 65000, null]]'),
('hr-eb', 'Perlengkapan Program Wellness Karyawan', 'Kesejahteraan Karyawan', 2, 'Rina Marlina', 'diajukan', '[
  ["Matras yoga dan perlengkapan", "Peralatan / Aset", 30, "pcs", 150000, null],
  ["Speaker portable untuk senam", "Peralatan / Aset", 2, "unit", 1750000, null]]'),
('hr-eb', 'Bingkisan Hari Raya Karyawan', 'Kesejahteraan Karyawan', 3, 'Fitri Handayani', 'diajukan', '[
  ["Parcel lebaran", "Perlengkapan & Merchandise", 210, "paket", 250000, null],
  ["Ongkos kirim ke cabang", "Transport", 12, "kali", 300000, null]]'),
('hr-eb', 'Apresiasi Karyawan Berprestasi', 'Kesejahteraan Karyawan', 12, 'Fitri Handayani', 'diajukan', '[
  ["Plakat dan sertifikat", "ATK & Cetak", 15, "pcs", 350000, null],
  ["Voucher hadiah", "Perlengkapan & Merchandise", 15, "pcs", 1000000, null],
  ["Gala dinner", "Konsumsi", 60, "porsi", 250000, null]]'),
('hr-eb', 'Vaksinasi Influenza Karyawan', 'Kesejahteraan Karyawan', 10, 'Rina Marlina', 'draft', '[
  ["Vaksin influenza", "Jasa", 200, "orang", 225000, null]]'),
-- HR-TA
('hr-ta', 'Job Fair Kampus Fisioterapi', 'Rekrutmen', 3, 'Bayu Setiawan', 'diajukan', '[
  ["Sewa booth job fair", "Sewa (venue, alat)", 3, "kali", 3500000, "3 kampus"],
  ["Banner dan brosur rekrutmen", "ATK & Cetak", 3, "paket", 1200000, null],
  ["Transport dan uang makan tim", "Transport", 3, "kali", 750000, null],
  ["Merchandise untuk kandidat", "Perlengkapan & Merchandise", 150, "pcs", 30000, null]]'),
('hr-ta', 'Iklan Lowongan Job Portal', 'Rekrutmen', 1, 'Bayu Setiawan', 'diajukan', '[
  ["Paket iklan premium job portal", "Software & Langganan", 12, "bulan", 2500000, null],
  ["Boost iklan media sosial", "Marketing", 6, "kali", 1000000, null]]'),
('hr-ta', 'Psikotes & Assessment Kandidat', 'Rekrutmen', 4, 'Bayu Setiawan', 'diajukan', '[
  ["Psikotes online", "Jasa", 120, "orang", 150000, null],
  ["Assessment center kandidat supervisor", "Jasa", 8, "orang", 1750000, null]]'),
('hr-ta', 'Rekrutmen Fisioterapis Cabang Baru', 'Rekrutmen', 8, 'Lia Kurniasih', 'diajukan', '[
  ["Iklan lowongan lokal", "Marketing", 2, "paket", 1500000, null],
  ["Tiket dan hotel interview luar kota", "Transport", 2, "kali", 3500000, null],
  ["Medical check up pra-kerja", "Jasa", 10, "orang", 450000, null]]'),
('hr-ta', 'Employer Branding Konten Karier', 'Kampanye & Promosi', 10, 'Lia Kurniasih', 'draft', '[
  ["Produksi video Kerja di WM Center", "Jasa", 1, "paket", 12000000, null]]'),
-- HR-GA / Purchasing
('hr-ga-purchasing', 'Pengadaan Bed Terapi Elektrik', 'Pengadaan Barang & Aset', 2, 'Hendra Wijaya', 'diajukan', '[
  ["Bed terapi elektrik 3 section", "Peralatan / Aset", 6, "unit", 14500000, null],
  ["Ongkos kirim dan instalasi", "Transport", 1, "paket", 2500000, null]]'),
('hr-ga-purchasing', 'Renovasi Ruang Tunggu Cabang', 'Renovasi & Pemeliharaan', 5, 'Hendra Wijaya', 'diajukan', '[
  ["Jasa renovasi interior", "Jasa", 1, "paket", 45000000, null],
  ["Sofa ruang tunggu", "Peralatan / Aset", 4, "set", 4500000, null],
  ["Pengecatan ulang dinding", "Jasa", 127.5, "m2", 55000, null]]'),
('hr-ga-purchasing', 'Servis AC Berkala Semua Cabang', 'Renovasi & Pemeliharaan', 1, 'Joko Susilo', 'diajukan', '[
  ["Servis dan cuci AC", "Jasa", 48, "unit", 175000, "4 cabang x 12 unit"],
  ["Freon dan sparepart", "Operasional", 1, "paket", 3500000, null]]'),
('hr-ga-purchasing', 'Servis AC Berkala Semua Cabang', 'Renovasi & Pemeliharaan', 7, 'Joko Susilo', 'diajukan', '[
  ["Servis dan cuci AC", "Jasa", 48, "unit", 175000, "4 cabang x 12 unit"],
  ["Freon dan sparepart", "Operasional", 1, "paket", 3500000, null]]'),
('hr-ga-purchasing', 'ATK & Perlengkapan Kantor Semester 1', 'Pengadaan Barang & Aset', 1, 'Joko Susilo', 'diajukan', '[
  ["Kertas A4", "ATK & Cetak", 60, "rim", 52000, null],
  ["Toner printer", "ATK & Cetak", 12, "pcs", 650000, null],
  ["Alat tulis kantor", "ATK & Cetak", 1, "paket", 4500000, null],
  ["Tinta isi ulang printer", "ATK & Cetak", 2.5, "botol", 33333, null]]'),
('hr-ga-purchasing', 'Seragam Terapis & Staf', 'Pengadaan Barang & Aset', 4, 'Hendra Wijaya', 'diajukan', '[
  ["Seragam terapis (2 stel per orang)", "Perlengkapan & Merchandise", 160, "pcs", 185000, null],
  ["Seragam staf front office", "Perlengkapan & Merchandise", 40, "pcs", 210000, null]]'),
('hr-ga-purchasing', 'Perpanjangan Asuransi Aset Klinik', 'Perizinan, Legal & Kepatuhan', 11, 'Hendra Wijaya', 'draft', '[
  ["Premi asuransi properti dan alat", "Jasa", 1, "paket", 28000000, null]]'),
-- HR-OPS
('hr-ops', 'Kalibrasi Alat Fisioterapi', 'Renovasi & Pemeliharaan', 3, 'Siti Rahmawati', 'diajukan', '[
  ["Kalibrasi alat elektroterapi", "Jasa", 24, "unit", 650000, null],
  ["Sertifikat kalibrasi", "Perizinan & Legal", 24, "pcs", 100000, null]]'),
('hr-ops', 'Audit SOP Operasional Cabang', 'Riset & Pengembangan Layanan', 6, 'Siti Rahmawati', 'diajukan', '[
  ["Transport dan akomodasi tim audit", "Transport", 4, "kali", 2500000, null],
  ["Uang harian auditor", "Operasional", 12, "hari", 300000, null]]'),
('hr-ops', 'Pelatihan K3 & APAR', 'Training', 8, 'Teguh Prasetyo', 'diajukan', '[
  ["Trainer K3 bersertifikat", "Honorarium / Narasumber", 1, "hari", 5000000, null],
  ["Refill APAR", "Operasional", 20, "unit", 175000, null],
  ["Konsumsi peserta", "Konsumsi", 40, "porsi", 50000, null]]'),
('hr-ops', 'Sistem Absensi Karyawan', 'Pengembangan Sistem / IT', 2, 'Teguh Prasetyo', 'diajukan', '[
  ["Mesin absensi face recognition", "Peralatan / Aset", 6, "unit", 3200000, null],
  ["Langganan aplikasi absensi", "Software & Langganan", 12, "bulan", 1500000, null]]'),
-- Business Development
('business-development', 'Studi Kelayakan Cabang Baru Bekasi', 'Riset & Pengembangan Layanan', 2, 'Rudi Hartono', 'diajukan', '[
  ["Konsultan studi kelayakan", "Jasa", 1, "paket", 35000000, null],
  ["Survei lokasi", "Transport", 6, "kali", 400000, null]]'),
('business-development', 'Kerja Sama Corporate Wellness', 'Kampanye & Promosi', 4, 'Rudi Hartono', 'diajukan', '[
  ["Company profile dan proposal cetak", "ATK & Cetak", 50, "pcs", 75000, null],
  ["Jamuan meeting klien", "Konsumsi", 12, "kali", 750000, null],
  ["Demo terapi di kantor klien", "Operasional", 6, "kali", 1200000, null]]'),
('business-development', 'Partnership Asuransi Kesehatan', 'Perizinan, Legal & Kepatuhan', 6, 'Melinda Sari', 'diajukan', '[
  ["Review kontrak oleh konsultan hukum", "Jasa", 3, "kali", 5000000, null],
  ["Perjalanan dinas negosiasi", "Transport", 4, "kali", 1500000, null]]'),
('business-development', 'Pameran Health Expo 2027', 'Event', 9, 'Melinda Sari', 'diajukan', '[
  ["Sewa booth 3x3 m", "Sewa (venue, alat)", 1, "paket", 22000000, null],
  ["Desain dan produksi booth", "Jasa", 1, "paket", 15000000, null],
  ["Brosur dan flyer", "ATK & Cetak", 2000, "lembar", 1500, null],
  ["Konsumsi tim jaga booth", "Konsumsi", 24, "porsi", 50000, null]]'),
('business-development', 'Riset Pasar Layanan Home Visit', 'Riset & Pengembangan Layanan', 11, 'Rudi Hartono', 'draft', '[
  ["Survei online responden", "Jasa", 400, "orang", 25000, null]]'),
-- Operation
('operation', 'Pembukaan Cabang Baru Bekasi', 'Event', 10, 'Agus Salim', 'diajukan', '[
  ["Alat fisioterapi set lengkap", "Peralatan / Aset", 1, "set", 185000000, null],
  ["Perizinan klinik dan PBG", "Perizinan & Legal", 1, "paket", 25000000, null],
  ["Acara grand opening", "Jasa", 1, "paket", 20000000, null]]'),
('operation', 'Pengadaan Alat Traksi Lumbal', 'Pengadaan Barang & Aset', 3, 'Agus Salim', 'diajukan', '[
  ["Alat traksi lumbal dan servikal", "Peralatan / Aset", 2, "unit", 38000000, null],
  ["Pelatihan penggunaan alat dari vendor", "Jasa", 1, "kali", 2500000, null]]'),
('operation', 'Maintenance Alat Terapi', 'Renovasi & Pemeliharaan', 6, 'Wahyu Hidayat', 'diajukan', '[
  ["Servis alat shockwave", "Jasa", 4, "unit", 2500000, null],
  ["Penggantian elektroda dan kabel", "Operasional", 1, "paket", 7500000, null],
  ["Solar genset cadangan", "Operasional", 37.75, "liter", 12333, "harga per liter"]]'),
-- Brand and Communication
('brand-communication', 'Kampanye Hari Fisioterapi Sedunia', 'Kampanye & Promosi', 9, 'Nadia Putri', 'diajukan', '[
  ["Iklan digital Meta dan Google", "Marketing", 1, "paket", 25000000, null],
  ["Sewa spot free screening postur di mal", "Sewa (venue, alat)", 2, "hari", 7500000, null],
  ["Merchandise kampanye", "Perlengkapan & Merchandise", 500, "pcs", 25000, null]]'),
('brand-communication', 'Kerja Sama KOL Kesehatan', 'Kampanye & Promosi', 3, 'Gilang Ramadhan', 'diajukan', '[
  ["Fee KOL kesehatan", "Jasa", 4, "orang", 7500000, null]]'),
('brand-communication', 'Press Release & Media Gathering', 'Event', 5, 'Gilang Ramadhan', 'diajukan', '[
  ["Sewa restoran untuk media", "Sewa (venue, alat)", 1, "kali", 8000000, null],
  ["Goodie bag media", "Perlengkapan & Merchandise", 30, "paket", 200000, null],
  ["Distribusi press release", "Jasa", 1, "paket", 5000000, null]]'),
('brand-communication', 'Rebranding Signage Cabang', 'Renovasi & Pemeliharaan', 8, 'Nadia Putri', 'draft', '[
  ["Signage neon box", "Peralatan / Aset", 4, "unit", 12000000, null]]'),
-- Creative
('creative', 'Produksi Konten Edukasi Video', 'Kampanye & Promosi', 2, 'Kevin Tanjaya', 'diajukan', '[
  ["Videografer dan editor", "Jasa", 12, "kali", 2500000, null],
  ["Talent atau model", "Honorarium / Narasumber", 6, "orang", 1000000, null]]'),
('creative', 'Langganan Tools Desain', 'Pengembangan Sistem / IT', 1, 'Kevin Tanjaya', 'diajukan', '[
  ["Adobe Creative Cloud tim", "Software & Langganan", 3, "lisensi", 9000000, "per tahun"],
  ["Canva Pro Teams", "Software & Langganan", 1, "paket", 3500000, null],
  ["Stok foto dan musik", "Software & Langganan", 12, "bulan", 450000, null]]'),
('creative', 'Pengadaan Kamera & Lighting', 'Pengadaan Barang & Aset', 3, 'Putri Ayu', 'diajukan', '[
  ["Kamera mirrorless dan lensa", "Peralatan / Aset", 1, "unit", 28000000, null],
  ["Lighting kit LED", "Peralatan / Aset", 2, "set", 3500000, null],
  ["Mikrofon wireless", "Peralatan / Aset", 2, "unit", 2800000, null]]'),
('creative', 'Desain Materi Cetak Promosi', 'Kampanye & Promosi', 6, 'Putri Ayu', 'diajukan', '[
  ["Cetak brosur layanan", "ATK & Cetak", 5000, "lembar", 1200, null],
  ["Cetak banner roll up", "ATK & Cetak", 12, "pcs", 350000, null]]'),
-- Legal and Compliance (sengaja baru draft)
('legal-compliance', 'Perpanjangan Izin Operasional Klinik', 'Perizinan, Legal & Kepatuhan', 3, 'Yohana Simanjuntak', 'draft', '[
  ["Biaya perpanjangan izin klinik", "Perizinan & Legal", 4, "paket", 3500000, null],
  ["Jasa pengurusan dokumen", "Jasa", 4, "kali", 1500000, null]]'),
('legal-compliance', 'Pendaftaran Merek Dagang', 'Perizinan, Legal & Kepatuhan', 5, 'Yohana Simanjuntak', 'draft', '[
  ["Biaya pendaftaran merek DJKI", "Perizinan & Legal", 3, "kelas", 1800000, null],
  ["Konsultan HKI", "Jasa", 1, "paket", 6000000, null]]'),
-- Finance & Data Analyst
('finance-data-analyst', 'Audit Laporan Keuangan Tahunan', 'Perizinan, Legal & Kepatuhan', 3, 'Fajar Nugroho', 'diajukan', '[
  ["Jasa audit kantor akuntan publik", "Jasa", 1, "paket", 65000000, null]]'),
('finance-data-analyst', 'Langganan Software Akuntansi & BI', 'Pengembangan Sistem / IT', 1, 'Fajar Nugroho', 'diajukan', '[
  ["Lisensi software akuntansi", "Software & Langganan", 12, "bulan", 1750000, null],
  ["Lisensi dashboard BI", "Software & Langganan", 5, "lisensi", 2400000, null]]'),
('finance-data-analyst', 'Pelatihan Perpajakan Tim Finance', 'Training', 7, 'Anisa Rahma', 'diajukan', '[
  ["Seminar perpajakan", "Honorarium / Narasumber", 4, "orang", 2500000, null],
  ["Brevet pajak A dan B", "Jasa", 1, "orang", 4500000, null]]'),
('finance-data-analyst', 'Stock Opname & Audit Internal Cabang', 'Perizinan, Legal & Kepatuhan', 12, 'Anisa Rahma', 'diajukan', '[
  ["Transport tim stock opname", "Transport", 4, "kali", 800000, null],
  ["Uang harian", "Operasional", 8, "hari", 300000, null]]'),
-- Physiotherapist
('physiotherapist', 'Pelatihan Manual Therapy Bersertifikat', 'Training', 4, 'Maya Anggraini, S.Ft', 'diajukan', '[
  ["Biaya pelatihan dan sertifikasi", "Jasa", 6, "orang", 7500000, null],
  ["Hotel peserta", "Akomodasi", 6, "orang", 1500000, null],
  ["Transport peserta", "Transport", 6, "orang", 900000, null]]'),
('physiotherapist', 'Seminar Ilmiah Fisioterapi Internal', 'Event', 8, 'Maya Anggraini, S.Ft', 'diajukan', '[
  ["Narasumber pakar", "Honorarium / Narasumber", 2, "orang", 5000000, null],
  ["Sewa auditorium", "Sewa (venue, alat)", 1, "hari", 6000000, null],
  ["Konsumsi peserta", "Konsumsi", 80, "porsi", 75000, null],
  ["Sertifikat SKP", "ATK & Cetak", 80, "pcs", 15000, null]]'),
('physiotherapist', 'Alat Radial Shockwave Therapy', 'Pengadaan Barang & Aset', 2, 'Maya Anggraini, S.Ft', 'diajukan', '[
  ["Alat radial shockwave therapy", "Peralatan / Aset", 1, "unit", 165000000, null]]'),
('physiotherapist', 'Langganan Jurnal & Referensi Klinis', 'Riset & Pengembangan Layanan', 1, 'Maya Anggraini, S.Ft', 'diajukan', '[
  ["Akses jurnal online", "Software & Langganan", 1, "paket", 8500000, null],
  ["Buku referensi klinis", "ATK & Cetak", 10, "pcs", 650000, null]]'),
('physiotherapist', 'Perpanjangan STR & SIP Terapis', 'Perizinan, Legal & Kepatuhan', 10, 'Maya Anggraini, S.Ft', 'draft', '[
  ["Biaya perpanjangan STR dan SIP", "Perizinan & Legal", 20, "orang", 350000, null]]'),
-- Project Expansion (D-40): ekspansi cabang baru Tangerang Selatan
('project-expansion', 'Survei Lokasi Cabang Baru Tangerang Selatan', 'Riset & Pengembangan Layanan', 1, 'Rizky Maulana', 'diajukan', '[
  ["Konsultan riset lokasi dan demografi", "Jasa", 1, "paket", 28000000, null],
  ["Transport survei lapangan", "Transport", 10, "kali", 350000, "5 kandidat lokasi x 2 kunjungan"],
  ["Konsumsi tim survei", "Konsumsi", 20, "porsi", 45000, null]]'),
('project-expansion', 'Sewa Ruko Cabang Tangerang Selatan', 'Pengadaan Barang & Aset', 3, 'Rizky Maulana', 'diajukan', '[
  ["Sewa ruko 2 lantai (tahun pertama)", "Sewa (venue, alat)", 1, "paket", 180000000, null],
  ["Biaya notaris perjanjian sewa", "Perizinan & Legal", 1, "paket", 4500000, null]]'),
('project-expansion', 'Desain & Renovasi Interior Cabang Baru', 'Renovasi & Pemeliharaan', 4, 'Intan Permatasari', 'diajukan', '[
  ["Jasa desain interior klinik", "Jasa", 1, "paket", 25000000, null],
  ["Renovasi interior dan instalasi", "Jasa", 185.5, "m2", 1250000, "luas bangunan"],
  ["Signage dan papan nama", "Peralatan / Aset", 1, "set", 15000000, null]]'),
('project-expansion', 'Perizinan Klinik & PBG Cabang Baru', 'Perizinan, Legal & Kepatuhan', 5, 'Intan Permatasari', 'diajukan', '[
  ["Pengurusan PBG dan SLF", "Perizinan & Legal", 1, "paket", 22000000, null],
  ["Izin operasional klinik", "Perizinan & Legal", 1, "paket", 12500000, null]]'),
('project-expansion', 'Pengadaan Alat Fisioterapi Cabang Baru', 'Pengadaan Barang & Aset', 6, 'Rizky Maulana', 'diajukan', '[
  ["Bed terapi elektrik", "Peralatan / Aset", 6, "unit", 14500000, null],
  ["Alat elektroterapi (TENS/US)", "Peralatan / Aset", 4, "unit", 18000000, null],
  ["Alat latihan dan matras", "Peralatan / Aset", 1, "paket", 22500000, null]]'),
('project-expansion', 'Rekrutmen Tim Cabang Baru', 'Rekrutmen', 7, 'Intan Permatasari', 'diajukan', '[
  ["Iklan lowongan terapis dan front office", "Marketing", 2, "paket", 1500000, null],
  ["Psikotes kandidat", "Jasa", 40, "orang", 150000, null],
  ["Medical check up pra-kerja", "Jasa", 12, "orang", 450000, null]]'),
('project-expansion', 'Promosi Pra-Pembukaan Cabang Baru', 'Kampanye & Promosi', 8, 'Rizky Maulana', 'diajukan', '[
  ["Iklan digital area Tangerang Selatan", "Marketing", 2, "bulan", 7500000, null],
  ["Brosur dan spanduk", "ATK & Cetak", 1, "paket", 4500000, null],
  ["Free screening postur di perumahan", "Operasional", 4, "kali", 2500000, null]]'),
('project-expansion', 'Grand Opening Cabang Tangerang Selatan', 'Event', 9, 'Intan Permatasari', 'diajukan', '[
  ["Event organizer grand opening", "Jasa", 1, "paket", 25000000, null],
  ["Konsumsi tamu undangan", "Konsumsi", 200, "porsi", 75000, null],
  ["Souvenir pengunjung", "Perlengkapan & Merchandise", 300, "pcs", 35000, null]]'),
('project-expansion', 'Studi Kelayakan Cabang Ketiga (2028)', 'Riset & Pengembangan Layanan', 11, 'Rizky Maulana', 'draft', '[
  ["Konsultan studi kelayakan", "Jasa", 1, "paket", 35000000, null],
  ["Survei kandidat lokasi", "Transport", 8, "kali", 400000, null]]')
),
-- Program rutin per divisi agar SETIAP divisi punya program di SETIAP bulan.
-- mode 'kosong' = hanya mengisi bulan yang belum ada programnya;
-- mode 'semua'  = ada tiap bulan (jadi beberapa bulan berisi lebih dari 1 program).
-- Qty item >= 4 sedikit bervariasi per bulan supaya angka tidak seragam.
tpl_raw (div, nama, kat, pic, mode, items) as (values
('hr-pd', 'Training Internal Terapis ({bulan})', 'Training', 'Andi Pratama', 'kosong', '[
  ["Honor trainer internal", "Honorarium / Narasumber", 1, "hari", 1500000, null],
  ["Konsumsi peserta", "Konsumsi", 30, "porsi", 45000, null],
  ["Modul pelatihan", "ATK & Cetak", 30, "set", 20000, null]]'),
('hr-eb', 'Program Wellness Bulanan ({bulan})', 'Kesejahteraan Karyawan', 'Rina Marlina', 'kosong', '[
  ["Instruktur senam dan yoga", "Honorarium / Narasumber", 2, "kali", 400000, null],
  ["Buah dan air mineral peserta", "Konsumsi", 1, "paket", 750000, null]]'),
('hr-ta', 'Rekrutmen Rutin Terapis & Staf ({bulan})', 'Rekrutmen', 'Lia Kurniasih', 'semua', '[
  ["Iklan lowongan", "Marketing", 1, "paket", 1500000, null],
  ["Psikotes online kandidat", "Jasa", 15, "orang", 150000, null],
  ["Medical check up pra-kerja", "Jasa", 4, "orang", 450000, null]]'),
('hr-ga-purchasing', 'Kebersihan & Perbaikan Kecil Gedung ({bulan})', 'Renovasi & Pemeliharaan', 'Joko Susilo', 'kosong', '[
  ["Jasa kebersihan cabang", "Jasa", 4, "cabang", 3500000, null],
  ["Perbaikan kecil gedung", "Jasa", 1, "paket", 2000000, null],
  ["Perlengkapan kebersihan", "Operasional", 1, "paket", 1500000, null]]'),
('hr-ops', 'Kunjungan Supervisi Cabang ({bulan})', 'Riset & Pengembangan Layanan', 'Teguh Prasetyo', 'kosong', '[
  ["Transport kunjungan supervisor", "Transport", 8, "kali", 250000, null],
  ["Konsumsi briefing bulanan", "Konsumsi", 40, "porsi", 30000, null]]'),
('business-development', 'Prospek Mitra Korporat ({bulan})', 'Kampanye & Promosi', 'Melinda Sari', 'kosong', '[
  ["Jamuan meeting prospek", "Konsumsi", 4, "kali", 600000, null],
  ["Transport kunjungan klien", "Transport", 8, "kali", 200000, null],
  ["Cetak materi presentasi", "ATK & Cetak", 20, "pcs", 50000, null]]'),
('operation', 'Bahan Habis Pakai Klinik ({bulan})', 'Pengadaan Barang & Aset', 'Agus Salim', 'semua', '[
  ["Gel ultrasound 5 liter", "Operasional", 14, "pcs", 175000, null],
  ["Kinesio tape", "Operasional", 40, "pcs", 95000, null],
  ["Tissue dan handuk sekali pakai", "Operasional", 1, "paket", 2200000, null]]'),
('brand-communication', 'Iklan Digital ({bulan})', 'Kampanye & Promosi', 'Nadia Putri', 'semua', '[
  ["Budget Meta Ads", "Marketing", 1, "bulan", 8000000, null],
  ["Budget Google Ads", "Marketing", 1, "bulan", 6000000, null]]'),
('creative', 'Konten Media Sosial ({bulan})', 'Kampanye & Promosi', 'Putri Ayu', 'kosong', '[
  ["Produksi foto dan video konten", "Jasa", 8, "kali", 750000, null],
  ["Talent konten", "Honorarium / Narasumber", 2, "orang", 750000, null]]'),
('legal-compliance', 'Legalisasi & Konsultasi Hukum ({bulan})', 'Perizinan, Legal & Kepatuhan', 'Yohana Simanjuntak', 'kosong', '[
  ["Legalisasi dokumen dan notaris", "Perizinan & Legal", 2, "kali", 1500000, null],
  ["Konsultasi hukum", "Jasa", 1, "kali", 2500000, null]]'),
('finance-data-analyst', 'Closing Bulanan & Kiriman Dokumen ({bulan})', 'Perizinan, Legal & Kepatuhan', 'Fajar Nugroho', 'kosong', '[
  ["Materai", "Perizinan & Legal", 100, "pcs", 10000, null],
  ["Kurir dokumen ke cabang", "Transport", 4, "kali", 150000, null],
  ["Konsumsi lembur closing", "Konsumsi", 12, "porsi", 40000, null]]'),
('physiotherapist', 'Diskusi Kasus Klinis ({bulan})', 'Riset & Pengembangan Layanan', 'Maya Anggraini, S.Ft', 'kosong', '[
  ["Narasumber tamu", "Honorarium / Narasumber", 1, "orang", 1500000, null],
  ["Konsumsi diskusi", "Konsumsi", 25, "porsi", 40000, null],
  ["Cetak materi kasus", "ATK & Cetak", 25, "pcs", 10000, null]]'),
('project-expansion', 'Monitoring Proyek Ekspansi ({bulan})', 'Riset & Pengembangan Layanan', 'Rizky Maulana', 'kosong', '[
  ["Transport kunjungan lokasi proyek", "Transport", 6, "kali", 300000, null],
  ["Konsumsi rapat progres proyek", "Konsumsi", 15, "porsi", 45000, null],
  ["Cetak laporan progres", "ATK & Cetak", 10, "pcs", 25000, null]]')
),
tpl as (select row_number() over () as no, t.* from tpl_raw t),
bulan (b, nama_bulan) as (values (1, 'Januari'), (2, 'Februari'), (3, 'Maret'), (4, 'April'), (5, 'Mei'), (6, 'Juni'),
                                 (7, 'Juli'), (8, 'Agustus'), (9, 'September'), (10, 'Oktober'), (11, 'November'), (12, 'Desember')),
khusus as (select row_number() over () as ord, k.* from demo_khusus k),
rutin as (
  select t.no * 100 + m.b as ord, t.div,
         replace(t.nama, '{bulan}', m.nama_bulan) as nama,
         t.kat, m.b as bulan, t.pic,
         case when (m.b * 5 + t.no) % 11 = 0 then 'draft' else 'diajukan' end as status,
         (select jsonb_agg(case when (e.val ->> 2)::numeric >= 4
                                then jsonb_set(e.val, '{2}', to_jsonb((e.val ->> 2)::numeric + (m.b % 3) * ceil((e.val ->> 2)::numeric * 0.1)))
                                else e.val end order by e.ord)
            from jsonb_array_elements(t.items::jsonb) with ordinality as e(val, ord)) as items
  from tpl t cross join bulan m
  where t.mode = 'semua'
     or not exists (select 1 from demo_khusus x where x.div = t.div and x.bulan = m.b)
),
demo as (
  select row_number() over (order by src, ord) as no, div, nama, kat, bulan, pic, status, items
  from (select 1 as src, ord, div, nama, kat, bulan, pic, status, items::jsonb as items from khusus
        union all
        select 2, ord, div, nama, kat, bulan, pic, status, items from rutin) u
),
-- Header program (tanggal pengajuan tersebar 2-9 November 2026, WIB)
ins as (
  insert into public.programs (division_id, nama_program, program_category_id, periode_bulan, pic_nama,
                               status, tanggal_pengajuan, submitted_at, created_by_name, updated_by_name)
  select d.id, x.nama, pc.id, x.bulan, x.pic, x.status,
         case when x.status = 'diajukan' then date '2026-11-02' + (x.no::int % 8) end,
         case when x.status = 'diajukan' then ((date '2026-11-02' + (x.no::int % 8))::timestamp + time '08:30' + make_interval(mins => (x.no::int * 37) % 480)) at time zone 'Asia/Jakarta' end,
         'Data Demo', x.pic
  from demo x
  join public.divisions d on d.code = x.div
  join public.program_categories pc on pc.name = x.kat
  returning id, division_id, nama_program, periode_bulan, status
),
-- Baris kebutuhan
ins_items as (
  insert into public.program_items (program_id, urutan, uraian, item_category_id, qty, satuan, harga_satuan, catatan)
  select p.id, e.ord, e.val ->> 0, ic.id, (e.val ->> 2)::numeric, e.val ->> 3, (e.val ->> 4)::bigint, e.val ->> 5
  from demo x
  join public.divisions d on d.code = x.div
  join ins p on p.division_id = d.id and p.nama_program = x.nama and p.periode_bulan = x.bulan
  cross join lateral jsonb_array_elements(x.items) with ordinality as e(val, ord)
  left join public.item_categories ic on ic.name = e.val ->> 1
  returning program_id, subtotal
)
select 'Data demo selesai' as status,
       (select count(*) from ins) as jumlah_program,
       (select count(*) from ins where status = 'draft') as draft,
       (select count(*) from ins_items) as jumlah_baris,
       (select sum(i.subtotal) from ins_items i join ins p on p.id = i.program_id where p.status = 'diajukan') as total_diajukan,
       case when (select count(*) from ins) = (select count(*) from demo)
             and (select count(*) from ins_items) = (select count(*) from demo x cross join lateral jsonb_array_elements(x.items) e)
             and not exists (select 1 from demo x cross join lateral jsonb_array_elements(x.items) e
                             where e ->> 1 is not null and not exists (select 1 from public.item_categories c where c.name = e ->> 1))
            then 'OK' else 'PERIKSA: ada data demo yang tidak cocok dengan master' end as cek;
