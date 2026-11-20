-- =====================================================================
-- 97_reset_pengajuan.sql  -  Mengosongkan SEMUA pengajuan (mulai dari 0), PIN TETAP
--
-- Dihapus : semua program (draft + diajukan) beserta baris kebutuhannya, RAB Gabungan, riwayat revisi item,
--           notifikasi, dan catatan log yang berkaitan dengan program/export (sisa uji coba).
-- TETAP   : PIN divisi + Master PIN Finance, divisi, kategori (master data), pengaturan, sesi login,
--           dan log PIN/kategori (pin_reset, master_pin_change, category_change).
--
-- PENGAMAN: skrip tidak melakukan apa pun sampai kata 'TIDAK' di baris "konfirmasi" diganti 'YA'.
-- JANGAN jalankan setelah divisi mulai mengisi data asli (data yang terhapus tidak bisa kembali,
-- kecuali dari file backup).
-- =====================================================================

do $$
declare
  konfirmasi text := 'TIDAK';   -- <== ganti menjadi 'YA' untuk benar-benar menghapus
  n_prog int; n_item int; n_hist int; n_notif int; n_log int;
begin
  if konfirmasi <> 'YA' then
    raise exception 'Belum dikonfirmasi. Ganti ''TIDAK'' menjadi ''YA'' di baris konfirmasi bila yakin ingin menghapus SEMUA pengajuan.';
  end if;

  select count(*) into n_prog from public.programs;
  select count(*) into n_item from public.program_items;
  select count(*) into n_hist from public.program_item_history;
  select count(*) into n_notif from public.notifications;
  select count(*) into n_log from public.audit_log where action not in ('pin_reset', 'master_pin_change', 'category_change');

  delete from public.programs;               -- baris kebutuhan ikut terhapus (cascade)
  if to_regclass('public.consolidation_groups') is not null then
    delete from public.consolidation_groups;   -- RAB Gabungan (D-52) ikut kosong
  end if;
  if to_regclass('public.consolidation_dismissed') is not null then
    delete from public.consolidation_dismissed;   -- saran yang diabaikan (D-53)
  end if;
  delete from public.program_item_history;
  delete from public.notifications;
  delete from public.audit_log where action not in ('pin_reset', 'master_pin_change', 'category_change');

  raise notice 'Dihapus: % program, % baris kebutuhan, % riwayat revisi, % notifikasi, % log.', n_prog, n_item, n_hist, n_notif, n_log;
end;
$$;

-- Hasil (harus 0 semua di 5 kolom pertama; PIN & kategori tetap ada)
select (select count(*) from public.programs)              as program,
       (select count(*) from public.program_items)         as baris_kebutuhan,
       (select count(*) from public.program_item_history)  as riwayat_revisi,
       (select count(*) from public.notifications)         as notifikasi,
       (select count(*) from public.audit_log where action not in ('pin_reset', 'master_pin_change', 'category_change')) as log_pengajuan,
       (select count(*) from public.divisions where pin_hash is not null) as divisi_ber_pin,
       (select count(*) from public.app_settings where key = 'finance_pin_hash') as pin_finance,
       (select count(*) from public.program_categories)    as kategori_program,
       (select count(*) from public.item_categories)       as kategori_kebutuhan;
