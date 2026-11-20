-- =====================================================================
-- 05c_rab_saran.sql  -  RAB Gabungan tahap 2 (D-53): SARAN OTOMATIS dari kata khas yang sama di nama program.
--
-- Jalankan setelah 05b_rab_gabungan.sql. Aman dijalankan ulang. Hanya MENAMBAH 1 tabel kecil + fungsi baru;
-- tabel program, angka Dashboard, dan fungsi tahap 1 tidak diubah.
--
-- Cara kerja (D-53):
--  1. Nama program dirapikan: huruf besar/kecil sama, tanda baca dibuang, huruf-angka yang menempel dipisah.
--  2. Kata umum dibuang (angka/tahun, bulan, kata pengajuan seperti "pengajuan/program/event/training",
--     kata generik seperti "baru/rutin/tahunan/tim/hari", kata sambung, "Center") dan kata < 3 huruf.
--  3. Salah ketik ringan digabung (kemiripan trigram >= 0,5 untuk kata >= 5 huruf, mis. Seragam/Seragamm).
--  4. Kata yang muncul di > 25% semua program DAN minimal 10 program dianggap umum.
--  5. Saran A (RAB Gabungan baru), dari program yang belum masuk gabungan mana pun:
--       a) Nama sama: >= 2 program dengan kumpulan kata khas yang IDENTIK (mis. Seragam Januari/Februari).
--       b) Kata paling khas: sisa program dikelompokkan per kata, mulai dari kata yang paling jarang (mis. JAKIM).
--     Satu program hanya muncul di satu saran.
--  6. Saran B (tambahan untuk gabungan yang ada): program yang belum masuk gabungan mana pun, kata khasnya ada di
--     NAMA gabungan atau dimiliki sebagian besar (>= setengah) anggotanya, dan belum pernah dikeluarkan/ditolak.
--  7. Saran HANYA dibaca; program tidak pernah masuk sendiri. Dihitung setiap kali diminta (tanpa proses latar belakang).
-- =====================================================================

-- Saran A yang diabaikan Finance (kunci = kata khas saran itu, diurutkan, dipisah spasi)
create table if not exists public.consolidation_dismissed (
  signature    text primary key check (char_length(signature) between 3 and 300),
  label        text not null check (char_length(label) between 1 and 200),
  dismissed_at timestamptz not null default now()
);
alter table public.consolidation_dismissed enable row level security;
revoke all on public.consolidation_dismissed from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Pembantu internal
-- ---------------------------------------------------------------------

-- Kata khas sebuah nama, urut sesuai posisi (word = huruf kecil, raw = tulisan asli, pos = urutan)
create or replace function public._rab_tokens(p_name text)
returns table (word text, raw text, pos bigint)
language sql
immutable
set search_path = public, extensions
as $$
  select lower(x.t), x.t, x.n
  from regexp_split_to_table(
         regexp_replace(regexp_replace(coalesce(p_name, ''), '([[:alpha:]])([[:digit:]])', '\1 \2', 'g'),
                        '([[:digit:]])([[:alpha:]])', '\1 \2', 'g'),
         '[^[:alnum:]]+') with ordinality as x(t, n)
  where char_length(x.t) >= 3
    and x.t !~ '^[[:digit:]]+$'
    and lower(x.t) <> all (array[
      -- bulan
      'januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember',
      'jan','feb','mar','apr','jun','jul','agu','agt','aug','sep','sept','okt','oct','nov','des','dec',
      -- kata pengajuan
      'pengajuan','program','kegiatan','acara','event','training','pelatihan','batch','tahap',
      -- kata generik
      'baru','rutin','bulanan','tahunan','mingguan','harian','berkala','semester','semua','umum','lain','lainnya',
      'kecil','besar','tim','hari','kerja','sama','kantor','internal','eksternal','operasional','pengadaan',
      'perlengkapan','perpanjangan','layanan','biaya','kebutuhan',
      -- kata sambung & nama perusahaan
      'dan','untuk','dengan','yang','the','and','for','center']);
$$;

-- Dua kata dianggap sama (termasuk salah ketik ringan)
create or replace function public._rab_similar(a text, b text)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select a = b or (least(char_length(a), char_length(b)) >= 5 and extensions.similarity(a, b) >= 0.5);
$$;

-- Satu program dalam bentuk JSON untuk daftar saran
create or replace function public._rab_prog_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', p.id, 'division_code', d.code, 'division_name', d.name, 'nama_program', p.nama_program,
    'program_category_name', pc.name, 'periode_bulan', p.periode_bulan, 'pic_nama', p.pic_nama, 'status', p.status,
    'total', coalesce((select sum(i.subtotal) from public.program_items i where i.program_id = p.id), 0))
  from public.programs p
  join public.divisions d on d.id = p.division_id
  join public.program_categories pc on pc.id = p.program_category_id
  where p.id = p_id;
$$;

-- Kata khas yang dimiliki SEMUA program p_ids (p_all_ids/p_all_keys = daftar calon dan kata khasnya, dipisah spasi)
create or replace function public._rab_common_keys(p_ids uuid[], p_all_ids uuid[], p_all_keys text[])
returns text[]
language sql
immutable
set search_path = public, extensions
as $$
  select coalesce(array_agg(x.k order by x.k), '{}')
  from (select k.k
        from unnest(p_all_ids, p_all_keys) u(id, ks), unnest(string_to_array(u.ks, ' ')) k(k)
        where u.id = any (p_ids)
        group by k.k
        having count(distinct u.id) = cardinality(p_ids)) x;
$$;

-- Semua saran saat ini (hanya membaca data)
create or replace function public._rab_suggest()
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_n       int := (select count(*) from public.programs);
  v_year    text := coalesce((select value from public.app_settings where key = 'tahun_anggaran'), '');
  v_map     jsonb := '{}'::jsonb;   -- kata -> kata kanonik
  v_canon   text[] := '{}';
  v_common  text[];                 -- kata kanonik yang terlalu umum
  v_freq    jsonb;                  -- kata kanonik -> jumlah program
  v_c       text;
  r         record;
  v_ids     uuid[];                 -- program calon saran A
  v_keys    text[];                 -- kata khas tiap program (dipisah spasi, urut abjad)
  v_used    uuid[] := '{}';
  v_grp     uuid[];
  v_sub     uuid[];
  v_inter   text[];
  v_strong  text[];                 -- kata yang ditulis HURUF BESAR (singkatan/nama khusus)
  r2        record;
  v_clusters jsonb := '[]'::jsonb;  -- [{ids:[..], keys:[..]}]
  v_b       jsonb;
  v_res     jsonb;
begin
  -- 1) Kata kanonik: kata yang lebih sering muncul menjadi wakil kata yang mirip (salah ketik ringan)
  for r in
    select w.word, sum(w.f) as f
    from (select t.word, count(distinct p.id) f
          from public.programs p cross join lateral public._rab_tokens(p.nama_program) t group by t.word
          union all
          select t.word, 0 from public.consolidation_groups g cross join lateral public._rab_tokens(g.name) t) w
    group by w.word
    order by sum(w.f) desc, w.word
  loop
    v_c := null;
    select u.c into v_c from unnest(v_canon) with ordinality u(c, o) where public._rab_similar(r.word, u.c) order by u.o limit 1;
    if v_c is null then
      v_canon := v_canon || r.word;
      v_c := r.word;
    end if;
    v_map := v_map || jsonb_build_object(r.word, v_c);
  end loop;

  -- 2) Frekuensi kata kanonik & kata yang terlalu umum
  select coalesce(jsonb_object_agg(x.k, x.f), '{}'::jsonb),
         coalesce(array_agg(x.k) filter (where x.f > greatest(10, v_n * 0.25)), '{}')
    into v_freq, v_common
  from (select v_map ->> t.word as k, count(distinct p.id) f
        from public.programs p cross join lateral public._rab_tokens(p.nama_program) t group by 1) x;

  -- 3) Saran B: tambahan untuk gabungan yang ada (kata dari nama gabungan atau milik >= setengah anggota)
  with
  pk as (select distinct p.id, v_map ->> t.word as k
         from public.programs p cross join lateral public._rab_tokens(p.nama_program) t
         where not ((v_map ->> t.word) = any (v_common))),
  gsize as (select group_id, count(*) n from public.consolidation_members group by group_id),
  gk as (select g.id gid, v_map ->> t.word k
         from public.consolidation_groups g cross join lateral public._rab_tokens(g.name) t
         where not ((v_map ->> t.word) = any (v_common))
         union
         select m.group_id, pk.k from public.consolidation_members m join pk on pk.id = m.program_id
         group by m.group_id, pk.k
         having count(distinct m.program_id) * 2 >= (select n from gsize where gsize.group_id = m.group_id)),
  cand as (select gk.gid, pk.id pid, array_agg(distinct pk.k order by pk.k) ks
           from pk join gk on gk.k = pk.k
           where not exists (select 1 from public.consolidation_members m where m.program_id = pk.id)
             and not exists (select 1 from public.consolidation_exclusions e where e.group_id = gk.gid and e.program_id = pk.id)
           group by gk.gid, pk.id)
  select coalesce(jsonb_agg(jsonb_build_object('gid', c.gid, 'pid', c.pid, 'ks', to_jsonb(c.ks))), '[]'::jsonb)
    into v_b from cand c;

  -- 4) Calon saran A: belum masuk gabungan mana pun dan bukan calon saran B
  select array_agg(x.id order by x.id), array_agg(x.ks order by x.id)
    into v_ids, v_keys
  from (select p.id, string_agg(distinct v_map ->> t.word, ' ' order by v_map ->> t.word) ks
        from public.programs p cross join lateral public._rab_tokens(p.nama_program) t
        where not ((v_map ->> t.word) = any (v_common))
          and not exists (select 1 from public.consolidation_members m where m.program_id = p.id)
          and not exists (select 1 from jsonb_array_elements(v_b) b where (b ->> 'pid')::uuid = p.id)
        group by p.id) x;

  if v_ids is not null then
    -- 4a) Nama sama: kumpulan kata khas identik
    for r in
      select u.ks, array_agg(u.id order by u.id) ids
      from unnest(v_ids, v_keys) u(id, ks)
      group by u.ks
      having count(*) >= 2
      order by count(*) desc, u.ks
    loop
      if not exists (select 1 from public.consolidation_dismissed d where d.signature = r.ks) then
        v_clusters := v_clusters || jsonb_build_array(jsonb_build_object('ids', to_jsonb(r.ids), 'keys', to_jsonb(string_to_array(r.ks, ' '))));
        v_used := v_used || r.ids;
      end if;
    end loop;

    -- 4b) Kata paling khas lebih dulu (paling jarang muncul), dari sisa program. Kelompok hanya disarankan bila
    --     programnya berbagi >= 2 kata khas, ATAU kata itu ditulis HURUF BESAR (singkatan/nama khusus, mis. JAKIM).
    select coalesce(array_agg(x.k), '{}') into v_strong
    from (select v_map ->> t.word as k
          from public.programs p cross join lateral public._rab_tokens(p.nama_program) t
          group by 1
          having count(*) filter (where t.raw = upper(t.raw) and t.raw ~ '[[:alpha:]]') * 2 > count(*)) x;
    for r in
      select distinct k.k, coalesce((v_freq ->> k.k)::int, 0) f
      from unnest(v_keys) ks, unnest(string_to_array(ks, ' ')) k(k)
      order by 2, 1
    loop
      select array_agg(u.id order by u.id) into v_grp
      from unnest(v_ids, v_keys) u(id, ks)
      where not (u.id = any (v_used)) and r.k = any (string_to_array(u.ks, ' '));
      continue when coalesce(cardinality(v_grp), 0) < 2;
      v_inter := public._rab_common_keys(v_grp, v_ids, v_keys);
      if r.k = any (v_strong) or cardinality(v_inter) >= 2 then
        if not exists (select 1 from public.consolidation_dismissed d where d.signature = array_to_string(v_inter, ' ')) then
          v_clusters := v_clusters || jsonb_build_array(jsonb_build_object('ids', to_jsonb(v_grp), 'keys', to_jsonb(v_inter)));
          v_used := v_used || v_grp;
        end if;
      else
        -- Kata ini sendirian terlalu umum: cari pasangan kata kedua (yang paling jarang lebih dulu)
        for r2 in
          select distinct k2.k, coalesce((v_freq ->> k2.k)::int, 0) f
          from unnest(v_ids, v_keys) u(id, ks), unnest(string_to_array(u.ks, ' ')) k2(k)
          where u.id = any (v_grp) and k2.k <> r.k
          order by 2, 1
        loop
          select array_agg(u.id order by u.id) into v_sub
          from unnest(v_ids, v_keys) u(id, ks)
          where u.id = any (v_grp) and not (u.id = any (v_used)) and r2.k = any (string_to_array(u.ks, ' '));
          continue when coalesce(cardinality(v_sub), 0) < 2;
          v_inter := public._rab_common_keys(v_sub, v_ids, v_keys);
          if not exists (select 1 from public.consolidation_dismissed d where d.signature = array_to_string(v_inter, ' ')) then
            v_clusters := v_clusters || jsonb_build_array(jsonb_build_object('ids', to_jsonb(v_sub), 'keys', to_jsonb(v_inter)));
            v_used := v_used || v_sub;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  -- 5) Susun hasil
  with
  disp as (select v_map ->> t.word as k,
                  case when count(*) filter (where t.raw = upper(t.raw)) * 2 > count(*)
                       then upper(v_map ->> t.word) else upper(left(v_map ->> t.word, 1)) || substr(v_map ->> t.word, 2) end as d
           from public.programs p cross join lateral public._rab_tokens(p.nama_program) t
           group by v_map ->> t.word),
  cl as (select c, ord,
                array(select jsonb_array_elements_text(c -> 'ids'))::uuid[] as ids,
                array(select jsonb_array_elements_text(c -> 'keys')) as ks
         from jsonb_array_elements(v_clusters) with ordinality x(c, ord)),
  fresh as (
    select cl.ord, cl.ks,
           -- kata ditampilkan seperti tulisan aslinya, urut sesuai nama program pertama (bulan paling awal)
           (select array_agg(case when w.raw = upper(w.raw) then w.raw else upper(left(w.raw, 1)) || substr(w.raw, 2) end order by w.pos)
              from (select distinct on (v_map ->> t.word) t.raw, t.pos
                    from public.programs p cross join lateral public._rab_tokens(p.nama_program) t
                    where p.id = (select p0.id from public.programs p0 where p0.id = any (cl.ids)
                                  order by p0.periode_bulan, lower(p0.nama_program), p0.id limit 1)
                      and (v_map ->> t.word) = any (cl.ks)
                    order by v_map ->> t.word, t.pos) w) as words,
           cardinality(cl.ids) as n,
           (select coalesce(sum(i.subtotal), 0) from public.programs p join public.program_items i on i.program_id = p.id
             where p.id = any (cl.ids) and p.status = 'diajukan') as total,
           (select count(distinct p.division_id) from public.programs p where p.id = any (cl.ids)) as divs,
           (select jsonb_agg(public._rab_prog_json(x.id) order by d2.sort_order, p2.periode_bulan, lower(p2.nama_program), x.id)
              from unnest(cl.ids) x(id) join public.programs p2 on p2.id = x.id join public.divisions d2 on d2.id = p2.division_id) as programs
    from cl),
  b_rows as (select (b ->> 'gid')::bigint gid, (b ->> 'pid')::uuid pid,
                    array(select jsonb_array_elements_text(b -> 'ks')) ks
             from jsonb_array_elements(v_b) b),
  b_json as (
    select b.gid, count(*) n,
           jsonb_agg(public._rab_prog_json(b.pid) || jsonb_build_object('why',
             (select jsonb_agg(coalesce(d.d, k2) order by k2) from unnest(b.ks) k2 left join disp d on d.k = k2))
           order by p.periode_bulan, lower(p.nama_program), b.pid) as programs
    from b_rows b join public.programs p on p.id = b.pid
    group by b.gid)
  select jsonb_build_object(
    'fresh', coalesce((select jsonb_agg(jsonb_build_object(
                 'signature', array_to_string(f.ks, ' '),
                 'words', to_jsonb(f.words),
                 'name', array_to_string(f.words, ' ') || case when v_year <> '' then ' ' || v_year else '' end,
                 'program_count', f.n, 'division_count', f.divs, 'total', f.total, 'programs', f.programs)
               order by f.n desc, f.total desc, f.ord) from fresh f), '[]'::jsonb),
    'for_group', coalesce((select jsonb_agg(jsonb_build_object('group_id', g.id, 'group_name', g.name, 'programs', b.programs)
               order by lower(g.name), g.id) from b_json b join public.consolidation_groups g on g.id = b.gid), '[]'::jsonb),
    'count', (select count(*) from fresh) + coalesce((select sum(n) from b_json), 0),
    'dismissed', coalesce((select jsonb_agg(jsonb_build_object('signature', d.signature, 'label', d.label, 'dismissed_at', d.dismissed_at)
               order by d.dismissed_at desc, d.signature) from public.consolidation_dismissed d), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- Tandai catatan Log transaksi ini sebagai hasil saran otomatis
create or replace function public._rab_tag_via_saran(p_group_id bigint)
returns void
language sql
set search_path = public, extensions
as $$
  update public.audit_log set new_data = coalesce(new_data, '{}'::jsonb) || jsonb_build_object('via', 'saran otomatis')
  where entity_type = 'consolidation' and entity_id = p_group_id::text and occurred_at = now()
    and action in ('consolidation_create', 'consolidation_add');
$$;

-- ---------------------------------------------------------------------
-- RPC (hanya Finance)
-- ---------------------------------------------------------------------

create or replace function public.rpc_f_rab_suggestions(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
begin
  return public._rab_suggest();
end;
$$;

-- Jumlah saran (angka oranye di menu)
create or replace function public.rpc_f_rab_suggest_count(p_token text)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
begin
  return (public._rab_suggest() ->> 'count')::int;
end;
$$;

-- Terima saran A: buat RAB Gabungan + masukkan program sekaligus (satu transaksi: gagal satu, batal semua)
create or replace function public.rpc_f_rab_create_from_suggestion(p_token text, p_name text, p_note text, p_program_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s    public.sessions := public._require_session(p_token, 'finance');
  v_g  jsonb;
  v_id bigint;
begin
  if p_program_ids is null or jsonb_typeof(p_program_ids) <> 'array' or jsonb_array_length(p_program_ids) = 0 then
    perform public._fail('VALIDATION:programs:Pilih minimal satu program');
  end if;
  v_g := public.rpc_f_rab_save(p_token, null, p_name, p_note);
  v_id := (v_g ->> 'id')::bigint;
  perform public.rpc_f_rab_add(p_token, v_id, p_program_ids);
  perform public._rab_tag_via_saran(v_id);
  return v_g;
end;
$$;

-- Terima saran B: tambahkan program ke gabungan yang sudah ada
create or replace function public.rpc_f_rab_add_suggested(p_token text, p_group_id bigint, p_program_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s     public.sessions := public._require_session(p_token, 'finance');
  v_res jsonb;
begin
  v_res := public.rpc_f_rab_add(p_token, p_group_id, p_program_ids);
  perform public._rab_tag_via_saran(p_group_id);
  return v_res;
end;
$$;

-- Tolak saran B: program dicatat "bukan bagian gabungan ini" (tidak disarankan lagi untuk gabungan itu)
create or replace function public.rpc_f_rab_reject(p_token text, p_group_id bigint, p_program_id text)
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
  select * into v_prog from public.programs where id = v_pid;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;
  if exists (select 1 from public.consolidation_members where program_id = v_pid and group_id = p_group_id) then
    perform public._fail('VALIDATION:program:Program sudah ada di gabungan ini. Gunakan "Keluarkan".');
  end if;
  insert into public.consolidation_exclusions (group_id, program_id) values (p_group_id, v_pid)
  on conflict (group_id, program_id) do update set excluded_at = now();
  perform public._audit('finance', v_prog.division_id, s.actor_name, 'consolidation_reject', 'consolidation', p_group_id::text,
    jsonb_build_object('group_id', p_group_id, 'group_name', v_group.name, 'program_id', v_pid,
                       'nama_program', v_prog.nama_program, 'periode_bulan', v_prog.periode_bulan, 'status', v_prog.status),
    null, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Abaikan saran A. p_signature = kunci saran (dari rpc_f_rab_suggestions), p_label = nama saran untuk ditampilkan.
create or replace function public.rpc_f_rab_dismiss(p_token text, p_signature text, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s     public.sessions := public._require_session(p_token, 'finance');
  v_sig text := lower(btrim(coalesce(p_signature, '')));
  v_lbl text := btrim(coalesce(p_label, ''));
begin
  if char_length(v_sig) not between 3 and 300 or v_sig !~ '^[[:alnum:]]+( [[:alnum:]]+)*$' then
    perform public._fail('VALIDATION:signature:Saran tidak valid');
  end if;
  if char_length(v_lbl) = 0 then v_lbl := v_sig; end if;
  v_lbl := left(v_lbl, 200);
  insert into public.consolidation_dismissed (signature, label) values (v_sig, v_lbl)
  on conflict (signature) do update set label = excluded.label, dismissed_at = now();
  perform public._audit('finance', null, s.actor_name, 'consolidation_dismiss', 'consolidation', null, null,
                        jsonb_build_object('signature', v_sig, 'label', v_lbl), null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Kembalikan saran yang diabaikan
create or replace function public.rpc_f_rab_undismiss(p_token text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s     public.sessions := public._require_session(p_token, 'finance');
  v_sig text := lower(btrim(coalesce(p_signature, '')));
  v_lbl text;
begin
  delete from public.consolidation_dismissed where signature = v_sig returning label into v_lbl;
  if not found then
    perform public._fail('NOT_FOUND');
  end if;
  perform public._audit('finance', null, s.actor_name, 'consolidation_undismiss', 'consolidation', null, null,
                        jsonb_build_object('signature', v_sig, 'label', v_lbl), null);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Izin: hanya rpc_f_rab_*; pembantu (_rab_*) tertutup. 04_security.sql memasang ulang izin ini bila dijalankan lagi.
-- ---------------------------------------------------------------------
revoke all on function public._rab_tokens(text) from public, anon, authenticated;
revoke all on function public._rab_similar(text, text) from public, anon, authenticated;
revoke all on function public._rab_prog_json(uuid) from public, anon, authenticated;
revoke all on function public._rab_common_keys(uuid[], uuid[], text[]) from public, anon, authenticated;
revoke all on function public._rab_suggest() from public, anon, authenticated;
revoke all on function public._rab_tag_via_saran(bigint) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_suggestions(text) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_suggest_count(text) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_create_from_suggestion(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_add_suggested(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_reject(text, bigint, text) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_dismiss(text, text, text) from public, anon, authenticated;
revoke all on function public.rpc_f_rab_undismiss(text, text) from public, anon, authenticated;
grant execute on function public.rpc_f_rab_suggestions(text) to anon;
grant execute on function public.rpc_f_rab_suggest_count(text) to anon;
grant execute on function public.rpc_f_rab_create_from_suggestion(text, text, text, jsonb) to anon;
grant execute on function public.rpc_f_rab_add_suggested(text, bigint, jsonb) to anon;
grant execute on function public.rpc_f_rab_reject(text, bigint, text) to anon;
grant execute on function public.rpc_f_rab_dismiss(text, text, text) to anon;
grant execute on function public.rpc_f_rab_undismiss(text, text) to anon;

notify pgrst, 'reload schema';
