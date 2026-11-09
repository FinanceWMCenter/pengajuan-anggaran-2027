-- =====================================================================
-- 06_bootstrap.sql  -  Membuat master PIN Finance + PIN awal tiap divisi
--
-- File ini TIDAK berisi PIN. PIN dibuat ACAK oleh database saat dijalankan, lalu
-- ditampilkan SATU KALI di tabel hasil (bagian bawah SQL Editor).
--
-- CARA PAKAI (Supabase -> SQL Editor):
--   1. Tempel seluruh isi file ini, klik Run.
--   2. Lihat tabel hasil: kolom "pin" berisi PIN baru.
--   3. SEGERA salin ke password manager. PIN tidak bisa dilihat lagi (hanya bisa direset).
--   4. Jangan menyimpan hasil ini di file repo, chat, atau grup.
--
-- Aman dijalankan ulang: hanya mengisi PIN yang BELUM ada. PIN yang sudah ada tidak diubah
-- (hasil kosong = semua PIN sudah pernah dibuat). Ganti PIN berikutnya lewat halaman Finance.
-- =====================================================================

with
master as (
  select 'MASTER PIN FINANCE'::text as untuk, 'finance'::text as kode, public._random_digits(8) as pin, 0 as urut
  where not exists (select 1 from public.app_settings where key = 'finance_pin_hash')
),
master_saved as (
  insert into public.app_settings (key, value)
  select 'finance_pin_hash', extensions.crypt(pin, extensions.gen_salt('bf', 10)) from master
  returning key
),
division_pins as (
  select d.id, d.name as untuk, d.code as kode, public._random_digits(6) as pin, d.sort_order::int as urut
  from public.divisions d
  where d.pin_hash is null and d.is_active
),
division_saved as (
  update public.divisions d
     set pin_hash = extensions.crypt(p.pin, extensions.gen_salt('bf', 10)),
         pin_updated_at = now()
    from division_pins p
   where p.id = d.id
  returning d.id
),
logged as (
  insert into public.audit_log (actor_role, division_id, action, entity_type, entity_id, new_data)
  select 'system', s.id, 'pin_reset', 'division', s.id::text, jsonb_build_object('via', '06_bootstrap.sql')
  from division_saved s
  returning id
)
select untuk, kode, pin
from (
  select urut, untuk, kode, pin from master
  union all
  select urut, untuk, kode, pin from division_pins
) hasil
order by urut;
