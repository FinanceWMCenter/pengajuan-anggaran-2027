-- =====================================================================
-- 06_bootstrap.sql  -  Membuat PIN Finance + PIN awal tiap divisi (yang BELUM punya PIN)
--
-- File ini TIDAK berisi PIN. PIN dibuat ACAK oleh database saat dijalankan, lalu
-- ditampilkan SATU KALI di tabel hasil (bagian bawah SQL Editor).
-- Semua PIN 6 digit dan dijamin berbeda satu sama lain (login PIN langsung, D-38).
--
-- CARA PAKAI (Supabase -> SQL Editor):
--   1. Tempel seluruh isi file ini, klik Run.
--   2. Lihat tabel hasil: kolom "pin" berisi PIN baru.
--   3. SEGERA salin ke password manager. PIN tidak bisa dilihat lagi (hanya bisa direset).
--   4. Jangan menyimpan hasil ini di file repo, chat, atau grup.
--
-- Aman dijalankan ulang: hanya mengisi PIN yang BELUM ada. PIN yang sudah ada tidak diubah
-- (hasil kosong = semua PIN sudah pernah dibuat). Ganti PIN lewat halaman Finance,
-- atau reset semua sekaligus dengan 07_reset_semua_pin.sql.
-- Butuh fungsi dari 03_functions.sql (jalankan 01-05 dulu).
-- =====================================================================

with
need as (
  select (not exists (select 1 from public.app_settings where key = 'finance_pin_hash'))::int as master_n,
         (select count(*)::int from public.divisions where pin_hash is null and is_active) as div_n
),
pins as (
  select public._new_unique_pins((select master_n + div_n from need), true) as arr
),
master as (
  select 'PIN FINANCE'::text as untuk, 'finance'::text as kode, (select arr[1] from pins) as pin, 0 as urut
  where (select master_n from need) = 1
),
master_saved as (
  insert into public.app_settings (key, value)
  select 'finance_pin_hash', public._pin_hash(pin) from master
  returning key
),
division_pins as (
  select d.id, d.name as untuk, d.code as kode,
         (select arr from pins)[(select master_n from need) + (row_number() over (order by d.sort_order, d.id))::int] as pin,
         d.sort_order::int as urut
  from public.divisions d
  where d.pin_hash is null and d.is_active
),
division_saved as (
  update public.divisions d
     set pin_hash = public._pin_hash(p.pin),
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
