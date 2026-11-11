-- =====================================================================
-- 05_overview.sql  -  Agregasi Overview (divisi dan Finance)
-- Jalankan setelah 04. Aman dijalankan ulang.
-- Hanya program berstatus "diajukan" yang dihitung; draft dihitung terpisah (A-03).
-- Seri sama besar diurutkan konsisten: total desc, lalu bulan/nama/id naik (O-07).
-- =====================================================================

-- Program berstatus "diajukan" dalam cakupan (null = semua divisi) beserta total masing-masing
create or replace function public._ov_programs(p_division_id smallint)
returns table (id uuid, division_id smallint, nama_program text, program_category_id smallint,
               periode_bulan smallint, total numeric)
language sql
stable
set search_path = public, extensions
as $$
  select p.id, p.division_id, p.nama_program, p.program_category_id, p.periode_bulan,
         coalesce((select sum(i.subtotal) from public.program_items i where i.program_id = p.id), 0)::numeric
  from public.programs p
  where p.status = 'diajukan'
    and (p_division_id is null or p.division_id = p_division_id);
$$;

create or replace function public._overview(p_division_id smallint, p_top int)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_total  numeric;
  v_count  int;
  v_drafts int;
  v_result jsonb;
begin
  select coalesce(sum(o.total), 0), count(*) into v_total, v_count from public._ov_programs(p_division_id) o;
  select count(*) into v_drafts from public.programs p
   where p.status = 'draft' and (p_division_id is null or p.division_id = p_division_id);

  v_result := jsonb_build_object(
    'total', v_total,
    'program_count', v_count,
    'average', case when v_count > 0 then round(v_total / v_count) else 0 end,
    'draft_count', v_drafts,

    'per_bulan', (
      select jsonb_agg(jsonb_build_object(
               'bulan', m.b,
               'count', coalesce(x.cnt, 0),
               'total', coalesce(x.tot, 0),
               'pct', case when v_total > 0 then round(coalesce(x.tot, 0) * 100 / v_total, 1) else 0 end
             ) order by m.b)
      from generate_series(1, 12) m(b)
      left join (select periode_bulan, count(*) cnt, sum(total) tot from public._ov_programs(p_division_id) group by periode_bulan) x
        on x.periode_bulan = m.b
    ),

    'per_kuartal', (
      select jsonb_agg(jsonb_build_object(
               'kuartal', q.k,
               'count', coalesce(x.cnt, 0),
               'total', coalesce(x.tot, 0),
               'pct', case when v_total > 0 then round(coalesce(x.tot, 0) * 100 / v_total, 1) else 0 end
             ) order by q.k)
      from generate_series(1, 4) q(k)
      left join (select ((periode_bulan - 1) / 3) + 1 as k, count(*) cnt, sum(total) tot
                 from public._ov_programs(p_division_id) group by 1) x on x.k = q.k
    ),

    'per_kategori_program', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'count', x.cnt, 'total', x.tot,
               'pct', case when v_total > 0 then round(x.tot * 100 / v_total, 1) else 0 end
             ) order by x.tot desc, x.name, x.id)
      from (select pc.id, pc.name, count(*) cnt, sum(o.total) tot
            from public._ov_programs(p_division_id) o join public.program_categories pc on pc.id = o.program_category_id
            group by pc.id, pc.name) x
    ), '[]'::jsonb),

    'per_kategori_baris', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'item_count', x.cnt, 'total', x.tot,
               'pct', case when v_total > 0 then round(x.tot * 100 / v_total, 1) else 0 end
             ) order by x.tot desc, x.name, x.id)
      from (select ic.id, ic.name, count(*) cnt, sum(i.subtotal) tot
            from public._ov_programs(p_division_id) o
            join public.program_items i on i.program_id = o.id
            join public.item_categories ic on ic.id = i.item_category_id
            group by ic.id, ic.name) x
    ), '[]'::jsonb),

    'top_programs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'nama_program', x.nama_program, 'periode_bulan', x.periode_bulan,
               'division_code', x.code, 'division_name', x.dname, 'total', x.total,
               'pct', case when v_total > 0 then round(x.total * 100 / v_total, 1) else 0 end
             ) order by x.total desc, lower(x.nama_program), x.id)
      from (select o.*, d.code, d.name as dname
            from public._ov_programs(p_division_id) o join public.divisions d on d.id = o.division_id
            order by o.total desc, lower(o.nama_program), o.id
            limit p_top) x
    ), '[]'::jsonb)
  );

  -- Kartu "terbesar" (null bila belum ada data diajukan)
  v_result := v_result || jsonb_build_object(
    'top_month', case when v_count = 0 then null else (
      select jsonb_build_object('bulan', periode_bulan, 'total', tot, 'count', cnt)
      from (select periode_bulan, sum(total) tot, count(*) cnt from public._ov_programs(p_division_id) group by periode_bulan) x
      order by tot desc, periode_bulan limit 1) end,
    'top_program_category', case when v_count = 0 then null else v_result -> 'per_kategori_program' -> 0 end,
    'top_item_category', case when jsonb_array_length(v_result -> 'per_kategori_baris') = 0 then null
                              else v_result -> 'per_kategori_baris' -> 0 end,
    'top_program', case when v_count = 0 then null else v_result -> 'top_programs' -> 0 end
  );

  return v_result;
end;
$$;

-- Overview satu divisi (sesi divisi = miliknya; sesi finance = divisi pilihan)
create or replace function public.rpc_overview_division(p_token text, p_division_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s     public.sessions := public._require_session(p_token);
  v_div smallint := public._division_context(s, p_division_code);
begin
  return public._overview(v_div, 5) || jsonb_build_object(
    'division', (select jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name)
                 from public.divisions d where d.id = v_div),
    'read_only', s.role = 'finance');
end;
$$;

-- Isi Overview Finance (pembantu internal; dipakai rpc_f_overview dan tests/sql/reconcile.sql)
-- Konsisten dengan total: divisi nonaktif yang masih punya program diajukan tetap ditampilkan,
-- supaya jumlah per divisi = jumlah per grup = total keseluruhan.
create or replace function public._overview_finance()
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_base  jsonb := public._overview(null, 10);
  v_total numeric := (v_base ->> 'total')::numeric;
begin
  return v_base || jsonb_build_object(
    'per_divisi', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'code', x.code, 'name', x.name, 'group_name', x.gname,
               'count', x.cnt, 'draft_count', x.drafts, 'total', x.tot,
               'pct', case when v_total > 0 then round(x.tot * 100 / v_total, 1) else 0 end
             ) order by x.gsort, x.dsort, x.name)
      from (
        select d.id, d.code, d.name, g.name gname, g.sort_order gsort, d.sort_order dsort,
               (select count(*) from public.programs p where p.division_id = d.id and p.status = 'diajukan') cnt,
               (select count(*) from public.programs p where p.division_id = d.id and p.status = 'draft') drafts,
               coalesce((select sum(i.subtotal) from public.programs p join public.program_items i on i.program_id = p.id
                         where p.division_id = d.id and p.status = 'diajukan'), 0) tot
        from public.divisions d join public.division_groups g on g.id = d.group_id
        where d.is_active or exists (select 1 from public.programs p where p.division_id = d.id)
      ) x
    ), '[]'::jsonb),
    'per_grup', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.name, 'division_count', x.dcount, 'count', x.cnt, 'total', x.tot,
               'pct', case when v_total > 0 then round(x.tot * 100 / v_total, 1) else 0 end
             ) order by x.sort_order, x.name)
      from (
        select g.name, g.sort_order,
               (select count(*) from public.divisions d where d.group_id = g.id and d.is_active) dcount,
               (select count(*) from public.programs p join public.divisions d on d.id = p.division_id
                 where d.group_id = g.id and p.status = 'diajukan') cnt,
               coalesce((select sum(i.subtotal) from public.programs p
                          join public.divisions d on d.id = p.division_id
                          join public.program_items i on i.program_id = p.id
                         where d.group_id = g.id and p.status = 'diajukan'), 0) tot
        from public.division_groups g
      ) x
      where x.dcount > 0 or x.cnt > 0
    ), '[]'::jsonb),
    'belum_mengisi', coalesce((
      select jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name,
               'draft_count', (select count(*) from public.programs p where p.division_id = d.id and p.status = 'draft'))
             order by d.sort_order, d.name)
      from public.divisions d
      where d.is_active
        and not exists (select 1 from public.programs p where p.division_id = d.id and p.status = 'diajukan')
    ), '[]'::jsonb),
    'division_count', (select count(*) from public.divisions where is_active)
  );
end;
$$;

-- Overview seluruh perusahaan untuk Finance
create or replace function public.rpc_f_overview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
begin
  return public._overview_finance();
end;
$$;

-- Rincian untuk pop-up Overview Finance (D-42). Hanya membaca; hanya program Diajukan (dasar yang sama dengan angka Overview).
-- Dibuka sekali saat pop-up pertama diklik, sehingga halaman Overview tetap ringan.
create or replace function public.rpc_f_overview_detail(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions := public._require_session(p_token, 'finance');
begin
  return jsonb_build_object(
    'programs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id,
               'division_code', d.code, 'division_name', d.name, 'group_name', g.name,
               'nama_program', o.nama_program,
               'program_category_id', o.program_category_id, 'program_category_name', pc.name,
               'periode_bulan', o.periode_bulan,
               'pic_nama', p.pic_nama,
               'tanggal_pengajuan', p.tanggal_pengajuan,
               'total', o.total
             ) order by o.total desc, lower(o.nama_program), o.id)
      from public._ov_programs(null::smallint) o
      join public.programs p on p.id = o.id
      join public.divisions d on d.id = o.division_id
      join public.division_groups g on g.id = d.group_id
      join public.program_categories pc on pc.id = o.program_category_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'program_id', i.program_id,
               'urutan', i.urutan,
               'uraian', i.uraian,
               'item_category_id', i.item_category_id, 'item_category_name', ic.name,
               'qty', i.qty,
               'satuan', i.satuan,
               'harga_satuan', i.harga_satuan,
               'subtotal', i.subtotal,
               'catatan', i.catatan
             ) order by i.subtotal desc, i.program_id, i.urutan)
      from public._ov_programs(null::smallint) o
      join public.program_items i on i.program_id = o.id
      left join public.item_categories ic on ic.id = i.item_category_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Izin: hanya fungsi rpc_*; pembantu (_overview, _ov_programs, _overview_finance) tetap tertutup
revoke all on function public._overview(smallint, int) from public, anon, authenticated;
revoke all on function public._ov_programs(smallint) from public, anon, authenticated;
revoke all on function public._overview_finance() from public, anon, authenticated;
revoke all on function public.rpc_overview_division(text, text) from public, anon, authenticated;
revoke all on function public.rpc_f_overview(text) from public, anon, authenticated;
grant execute on function public.rpc_overview_division(text, text) to anon;
grant execute on function public.rpc_f_overview(text) to anon;
revoke all on function public.rpc_f_overview_detail(text) from public, anon, authenticated;
grant execute on function public.rpc_f_overview_detail(text) to anon;
