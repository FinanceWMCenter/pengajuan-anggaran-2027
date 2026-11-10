-- =====================================================================
-- 07_reset_semua_pin.sql  -  RESET SEMUA PIN (Finance + 12 divisi) menjadi PIN acak baru
--
-- Kapan dipakai:
--   * Sekali saat pindah ke "login PIN langsung" (D-38): PIN Finance berubah dari 8 menjadi 6 digit
--     dan semua PIN harus dijamin berbeda satu sama lain.
--   * Bila ingin mengganti SEMUA PIN sekaligus (mis. dugaan PIN bocor).
--
-- Akibat: semua PIN lama langsung tidak berlaku, semua orang yang sedang masuk dikeluarkan.
-- Data program, kategori, dan log TIDAK berubah.
--
-- CARA PAKAI (Supabase -> SQL Editor):
--   1. Ganti kata 'TIDAK' menjadi 'YA' pada baris "konfirmasi" di bawah.
--   2. Tempel seluruh isi file, klik Run.
--   3. Tabel hasil berisi 13 PIN baru (6 digit, semua berbeda). SEGERA salin ke password manager.
--      PIN hanya tampil sekali. Jangan simpan di repo, chat, atau grup.
--   Bila hasilnya "BELUM DIKONFIRMASI", berarti kata 'YA' belum diisi; tidak ada yang berubah.
-- Butuh fungsi dari 03_functions.sql versi terbaru.
-- =====================================================================

with
konfirmasi as (
  select 'TIDAK'::text as v      -- <== ganti 'TIDAK' menjadi 'YA' untuk benar-benar mereset semua PIN
),
pins as (
  select public._new_unique_pins((select count(*)::int + 1 from public.divisions), false) as arr
  where (select v from konfirmasi) = 'YA'
),
master as (
  select 'PIN FINANCE'::text as untuk, 'finance'::text as kode, arr[1] as pin, 0 as urut from pins
),
master_saved as (
  insert into public.app_settings (key, value)
  select 'finance_pin_hash', public._pin_hash(pin) from master
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning key
),
division_pins as (
  select d.id, d.name as untuk, d.code as kode,
         (select arr from pins)[1 + (row_number() over (order by d.sort_order, d.id))::int] as pin,
         d.sort_order::int as urut
  from public.divisions d
  where exists (select 1 from pins)
),
division_saved as (
  update public.divisions d
     set pin_hash = public._pin_hash(p.pin),
         pin_updated_at = now()
    from division_pins p
   where p.id = d.id
  returning d.id
),
sessions_cleared as (
  delete from public.sessions where exists (select 1 from pins)
  returning 1
),
logged as (
  insert into public.audit_log (actor_role, division_id, action, entity_type, entity_id, new_data)
  select 'system', s.id, 'pin_reset', 'division', s.id::text, jsonb_build_object('via', '07_reset_semua_pin.sql')
  from division_saved s
  union all
  select 'system', null, 'master_pin_change', 'settings', 'finance_pin_hash', jsonb_build_object('via', '07_reset_semua_pin.sql')
  from master_saved
  returning id
)
select untuk, kode, pin
from (
  select urut, untuk, kode, pin from master
  union all
  select urut, untuk, kode, pin from division_pins
  union all
  select -1, 'BELUM DIKONFIRMASI: ganti kata TIDAK menjadi YA di baris konfirmasi, lalu Run lagi', '-', '-'
  where (select v from konfirmasi) <> 'YA'
) hasil
order by urut;
