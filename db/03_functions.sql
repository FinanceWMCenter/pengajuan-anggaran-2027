-- =====================================================================
-- 03_functions.sql  -  Fungsi RPC (satu-satunya pintu dari browser ke data)
-- Jalankan setelah 02. Aman dijalankan ulang (create or replace).
--
-- Aturan (05_SECURITY_MODEL.md bagian 4):
--  * Fungsi rpc_* = SECURITY DEFINER + search_path tetap; cek token di setiap panggilan.
--  * Fungsi berawalan "_" = pembantu internal, TIDAK boleh dipanggil browser (dicabut di 04_security.sql).
--  * Tidak ada SQL dinamis dari input pengguna. Semua total dihitung di database.
--  * Error dilempar sebagai kode: AUTH_REQUIRED, AUTH_EXPIRED, FORBIDDEN, NOT_FOUND, CONFLICT,
--    VALIDATION:<field>:<pesan>. Login gagal TIDAK dilempar (dikembalikan {ok:false}) - T-05.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pembantu internal
-- ---------------------------------------------------------------------

create or replace function public._fail(p_message text)
returns void
language plpgsql
set search_path = public, extensions
as $$
begin
  raise exception using message = p_message, errcode = 'P0001';
end;
$$;

create or replace function public._jkt_today()
returns date
language sql
stable
set search_path = public, extensions
as $$
  select (now() at time zone 'Asia/Jakarta')::date;
$$;

create or replace function public._hash_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Angka acak kriptografis sepanjang p_len digit (untuk PIN awal di 06_bootstrap.sql)
create or replace function public._random_digits(p_len int)
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_out text := '';
  v_byte int;
begin
  while char_length(v_out) < p_len loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < 250 then                -- buang 250..255 supaya tiap digit peluangnya sama
      v_out := v_out || (v_byte % 10)::text;
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public._to_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  return btrim(p_text)::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public._to_ts(p_text text)
returns timestamptz
language plpgsql
stable
set search_path = public, extensions
as $$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  return btrim(p_text)::timestamptz;
exception when others then
  return null;
end;
$$;

-- Ubah teks jadi angka; teks kosong = null; teks bukan angka = VALIDATION
create or replace function public._parse_num(p_text text, p_field text)
returns numeric
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v numeric;
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  begin
    v := btrim(p_text)::numeric;
  exception when others then
    perform public._fail('VALIDATION:' || p_field || ':Harus berupa angka');
  end;
  if v = 'NaN'::numeric then
    perform public._fail('VALIDATION:' || p_field || ':Harus berupa angka');
  end if;
  return v;
end;
$$;

create or replace function public._parse_int(p_text text, p_field text)
returns int
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v numeric := public._parse_num(p_text, p_field);
begin
  if v is null then
    return null;
  end if;
  if v <> trunc(v) or v < -2147483648 or v > 2147483647 then
    perform public._fail('VALIDATION:' || p_field || ':Harus berupa bilangan bulat');
  end if;
  return v::int;
end;
$$;

-- Ambil sesi dari token. Gagal -> AUTH_REQUIRED / AUTH_EXPIRED / FORBIDDEN.
create or replace function public._require_session(p_token text, p_role text default null)
returns public.sessions
language plpgsql
set search_path = public, extensions
as $$
declare
  s public.sessions;
begin
  if p_token is null or btrim(p_token) = '' then
    perform public._fail('AUTH_REQUIRED');
  end if;

  select * into s from public.sessions where token_hash = public._hash_token(p_token);
  if not found or s.expires_at <= now() then
    perform public._fail('AUTH_EXPIRED');
  end if;

  if p_role is not null and s.role <> p_role then
    perform public._fail('FORBIDDEN');
  end if;

  update public.sessions set last_seen_at = now() where token_hash = s.token_hash;
  return s;
end;
$$;

-- Divisi yang boleh diakses sesi ini.
--  * Sesi divisi: SELALU divisi miliknya (kode dari klien hanya dicocokkan, tidak dipercaya).
--  * Sesi finance: divisi sesuai kode (Finance boleh melihat semua divisi - D-32: lihat + hapus saja).
create or replace function public._division_context(s public.sessions, p_division_code text)
returns smallint
language plpgsql
set search_path = public, extensions
as $$
declare
  v_id smallint;
begin
  if s.role = 'division' then
    if p_division_code is not null
       and not exists (select 1 from public.divisions where id = s.division_id and code = p_division_code) then
      perform public._fail('FORBIDDEN');
    end if;
    return s.division_id;
  end if;

  select id into v_id from public.divisions where code = p_division_code;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;
  return v_id;
end;
$$;

create or replace function public._audit(
  p_role        text,
  p_division_id smallint,
  p_actor_name  text,
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_old         jsonb,
  p_new         jsonb,
  p_reason      text
)
returns void
language sql
set search_path = public, extensions
as $$
  insert into public.audit_log (actor_role, division_id, actor_name, action, entity_type, entity_id, old_data, new_data, reason)
  values (p_role, p_division_id, p_actor_name, p_action, p_entity_type, p_entity_id, p_old, p_new, p_reason);
$$;

-- Satu program lengkap (header + baris + total) sebagai JSON
create or replace function public._program_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', p.id,
    'division_id', p.division_id,
    'division_code', d.code,
    'division_name', d.name,
    'nama_program', p.nama_program,
    'program_category_id', p.program_category_id,
    'program_category_name', pc.name,
    'periode_bulan', p.periode_bulan,
    'pic_nama', p.pic_nama,
    'status', p.status,
    'tanggal_pengajuan', p.tanggal_pengajuan,
    'submitted_at', p.submitted_at,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'created_by_name', p.created_by_name,
    'updated_by_name', p.updated_by_name,
    'total', coalesce((select sum(i.subtotal) from public.program_items i where i.program_id = p.id), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id,
               'urutan', i.urutan,
               'uraian', i.uraian,
               'item_category_id', i.item_category_id,
               'item_category_name', ic.name,
               'qty', i.qty,
               'satuan', i.satuan,
               'harga_satuan', i.harga_satuan,
               'catatan', i.catatan,
               'subtotal', i.subtotal
             ) order by i.urutan)
      from public.program_items i
      left join public.item_categories ic on ic.id = i.item_category_id
      where i.program_id = p.id
    ), '[]'::jsonb)
  )
  from public.programs p
  join public.divisions d on d.id = p.division_id
  join public.program_categories pc on pc.id = p.program_category_id
  where p.id = p_id;
$$;

-- ---------------------------------------------------------------------
-- RPC publik (tanpa token)
-- ---------------------------------------------------------------------

-- Keepalive + pembersihan ringan
create or replace function public.rpc_ping()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.sessions where expires_at < now() - interval '1 day';
  delete from public.login_attempts where attempted_at < now() - interval '30 days';
  return jsonb_build_object('ok', true, 'time', now());
end;
$$;

-- Daftar grup + divisi untuk Home (TANPA angka apa pun)
create or replace function public.rpc_list_divisions()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', g.name,
           'divisions', (
             select jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name) order by d.sort_order, d.name)
             from public.divisions d
             where d.group_id = g.id and d.is_active
           )
         ) order by g.sort_order, g.name), '[]'::jsonb)
  from public.division_groups g
  where exists (select 1 from public.divisions d where d.group_id = g.id and d.is_active);
$$;

-- Data master: kategori, tahun anggaran, kontak Finance
create or replace function public.rpc_get_master()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'tahun_anggaran', (select value from public.app_settings where key = 'tahun_anggaran'),
    'contacts', jsonb_build_object(
      'email_1', (select value from public.app_settings where key = 'contact_email_1'),
      'email_2', (select value from public.app_settings where key = 'contact_email_2'),
      'wa',      (select value from public.app_settings where key = 'contact_wa'),
      'wa_link', (select value from public.app_settings where key = 'contact_wa_link')
    ),
    'program_categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'is_active', is_active) order by sort_order, name)
      from public.program_categories), '[]'::jsonb),
    'item_categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'is_active', is_active) order by sort_order, name)
      from public.item_categories), '[]'::jsonb)
  );
$$;

-- Login divisi. Gagal dikembalikan sebagai {ok:false} (bukan error) agar percobaan tetap tercatat.
create or replace function public.rpc_login(p_division_code text, p_pin text, p_actor_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  d       public.divisions;
  v_name  text := nullif(left(btrim(coalesce(p_actor_name, '')), 100), '');
  v_token text;
  v_exp   timestamptz := now() + interval '8 hours';
begin
  select * into d from public.divisions where code = lower(btrim(coalesce(p_division_code, ''))) and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if d.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'PIN_NOT_SET');
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' or d.pin_hash <> extensions.crypt(p_pin, d.pin_hash) then
    insert into public.login_attempts (scope, succeeded) values (d.code, false);
    perform pg_sleep(1);  -- jeda singkat, tanpa mengunci (D-28)
    return jsonb_build_object('ok', false, 'error', 'PIN_WRONG');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sessions (token_hash, role, division_id, actor_name, expires_at)
  values (public._hash_token(v_token), 'division', d.id, v_name, v_exp);
  insert into public.login_attempts (scope, succeeded) values (d.code, true);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'role', 'division',
    'division', jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name),
    'actor_name', v_name,
    'expires_at', v_exp
  );
end;
$$;

-- Login Finance (master PIN 8 digit - A-14)
create or replace function public.rpc_login_finance(p_pin text, p_actor_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash  text;
  v_name  text := nullif(left(btrim(coalesce(p_actor_name, '')), 100), '');
  v_token text;
  v_exp   timestamptz := now() + interval '8 hours';
begin
  select value into v_hash from public.app_settings where key = 'finance_pin_hash';
  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'PIN_NOT_SET');
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{8}$' or v_hash <> extensions.crypt(p_pin, v_hash) then
    insert into public.login_attempts (scope, succeeded) values ('finance', false);
    perform pg_sleep(1);
    return jsonb_build_object('ok', false, 'error', 'PIN_WRONG');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sessions (token_hash, role, division_id, actor_name, expires_at)
  values (public._hash_token(v_token), 'finance', null, v_name, v_exp);
  insert into public.login_attempts (scope, succeeded) values ('finance', true);

  return jsonb_build_object('ok', true, 'token', v_token, 'role', 'finance', 'actor_name', v_name, 'expires_at', v_exp);
end;
$$;

create or replace function public.rpc_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_token is not null and btrim(p_token) <> '' then
    delete from public.sessions where token_hash = public._hash_token(p_token);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC area divisi (token divisi; token finance = lihat saja)
-- ---------------------------------------------------------------------

-- Daftar program satu divisi + ringkasan
create or replace function public.rpc_list_programs(p_token text, p_division_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s     public.sessions := public._require_session(p_token);
  v_div smallint := public._division_context(s, p_division_code);
begin
  return (
    with prog as (
      select p.id, p.nama_program, p.program_category_id, pc.name as program_category_name,
             p.periode_bulan, p.pic_nama, p.status, p.tanggal_pengajuan, p.updated_at,
             coalesce(sum(i.subtotal), 0) as total,
             count(i.id) as item_count
      from public.programs p
      join public.program_categories pc on pc.id = p.program_category_id
      left join public.program_items i on i.program_id = p.id
      where p.division_id = v_div
      group by p.id, pc.name
    )
    select jsonb_build_object(
      'division', (select jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name, 'group_name', g.name)
                   from public.divisions d join public.division_groups g on g.id = d.group_id where d.id = v_div),
      'read_only', s.role = 'finance',
      'summary', jsonb_build_object(
        'total_diajukan', coalesce((select sum(total) from prog where status = 'diajukan'), 0),
        'count_diajukan', (select count(*) from prog where status = 'diajukan'),
        'count_draft',    (select count(*) from prog where status = 'draft')
      ),
      'programs', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id, 'nama_program', nama_program,
                 'program_category_id', program_category_id, 'program_category_name', program_category_name,
                 'periode_bulan', periode_bulan, 'pic_nama', pic_nama, 'status', status,
                 'tanggal_pengajuan', tanggal_pengajuan, 'updated_at', updated_at,
                 'total', total, 'item_count', item_count
               ) order by periode_bulan, lower(nama_program))
        from prog), '[]'::jsonb)
    )
  );
end;
$$;

-- Satu program (divisi hanya miliknya; finance semua)
create or replace function public.rpc_get_program(p_token text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s     public.sessions := public._require_session(p_token);
  v_id  uuid := public._to_uuid(p_id);
  v_div smallint;
begin
  select division_id into v_div from public.programs where id = v_id;
  if not found or (s.role = 'division' and v_div <> s.division_id) then
    perform public._fail('NOT_FOUND');
  end if;
  return public._program_json(v_id);
end;
$$;

-- Program mirip (nama sama/hampir sama) dalam divisi yang sama - hanya peringatan (BR-09)
create or replace function public.rpc_check_similar(p_token text, p_nama text, p_bulan int default null, p_exclude_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s      public.sessions := public._require_session(p_token, 'division');
  v_nama text := lower(btrim(coalesce(p_nama, '')));
  v_excl uuid := public._to_uuid(p_exclude_id);
begin
  if char_length(v_nama) < 3 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'nama_program', x.nama_program, 'periode_bulan', x.periode_bulan,
             'status', x.status, 'same_month', x.same_month, 'score', round(x.sim::numeric, 2)
           ) order by x.same_month desc, x.sim desc)
    from (
      select p.id, p.nama_program, p.periode_bulan, p.status,
             extensions.similarity(lower(p.nama_program), v_nama) as sim,
             (p_bulan is not null and p.periode_bulan = p_bulan) as same_month
      from public.programs p
      where p.division_id = s.division_id
        and (v_excl is null or p.id <> v_excl)
        and (lower(btrim(p.nama_program)) = v_nama
             or extensions.similarity(lower(p.nama_program), v_nama) >= 0.45)
      order by same_month desc, sim desc
      limit 5
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Simpan program (baru/edit), sebagai draft atau submit. Atomik: header + semua baris + log.
-- payload: {id|null, nama_program, program_category_id, periode_bulan, pic_nama,
--           items:[{uraian,item_category_id,qty,satuan,harga_satuan,catatan}], submit:bool, expected_updated_at}
create or replace function public.rpc_save_program(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s          public.sessions := public._require_session(p_token);
  v_div      smallint;
  v_id       uuid;
  v_existing public.programs;
  v_has_old  boolean := false;
  v_old      jsonb;
  v_new      jsonb;
  v_submit   boolean;
  v_full     boolean;
  v_nama     text;
  v_cat      int;
  v_bulan    int;
  v_pic      text;
  v_items    jsonb;
  v_item     jsonb;
  v_rows     jsonb := '[]'::jsonb;
  v_old_cats smallint[] := '{}';
  v_n        int := 0;
  v_f        text;
  v_action   text;
  v_total    numeric;
  r_uraian   text;
  r_cat      int;
  r_qty      numeric;
  r_satuan   text;
  r_harga    numeric;
  r_catatan  text;
begin
  if s.role <> 'division' then
    perform public._fail('FORBIDDEN');            -- Finance tidak menambah/mengedit program (D-32)
  end if;
  v_div := s.division_id;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    perform public._fail('VALIDATION:payload:Data tidak valid');
  end if;
  v_submit := coalesce(p_payload -> 'submit' = 'true'::jsonb, false);

  -- Program lama (edit)
  if nullif(btrim(coalesce(p_payload ->> 'id', '')), '') is not null then
    v_id := public._to_uuid(p_payload ->> 'id');
    if v_id is null then
      perform public._fail('NOT_FOUND');
    end if;
    select * into v_existing from public.programs where id = v_id for update;
    if not found or v_existing.division_id <> v_div then
      perform public._fail('NOT_FOUND');
    end if;
    if public._to_ts(p_payload ->> 'expected_updated_at') is distinct from v_existing.updated_at then
      perform public._fail('CONFLICT');            -- optimistic locking (BR-15)
    end if;
    v_has_old := true;
    v_old := public._program_json(v_id);
    select coalesce(array_agg(distinct item_category_id) filter (where item_category_id is not null), '{}')
      into v_old_cats from public.program_items where program_id = v_id;
  end if;

  -- Program yang sudah Diajukan tetap Diajukan dan selalu divalidasi penuh (D-30)
  v_full := v_submit or (v_has_old and v_existing.status = 'diajukan');

  -- Header (selalu wajib lengkap)
  v_nama := btrim(coalesce(p_payload ->> 'nama_program', ''));
  if char_length(v_nama) not between 3 and 150 then
    perform public._fail('VALIDATION:nama_program:Nama program wajib 3-150 karakter');
  end if;

  v_cat := public._parse_int(p_payload ->> 'program_category_id', 'program_category_id');
  if v_cat is null or not exists (
       select 1 from public.program_categories
       where id = v_cat and (is_active or (v_has_old and id = v_existing.program_category_id))) then
    perform public._fail('VALIDATION:program_category_id:Pilih kategori program');
  end if;

  v_bulan := public._parse_int(p_payload ->> 'periode_bulan', 'periode_bulan');
  if v_bulan is null or v_bulan not between 1 and 12 then
    perform public._fail('VALIDATION:periode_bulan:Pilih periode bulan');
  end if;

  v_pic := btrim(coalesce(p_payload ->> 'pic_nama', ''));
  if char_length(v_pic) not between 2 and 100 then
    perform public._fail('VALIDATION:pic_nama:Nama PIC wajib 2-100 karakter');
  end if;

  -- Baris kebutuhan
  v_items := coalesce(p_payload -> 'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then
    perform public._fail('VALIDATION:items:Data baris tidak valid');
  end if;
  if jsonb_array_length(v_items) > 200 then
    perform public._fail('VALIDATION:items:Maksimal 200 baris per program');
  end if;

  for i in 0 .. jsonb_array_length(v_items) - 1 loop
    v_item := v_items -> i;
    v_f := 'items.' || (i + 1) || '.';
    if jsonb_typeof(v_item) <> 'object' then
      perform public._fail('VALIDATION:' || v_f || 'uraian:Data baris tidak valid');
    end if;

    r_uraian  := nullif(btrim(coalesce(v_item ->> 'uraian', '')), '');
    r_cat     := public._parse_int(v_item ->> 'item_category_id', v_f || 'item_category_id');
    r_qty     := public._parse_num(v_item ->> 'qty', v_f || 'qty');
    r_satuan  := nullif(btrim(coalesce(v_item ->> 'satuan', '')), '');
    r_harga   := public._parse_num(v_item ->> 'harga_satuan', v_f || 'harga_satuan');
    r_catatan := nullif(btrim(coalesce(v_item ->> 'catatan', '')), '');

    -- Baris kosong total dilewati
    if r_uraian is null and r_cat is null and r_qty is null and r_satuan is null and r_harga is null and r_catatan is null then
      continue;
    end if;
    v_n := v_n + 1;

    -- Aturan yang berlaku juga untuk draft
    if r_uraian is not null and char_length(r_uraian) > 200 then
      perform public._fail('VALIDATION:' || v_f || 'uraian:Uraian maksimal 200 karakter');
    end if;
    if r_cat is not null and not exists (
         select 1 from public.item_categories where id = r_cat and (is_active or r_cat = any (v_old_cats))) then
      perform public._fail('VALIDATION:' || v_f || 'item_category_id:Kategori tidak tersedia');
    end if;
    if r_qty is not null and (r_qty <= 0 or r_qty > 100000 or r_qty <> round(r_qty, 2)) then
      perform public._fail('VALIDATION:' || v_f || 'qty:Qty harus lebih dari 0, maksimal 100.000, maksimal 2 angka desimal');
    end if;
    if r_harga is not null and (r_harga < 0 or r_harga > 1000000000000 or r_harga <> trunc(r_harga)) then
      perform public._fail('VALIDATION:' || v_f || 'harga_satuan:Harga satuan Rp0 sampai Rp1.000.000.000.000, tanpa desimal');
    end if;
    if r_satuan is not null and char_length(r_satuan) > 30 then
      perform public._fail('VALIDATION:' || v_f || 'satuan:Satuan maksimal 30 karakter');
    end if;
    if r_catatan is not null and char_length(r_catatan) > 300 then
      perform public._fail('VALIDATION:' || v_f || 'catatan:Catatan maksimal 300 karakter');
    end if;

    -- Aturan penuh untuk Submit / program Diajukan (BR-04, BR-05)
    if v_full then
      if r_uraian is null or char_length(r_uraian) < 3 then
        perform public._fail('VALIDATION:' || v_f || 'uraian:Uraian wajib 3-200 karakter');
      end if;
      if r_cat is null then
        perform public._fail('VALIDATION:' || v_f || 'item_category_id:Pilih kategori untuk baris ini');
      end if;
      if r_qty is null then
        perform public._fail('VALIDATION:' || v_f || 'qty:Qty wajib diisi');
      end if;
      if r_satuan is null then
        perform public._fail('VALIDATION:' || v_f || 'satuan:Satuan wajib diisi');
      end if;
      if r_harga is null then
        perform public._fail('VALIDATION:' || v_f || 'harga_satuan:Harga satuan wajib diisi');
      end if;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'urutan', v_n, 'uraian', r_uraian, 'item_category_id', r_cat, 'qty', r_qty,
      'satuan', r_satuan, 'harga_satuan', r_harga, 'catatan', r_catatan));
  end loop;

  if v_full and v_n = 0 then
    perform public._fail('VALIDATION:items:Tambahkan minimal satu kebutuhan sebelum submit');
  end if;

  -- Tulis header
  if not v_has_old then
    insert into public.programs (division_id, nama_program, program_category_id, periode_bulan, pic_nama,
                                 status, tanggal_pengajuan, submitted_at, created_by_name, updated_by_name)
    values (v_div, v_nama, v_cat, v_bulan, v_pic,
            case when v_submit then 'diajukan' else 'draft' end,
            case when v_submit then public._jkt_today() end,
            case when v_submit then now() end,
            s.actor_name, s.actor_name)
    returning id into v_id;
  else
    update public.programs
       set nama_program        = v_nama,
           program_category_id = v_cat,
           periode_bulan       = v_bulan,
           pic_nama            = v_pic,
           status              = case when v_full then 'diajukan' else 'draft' end,
           tanggal_pengajuan   = coalesce(tanggal_pengajuan, case when v_full then public._jkt_today() end),
           submitted_at        = coalesce(submitted_at, case when v_full then now() end),
           updated_at          = clock_timestamp(),
           updated_by_name     = s.actor_name
     where id = v_id;
  end if;

  -- Ganti semua baris (atomik dalam transaksi yang sama)
  delete from public.program_items where program_id = v_id;
  insert into public.program_items (program_id, urutan, uraian, item_category_id, qty, satuan, harga_satuan, catatan)
  select v_id,
         (r ->> 'urutan')::smallint,
         r ->> 'uraian',
         (r ->> 'item_category_id')::smallint,
         (r ->> 'qty')::numeric,
         r ->> 'satuan',
         (r ->> 'harga_satuan')::bigint,
         r ->> 'catatan'
  from jsonb_array_elements(v_rows) r;

  select coalesce(sum(subtotal), 0) into v_total from public.program_items where program_id = v_id;
  if v_total > 1000000000000000 then
    perform public._fail('VALIDATION:items:Total program terlalu besar (maksimal Rp1.000 triliun)');
  end if;

  v_new := public._program_json(v_id);
  v_action := case
                when not v_has_old and v_submit then 'submit'
                when not v_has_old then 'create'
                when v_existing.status = 'draft' and v_full then 'submit'
                else 'update'
              end;
  perform public._audit('division', v_div, s.actor_name, v_action, 'program', v_id::text, v_old, v_new, null);

  return v_new;
end;
$$;

-- Hapus program (hard delete + snapshot di log). Finance wajib alasan >= 10 karakter (BR-11).
create or replace function public.rpc_delete_program(p_token text, p_id text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s        public.sessions := public._require_session(p_token);
  v_id     uuid := public._to_uuid(p_id);
  v_div    smallint;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old    jsonb;
begin
  select division_id into v_div from public.programs where id = v_id for update;
  if not found or (s.role = 'division' and v_div <> s.division_id) then
    perform public._fail('NOT_FOUND');
  end if;

  if s.role = 'finance' and (v_reason is null or char_length(v_reason) < 10) then
    perform public._fail('VALIDATION:reason:Alasan wajib diisi minimal 10 karakter');
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    perform public._fail('VALIDATION:reason:Alasan maksimal 500 karakter');
  end if;

  v_old := public._program_json(v_id);
  perform public._audit(s.role, v_div, s.actor_name, 'delete', 'program', v_id::text, v_old, null, v_reason);
  delete from public.programs where id = v_id;   -- baris kebutuhan ikut terhapus (cascade)

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC khusus Finance
-- ---------------------------------------------------------------------

create or replace function public.rpc_f_list_programs(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
begin
  return coalesce((
    select jsonb_agg(t.x order by t.sort_key)
    from (
      select jsonb_build_object(
               'id', p.id,
               'division_code', d.code, 'division_name', d.name, 'group_name', g.name,
               'nama_program', p.nama_program,
               'program_category_id', p.program_category_id, 'program_category_name', pc.name,
               'periode_bulan', p.periode_bulan, 'pic_nama', p.pic_nama, 'status', p.status,
               'tanggal_pengajuan', p.tanggal_pengajuan, 'updated_at', p.updated_at,
               'total', coalesce((select sum(i.subtotal) from public.program_items i where i.program_id = p.id), 0),
               'item_count', (select count(*) from public.program_items i where i.program_id = p.id)
             ) as x,
             lpad(d.sort_order::text, 3, '0') || lpad(p.periode_bulan::text, 2, '0') || lower(p.nama_program) as sort_key
      from public.programs p
      join public.divisions d on d.id = p.division_id
      join public.division_groups g on g.id = d.group_id
      join public.program_categories pc on pc.id = p.program_category_id
    ) t(x, sort_key)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_f_list_divisions(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'code', d.code, 'name', d.name, 'group_name', g.name, 'is_active', d.is_active,
             'has_pin', d.pin_hash is not null,
             'pin_updated_at', d.pin_updated_at,
             'count_diajukan', (select count(*) from public.programs p where p.division_id = d.id and p.status = 'diajukan'),
             'count_draft',    (select count(*) from public.programs p where p.division_id = d.id and p.status = 'draft'),
             'total_diajukan', coalesce((select sum(i.subtotal) from public.programs p
                                          join public.program_items i on i.program_id = p.id
                                          where p.division_id = d.id and p.status = 'diajukan'), 0),
             'last_login_at',  (select max(a.attempted_at) from public.login_attempts a
                                 where a.scope = d.code and a.succeeded)
           ) order by d.sort_order, d.name)
    from public.divisions d
    join public.division_groups g on g.id = d.group_id
  ), '[]'::jsonb);
end;
$$;

-- Atur/reset PIN divisi (6 digit). Semua sesi divisi itu dicabut.
create or replace function public.rpc_f_set_division_pin(p_token text, p_division_id int, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
  d public.divisions;
begin
  select * into d from public.divisions where id = p_division_id for update;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then
    perform public._fail('VALIDATION:pin:PIN divisi harus 6 digit angka');
  end if;

  update public.divisions
     set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
         pin_updated_at = now()
   where id = d.id;
  delete from public.sessions where division_id = d.id;

  perform public._audit('finance', d.id, s.actor_name, 'pin_reset', 'division', d.id::text,
                        jsonb_build_object('pin_updated_at', d.pin_updated_at),
                        jsonb_build_object('pin_updated_at', now()), null);
  return jsonb_build_object('ok', true, 'pin_updated_at', now());
end;
$$;

-- Ganti master PIN Finance (8 digit). Sesi Finance lain dicabut.
create or replace function public.rpc_f_set_master_pin(p_token text, p_old_pin text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s      public.sessions := public._require_session(p_token, 'finance');
  v_hash text;
begin
  select value into v_hash from public.app_settings where key = 'finance_pin_hash' for update;
  if v_hash is null or p_old_pin is null or v_hash <> extensions.crypt(p_old_pin, v_hash) then
    perform pg_sleep(1);
    perform public._fail('VALIDATION:old_pin:Master PIN lama salah');
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{8}$' then
    perform public._fail('VALIDATION:new_pin:Master PIN baru harus 8 digit angka');
  end if;
  if p_new_pin = p_old_pin then
    perform public._fail('VALIDATION:new_pin:Master PIN baru harus berbeda dari yang lama');
  end if;

  update public.app_settings
     set value = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)), updated_at = now()
   where key = 'finance_pin_hash';
  delete from public.sessions where role = 'finance' and token_hash <> s.token_hash;

  perform public._audit('finance', null, s.actor_name, 'master_pin_change', 'settings', 'finance_pin_hash',
                        null, null, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Tambah kategori baru, atau aktif/nonaktifkan kategori. Tidak ada hapus / ganti nama (D-31).
-- p_kind: 'program' | 'item'. p_id null = tambah baru (p_name wajib). p_id terisi = ubah status aktif saja.
create or replace function public.rpc_f_upsert_category(
  p_token text, p_kind text, p_id int default null, p_name text default null, p_is_active boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s       public.sessions := public._require_session(p_token, 'finance');
  v_name  text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_old   jsonb;
  v_new   jsonb;
  v_id    int;
begin
  if p_kind is null or p_kind not in ('program', 'item') then
    perform public._fail('VALIDATION:kind:Jenis kategori tidak valid');
  end if;

  if p_id is null then
    if char_length(v_name) not between 2 and 60 then
      perform public._fail('VALIDATION:name:Nama kategori wajib 2-60 karakter');
    end if;
    if lower(v_name) ~ '^(lain[ -]*lain(nya)?|lainnya|other|others|dll\.?|dan lain[ -]*lain|misc.*|umum)$' then
      perform public._fail('VALIDATION:name:Kategori "Lain-lain" tidak diperbolehkan. Gunakan nama yang spesifik.');
    end if;

    if p_kind = 'program' then
      if exists (select 1 from public.program_categories where lower(btrim(name)) = lower(v_name)) then
        perform public._fail('VALIDATION:name:Kategori dengan nama ini sudah ada');
      end if;
      insert into public.program_categories (name, sort_order)
      values (v_name, coalesce((select max(sort_order) from public.program_categories), 0) + 1)
      returning id into v_id;
      select jsonb_build_object('id', id, 'name', name, 'is_active', is_active) into v_new
        from public.program_categories where id = v_id;
    else
      if exists (select 1 from public.item_categories where lower(btrim(name)) = lower(v_name)) then
        perform public._fail('VALIDATION:name:Kategori dengan nama ini sudah ada');
      end if;
      insert into public.item_categories (name, sort_order)
      values (v_name, coalesce((select max(sort_order) from public.item_categories), 0) + 1)
      returning id into v_id;
      select jsonb_build_object('id', id, 'name', name, 'is_active', is_active) into v_new
        from public.item_categories where id = v_id;
    end if;
  else
    if p_is_active is null then
      perform public._fail('VALIDATION:is_active:Status aktif wajib diisi');
    end if;
    if p_kind = 'program' then
      select jsonb_build_object('id', id, 'name', name, 'is_active', is_active) into v_old
        from public.program_categories where id = p_id for update;
      if v_old is null then
        perform public._fail('NOT_FOUND');
      end if;
      update public.program_categories set is_active = p_is_active where id = p_id;
      select jsonb_build_object('id', id, 'name', name, 'is_active', is_active) into v_new
        from public.program_categories where id = p_id;
    else
      select jsonb_build_object('id', id, 'name', name, 'is_active', is_active) into v_old
        from public.item_categories where id = p_id for update;
      if v_old is null then
        perform public._fail('NOT_FOUND');
      end if;
      update public.item_categories set is_active = p_is_active where id = p_id;
      select jsonb_build_object('id', id, 'name', name, 'is_active', is_active) into v_new
        from public.item_categories where id = p_id;
    end if;
    v_id := p_id;
  end if;

  perform public._audit('finance', null, s.actor_name, 'category_change', 'category', p_kind || ':' || v_id,
                        v_old, v_new || jsonb_build_object('kind', p_kind), null);
  return v_new || jsonb_build_object('kind', p_kind);
end;
$$;

-- Log riwayat. Filter: action, division_id, date_from, date_to (YYYY-MM-DD, WIB), limit (maks 1000).
create or replace function public.rpc_f_audit_log(p_token text, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s        public.sessions := public._require_session(p_token, 'finance');
  f        jsonb := coalesce(p_filters, '{}'::jsonb);
  v_action text := nullif(f ->> 'action', '');
  v_div    int := public._parse_int(f ->> 'division_id', 'division_id');
  v_from   timestamptz;
  v_to     timestamptz;
  v_limit  int := least(greatest(coalesce(public._parse_int(f ->> 'limit', 'limit'), 300), 1), 1000);
begin
  begin
    v_from := (nullif(f ->> 'date_from', '')::date)::timestamp at time zone 'Asia/Jakarta';
    v_to   := ((nullif(f ->> 'date_to', '')::date) + 1)::timestamp at time zone 'Asia/Jakarta';
  exception when others then
    perform public._fail('VALIDATION:date:Format tanggal tidak valid');
  end;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'occurred_at', a.occurred_at, 'actor_role', a.actor_role,
             'division_id', a.division_id, 'division_name', d.name, 'actor_name', a.actor_name,
             'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
             'old_data', a.old_data, 'new_data', a.new_data, 'reason', a.reason
           ) order by a.occurred_at desc, a.id desc)
    from (
      select * from public.audit_log a
      where (v_action is null or a.action = v_action)
        and (v_div is null or a.division_id = v_div)
        and (v_from is null or a.occurred_at >= v_from)
        and (v_to is null or a.occurred_at < v_to)
      order by a.occurred_at desc, a.id desc
      limit v_limit
    ) a
    left join public.divisions d on d.id = a.division_id
  ), '[]'::jsonb);
end;
$$;

-- Baris datar program + kebutuhan (pembantu internal; dipakai rpc_f_export dan tests/sql/reconcile.sql)
create or replace function public._export_rows(p_status text)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(r.row_data order by r.div_sort, r.periode_bulan, r.nama_lower, r.program_id, r.urutan), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'divisi', d.name,
             'grup', g.name,
             'nama_program', p.nama_program,
             'kategori_program', pc.name,
             'bulan', p.periode_bulan,
             'kuartal', 'Q' || (((p.periode_bulan - 1) / 3) + 1),
             'pic', p.pic_nama,
             'status', case p.status when 'diajukan' then 'Diajukan' else 'Draft' end,
             'tanggal_pengajuan', p.tanggal_pengajuan,
             'kategori_baris', ic.name,
             'uraian', i.uraian,
             'qty', i.qty,
             'satuan', i.satuan,
             'harga_satuan', i.harga_satuan,
             'subtotal', i.subtotal,
             'catatan', i.catatan
           ) as row_data,
           d.sort_order as div_sort, p.periode_bulan, lower(p.nama_program) as nama_lower, p.id as program_id,
           coalesce(i.urutan, 0) as urutan
    from public.programs p
    join public.divisions d on d.id = p.division_id
    join public.division_groups g on g.id = d.group_id
    join public.program_categories pc on pc.id = p.program_category_id
    left join public.program_items i on i.program_id = p.id
    left join public.item_categories ic on ic.id = i.item_category_id
    where p_status = 'all' or p.status = p_status
  ) r;
$$;

-- Data datar program + baris untuk export Excel/CSV. Filter: status ('all'|'diajukan'|'draft').
create or replace function public.rpc_f_export(p_token text, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s        public.sessions := public._require_session(p_token, 'finance');
  v_status text := coalesce(nullif(coalesce(p_filters, '{}'::jsonb) ->> 'status', ''), 'all');
  v_rows   jsonb;
begin
  if v_status not in ('all', 'diajukan', 'draft') then
    perform public._fail('VALIDATION:status:Filter status tidak valid');
  end if;
  v_rows := public._export_rows(v_status);
  perform public._audit('finance', null, s.actor_name, 'export', 'export', null, null,
                        jsonb_build_object('status', v_status, 'row_count', jsonb_array_length(v_rows)), null);
  return v_rows;
end;
$$;
