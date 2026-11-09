-- =====================================================================
-- 98_clear_test_data.sql  -  MENGHAPUS SEMUA data program sebelum go-live (tes R-07)
--
-- Menghapus: SEMUA program + baris kebutuhan (data demo maupun yang dibuat saat uji coba),
-- seluruh log, sesi, percobaan login, dan SEMUA PIN (divisi + master Finance).
-- Kategori, divisi, dan pengaturan TIDAK dihapus.
-- Setelah ini jalankan 06_bootstrap.sql untuk membuat PIN asli.
--
-- PENGAMAN: skrip tidak melakukan apa pun sampai Anda mengganti kata 'TIDAK' menjadi 'YA'
-- pada baris "konfirmasi" di bawah. JANGAN jalankan setelah divisi mulai mengisi data asli.
-- =====================================================================

do $$
declare
  konfirmasi text := 'TIDAK';   -- <== ganti menjadi 'YA' untuk benar-benar menghapus
  n_prog int;
begin
  if konfirmasi <> 'YA' then
    raise exception 'Belum dikonfirmasi. Ganti ''TIDAK'' menjadi ''YA'' di baris konfirmasi bila yakin ingin menghapus SEMUA data program.';
  end if;

  select count(*) into n_prog from public.programs;
  delete from public.programs;          -- baris kebutuhan ikut terhapus (cascade)
  delete from public.audit_log;
  delete from public.sessions;
  delete from public.login_attempts;
  update public.divisions set pin_hash = null, pin_updated_at = null;
  delete from public.app_settings where key = 'finance_pin_hash';
  raise notice 'Selesai: % program dihapus. Lanjutkan dengan 06_bootstrap.sql.', n_prog;
end;
$$;

select (select count(*) from public.programs) as sisa_program,
       (select count(*) from public.divisions where pin_hash is not null) as divisi_ber_pin;
