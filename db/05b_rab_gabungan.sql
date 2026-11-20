-- =====================================================================
-- 05b_rab_gabungan.sql  -  RAB Gabungan (D-52, tahap 1): Finance mengelompokkan program dari satu
-- atau beberapa divisi menjadi satu RAB kegiatan (mis. "JAKIM 2027").
--
-- Jalankan setelah 05_overview.sql. Aman dijalankan ulang (create if not exists / create or replace).
-- Hanya MENAMBAH tabel & fungsi baru. Tabel program, angka Dashboard, dan fungsi lama tidak diubah.
--
-- Aturan (D-52):
--  * Satu program paling banyak di SATU RAB Gabungan.
--  * Total gabungan = jumlah subtotal program anggota berstatus Diajukan (draft ditampilkan, tidak dihitung),
--    selalu dihitung langsung dari data terbaru (tidak disalin).
--  * "Keluarkan" hanya melepas program dari gabungan (program tidak dihapus) dan dicatat sebagai
--    "bukan bagian gabungan ini". Menghapus RAB Gabungan hanya menghapus kelompoknya.
--  * Program yang dihapus divisi/Finance otomatis keluar dari gabungan dan tercatat di Log.
--  * Hanya Finance. Semua aksi tercatat di Log (audit_log, entity_type 'consolidation').
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------
create table if not exists public.consolidation_groups (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(btrim(name)) between 3 and 80),
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists consolidation_groups_name_uq on public.consolidation_groups (lower(btrim(name)));

-- program_id sebagai primary key = satu program hanya boleh di satu RAB Gabungan
create table if not exists public.consolidation_members (
  program_id uuid primary key references public.programs(id) on delete cascade,
  group_id   bigint not null references public.consolidation_groups(id) on delete cascade,
  added_at   timestamptz not null default now()
);
create index if not exists consolidation_members_group_idx on public.consolidation_members (group_id);

-- Program yang dikeluarkan Finance dari sebuah gabungan ("bukan bagian gabungan ini")
create table if not exists public.consolidation_exclusions (
  group_id    bigint not null references public.consolidation_groups(id) on delete cascade,
  program_id  uuid not null references public.programs(id) on delete cascade,
  excluded_at timestamptz not null default now(),
  primary key (group_id, program_id)
);
create index if not exists consolidation_exclusions_program_idx on public.consolidation_exclusions (program_id);

-- Tertutup untuk browser (sama seperti tabel lain): RLS aktif tanpa policy + semua hak dicabut
alter table public.consolidation_groups enable row level security;
alter table public.consolidation_members enable row level security;
alter table public.consolidation_exclusions enable row level security;
revoke all on public.consolidation_groups, public.consolidation_members, public.consolidation_exclusions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Pembantu internal
-- ---------------------------------------------------------------------

-- Program anggota satu gabungan + total masing-masing (semua status)
create or replace function public._rab_programs(p_group_id bigint)
returns table (id uuid, division_id smallint, division_code text, division_name text, division_sort smallint,
               nama_program text, program_category_name text, periode_bulan smallint, pic_nama text,
               status text, tanggal_pengajuan date, total numeric, item_count int)
language sql
stable
set search_path = public, extensions
as $$
  select p.id, d.id, d.code, d.name, d.sort_order, p.nama_program, pc.name, p.periode_bulan, p.pic_nama,
         p.status, p.tanggal_pengajuan,
         coalesce((select sum(i.subtotal) from public.program_items i where i.program_id = p.id), 0)::numeric,
         (select count(*)::int from public.program_items i where i.program_id = p.id)
  from public.consolidation_members m
  join public.programs p on p.id = m.program_id
  join public.divisions d on d.id = p.division_id
  join public.program_categories pc on pc.id = p.program_category_id
  where m.group_id = p_group_id;
$$;

-- Ringkasan satu gabungan (dipakai daftar & detail, dan tests/sql/reconcile_rab.sql)
create or replace function public._rab_summary(p_group_id bigint)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'note', g.note, 'created_at', g.created_at, 'updated_at', g.updated_at,
    'member_count', (select count(*) from public._rab_programs(g.id)),
    'program_count', (select count(*) from public._rab_programs(g.id) r where r.status = 'diajukan'),
    'draft_count', (select count(*) from public._rab_programs(g.id) r where r.status = 'draft'),
    'total', (select coalesce(sum(r.total), 0) from public._rab_programs(g.id) r where r.status = 'diajukan'),
    'divisions', coalesce((select jsonb_agg(x.division_name order by x.division_sort, x.division_name)
                           from (select distinct r.division_name, r.division_sort from public._rab_programs(g.id) r) x), '[]'::jsonb),
    'month_min', (select min(r.periode_bulan) from public._rab_programs(g.id) r),
    'month_max', (select max(r.periode_bulan) from public._rab_programs(g.id) r),
    'months', coalesce((select jsonb_agg(distinct r.periode_bulan order by r.periode_bulan) from public._rab_programs(g.id) r), '[]'::jsonb)
  )
  from public.consolidation_groups g
  where g.id = p_group_id;
$$;

-- Validasi nama & catatan; mengembalikan nama yang sudah dirapikan
create or replace function public._rab_clean_name(p_name text, p_except_id bigint)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v) < 3 then
    perform public._fail('VALIDATION:name:Nama RAB Gabungan minimal 3 karakter');
  end if;
  if char_length(v) > 80 then
    perform public._fail('VALIDATION:name:Nama RAB Gabungan maksimal 80 karakter');
  end if;
  if exists (select 1 from public.consolidation_groups g
             where lower(btrim(g.name)) = lower(v) and (p_except_id is null or g.id <> p_except_id)) then
    perform public._fail('VALIDATION:name:Nama sudah dipakai RAB Gabungan lain');
  end if;
  return v;
end;
$$;

-- Log otomatis bila program anggota dihapus (oleh divisi/Finance/skrip): program keluar dari gabungan.
create or replace function public._rab_program_deleted()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_group public.consolidation_groups;
begin
  select g.* into v_group
  from public.consolidation_members m join public.consolidation_groups g on g.id = m.group_id
  where m.program_id = old.id;
  if found then
    insert into public.audit_log (actor_role, division_id, actor_name, action, entity_type, entity_id, old_data, new_data, reason)
    values ('system', old.division_id, null, 'consolidation_remove', 'consolidation', v_group.id::text,
            jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'program_id', old.id,
                               'nama_program', old.nama_program, 'periode_bulan', old.periode_bulan, 'status', old.status),
            null, 'Program dihapus, otomatis keluar dari RAB Gabungan');
  end if;
  return old;
end;
$$;

drop trigger if exists programs_rab_deleted on public.programs;
create trigger programs_rab_deleted
  before delete on public.programs
  for each row execute function public._rab_program_deleted();

-- ---------------------------------------------------------------------
-- RPC (hanya Finance)
-- ---------------------------------------------------------------------

-- Daftar RAB Gabungan + ringkasan keseluruhan
create or replace function public.rpc_f_rab_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
  v_groups jsonb;
begin
  select coalesce(jsonb_agg(public._rab_summary(g.id) order by lower(g.name), g.id), '[]'::jsonb)
    into v_groups from public.consolidation_groups g;
  return jsonb_build_object(
    'groups', v_groups,
    'total', (select coalesce(sum((x ->> 'total')::numeric), 0) from jsonb_array_elements(v_groups) x),
    'member_count', (select count(*) from public.consolidation_members),
    'all_program_count', (select count(*) from public.programs)
  );
end;
$$;

-- Detail satu RAB Gabungan. p_export = true mencatat export di Log (tombol Unduh Excel).
create or replace function public.rpc_f_rab_detail(p_token text, p_group_id bigint, p_export boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s       public.sessions := public._require_session(p_token, 'finance');
  v_sum   jsonb := public._rab_summary(p_group_id);
  v_total numeric;
  v_res   jsonb;
begin
  if v_sum is null then
    perform public._fail('NOT_FOUND');
  end if;
  v_total := (v_sum ->> 'total')::numeric;

  v_res := v_sum || jsonb_build_object(
    'programs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'division_code', r.division_code, 'division_name', r.division_name,
               'nama_program', r.nama_program, 'program_category_name', r.program_category_name,
               'periode_bulan', r.periode_bulan, 'pic_nama', r.pic_nama, 'status', r.status,
               'tanggal_pengajuan', r.tanggal_pengajuan, 'total', r.total, 'item_count', r.item_count
             ) order by r.division_sort, r.division_name, (r.status = 'draft'), r.total desc, lower(r.nama_program), r.id)
      from public._rab_programs(p_group_id) r), '[]'::jsonb),
    'per_divisi', coalesce((
      select jsonb_agg(jsonb_build_object(
               'division_code', x.division_code, 'division_name', x.division_name,
               'count', x.cnt, 'draft_count', x.drafts, 'total', x.tot,
               'pct', case when v_total > 0 then round(x.tot * 100 / v_total, 1) else 0 end
             ) order by x.tot desc, x.division_sort, x.division_name)
      from (select r.division_code, r.division_name, r.division_sort,
                   count(*) filter (where r.status = 'diajukan') cnt,
                   count(*) filter (where r.status = 'draft') drafts,
                   coalesce(sum(r.total) filter (where r.status = 'diajukan'), 0) tot
            from public._rab_programs(p_group_id) r
            group by r.division_code, r.division_name, r.division_sort) x), '[]'::jsonb),
    'per_kategori_baris', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.name, 'item_count', x.cnt, 'total', x.tot,
               'pct', case when v_total > 0 then round(x.tot * 100 / v_total, 1) else 0 end
             ) order by x.tot desc, x.name)
      from (select coalesce(ic.name, '(tanpa kategori)') as name, count(*) cnt, sum(i.subtotal) tot
            from public._rab_programs(p_group_id) r
            join public.program_items i on i.program_id = r.id
            left join public.item_categories ic on ic.id = i.item_category_id
            where r.status = 'diajukan'
            group by 1) x), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'program_id', i.program_id, 'urutan', i.urutan, 'uraian', i.uraian,
               'item_category_name', ic.name, 'qty', i.qty, 'satuan', i.satuan,
               'harga_satuan', i.harga_satuan, 'subtotal', i.subtotal, 'catatan', i.catatan
             ) order by r.division_sort, lower(r.nama_program), r.id, i.urutan)
      from public._rab_programs(p_group_id) r
      join public.program_items i on i.program_id = r.id
      left join public.item_categories ic on ic.id = i.item_category_id), '[]'::jsonb),
    'excluded', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'division_name', d.name, 'nama_program', p.nama_program,
               'periode_bulan', p.periode_bulan, 'status', p.status,
               'total', coalesce((select sum(i.subtotal) from public.program_items i where i.program_id = p.id), 0),
               'other_group', (select jsonb_build_object('id', g2.id, 'name', g2.name)
                               from public.consolidation_members m2 join public.consolidation_groups g2 on g2.id = m2.group_id
                               where m2.program_id = p.id)
             ) order by e.excluded_at desc, p.id)
      from public.consolidation_exclusions e
      join public.programs p on p.id = e.program_id
      join public.divisions d on d.id = p.division_id
      where e.group_id = p_group_id), '[]'::jsonb)
  );

  if coalesce(p_export, false) then
    perform public._audit('finance', null, s.actor_name, 'export', 'consolidation', p_group_id::text, null,
      jsonb_build_object('group_name', v_sum ->> 'name', 'program_count', jsonb_array_length(v_res -> 'programs'),
                         'row_count', jsonb_array_length(v_res -> 'items'), 'total', v_total), null);
  end if;
  return v_res;
end;
$$;

-- Buat (p_group_id null) atau ubah nama/catatan
create or replace function public.rpc_f_rab_save(p_token text, p_group_id bigint, p_name text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s      public.sessions := public._require_session(p_token, 'finance');
  v_name text;
  v_note text := nullif(regexp_replace(btrim(coalesce(p_note, '')), '\s+', ' ', 'g'), '');
  v_old  public.consolidation_groups;
  v_id   bigint;
begin
  if v_note is not null and char_length(v_note) > 200 then
    perform public._fail('VALIDATION:note:Catatan maksimal 200 karakter');
  end if;

  if p_group_id is null then
    v_name := public._rab_clean_name(p_name, null);
    begin
      insert into public.consolidation_groups (name, note) values (v_name, v_note) returning id into v_id;
    exception when unique_violation then
      perform public._fail('VALIDATION:name:Nama sudah dipakai RAB Gabungan lain');
    end;
    perform public._audit('finance', null, s.actor_name, 'consolidation_create', 'consolidation', v_id::text, null,
                          jsonb_build_object('group_id', v_id, 'group_name', v_name, 'note', v_note), null);
  else
    select * into v_old from public.consolidation_groups where id = p_group_id for update;
    if not found then
      perform public._fail('NOT_FOUND');
    end if;
    v_name := public._rab_clean_name(p_name, p_group_id);
    v_id := p_group_id;
    if v_old.name is distinct from v_name or v_old.note is distinct from v_note then
      begin
        update public.consolidation_groups set name = v_name, note = v_note, updated_at = now() where id = p_group_id;
      exception when unique_violation then
        perform public._fail('VALIDATION:name:Nama sudah dipakai RAB Gabungan lain');
      end;
      perform public._audit('finance', null, s.actor_name, 'consolidation_update', 'consolidation', v_id::text,
                            jsonb_build_object('group_id', v_id, 'group_name', v_old.name, 'note', v_old.note),
                            jsonb_build_object('group_id', v_id, 'group_name', v_name, 'note', v_note), null);
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'name', v_name, 'note', v_note);
end;
$$;

-- Hapus RAB Gabungan (kelompoknya saja; program tetap utuh)
create or replace function public.rpc_f_rab_delete(p_token text, p_group_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s     public.sessions := public._require_session(p_token, 'finance');
  v_sum jsonb;
begin
  perform 1 from public.consolidation_groups where id = p_group_id for update;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;
  v_sum := public._rab_summary(p_group_id);
  perform public._audit('finance', null, s.actor_name, 'consolidation_delete', 'consolidation', p_group_id::text,
    jsonb_build_object('group_id', p_group_id, 'group_name', v_sum ->> 'name', 'note', v_sum ->> 'note',
                       'program_count', (v_sum ->> 'member_count')::int, 'total', (v_sum ->> 'total')::numeric,
                       'programs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'nama_program', r.nama_program, 'division_name', r.division_name) order by r.division_sort, lower(r.nama_program))
                                             from public._rab_programs(p_group_id) r), '[]'::jsonb)),
    null, null);
  delete from public.consolidation_groups where id = p_group_id;   -- anggota & daftar "dikeluarkan" ikut terhapus
  return jsonb_build_object('ok', true);
end;
$$;

-- Tambah program ke RAB Gabungan (juga dipakai "Masukkan lagi"). p_program_ids = array JSON berisi id program.
create or replace function public.rpc_f_rab_add(p_token text, p_group_id bigint, p_program_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s       public.sessions := public._require_session(p_token, 'finance');
  v_group public.consolidation_groups;
  v_ids   uuid[];
  v_n     int;
  v_conf  text;
  v_added jsonb;
begin
  select * into v_group from public.consolidation_groups where id = p_group_id for update;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;
  if p_program_ids is null or jsonb_typeof(p_program_ids) <> 'array' or jsonb_array_length(p_program_ids) = 0 then
    perform public._fail('VALIDATION:programs:Pilih minimal satu program');
  end if;
  if jsonb_array_length(p_program_ids) > 500 then
    perform public._fail('VALIDATION:programs:Maksimal 500 program sekali tambah');
  end if;

  select array_agg(distinct public._to_uuid(x)), count(*) filter (where public._to_uuid(x) is null)
    into v_ids, v_n
  from jsonb_array_elements_text(p_program_ids) x;
  if v_n > 0 or exists (select 1 from unnest(v_ids) u where not exists (select 1 from public.programs p where p.id = u)) then
    perform public._fail('VALIDATION:programs:Ada program yang tidak ditemukan (mungkin sudah dihapus). Muat ulang daftar.');
  end if;

  -- Satu program hanya boleh di satu RAB Gabungan
  select string_agg(format('"%s" (sudah di %s)', p.nama_program, g.name), ', ' order by lower(p.nama_program))
    into v_conf
  from public.consolidation_members m
  join public.consolidation_groups g on g.id = m.group_id
  join public.programs p on p.id = m.program_id
  where m.program_id = any (v_ids) and m.group_id <> p_group_id;
  if v_conf is not null then
    perform public._fail('VALIDATION:programs:Program sudah masuk RAB Gabungan lain: ' || v_conf);
  end if;

  with ins as (
    insert into public.consolidation_members (program_id, group_id)
    select u, p_group_id from unnest(v_ids) u
    on conflict (program_id) do nothing
    returning program_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nama_program', p.nama_program, 'division_name', d.name,
                                               'periode_bulan', p.periode_bulan, 'status', p.status) order by lower(p.nama_program)), '[]'::jsonb)
    into v_added
  from ins join public.programs p on p.id = ins.program_id join public.divisions d on d.id = p.division_id;

  delete from public.consolidation_exclusions where group_id = p_group_id and program_id = any (v_ids);

  if jsonb_array_length(v_added) > 0 then
    update public.consolidation_groups set updated_at = now() where id = p_group_id;
    perform public._audit('finance', null, s.actor_name, 'consolidation_add', 'consolidation', p_group_id::text, null,
                          jsonb_build_object('group_id', p_group_id, 'group_name', v_group.name, 'programs', v_added), null);
  end if;
  return jsonb_build_object('ok', true, 'added', jsonb_array_length(v_added));
end;
$$;

-- Keluarkan satu program dari RAB Gabungan (program TIDAK dihapus)
create or replace function public.rpc_f_rab_remove(p_token text, p_group_id bigint, p_program_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s       public.sessions := public._require_session(p_token, 'finance');
  v_pid   uuid := public._to_uuid(p_program_id);
  v_group public.consolidation_groups;
  v_prog  public.programs;
begin
  select * into v_group from public.consolidation_groups where id = p_group_id for update;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;
  select p.* into v_prog from public.consolidation_members m join public.programs p on p.id = m.program_id
  where m.program_id = v_pid and m.group_id = p_group_id;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;

  delete from public.consolidation_members where program_id = v_pid and group_id = p_group_id;
  insert into public.consolidation_exclusions (group_id, program_id) values (p_group_id, v_pid)
  on conflict (group_id, program_id) do update set excluded_at = now();
  update public.consolidation_groups set updated_at = now() where id = p_group_id;

  perform public._audit('finance', v_prog.division_id, s.actor_name, 'consolidation_remove', 'consolidation', p_group_id::text,
    jsonb_build_object('group_id', p_group_id, 'group_name', v_group.name, 'program_id', v_pid,
                       'nama_program', v_prog.nama_program, 'periode_bulan', v_prog.periode_bulan, 'status', v_prog.status),
    null, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Semua program yang BELUM ada di gabungan ini (isi pop-up "+ Tambah program")
create or replace function public.rpc_f_rab_candidates(p_token text, p_group_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
begin
  if not exists (select 1 from public.consolidation_groups where id = p_group_id) then
    perform public._fail('NOT_FOUND');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'division_code', d.code, 'division_name', d.name,
             'nama_program', p.nama_program, 'program_category_name', pc.name,
             'periode_bulan', p.periode_bulan, 'pic_nama', p.pic_nama, 'status', p.status,
             'total', coalesce((select sum(i.subtotal) from public.program_items i where i.program_id = p.id), 0),
             'other_group', (select jsonb_build_object('id', g.id, 'name', g.name)
                             from public.consolidation_members m join public.consolidation_groups g on g.id = m.group_id
                             where m.program_id = p.id),
             'excluded', exists (select 1 from public.consolidation_exclusions e where e.group_id = p_group_id and e.program_id = p.id)
           ) order by d.sort_order, p.periode_bulan, lower(p.nama_program), p.id)
    from public.programs p
    join public.divisions d on d.id = p.division_id
    join public.program_categories pc on pc.id = p.program_category_id
    where not exists (select 1 from public.consolidation_members m where m.program_id = p.id and m.group_id = p_group_id)
  ), '[]'::jsonb);
end;
$$;

-- Peta program -> RAB Gabungan, untuk penanda "Konsolidasi" di Semua Program & detail program (Finance)
create or replace function public.rpc_f_rab_map(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
begin
  return coalesce((
    select jsonb_object_agg(m.program_id::text, jsonb_build_object('id', g.id, 'name', g.name))
    from public.consolidation_members m join public.consolidation_groups g on g.id = m.group_id
  ), '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- Izin: hanya rpc_f_rab_*; pembantu (_rab_*) tetap tertutup. 04_security.sql memasang ulang izin ini bila dijalankan lagi.
-- ---------------------------------------------------------------------
revoke all on function public._rab_programs(bigint) from public, anon, authenticated;
revoke all on function public._rab_summary(bigint) from public, anon, authenticated;
revoke all on function public._rab_clean_name(text, bigint) from public, anon, authenticated;
revoke all on function public._rab_program_deleted() from public, anon, authenticated;
revoke all on function public.rpc_f_rab_list(text) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_detail(text, bigint, boolean) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_save(text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_delete(text, bigint) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_add(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_remove(text, bigint, text) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_candidates(text, bigint) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_map(text) from public, anon, authenticated;
grant execute on function public.rpc_f_rab_list(text) to anon;
grant execute on function public.rpc_f_rab_detail(text, bigint, boolean) to anon;
grant execute on function public.rpc_f_rab_save(text, bigint, text, text) to anon;
grant execute on function public.rpc_f_rab_delete(text, bigint) to anon;
grant execute on function public.rpc_f_rab_add(text, bigint, jsonb) to anon;
grant execute on function public.rpc_f_rab_remove(text, bigint, text) to anon;
grant execute on function public.rpc_f_rab_candidates(text, bigint) to anon;
grant execute on function public.rpc_f_rab_map(text) to anon;

-- Supabase membaca daftar fungsi baru setelah perintah ini (tanpa ini, browser bisa mendapat "fungsi tidak ditemukan" beberapa menit)
notify pgrst, 'reload schema';
