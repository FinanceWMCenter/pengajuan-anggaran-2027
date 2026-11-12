-- =====================================================================
-- 04_security.sql  -  Kunci semua tabel; buka hanya fungsi RPC yang diperlukan
-- Jalankan setelah 03. Aman dijalankan ulang. WAJIB dijalankan ulang setiap ada tabel/fungsi baru.
-- Acuan: 05_SECURITY_MODEL.md, keputusan T-04.
-- =====================================================================

-- 1) RLS aktif di SEMUA tabel public, tanpa policy apa pun (= default tolak)
do $$
declare
  t record;
begin
  for t in select c.relname
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end;
$$;

-- 2) Cabut semua hak langsung dari browser (anon) dan pengguna login (authenticated; tidak dipakai)
revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- 3) Objek BARU di masa depan juga tertutup secara default (Supabase memberi akses otomatis)
alter default privileges in schema public revoke all on tables    from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- 4) Browser boleh "melihat" schema public, tetapi hanya bisa memanggil fungsi di bawah
grant usage on schema public to anon;

grant execute on function public.rpc_ping()                                   to anon;
grant execute on function public.rpc_list_divisions()                         to anon;
grant execute on function public.rpc_get_master()                             to anon;
grant execute on function public.rpc_login_pin(text, text)                    to anon;  -- login PIN langsung (D-38)
grant execute on function public.rpc_login(text, text, text)                  to anon;
grant execute on function public.rpc_login_finance(text, text)                to anon;
grant execute on function public.rpc_logout(text)                             to anon;
grant execute on function public.rpc_list_programs(text, text)                to anon;
grant execute on function public.rpc_get_program(text, text)                  to anon;
grant execute on function public.rpc_check_similar(text, text, int, text)     to anon;
grant execute on function public.rpc_save_program(text, jsonb)                to anon;
grant execute on function public.rpc_delete_program(text, text, text)         to anon;
grant execute on function public.rpc_f_list_programs(text)                    to anon;
grant execute on function public.rpc_f_list_divisions(text)                   to anon;
grant execute on function public.rpc_f_set_division_pin(text, int, text)      to anon;
grant execute on function public.rpc_f_set_master_pin(text, text, text)       to anon;
grant execute on function public.rpc_f_upsert_category(text, text, int, text, boolean) to anon;
grant execute on function public.rpc_f_audit_log(text, jsonb)                 to anon;
grant execute on function public.rpc_f_export(text, jsonb)                    to anon;
grant execute on function public.rpc_f_revise_items(text, text, text, jsonb)  to anon;  -- D-43
grant execute on function public.rpc_program_item_history(text, text)         to anon;
grant execute on function public.rpc_notifications(text)                      to anon;
grant execute on function public.rpc_notifications_read(text, bigint)         to anon;
-- Fungsi overview dibuat di 05_overview.sql (dan diberi izin di sana). Bila file ini dijalankan ULANG
-- setelah 05, izinnya ikut tercabut oleh langkah 2 -> pasang lagi di sini supaya Overview tetap jalan.
do $$
begin
  if to_regprocedure('public.rpc_overview_division(text, text)') is not null then
    grant execute on function public.rpc_overview_division(text, text) to anon;
  end if;
  if to_regprocedure('public.rpc_f_overview(text)') is not null then
    grant execute on function public.rpc_f_overview(text) to anon;
  end if;
  if to_regprocedure('public.rpc_f_overview_detail(text)') is not null then
    grant execute on function public.rpc_f_overview_detail(text) to anon;
  end if;
  if to_regprocedure('public.rpc_overview_division_detail(text, text)') is not null then
    grant execute on function public.rpc_overview_division_detail(text, text) to anon;  -- D-45
  end if;
end;
$$;
-- Fungsi berawalan "_" (pembantu internal) sengaja TIDAK diberi izin.
