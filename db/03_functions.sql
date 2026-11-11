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

-- Hash PIN (T-14): bcrypt tingkat 6 supaya login "PIN langsung" (1 PIN dicek ke 13 akun) tetap cepat.
-- Untuk PIN 6 digit, tingkat hash praktis tidak mengubah keamanan; hash tidak pernah keluar dari database.
create or replace function public._pin_hash(p_pin text)
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select extensions.crypt(p_pin, extensions.gen_salt('bf', 6));
$$;

-- Semua akun yang PIN-nya cocok dengan p_pin: Finance dan divisi (aktif maupun nonaktif).
-- Dipakai login PIN langsung (D-38) dan pengecekan PIN unik.
create or replace function public._pin_owners(p_pin text)
returns table (kind text, division_id smallint, is_active boolean)
language sql
stable
set search_path = public, extensions
as $$
  select 'finance'::text, null::smallint, true
  from public.app_settings s
  where s.key = 'finance_pin_hash' and s.value = extensions.crypt(p_pin, s.value)
  union all
  select 'division'::text, d.id, d.is_active
  from public.divisions d
  where d.pin_hash is not null and d.pin_hash = extensions.crypt(p_pin, d.pin_hash);
$$;

-- p_count PIN acak 6 digit yang berbeda satu sama lain.
-- p_check_existing = true: juga tidak boleh sama dengan PIN yang sudah dipakai akun mana pun.
create or replace function public._new_unique_pins(p_count int, p_check_existing boolean)
returns text[]
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_out   text[] := '{}';
  v       text;
  v_guard int := 0;
begin
  while coalesce(array_length(v_out, 1), 0) < p_count loop
    v_guard := v_guard + 1;
    if v_guard > p_count * 1000 + 100 then
      perform public._fail('Gagal membuat PIN unik');
    end if;
    v := public._random_digits(6);
    if v = any (v_out) then
      continue;
    end if;
    if p_check_existing and exists (select 1 from public._pin_owners(v)) then
      continue;
    end if;
    v_out := v_out || v;
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

-- Isi satu item pada saat ini, untuk riwayat (D-43). Nama kategori ikut disimpan supaya riwayat tetap terbaca.
create or replace function public._item_snapshot(p_item_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'uraian', i.uraian,
    'item_category_id', i.item_category_id,
    'item_category_name', ic.name,
    'qty', i.qty,
    'satuan', i.satuan,
    'harga_satuan', i.harga_satuan,
    'subtotal', i.subtotal,
    'catatan', i.catatan)
  from public.program_items i
  left join public.item_categories ic on ic.id = i.item_category_id
  where i.id = p_item_id;
$$;

create or replace function public._item_history(
  p_program_id uuid, p_item_id uuid, p_division_id smallint, p_role text, p_type text,
  p_old jsonb, p_new jsonb, p_reason text
)
returns void
language sql
set search_path = public, extensions
as $$
  insert into public.program_item_history (program_id, item_id, division_id, actor_role, change_type, old_data, new_data, reason)
  values (p_program_id, p_item_id, p_division_id, p_role, p_type, p_old, p_new, p_reason);
$$;

create or replace function public._notify(
  p_recipient_role text, p_recipient_division smallint, p_division_id smallint, p_program_id uuid,
  p_program_name text, p_kind text, p_item_count int, p_info_changed boolean
)
returns void
language sql
set search_path = public, extensions
as $$
  insert into public.notifications (recipient_role, recipient_division_id, division_id, program_id, program_name, kind, item_count, info_changed)
  values (p_recipient_role, p_recipient_division, p_division_id, p_program_id, p_program_name, p_kind, p_item_count, p_info_changed);
$$;

-- Validasi satu item (satu sumber aturan untuk simpan divisi dan revisi Finance).
-- Hasil: jsonb isi item, atau null bila barisnya kosong total.
-- p_full = aturan lengkap (Submit / program Diajukan); p_allowed_cats = kategori nonaktif yang masih boleh dipakai.
create or replace function public._parse_item(p_item jsonb, p_f text, p_full boolean, p_allowed_cats smallint[])
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  r_uraian  text;
  r_cat     int;
  r_qty     numeric;
  r_satuan  text;
  r_harga   numeric;
  r_catatan text;
begin
  if jsonb_typeof(p_item) is distinct from 'object' then
    perform public._fail('VALIDATION:' || p_f || 'uraian:Data baris tidak valid');
  end if;

  r_uraian  := nullif(btrim(coalesce(p_item ->> 'uraian', '')), '');
  r_cat     := public._parse_int(p_item ->> 'item_category_id', p_f || 'item_category_id');
  r_qty     := public._parse_num(p_item ->> 'qty', p_f || 'qty');
  r_satuan  := nullif(btrim(coalesce(p_item ->> 'satuan', '')), '');
  r_harga   := public._parse_num(p_item ->> 'harga_satuan', p_f || 'harga_satuan');
  r_catatan := nullif(btrim(coalesce(p_item ->> 'catatan', '')), '');

  -- Baris kosong total dilewati
  if r_uraian is null and r_cat is null and r_qty is null and r_satuan is null and r_harga is null and r_catatan is null then
    return null;
  end if;

  -- Aturan yang berlaku juga untuk draft
  if r_uraian is not null and char_length(r_uraian) > 200 then
    perform public._fail('VALIDATION:' || p_f || 'uraian:Uraian maksimal 200 karakter');
  end if;
  if r_cat is not null and not exists (
       select 1 from public.item_categories where id = r_cat and (is_active or r_cat = any (p_allowed_cats))) then
    perform public._fail('VALIDATION:' || p_f || 'item_category_id:Kategori tidak tersedia');
  end if;
  if r_qty is not null and (r_qty <= 0 or r_qty > 100000 or r_qty <> round(r_qty, 2)) then
    perform public._fail('VALIDATION:' || p_f || 'qty:Qty harus lebih dari 0, maksimal 100.000, maksimal 2 angka desimal');
  end if;
  if r_harga is not null and (r_harga < 0 or r_harga > 1000000000000 or r_harga <> trunc(r_harga)) then
    perform public._fail('VALIDATION:' || p_f || 'harga_satuan:Harga satuan Rp0 sampai Rp1.000.000.000.000, tanpa desimal');
  end if;
  if r_satuan is not null and char_length(r_satuan) > 30 then
    perform public._fail('VALIDATION:' || p_f || 'satuan:Satuan maksimal 30 karakter');
  end if;
  if r_catatan is not null and char_length(r_catatan) > 300 then
    perform public._fail('VALIDATION:' || p_f || 'catatan:Catatan maksimal 300 karakter');
  end if;

  -- Aturan penuh untuk Submit / program Diajukan (BR-04, BR-05)
  if p_full then
    if r_uraian is null or char_length(r_uraian) < 3 then
      perform public._fail('VALIDATION:' || p_f || 'uraian:Uraian wajib 3-200 karakter');
    end if;
    if r_cat is null then
      perform public._fail('VALIDATION:' || p_f || 'item_category_id:Pilih kategori untuk baris ini');
    end if;
    if r_qty is null then
      perform public._fail('VALIDATION:' || p_f || 'qty:Qty wajib diisi');
    end if;
    if r_satuan is null then
      perform public._fail('VALIDATION:' || p_f || 'satuan:Satuan wajib diisi');
    end if;
    if r_harga is null then
      perform public._fail('VALIDATION:' || p_f || 'harga_satuan:Harga satuan wajib diisi');
    end if;
  end if;

  return jsonb_build_object('uraian', r_uraian, 'item_category_id', r_cat, 'qty', r_qty,
                            'satuan', r_satuan, 'harga_satuan', r_harga, 'catatan', r_catatan);
end;
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

-- Login PIN langsung (D-38): cukup ketik PIN 6 digit, sistem menentukan akunnya (divisi atau Finance).
-- PIN dijamin unik oleh rpc_f_set_division_pin / rpc_f_set_master_pin / 06 / 07. Bila ternyata kembar,
-- login ditolak (PIN_DUPLICATE) supaya tidak pernah salah masuk ke divisi lain.
create or replace function public.rpc_login_pin(p_pin text, p_actor_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name  text := nullif(left(btrim(coalesce(p_actor_name, '')), 100), '');
  v_n     int;
  v_kind  text;
  v_div   smallint;
  d       public.divisions;
  v_token text;
  v_exp   timestamptz := now() + interval '8 hours';
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    insert into public.login_attempts (scope, succeeded) values ('pin', false);
    perform pg_sleep(0.5);  -- jeda singkat, tanpa mengunci (D-28)
    return jsonb_build_object('ok', false, 'error', 'PIN_WRONG');
  end if;

  select count(*), min(o.kind), min(o.division_id)
    into v_n, v_kind, v_div
  from public._pin_owners(p_pin) o
  where o.is_active;

  if v_n = 0 then
    insert into public.login_attempts (scope, succeeded) values ('pin', false);
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'PIN_WRONG');
  end if;
  if v_n > 1 then
    insert into public.login_attempts (scope, succeeded) values ('pin-kembar', false);
    return jsonb_build_object('ok', false, 'error', 'PIN_DUPLICATE');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  if v_kind = 'finance' then
    insert into public.sessions (token_hash, role, division_id, actor_name, expires_at)
    values (public._hash_token(v_token), 'finance', null, v_name, v_exp);
    insert into public.login_attempts (scope, succeeded) values ('finance', true);
    return jsonb_build_object('ok', true, 'token', v_token, 'role', 'finance', 'actor_name', v_name, 'expires_at', v_exp);
  end if;

  select * into d from public.divisions where id = v_div;
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

-- Login Finance lama (dipertahankan untuk kompatibilitas; web sekarang memakai rpc_login_pin)
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

  if p_pin is null or p_pin !~ '^[0-9]{6,8}$' or v_hash <> extensions.crypt(p_pin, v_hash) then
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
                 'total', total, 'item_count', item_count,
                 'revised_by_finance', exists (select 1 from public.program_item_history h where h.program_id = prog.id and h.actor_role = 'finance')
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
  v_row      jsonb;
  v_rows     jsonb := '[]'::jsonb;
  v_old_cats smallint[] := '{}';
  v_old_ids  uuid[] := '{}';
  v_kept     uuid[] := '{}';
  v_item_id  uuid;
  v_before   jsonb;
  v_after    jsonb;
  v_track    boolean := false;   -- riwayat & notifikasi hanya untuk program yang sudah Diajukan (D-43)
  v_changes  int := 0;
  v_info     boolean := false;
  v_n        int := 0;
  v_f        text;
  v_action   text;
  v_total    numeric;
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
    select coalesce(array_agg(distinct item_category_id) filter (where item_category_id is not null), '{}'),
           coalesce(array_agg(id), '{}')
      into v_old_cats, v_old_ids from public.program_items where program_id = v_id;
    v_track := v_existing.status = 'diajukan';
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
    v_row := public._parse_item(v_item, v_f, v_full, v_old_cats);
    if v_row is null then
      continue;   -- baris kosong total dilewati
    end if;
    v_n := v_n + 1;

    -- Item lama dikenali dari id-nya; id yang bukan milik program ini / dipakai dua kali = item baru
    v_item_id := public._to_uuid(v_item ->> 'id');
    if v_item_id = any (v_old_ids) and not (v_item_id = any (v_kept)) then
      v_kept := v_kept || v_item_id;
    else
      v_item_id := null;
    end if;

    v_rows := v_rows || jsonb_build_array(v_row || jsonb_build_object('urutan', v_n, 'id', v_item_id));
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

  -- Tulis baris (atomik dalam transaksi yang sama). Item lama diperbarui di tempat supaya identitas dan riwayatnya tetap (D-43).
  if v_track then
    for v_item_id in select id from public.program_items where program_id = v_id and not (id = any (v_kept)) loop
      perform public._item_history(v_id, v_item_id, v_div, 'division', 'hapus', public._item_snapshot(v_item_id), null, null);
      v_changes := v_changes + 1;
    end loop;
  end if;
  delete from public.program_items where program_id = v_id and not (id = any (v_kept));

  for v_row in select r from jsonb_array_elements(v_rows) r loop
    v_item_id := (v_row ->> 'id')::uuid;
    if v_item_id is null then
      insert into public.program_items (program_id, urutan, uraian, item_category_id, qty, satuan, harga_satuan, catatan)
      values (v_id, (v_row ->> 'urutan')::smallint, v_row ->> 'uraian', (v_row ->> 'item_category_id')::smallint,
              (v_row ->> 'qty')::numeric, v_row ->> 'satuan', (v_row ->> 'harga_satuan')::bigint, v_row ->> 'catatan')
      returning id into v_item_id;
      if v_track then
        perform public._item_history(v_id, v_item_id, v_div, 'division', 'tambah', null, public._item_snapshot(v_item_id), null);
        v_changes := v_changes + 1;
      end if;
    else
      v_before := public._item_snapshot(v_item_id);
      update public.program_items
         set urutan           = (v_row ->> 'urutan')::smallint,
             uraian           = v_row ->> 'uraian',
             item_category_id = (v_row ->> 'item_category_id')::smallint,
             qty              = (v_row ->> 'qty')::numeric,
             satuan           = v_row ->> 'satuan',
             harga_satuan     = (v_row ->> 'harga_satuan')::bigint,
             catatan          = v_row ->> 'catatan'
       where id = v_item_id;
      v_after := public._item_snapshot(v_item_id);
      if v_track and v_before is distinct from v_after then
        perform public._item_history(v_id, v_item_id, v_div, 'division', 'ubah', v_before, v_after, null);
        v_changes := v_changes + 1;
      end if;
    end if;
  end loop;

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

  -- Finance diberi tahu bila divisi mengubah program yang sudah Diajukan (D-43)
  if v_track then
    v_info := v_nama is distinct from v_existing.nama_program
              or v_cat is distinct from v_existing.program_category_id::int
              or v_bulan is distinct from v_existing.periode_bulan::int
              or v_pic is distinct from v_existing.pic_nama;
    if v_changes > 0 or v_info then
      perform public._notify('finance', null, v_div, v_id, v_nama, 'ubah_divisi', v_changes, v_info);
    end if;
  end if;

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
  v_status text;
  v_name   text;
begin
  select division_id, status, nama_program into v_div, v_status, v_name from public.programs where id = v_id for update;
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

  -- Divisi tahu bila Finance menghapus programnya; Finance tahu bila divisi menghapus program Diajukan (D-43)
  if s.role = 'finance' then
    perform public._notify('division', v_div, v_div, v_id, v_name, 'hapus_program', 0, false);
  elsif v_status = 'diajukan' then
    perform public._notify('finance', null, v_div, v_id, v_name, 'hapus_program', 0, false);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Riwayat per item satu program (D-43): divisi hanya miliknya, finance semua. Terbaru lebih dulu.
create or replace function public.rpc_program_item_history(p_token text, p_id text)
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'occurred_at', x.occurred_at, 'item_id', x.item_id,
             'actor_role', x.actor_role, 'actor_label', x.actor_label,
             'change_type', x.change_type, 'old_data', x.old_data, 'new_data', x.new_data, 'reason', x.reason
           ) order by x.occurred_at desc, x.id desc)
    from (
      select h.*, case h.actor_role when 'finance' then 'Finance' else d.name end as actor_label
      from public.program_item_history h
      join public.divisions d on d.id = h.division_id
      where h.program_id = v_id
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Notifikasi akun yang sedang masuk (D-43): divisi hanya miliknya; Finance milik Finance
create or replace function public.rpc_notifications(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token);
begin
  return jsonb_build_object(
    'unread', (select count(*) from public.notifications n
               where n.read_at is null and n.recipient_role = s.role
                 and (s.role = 'finance' or n.recipient_division_id = s.division_id)),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'created_at', x.created_at, 'kind', x.kind,
               'program_id', x.program_id, 'program_name', x.program_name,
               'division_code', x.code, 'division_name', x.dname,
               'item_count', x.item_count, 'info_changed', x.info_changed, 'read_at', x.read_at
             ) order by x.created_at desc, x.id desc)
      from (
        select n.*, d.code, d.name as dname
        from public.notifications n
        join public.divisions d on d.id = n.division_id
        where n.recipient_role = s.role
          and (s.role = 'finance' or n.recipient_division_id = s.division_id)
        order by n.created_at desc, n.id desc
        limit 30
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Tandai sudah dibaca: satu notifikasi (p_id) atau semua (p_id null). Hanya milik akun sendiri.
create or replace function public.rpc_notifications_read(p_token text, p_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token);
begin
  update public.notifications n
     set read_at = clock_timestamp()
   where n.read_at is null
     and n.recipient_role = s.role
     and (s.role = 'finance' or n.recipient_division_id = s.division_id)
     and (p_id is null or n.id = p_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC khusus Finance
-- ---------------------------------------------------------------------

-- Urutan item dirapatkan kembali menjadi 1..n
create or replace function public._renumber_items(p_program_id uuid)
returns void
language sql
set search_path = public, extensions
as $$
  update public.program_items i
     set urutan = x.rn
    from (select id, row_number() over (order by urutan, id) as rn
          from public.program_items where program_id = p_program_id) x
   where x.id = i.id and i.urutan <> x.rn;
$$;

-- Revisi item oleh Finance pada program Diajukan (D-43). Semua perubahan tersimpan sekaligus, atau tidak sama sekali.
-- p_changes: [{op:'ubah', id, reason, item:{...}} | {op:'tambah', reason, item:{...}} | {op:'hapus', id, reason}]
create or replace function public.rpc_f_revise_items(p_token text, p_program_id text, p_expected_updated_at text, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s         public.sessions := public._require_session(p_token, 'finance');
  v_id      uuid := public._to_uuid(p_program_id);
  v_prog    public.programs;
  v_old     jsonb;
  v_new     jsonb;
  v_change  jsonb;
  v_ord     bigint;
  v_f       text;
  v_op      text;
  v_reason  text;
  v_item_id uuid;
  v_seen    uuid[] := '{}';
  v_cats    smallint[];
  v_row     jsonb;
  v_before  jsonb;
  v_after   jsonb;
  v_uraian  text;
  v_notes   text[] := '{}';
  v_count   int;
  v_total   numeric;
begin
  select * into v_prog from public.programs where id = v_id for update;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;
  if v_prog.status <> 'diajukan' then
    perform public._fail('VALIDATION:program:Hanya program berstatus Diajukan yang bisa direvisi Finance');
  end if;
  if public._to_ts(p_expected_updated_at) is distinct from v_prog.updated_at then
    perform public._fail('CONFLICT');
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    perform public._fail('VALIDATION:changes:Belum ada item yang direvisi');
  end if;
  if jsonb_array_length(p_changes) > 200 then
    perform public._fail('VALIDATION:changes:Maksimal 200 perubahan sekali submit');
  end if;

  v_old := public._program_json(v_id);

  -- Hapus dulu, lalu ubah, lalu tambah, supaya batas 200 baris dihitung dari kondisi akhir
  for v_change, v_ord in
    select c, o from jsonb_array_elements(p_changes) with ordinality t(c, o)
    order by case c ->> 'op' when 'hapus' then 1 when 'ubah' then 2 else 3 end, o
  loop
    v_f := 'changes.' || v_ord || '.';
    v_op := v_change ->> 'op';
    if v_op is null or v_op not in ('ubah', 'tambah', 'hapus') then
      perform public._fail('VALIDATION:' || v_f || 'op:Jenis perubahan tidak valid');
    end if;

    v_reason := btrim(coalesce(v_change ->> 'reason', ''));
    if char_length(v_reason) < 10 then
      perform public._fail('VALIDATION:' || v_f || 'reason:Alasan wajib diisi minimal 10 karakter');
    end if;
    if char_length(v_reason) > 500 then
      perform public._fail('VALIDATION:' || v_f || 'reason:Alasan maksimal 500 karakter');
    end if;

    v_item_id := null;
    if v_op in ('ubah', 'hapus') then
      v_item_id := public._to_uuid(v_change ->> 'id');
      if v_item_id is null or not exists (select 1 from public.program_items i where i.id = v_item_id and i.program_id = v_id) then
        perform public._fail('VALIDATION:' || v_f || 'id:Item tidak ditemukan pada program ini');
      end if;
      if v_item_id = any (v_seen) then
        perform public._fail('VALIDATION:' || v_f || 'id:Item yang sama direvisi dua kali');
      end if;
      v_seen := v_seen || v_item_id;
    end if;

    if v_op = 'hapus' then
      v_before := public._item_snapshot(v_item_id);
      delete from public.program_items where id = v_item_id;
      perform public._item_history(v_id, v_item_id, v_prog.division_id, 'finance', 'hapus', v_before, null, v_reason);
      v_uraian := v_before ->> 'uraian';

    elsif v_op = 'ubah' then
      select coalesce(array_agg(item_category_id) filter (where item_category_id is not null), '{}')
        into v_cats from public.program_items where id = v_item_id;
      v_row := public._parse_item(v_change -> 'item', v_f, true, v_cats);
      if v_row is null then
        perform public._fail('VALIDATION:' || v_f || 'uraian:Isi item wajib dilengkapi');
      end if;
      v_before := public._item_snapshot(v_item_id);
      update public.program_items
         set uraian           = v_row ->> 'uraian',
             item_category_id = (v_row ->> 'item_category_id')::smallint,
             qty              = (v_row ->> 'qty')::numeric,
             satuan           = v_row ->> 'satuan',
             harga_satuan     = (v_row ->> 'harga_satuan')::bigint,
             catatan          = v_row ->> 'catatan'
       where id = v_item_id;
      v_after := public._item_snapshot(v_item_id);
      if v_before = v_after then
        perform public._fail('VALIDATION:' || v_f || 'item:Item ini belum diubah');
      end if;
      perform public._item_history(v_id, v_item_id, v_prog.division_id, 'finance', 'ubah', v_before, v_after, v_reason);
      v_uraian := v_after ->> 'uraian';

    else
      v_row := public._parse_item(v_change -> 'item', v_f, true, '{}');
      if v_row is null then
        perform public._fail('VALIDATION:' || v_f || 'uraian:Isi item wajib dilengkapi');
      end if;
      perform public._renumber_items(v_id);
      select count(*) into v_count from public.program_items where program_id = v_id;
      if v_count >= 200 then
        perform public._fail('VALIDATION:changes:Maksimal 200 baris per program');
      end if;
      insert into public.program_items (program_id, urutan, uraian, item_category_id, qty, satuan, harga_satuan, catatan)
      values (v_id, v_count + 1, v_row ->> 'uraian', (v_row ->> 'item_category_id')::smallint,
              (v_row ->> 'qty')::numeric, v_row ->> 'satuan', (v_row ->> 'harga_satuan')::bigint, v_row ->> 'catatan')
      returning id into v_item_id;
      v_after := public._item_snapshot(v_item_id);
      perform public._item_history(v_id, v_item_id, v_prog.division_id, 'finance', 'tambah', null, v_after, v_reason);
      v_uraian := v_after ->> 'uraian';
    end if;

    v_notes := v_notes || (v_uraian || ': ' || v_reason);
  end loop;

  perform public._renumber_items(v_id);

  select count(*), coalesce(sum(subtotal), 0) into v_count, v_total from public.program_items where program_id = v_id;
  if v_count = 0 then
    perform public._fail('VALIDATION:changes:Program harus punya minimal satu item. Hapus programnya bila memang dibatalkan');
  end if;
  if v_total > 1000000000000000 then
    perform public._fail('VALIDATION:changes:Total program terlalu besar (maksimal Rp1.000 triliun)');
  end if;

  update public.programs set updated_at = clock_timestamp(), updated_by_name = 'Finance' where id = v_id;

  v_new := public._program_json(v_id);
  perform public._audit('finance', v_prog.division_id, null, 'revise', 'program', v_id::text, v_old, v_new, array_to_string(v_notes, ' | '));
  perform public._notify('division', v_prog.division_id, v_prog.division_id, v_id, v_prog.nama_program, 'revisi_finance', jsonb_array_length(p_changes), false);

  return v_new;
end;
$$;


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
               'item_count', (select count(*) from public.program_items i where i.program_id = p.id),
               'revised_by_finance', exists (select 1 from public.program_item_history h where h.program_id = p.id and h.actor_role = 'finance')
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
  -- PIN harus unik: tidak boleh sama dengan PIN divisi lain atau PIN Finance (D-38)
  if exists (select 1 from public._pin_owners(p_new_pin) o
             where o.kind = 'finance' or o.division_id is distinct from d.id) then
    perform public._fail('VALIDATION:pin:PIN ini sudah dipakai divisi lain atau Finance. Pilih PIN lain.');
  end if;

  update public.divisions
     set pin_hash = public._pin_hash(p_new_pin),
         pin_updated_at = now()
   where id = d.id;
  delete from public.sessions where division_id = d.id;

  perform public._audit('finance', d.id, s.actor_name, 'pin_reset', 'division', d.id::text,
                        jsonb_build_object('pin_updated_at', d.pin_updated_at),
                        jsonb_build_object('pin_updated_at', now()), null);
  return jsonb_build_object('ok', true, 'pin_updated_at', now());
end;
$$;

-- Ganti PIN Finance (6 digit, D-38; PIN lama boleh 6-8 digit). Sesi Finance lain dicabut.
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
    perform public._fail('VALIDATION:old_pin:PIN Finance lama salah');
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then
    perform public._fail('VALIDATION:new_pin:PIN Finance baru harus 6 digit angka');
  end if;
  if p_new_pin = p_old_pin then
    perform public._fail('VALIDATION:new_pin:PIN Finance baru harus berbeda dari yang lama');
  end if;
  if exists (select 1 from public._pin_owners(p_new_pin) o where o.kind = 'division') then
    perform public._fail('VALIDATION:new_pin:PIN ini sudah dipakai salah satu divisi. Pilih PIN lain.');
  end if;

  update public.app_settings
     set value = public._pin_hash(p_new_pin), updated_at = now()
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
