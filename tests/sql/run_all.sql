-- =====================================================================
-- tests/sql/run_all.sql  -  Uji otomatis keamanan (S), fungsi DB (D), dan rekonsiliasi Overview (O)
--
-- JALANKAN HANYA DI DATABASE UJI (lokal atau Supabase DEV) yang SUDAH berisi 99_test_seed.sql.
-- Skrip ini mengubah data (membuat/menghapus program uji, mengganti PIN ke nilai uji).
--
-- Lokal:  psql -U postgres -d anggaran_test -v ON_ERROR_STOP=1 -f tests/sql/run_all.sql
-- Hasil:  setiap tes mencetak "LULUS <ID>". Bila ada yang gagal, skrip berhenti dengan "GAGAL <ID>: ...".
-- =====================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ---------- Alat bantu uji (schema "test", dihapus di akhir) ----------
drop schema if exists test cascade;
create schema test;
grant usage on schema test to anon;

create function test.ok(p_cond boolean, p_id text, p_detail text default '')
returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'GAGAL %: %', p_id, p_detail;
  end if;
  raise notice 'LULUS %', p_id;
end $$;

-- Jalankan p_sql; harus gagal dengan pesan yang diawali p_expected
create function test.expect_error(p_sql text, p_expected text, p_id text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_expected || '%' then
      raise notice 'LULUS % (%)', p_id, sqlerrm;
      return;
    end if;
    raise exception 'GAGAL %: error berbeda: % (diharapkan %)', p_id, sqlerrm, p_expected;
  end;
  raise exception 'GAGAL %: tidak ada error (diharapkan %)', p_id, p_expected;
end $$;

-- Harus ditolak karena tidak punya hak (permission denied)
create function test.expect_denied(p_sql text, p_id text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    raise notice 'LULUS %', p_id;
    return;
  end;
  raise exception 'GAGAL %: perintah berhasil padahal harus ditolak: %', p_id, p_sql;
end $$;

grant execute on all functions in schema test to anon;

-- Cadangkan PIN yang ada (dikembalikan di akhir), lalu pakai PIN uji sementara
drop table if exists _pin_backup;
drop table if exists _master_backup;
create temporary table _pin_backup as select id, pin_hash, pin_updated_at from divisions;
create temporary table _master_backup as select value from app_settings where key = 'finance_pin_hash';
-- PIN uji UNIK per divisi (login PIN langsung, D-38): HR-PD 100001, HR-EB 100002, HR-TA 100003, HR-OPS 100005, ...; Finance 999999
update divisions set pin_hash = extensions.crypt(lpad((100000 + sort_order)::text, 6, '0'), extensions.gen_salt('bf', 4));
insert into app_settings (key, value) values ('finance_pin_hash', extensions.crypt('999999', extensions.gen_salt('bf', 4)))
on conflict (key) do update set value = excluded.value;
delete from sessions;

-- =====================================================================
-- S: KEAMANAN (dijalankan sebagai "anon" = browser dengan anon key)
-- =====================================================================
set role anon;

-- S-01 / S-03: anon tidak bisa membaca tabel apa pun (termasuk pin_hash dan app_settings)
do $$
declare t text;
begin
  foreach t in array array['app_settings','division_groups','divisions','program_categories','item_categories',
                           'programs','program_items','sessions','login_attempts','audit_log'] loop
    perform test.expect_denied(format('select * from public.%I limit 1', t), 'S-01 baca ' || t);
  end loop;
  perform test.expect_denied('select pin_hash from public.divisions', 'S-03 pin_hash');
end $$;

-- S-02: anon tidak bisa menulis
select test.expect_denied($q$insert into public.programs (division_id, nama_program, program_category_id, periode_bulan, pic_nama) values (1,'Hack',1,1,'XX')$q$, 'S-02 insert programs');
select test.expect_denied($q$update public.divisions set name = 'x'$q$, 'S-02 update divisions');
select test.expect_denied($q$delete from public.app_settings$q$, 'S-02 delete app_settings');
select test.expect_denied($q$delete from public.programs$q$, 'S-02 delete programs');

-- Fungsi pembantu internal tidak bisa dipanggil browser
select test.expect_denied($q$select public._program_json(gen_random_uuid())$q$, 'S-04b _program_json');
select test.expect_denied($q$select public._require_session('x')$q$, 'S-04b _require_session');
select test.expect_denied($q$select public._overview(null::smallint, 10)$q$, 'S-04b _overview');
select test.expect_denied($q$select public._random_digits(6)$q$, 'S-04b _random_digits');
select test.expect_denied($q$select * from public._pin_owners('123456')$q$, 'S-04b _pin_owners (tidak bisa dipakai menebak PIN)');
select test.expect_denied($q$select public._new_unique_pins(1, false)$q$, 'S-04b _new_unique_pins');

-- S-05: tanpa token / token acak ditolak
select test.expect_error($q$select rpc_list_programs('', 'hr-pd')$q$, 'AUTH_REQUIRED', 'S-05 token kosong');
select test.expect_error($q$select rpc_list_programs(null, 'hr-pd')$q$, 'AUTH_REQUIRED', 'S-05 token null');
select test.expect_error($q$select rpc_list_programs(repeat('ab', 32), 'hr-pd')$q$, 'AUTH_EXPIRED', 'S-05 token acak');
select test.expect_error($q$select rpc_f_overview('tebakan')$q$, 'AUTH_EXPIRED', 'S-05 finance token acak');

-- Login PIN langsung (D-38): PIN menentukan akun
select test.ok((rpc_login_pin('000000', 'Penyusup') ->> 'error') = 'PIN_WRONG', 'S-login PIN salah');
select test.ok((rpc_login_pin('12345', null) ->> 'error') = 'PIN_WRONG', 'S-login PIN 5 digit ditolak');
select test.ok((rpc_login_pin('1000011', null) ->> 'error') = 'PIN_WRONG', 'S-login PIN 7 digit ditolak');
select test.ok((rpc_login_pin('100002', null) -> 'division' ->> 'code') = 'hr-eb', 'D-38 PIN HR-EB langsung masuk ke HR-EB');
select test.ok((rpc_login_pin('100012', null) -> 'division' ->> 'code') = 'physiotherapist', 'D-38 PIN Physiotherapist langsung masuk ke Physiotherapist');
select test.ok((rpc_login_pin('999999', null) ->> 'role') = 'finance', 'D-38 PIN Finance (6 digit) masuk sebagai Finance');
select set_config('test.tok_pd', rpc_login_pin('100001', 'Tester PD') ->> 'token', false);
select set_config('test.tok_eb', rpc_login_pin('100002', 'Tester EB') ->> 'token', false);
select set_config('test.tok_ta', rpc_login_pin('100003', 'Tester TA') ->> 'token', false);
select set_config('test.tok_fin', rpc_login_pin('999999', 'Tester Finance') ->> 'token', false);
select test.ok(length(current_setting('test.tok_pd')) = 64, 'S-login token 64 hex');
-- Login lama per divisi tetap berfungsi (cadangan bila web dikembalikan ke versi sebelumnya)
select test.ok((rpc_login('hr-pd', '100001', null) ->> 'ok')::boolean, 'Kompatibilitas rpc_login lama');
select test.ok((rpc_login('hr-pd', '100002', null) ->> 'error') = 'PIN_WRONG', 'Kompatibilitas rpc_login: PIN divisi lain ditolak');

-- D-28: tidak ada lockout. 5x salah lalu PIN benar tetap bisa masuk.
do $$
begin
  for i in 1..5 loop
    perform rpc_login_pin('999998', null);
  end loop;
  perform test.ok((rpc_login_pin('100005', null) -> 'division' ->> 'code') = 'hr-ops', 'S-08 (D-28) tanpa lockout: PIN benar tetap diterima');
end $$;

-- S-06: isolasi antar divisi
do $$
declare
  v_eb_prog text := (select (p ->> 'id') from jsonb_array_elements(
                      rpc_list_programs(current_setting('test.tok_eb'), 'hr-eb') -> 'programs') p limit 1);
begin
  perform test.ok(v_eb_prog is not null, 'S-06 persiapan: HR-EB punya program');
  perform test.expect_error(format('select rpc_get_program(%L, %L)', current_setting('test.tok_pd'), v_eb_prog), 'NOT_FOUND', 'S-06 baca program divisi lain');
  perform test.expect_error(format('select rpc_list_programs(%L, %L)', current_setting('test.tok_pd'), 'hr-eb'), 'FORBIDDEN', 'S-06 daftar divisi lain');
  perform test.expect_error(format('select rpc_overview_division(%L, %L)', current_setting('test.tok_pd'), 'hr-eb'), 'FORBIDDEN', 'S-06 overview divisi lain');
  perform test.expect_error(format('select rpc_delete_program(%L, %L, null)', current_setting('test.tok_pd'), v_eb_prog), 'NOT_FOUND', 'S-06 hapus program divisi lain');
  perform test.expect_error(format($f$select rpc_save_program(%L, jsonb_build_object('id', %L, 'nama_program', 'Ambil alih', 'program_category_id', 1, 'periode_bulan', 1, 'pic_nama', 'XX', 'items', '[]'::jsonb))$f$,
                            current_setting('test.tok_pd'), v_eb_prog), 'NOT_FOUND', 'S-06 edit program divisi lain');
  -- Tanpa kode divisi: sesi divisi tetap hanya melihat miliknya
  perform test.ok((rpc_list_programs(current_setting('test.tok_pd'), null) -> 'division' ->> 'code') = 'hr-pd', 'S-06 tanpa kode = divisi sendiri');
end $$;

-- S-07: token divisi tidak bisa memakai fungsi finance
select test.expect_error(format('select rpc_f_overview(%L)', current_setting('test.tok_pd')), 'FORBIDDEN', 'S-07 rpc_f_overview');
select test.expect_error(format('select rpc_f_set_division_pin(%L, 1, %L)', current_setting('test.tok_pd'), '222222'), 'FORBIDDEN', 'S-07 rpc_f_set_division_pin');
select test.expect_error(format('select rpc_f_export(%L, %L)', current_setting('test.tok_pd'), '{}'), 'FORBIDDEN', 'S-07 rpc_f_export');
select test.expect_error(format('select rpc_f_audit_log(%L, %L)', current_setting('test.tok_pd'), '{}'), 'FORBIDDEN', 'S-07 rpc_f_audit_log');

-- S-09: SQL injection tersimpan sebagai teks biasa
do $$
declare v jsonb;
begin
  v := rpc_save_program(current_setting('test.tok_pd'), jsonb_build_object(
         'nama_program', $s$'; drop table programs;--$s$, 'program_category_id', 1, 'periode_bulan', 2,
         'pic_nama', $s$Robert'); --$s$, 'items', '[]'::jsonb, 'submit', false));
  perform test.ok(v ->> 'nama_program' = $s$'; drop table programs;--$s$, 'S-09 nama berisi SQL tersimpan sebagai teks');
  perform test.ok((rpc_login_pin($s$' or '1'='1$s$, null) ->> 'error') = 'PIN_WRONG', 'S-09 PIN berisi SQL ditolak');
  perform rpc_delete_program(current_setting('test.tok_pd'), v ->> 'id', null);
end $$;

-- =====================================================================
-- D: FUNGSI DATABASE
-- =====================================================================

-- D-01: validasi panjang/rentang
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"AB","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:nama_program', 'D-01 nama 2 huruf');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":1,"periode_bulan":13,"pic_nama":"Budi","items":[]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:periode_bulan', 'D-01 bulan 13');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":1,"periode_bulan":1,"pic_nama":"B","items":[]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:pic_nama', 'D-01 PIC 1 huruf');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":999,"periode_bulan":1,"pic_nama":"Budi","items":[]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:program_category_id', 'D-01 kategori tidak ada');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[{"uraian":"Kopi","item_category_id":2,"qty":0,"satuan":"pcs","harga_satuan":1000}]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:items.1.qty', 'D-01 qty 0');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[{"uraian":"Kopi","item_category_id":2,"qty":1,"satuan":"pcs","harga_satuan":-5}]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:items.1.harga_satuan', 'D-01 harga negatif');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[{"uraian":"Kopi","qty":100001}]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:items.1.qty', 'D-01 (T-02) qty > 100.000');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[{"uraian":"Kopi","qty":1.255}]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:items.1.qty', 'D-01 qty 3 desimal');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[{"uraian":"Kopi","qty":"abc"}]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:items.1.qty', 'D-01 qty bukan angka');
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program A","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[{"uraian":"Kopi","harga_satuan":1000000000001}]}')$f$, current_setting('test.tok_pd')), 'VALIDATION:items.1.harga_satuan', 'D-01 harga > 1 triliun');

-- D-02: submit tanpa baris
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program Kosong","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[],"submit":true}')$f$, current_setting('test.tok_pd')), 'VALIDATION:items', 'D-02 submit tanpa baris');

-- D-03, D-04, D-06, T-01, D-30, D-11, D-07: satu alur program
do $$
declare
  tok  text := current_setting('test.tok_pd');
  v    jsonb;
  v2   jsonb;
  vid  text;
  n_before int;
begin
  -- T-01: draft boleh berisi baris belum lengkap (uraian kosong, tanpa kategori)
  v := rpc_save_program(tok, jsonb_build_object(
         'nama_program', 'Gathering Uji Alur', 'program_category_id', 1, 'periode_bulan', 3, 'pic_nama', 'Budi',
         'submit', false,
         'items', jsonb_build_array(
            jsonb_build_object('uraian', '', 'qty', 2, 'harga_satuan', 1000),
            jsonb_build_object('uraian', 'Sewa aula', 'item_category_id', null, 'qty', 1, 'satuan', 'hari', 'harga_satuan', 5000000),
            jsonb_build_object())));
  vid := v ->> 'id';
  perform test.ok(v ->> 'status' = 'draft' and jsonb_array_length(v -> 'items') = 2, 'T-01 draft dengan baris belum lengkap tersimpan (baris kosong dibuang)');
  perform test.ok(v ->> 'tanggal_pengajuan' is null, 'D-07a draft belum punya tanggal pengajuan');

  -- D-03: submit dengan baris tanpa kategori ditolak, status tidak berubah
  perform test.expect_error(format('select rpc_save_program(%L, %L::jsonb)', tok, jsonb_build_object(
      'id', vid, 'expected_updated_at', v ->> 'updated_at', 'submit', true,
      'nama_program', 'Gathering Uji Alur', 'program_category_id', 1, 'periode_bulan', 3, 'pic_nama', 'Budi',
      'items', jsonb_build_array(jsonb_build_object('uraian', 'Sewa aula', 'qty', 1, 'satuan', 'hari', 'harga_satuan', 5000000)))),
    'VALIDATION:items.1.item_category_id', 'D-03 submit baris tanpa kategori');
  perform test.ok((rpc_get_program(tok, vid) ->> 'status') = 'draft', 'D-03 status tetap draft');

  -- D-04 + D-06: subtotal dihitung DB; total/subtotal palsu dari klien diabaikan; submit berhasil
  v := rpc_save_program(tok, jsonb_build_object(
      'id', vid, 'expected_updated_at', v ->> 'updated_at', 'submit', true, 'total', 999,
      'nama_program', 'Gathering Uji Alur', 'program_category_id', 1, 'periode_bulan', 3, 'pic_nama', 'Budi',
      'items', jsonb_build_array(
         jsonb_build_object('uraian', 'Snack peserta', 'item_category_id', 2, 'qty', 2.5, 'satuan', 'paket', 'harga_satuan', 100000, 'subtotal', 1),
         jsonb_build_object('uraian', 'Sewa aula', 'item_category_id', 8, 'qty', 1, 'satuan', 'hari', 'harga_satuan', 5000000))));
  perform test.ok((v -> 'items' -> 0 ->> 'subtotal')::bigint = 250000, 'D-04 subtotal 2,5 x 100.000 = 250.000');
  perform test.ok((v ->> 'total')::bigint = 5250000, 'D-06 total dihitung ulang (bukan 999)');
  perform test.ok(v ->> 'status' = 'diajukan', 'F-07 submit -> Diajukan');
  perform test.ok((v ->> 'tanggal_pengajuan')::date = (now() at time zone 'Asia/Jakarta')::date, 'D-05 tanggal pengajuan = hari ini WIB');

  -- D-30 + F-12: edit program Diajukan; status & tanggal tetap; draft tidak bisa
  v2 := rpc_save_program(tok, jsonb_build_object(
      'id', vid, 'expected_updated_at', v ->> 'updated_at', 'submit', false,
      'nama_program', 'Gathering Uji Alur (revisi)', 'program_category_id', 1, 'periode_bulan', 3, 'pic_nama', 'Budi',
      'items', v -> 'items'));
  perform test.ok(v2 ->> 'status' = 'diajukan' and v2 ->> 'tanggal_pengajuan' = v ->> 'tanggal_pengajuan', 'D-30 edit Diajukan: status & tanggal pengajuan tetap');
  perform test.expect_error(format('select rpc_save_program(%L, %L::jsonb)', tok, jsonb_build_object(
      'id', vid, 'expected_updated_at', v2 ->> 'updated_at', 'submit', false,
      'nama_program', 'Gathering Uji Alur (revisi)', 'program_category_id', 1, 'periode_bulan', 3, 'pic_nama', 'Budi',
      'items', jsonb_build_array(jsonb_build_object('uraian', 'Belum lengkap')))),
    'VALIDATION:items.1', 'D-30 program Diajukan tetap divalidasi penuh');

  -- D-11: simpan dengan expected_updated_at lama -> CONFLICT
  perform test.expect_error(format('select rpc_save_program(%L, %L::jsonb)', tok, jsonb_build_object(
      'id', vid, 'expected_updated_at', v ->> 'updated_at', 'submit', false,
      'nama_program', 'Tab lain', 'program_category_id', 1, 'periode_bulan', 3, 'pic_nama', 'Budi', 'items', v -> 'items')),
    'CONFLICT', 'D-11 optimistic locking');

  -- D-08: atomik - payload dengan baris invalid di tengah tidak menyimpan apa pun
  n_before := jsonb_array_length(rpc_list_programs(tok, null) -> 'programs');
  perform test.expect_error(format('select rpc_save_program(%L, %L::jsonb)', tok, jsonb_build_object(
      'nama_program', 'Program Atomik', 'program_category_id', 1, 'periode_bulan', 4, 'pic_nama', 'Budi', 'submit', true,
      'items', jsonb_build_array(
         jsonb_build_object('uraian', 'Baris satu', 'item_category_id', 1, 'qty', 1, 'satuan', 'pcs', 'harga_satuan', 1000),
         jsonb_build_object('uraian', 'Baris dua', 'item_category_id', 1, 'qty', -1, 'satuan', 'pcs', 'harga_satuan', 1000),
         jsonb_build_object('uraian', 'Baris tiga', 'item_category_id', 1, 'qty', 1, 'satuan', 'pcs', 'harga_satuan', 1000)))),
    'VALIDATION:items.2.qty', 'D-08 baris invalid di tengah');
  perform test.ok(jsonb_array_length(rpc_list_programs(tok, null) -> 'programs') = n_before, 'D-08 tidak ada yang tersimpan setengah');
  perform set_config('test.prog_alur', vid, false);
end $$;

-- D-10: alert program mirip
select test.ok(jsonb_array_length(rpc_check_similar(current_setting('test.tok_ta'), 'Job Fair Kampus Fisioterapi 2027', 3, null)) >= 1, 'D-10 "Job Fair Kampus Fisioterapi 2027" mirip "Job Fair Kampus Fisioterapi"');
select test.ok((rpc_check_similar(current_setting('test.tok_ta'), 'Job Fair Kampus Fisioterapi 2027', 3, null) -> 0 ->> 'same_month')::boolean, 'D-10 bulan sama ditandai');
select test.ok(jsonb_array_length(rpc_check_similar(current_setting('test.tok_ta'), 'Pengadaan Laptop Kantor', 1, null)) = 0, 'D-10 nama jauh berbeda tidak terdeteksi');
select test.ok(jsonb_array_length(rpc_check_similar(current_setting('test.tok_pd'), 'Job Fair Kampus Fisioterapi', 3, null)) = 0, 'D-10 tidak membocorkan nama program divisi lain');

-- D-32: Finance tidak bisa menambah/mengedit program, tetapi bisa melihat
select test.expect_error(format($f$select rpc_save_program(%L, '{"nama_program":"Program Finance","program_category_id":1,"periode_bulan":1,"pic_nama":"Budi","items":[]}')$f$, current_setting('test.tok_fin')), 'FORBIDDEN', 'D-32 Finance tidak bisa membuat program');
select test.ok((rpc_get_program(current_setting('test.tok_fin'), current_setting('test.prog_alur')) ->> 'division_code') = 'hr-pd', 'D-32 Finance bisa melihat program divisi');
select test.ok((rpc_list_programs(current_setting('test.tok_fin'), 'hr-pd') ->> 'read_only')::boolean, 'D-32 Finance di area divisi = read_only');

-- D-09: kategori nonaktif tidak bisa dipakai untuk baris baru; data lama tetap bisa disimpan
do $$
declare
  fin  text := current_setting('test.tok_fin');
  tok  text := current_setting('test.tok_pd');
  vid  text := current_setting('test.prog_alur');
  v    jsonb := rpc_get_program(tok, vid);
  v_cat int := (v -> 'items' -> 1 ->> 'item_category_id')::int;
  v_cat_name text := v -> 'items' -> 1 ->> 'item_category_name';
begin
  perform rpc_f_upsert_category(fin, 'item', v_cat, null, false);  -- nonaktifkan kategori yang dipakai program ini
  perform test.ok(not exists (select 1 from jsonb_array_elements(rpc_get_master() -> 'item_categories') c
                              where (c ->> 'id')::int = v_cat and (c ->> 'is_active')::boolean), 'D-09 kategori nonaktif ditandai di master');
  v := rpc_save_program(tok, jsonb_build_object('id', vid, 'expected_updated_at', v ->> 'updated_at', 'submit', false,
         'nama_program', v ->> 'nama_program', 'program_category_id', 1, 'periode_bulan', 3, 'pic_nama', 'Budi', 'items', v -> 'items'));
  perform test.ok((v -> 'items' -> 1 ->> 'item_category_name') = v_cat_name, 'D-09 data lama dengan kategori nonaktif tetap tampil & bisa disimpan');
  perform test.expect_error(format('select rpc_save_program(%L, %L::jsonb)', tok, jsonb_build_object(
      'nama_program', 'Program Baru Kategori Nonaktif', 'program_category_id', 1, 'periode_bulan', 5, 'pic_nama', 'Budi',
      'items', jsonb_build_array(jsonb_build_object('uraian', 'Sewa', 'item_category_id', v_cat)))),
    'VALIDATION:items.1.item_category_id', 'D-09 kategori nonaktif ditolak untuk baris baru');
  perform rpc_f_upsert_category(fin, 'item', v_cat, null, true);
end $$;

-- Kategori: tidak ada "Lain-lain", tidak ada duplikat (D-14, D-31)
select test.expect_error(format('select rpc_f_upsert_category(%L, %L, null, %L, true)', current_setting('test.tok_fin'), 'item', 'Lain-lain'), 'VALIDATION:name', 'D-14 kategori "Lain-lain" ditolak');
select test.expect_error(format('select rpc_f_upsert_category(%L, %L, null, %L, true)', current_setting('test.tok_fin'), 'program', 'lainnya'), 'VALIDATION:name', 'D-14 kategori "lainnya" ditolak');
select test.expect_error(format('select rpc_f_upsert_category(%L, %L, null, %L, true)', current_setting('test.tok_fin'), 'item', 'konsumsi'), 'VALIDATION:name', 'D-31 nama kategori kembar ditolak');
select test.ok((rpc_f_upsert_category(current_setting('test.tok_fin'), 'program', 2, 'Nama Baru', true) ->> 'name') = 'Training', 'D-31 ganti nama kategori tidak mungkin');

-- D-07 + F-13 + F-14: hapus (divisi tanpa alasan, finance wajib alasan) + snapshot log
select test.expect_error(format('select rpc_delete_program(%L, %L, %L)', current_setting('test.tok_fin'), current_setting('test.prog_alur'), 'pendek'), 'VALIDATION:reason', 'F-14 hapus Finance alasan < 10 karakter ditolak');
select test.ok((rpc_delete_program(current_setting('test.tok_fin'), current_setting('test.prog_alur'), 'Duplikat dengan program lain') ->> 'ok')::boolean, 'F-14 hapus Finance dengan alasan berhasil');
select test.expect_error(format('select rpc_get_program(%L, %L)', current_setting('test.tok_pd'), current_setting('test.prog_alur')), 'NOT_FOUND', 'D-07 program terhapus tidak bisa dibuka');
do $$
declare
  v_log jsonb := (select l from jsonb_array_elements(rpc_f_audit_log(current_setting('test.tok_fin'), '{"action":"delete"}')) l
                  where l ->> 'entity_id' = current_setting('test.prog_alur') limit 1);
begin
  perform test.ok(v_log is not null and v_log ->> 'reason' = 'Duplikat dengan program lain', 'D-07 log delete berisi alasan');
  perform test.ok(jsonb_array_length(v_log -> 'old_data' -> 'items') = 2 and v_log -> 'old_data' ->> 'nama_program' is not null, 'D-07 snapshot header + semua baris di log');
  perform test.ok(v_log ->> 'actor_role' = 'finance', 'F-24 log mencatat aktor finance');
end $$;

-- F-22 + S-13: atur PIN divisi mencabut sesi lama
select test.ok((rpc_f_set_division_pin(current_setting('test.tok_fin'), (select (d ->> 'id')::int from jsonb_array_elements(rpc_f_list_divisions(current_setting('test.tok_fin'))) d where d ->> 'code' = 'hr-pd'), '654321') ->> 'ok')::boolean, 'F-22 atur PIN divisi');
select test.expect_error(format('select rpc_list_programs(%L, null)', current_setting('test.tok_pd')), 'AUTH_EXPIRED', 'S-13 token lama ditolak setelah PIN diganti');
select test.ok((rpc_login_pin('100001', null) ->> 'error') = 'PIN_WRONG', 'F-22 PIN lama tidak berlaku');
select test.ok((rpc_login_pin('654321', null) -> 'division' ->> 'code') = 'hr-pd', 'F-22 PIN baru berlaku (masuk ke HR-PD)');
select test.expect_error(format('select rpc_f_set_division_pin(%L, 1, %L)', current_setting('test.tok_fin'), '12345'), 'VALIDATION:pin', 'F-22 PIN 5 digit ditolak');
-- D-38: PIN wajib unik
select test.expect_error(format('select rpc_f_set_division_pin(%L, 1, %L)', current_setting('test.tok_fin'), '100002'), 'VALIDATION:pin', 'D-38 PIN milik divisi lain ditolak');
select test.expect_error(format('select rpc_f_set_division_pin(%L, 1, %L)', current_setting('test.tok_fin'), '999999'), 'VALIDATION:pin', 'D-38 PIN milik Finance ditolak untuk divisi');
select test.ok((rpc_f_set_division_pin(current_setting('test.tok_fin'), 1, '654321') ->> 'ok')::boolean, 'D-38 PIN sama dengan PIN divisi itu sendiri boleh');

-- Ganti PIN Finance (6 digit, unik)
select test.expect_error(format('select rpc_f_set_master_pin(%L, %L, %L)', current_setting('test.tok_fin'), '000000', '888888'), 'VALIDATION:old_pin', 'F-master PIN lama salah ditolak');
select test.expect_error(format('select rpc_f_set_master_pin(%L, %L, %L)', current_setting('test.tok_fin'), '999999', '88888888'), 'VALIDATION:new_pin', 'F-master PIN baru 8 digit ditolak (harus 6)');
select test.expect_error(format('select rpc_f_set_master_pin(%L, %L, %L)', current_setting('test.tok_fin'), '999999', '100003'), 'VALIDATION:new_pin', 'D-38 PIN Finance tidak boleh sama dengan PIN divisi');
select test.ok((rpc_f_set_master_pin(current_setting('test.tok_fin'), '999999', '888888') ->> 'ok')::boolean, 'F-master ganti PIN Finance');
select test.ok((rpc_login_pin('888888', null) ->> 'role') = 'finance', 'F-master PIN Finance baru berlaku');
select rpc_f_set_master_pin(current_setting('test.tok_fin'), '888888', '999999');

-- Logout menghapus sesi
select set_config('test.tok_tmp', rpc_login_pin('100002', null) ->> 'token', false);
select rpc_logout(current_setting('test.tok_tmp'));
select test.expect_error(format('select rpc_list_programs(%L, null)', current_setting('test.tok_tmp')), 'AUTH_EXPIRED', 'S-logout token tidak berlaku lagi');

-- Data publik Home tanpa angka (F-01)
select test.ok(jsonb_array_length(rpc_list_divisions()) = 8, 'F-01 8 grup (termasuk Project Expansion, D-40)');
select test.ok((select sum(jsonb_array_length(g -> 'divisions')) from jsonb_array_elements(rpc_list_divisions()) g) = 13, 'F-01 13 divisi');
select test.ok(rpc_list_divisions()::text !~ '[0-9]{4,}', 'F-01 Home tanpa angka/data program');
select test.ok(not exists (select 1 from jsonb_array_elements(rpc_get_master() -> 'item_categories') c where lower(c ->> 'name') like 'lain%'), 'F-16 tidak ada kategori Lain-lain');

-- =====================================================================
-- O: REKONSILIASI OVERVIEW (dibandingkan dengan query mentah sebagai postgres)
-- =====================================================================
select set_config('test.ov_fin', rpc_f_overview(current_setting('test.tok_fin'))::text, false);
select set_config('test.ov_eb', rpc_overview_division(current_setting('test.tok_eb'), 'hr-eb')::text, false);
select set_config('test.export_all', rpc_f_export(current_setting('test.tok_fin'), '{"status":"all"}')::text, false);

reset role;

do $$
declare
  ov  jsonb := current_setting('test.ov_fin')::jsonb;
  ove jsonb := current_setting('test.ov_eb')::jsonb;
  ex  jsonb := current_setting('test.export_all')::jsonb;
  raw_total numeric;
  raw_eb    numeric;
  ok_bulan  boolean;
  ok_q      boolean;
begin
  select coalesce(sum(i.subtotal), 0) into raw_total
    from programs p join program_items i on i.program_id = p.id where p.status = 'diajukan';
  perform test.ok((ov ->> 'total')::numeric = raw_total, 'O-01 total setahun = query mentah', (ov ->> 'total') || ' vs ' || raw_total);
  perform test.ok((ov ->> 'program_count')::int = (select count(*) from programs where status = 'diajukan'), 'O-01 jumlah program diajukan');

  select bool_and((b ->> 'total')::numeric = coalesce(r.tot, 0) and (b ->> 'count')::int = coalesce(r.cnt, 0)) into ok_bulan
    from jsonb_array_elements(ov -> 'per_bulan') b
    left join (select p.periode_bulan, count(distinct p.id) cnt, sum(i.subtotal) tot
               from programs p left join program_items i on i.program_id = p.id
               where p.status = 'diajukan' group by 1) r on r.periode_bulan = (b ->> 'bulan')::int;
  perform test.ok(ok_bulan and jsonb_array_length(ov -> 'per_bulan') = 12, 'O-02 per bulan 12 baris cocok');

  select bool_and((q ->> 'total')::numeric = (select coalesce(sum((b ->> 'total')::numeric), 0)
                                              from jsonb_array_elements(ov -> 'per_bulan') b
                                              where ((b ->> 'bulan')::int - 1) / 3 + 1 = (q ->> 'kuartal')::int)) into ok_q
    from jsonb_array_elements(ov -> 'per_kuartal') q;
  perform test.ok(ok_q, 'O-03 per kuartal = jumlah 3 bulan');

  perform test.ok((select sum((c ->> 'total')::numeric) from jsonb_array_elements(ov -> 'per_kategori_program') c) = raw_total, 'O-04 per kategori program = total');
  perform test.ok((select sum((c ->> 'total')::numeric) from jsonb_array_elements(ov -> 'per_kategori_baris') c) = raw_total, 'O-04 per kategori baris = total');
  perform test.ok((ov ->> 'draft_count')::int = (select count(*) from programs where status = 'draft'), 'O-05 jumlah draft benar dan terpisah');

  perform test.ok((select sum((d ->> 'total')::numeric) from jsonb_array_elements(ov -> 'per_divisi') d) = raw_total, 'O-06 per divisi = total');
  perform test.ok((select (g ->> 'total')::numeric from jsonb_array_elements(ov -> 'per_grup') g where g ->> 'name' = 'Human Resource')
                  = (select sum((d ->> 'total')::numeric) from jsonb_array_elements(ov -> 'per_divisi') d where d ->> 'group_name' = 'Human Resource'),
                  'O-06 rollup Human Resource = 5 sub-divisi');
  perform test.ok((select count(*) from jsonb_array_elements(ov -> 'per_grup') g where g ->> 'name' = 'Human Resource' and (g ->> 'division_count')::int = 5) = 1, 'O-06 HR berisi 5 divisi');
  perform test.ok(jsonb_array_length(ov -> 'belum_mengisi') = (select count(*) from divisions d where not exists (select 1 from programs p where p.division_id = d.id and p.status = 'diajukan')), 'O-06 daftar belum mengisi benar');

  perform test.ok((ov -> 'top_month' ->> 'total')::numeric = (select max((b ->> 'total')::numeric) from jsonb_array_elements(ov -> 'per_bulan') b), 'O-07 bulan terbesar benar');
  perform test.ok((ov -> 'top_program' ->> 'total')::numeric = (select max(t) from (select sum(i.subtotal) t from programs p join program_items i on i.program_id = p.id where p.status = 'diajukan' group by p.id) x), 'O-07 program terbesar benar');
  perform test.ok(jsonb_array_length(ov -> 'top_programs') = 10, 'O-07 top 10 program');

  select coalesce(sum(i.subtotal), 0) into raw_eb
    from programs p join program_items i on i.program_id = p.id join divisions d on d.id = p.division_id
    where p.status = 'diajukan' and d.code = 'hr-eb';
  perform test.ok((ove ->> 'total')::numeric = raw_eb, 'O-08 overview divisi = query mentah divisi itu');
  perform test.ok(not exists (select 1 from jsonb_array_elements(ove -> 'top_programs') t where t ->> 'division_code' <> 'hr-eb'), 'O-08 overview divisi hanya berisi datanya');
  perform test.ok(jsonb_array_length(ove -> 'top_programs') <= 5, 'O-08 top 5 program divisi');

  perform test.ok(jsonb_array_length(ex) = (select count(*) from programs p left join program_items i on i.program_id = p.id), 'F-25 export: jumlah baris = query mentah');
  perform test.ok((select sum(coalesce((r ->> 'subtotal')::numeric, 0)) from jsonb_array_elements(ex) r)
                  = (select coalesce(sum(subtotal), 0) from program_items), 'F-25 export: total subtotal = query mentah');
end $$;

-- S-04: RLS aktif di semua tabel public
select test.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'S-04 RLS aktif di semua tabel');
-- Hanya fungsi rpc_* yang bisa dijalankan anon; authenticated tidak bisa apa pun
select test.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname not like 'rpc\_%'
                             and has_function_privilege('anon', p.oid, 'execute')), 'S-04 anon hanya bisa menjalankan rpc_*');
select test.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')), 'S-04 authenticated tidak bisa menjalankan fungsi apa pun');
select test.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname like 'rpc\_%' and not p.prosecdef), 'S-04 semua rpc_* SECURITY DEFINER');
select test.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.prosecdef
                             and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')), 'S-04 semua SECURITY DEFINER punya search_path tetap');

-- S-15: token tidak tersimpan mentah
select test.ok(not exists (select 1 from sessions where token_hash = current_setting('test.tok_eb')), 'S-15 token mentah tidak ada di tabel sessions');
select test.ok(exists (select 1 from sessions where token_hash = encode(extensions.digest(current_setting('test.tok_eb'), 'sha256'), 'hex')), 'S-15 hanya hash SHA-256 yang disimpan');

-- S-12: token kedaluwarsa
update sessions set expires_at = now() - interval '1 minute'
 where token_hash = encode(extensions.digest(current_setting('test.tok_eb'), 'sha256'), 'hex');
set role anon;
select test.expect_error(format('select rpc_list_programs(%L, null)', current_setting('test.tok_eb')), 'AUTH_EXPIRED', 'S-12 token kedaluwarsa ditolak');
reset role;

-- D-38: PIN kembar (mis. terjadi sebelum aturan PIN unik) -> login ditolak, tidak pernah salah masuk divisi
update divisions set pin_hash = extensions.crypt('100002', extensions.gen_salt('bf', 4)) where code = 'hr-ops';
set role anon;
select test.ok((rpc_login_pin('100002', null) ->> 'error') = 'PIN_DUPLICATE', 'D-38 PIN kembar ditolak (tidak salah masuk divisi)');
reset role;
update divisions set pin_hash = extensions.crypt('100005', extensions.gen_salt('bf', 4)) where code = 'hr-ops';

-- D-38: pembuat PIN acak menghasilkan PIN unik dan tidak bentrok dengan PIN yang sudah ada
select test.ok((select count(distinct p) = 13 and bool_and(p ~ '^[0-9]{6}$') and bool_and(not exists (select 1 from public._pin_owners(p)))
                from unnest(public._new_unique_pins(13, true)) p), 'D-38 13 PIN acak unik, 6 digit, tidak bentrok');

-- D-05: tanggal WIB (bukan UTC) pada batas tengah malam
select test.ok((timestamptz '2027-01-14 16:30:00+00' at time zone 'Asia/Jakarta')::date = date '2027-01-14', 'D-05 23:30 WIB tetap tanggal yang sama');
select test.ok((timestamptz '2027-01-14 17:30:00+00' at time zone 'Asia/Jakarta')::date = date '2027-01-15', 'D-05 00:30 WIB = tanggal berikutnya (UTC masih kemarin)');

-- Login gagal tetap tercatat (T-05)
select test.ok(exists (select 1 from login_attempts where scope = 'hr-pd' and not succeeded), 'T-05 percobaan PIN salah tercatat');

-- Bersihkan alat uji dan kembalikan PIN seperti sebelum tes
update divisions d set pin_hash = b.pin_hash, pin_updated_at = b.pin_updated_at from _pin_backup b where b.id = d.id;
delete from app_settings where key = 'finance_pin_hash' and not exists (select 1 from _master_backup);
update app_settings set value = (select value from _master_backup) where key = 'finance_pin_hash' and exists (select 1 from _master_backup);
delete from sessions;
drop schema test cascade;

\echo '=============================================='
\echo ' SEMUA TES SQL LULUS'
\echo '=============================================='
