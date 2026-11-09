-- =====================================================================
-- tests/sql/reconcile.sql  -  AUDIT ANGKA (rekonsiliasi). HANYA MEMBACA, tidak mengubah data.
-- Aman dijalankan di DEV maupun PROD (Supabase SQL Editor: tempel seluruh isi -> Run).
--
-- Menghitung ulang semua angka langsung dari data mentah (qty x harga per baris, dibulatkan
-- dengan rumus terpisah floor(x + 0,5)), lalu membandingkannya dengan angka yang dipakai aplikasi:
-- subtotal, total program, Overview tiap divisi, Overview Finance, persen, kartu ringkasan, top
-- program, dan export. Hasil: satu tabel; kolom "hasil" harus "COCOK" di semua baris.
-- =====================================================================

with
it as (            -- setiap baris kebutuhan + hitungan ulang independen
  select i.id, i.program_id, i.item_category_id, i.subtotal,
         case when i.qty is null or i.harga_satuan is null then 0
              else floor(i.qty * i.harga_satuan + 0.5) end as calc
  from public.program_items i
),
pr as (            -- setiap program + total hitungan ulang
  select p.id, p.division_id, p.status, p.periode_bulan, p.program_category_id, p.nama_program,
         d.group_id,
         coalesce((select sum(it.calc) from it where it.program_id = p.id), 0) as total
  from public.programs p join public.divisions d on d.id = p.division_id
),
ok as (select * from pr where status = 'diajukan'),           -- hanya Diajukan yang dihitung (A-03)
okit as (select it.*, ok.division_id, ok.group_id from it join ok on ok.id = it.program_id),
dv as (select d.id, public._overview(d.id, 5) as j from public.divisions d where d.is_active),
fin as (select public._overview_finance() as j),
dvb as (select dv.id, b from dv cross join jsonb_array_elements(dv.j -> 'per_bulan') b),
dvq as (select dv.id, q from dv cross join jsonb_array_elements(dv.j -> 'per_kuartal') q),
dvc as (select dv.id, c from dv cross join jsonb_array_elements(dv.j -> 'per_kategori_program') c),
dvi as (select dv.id, c from dv cross join jsonb_array_elements(dv.j -> 'per_kategori_baris') c),
dvt as (select dv.id, t, n from dv cross join jsonb_array_elements(dv.j -> 'top_programs') with ordinality as x(t, n)),
fj as (select j from fin),
fb as (select b from fj cross join jsonb_array_elements(fj.j -> 'per_bulan') b),
fq as (select q from fj cross join jsonb_array_elements(fj.j -> 'per_kuartal') q),
fc as (select c from fj cross join jsonb_array_elements(fj.j -> 'per_kategori_program') c),
fi as (select c from fj cross join jsonb_array_elements(fj.j -> 'per_kategori_baris') c),
fd as (select d from fj cross join jsonb_array_elements(fj.j -> 'per_divisi') d),
fg as (select g from fj cross join jsonb_array_elements(fj.j -> 'per_grup') g),
ft as (select t, n from fj cross join jsonb_array_elements(fj.j -> 'top_programs') with ordinality as x(t, n)),
gt as (select coalesce(sum(total), 0) as total, count(*) as cnt from ok),
ex_all as (select public._export_rows('all') as j),
ex_ok as (select public._export_rows('diajukan') as j),
checks (urut, cek, diperiksa, selisih) as (
  -- ---------- Per baris & per program (form / detail / daftar) ----------
  select 1, 'Subtotal setiap baris = qty x harga (dibulatkan ke rupiah)', count(*), count(*) filter (where subtotal <> calc) from it
  union all
  select 2, 'Total setiap program (form, detail, daftar program)', count(*),
         count(*) filter (where (public._program_json(id) ->> 'total')::numeric <> total) from pr

  -- ---------- Overview tiap divisi ----------
  union all
  select 3, 'Overview divisi: total setahun', count(*),
         count(*) filter (where (j ->> 'total')::numeric <> coalesce((select sum(total) from ok where ok.division_id = dv.id), 0)) from dv
  union all
  select 4, 'Overview divisi: jumlah program diajukan & jumlah draft', count(*),
         count(*) filter (where (j ->> 'program_count')::int <> (select count(*) from ok where ok.division_id = dv.id)
                             or (j ->> 'draft_count')::int <> (select count(*) from pr where pr.division_id = dv.id and pr.status = 'draft')) from dv
  union all
  select 5, 'Overview divisi: rata-rata per program', count(*),
         count(*) filter (where (j ->> 'average')::numeric <> coalesce((select round(sum(total) / count(*)) from ok where ok.division_id = dv.id), 0)) from dv
  union all
  select 6, 'Overview divisi: per bulan (total & jumlah program, 12 bulan tiap divisi)', count(*),
         count(*) filter (where (b ->> 'total')::numeric <> coalesce((select sum(total) from ok where ok.division_id = dvb.id and ok.periode_bulan = (b ->> 'bulan')::int), 0)
                             or (b ->> 'count')::int <> (select count(*) from ok where ok.division_id = dvb.id and ok.periode_bulan = (b ->> 'bulan')::int))
         + abs(count(*) - 12 * (select count(*) from dv)) from dvb
  union all
  select 7, 'Overview divisi: per kuartal (Q1=Jan-Mar ... Q4=Okt-Des)', count(*),
         count(*) filter (where (q ->> 'total')::numeric <> coalesce((select sum(total) from ok where ok.division_id = dvq.id and (ok.periode_bulan - 1) / 3 + 1 = (q ->> 'kuartal')::int), 0)
                             or (q ->> 'count')::int <> (select count(*) from ok where ok.division_id = dvq.id and (ok.periode_bulan - 1) / 3 + 1 = (q ->> 'kuartal')::int))
         + abs(count(*) - 4 * (select count(*) from dv)) from dvq
  union all
  select 8, 'Overview divisi: per kategori program (nilai & kelengkapan)', count(*),
         count(*) filter (where (c ->> 'total')::numeric <> (select sum(total) from ok where ok.division_id = dvc.id and ok.program_category_id = (c ->> 'id')::int)
                             or (c ->> 'count')::int <> (select count(*) from ok where ok.division_id = dvc.id and ok.program_category_id = (c ->> 'id')::int))
         + abs(count(*) - (select count(*) from (select distinct division_id, program_category_id from ok where division_id in (select id from dv)) x)) from dvc
  union all
  select 9, 'Overview divisi: per kategori kebutuhan (nilai & kelengkapan)', count(*),
         count(*) filter (where (c ->> 'total')::numeric <> (select sum(calc) from okit where okit.division_id = dvi.id and okit.item_category_id = (c ->> 'id')::int)
                             or (c ->> 'item_count')::int <> (select count(*) from okit where okit.division_id = dvi.id and okit.item_category_id = (c ->> 'id')::int))
         + abs(count(*) - (select count(*) from (select distinct division_id, item_category_id from okit where item_category_id is not null and division_id in (select id from dv)) x)) from dvi
  union all
  select 10, 'Overview divisi: persen (%) per bulan/kuartal/kategori = nilai / total x 100', count(*),
         count(*) filter (where pct <> case when tot > 0 then round(val * 100 / tot, 1) else 0 end) from (
           select (b ->> 'pct')::numeric pct, (b ->> 'total')::numeric val, (dv.j ->> 'total')::numeric tot from dvb join dv using (id)
           union all select (q ->> 'pct')::numeric, (q ->> 'total')::numeric, (dv.j ->> 'total')::numeric from dvq join dv using (id)
           union all select (c ->> 'pct')::numeric, (c ->> 'total')::numeric, (dv.j ->> 'total')::numeric from dvc join dv using (id)
           union all select (c ->> 'pct')::numeric, (c ->> 'total')::numeric, (dv.j ->> 'total')::numeric from dvi join dv using (id)) x
  union all
  select 11, 'Overview divisi: kartu bulan/kategori/program terbesar', count(*),
         count(*) filter (where (j ->> 'program_count')::int > 0 and (
              (j -> 'top_month' ->> 'total')::numeric <> (select max(t) from (select sum(total) t from ok where ok.division_id = dv.id group by periode_bulan) x)
           or (j -> 'top_month' ->> 'bulan')::int <> (select periode_bulan from ok where ok.division_id = dv.id group by periode_bulan order by sum(total) desc, periode_bulan limit 1)
           or (j -> 'top_program_category' ->> 'total')::numeric <> (select max(t) from (select sum(total) t from ok where ok.division_id = dv.id group by program_category_id) x)
           or (j -> 'top_item_category' ->> 'total')::numeric <> (select max(t) from (select sum(calc) t from okit where okit.division_id = dv.id group by item_category_id) x)
           or (j -> 'top_program' ->> 'total')::numeric <> (select max(total) from ok where ok.division_id = dv.id))) from dv
  union all
  select 12, 'Overview divisi: Top 5 program = 5 program terbesar (urut)', count(*),
         count(*) filter (where (t ->> 'total')::numeric <> (select total from ok where ok.division_id = dvt.id order by total desc, lower(nama_program), id offset n - 1 limit 1)) from dvt
  union all
  select 13, 'Overview divisi: konsistensi bulan = kuartal = kategori program = kategori kebutuhan = total', count(*),
         count(*) filter (where (j ->> 'total')::numeric not in (select x from (values
              ((select coalesce(sum((e ->> 'total')::numeric), 0) from jsonb_array_elements(j -> 'per_bulan') e)),
              ((select coalesce(sum((e ->> 'total')::numeric), 0) from jsonb_array_elements(j -> 'per_kuartal') e)),
              ((select coalesce(sum((e ->> 'total')::numeric), 0) from jsonb_array_elements(j -> 'per_kategori_program') e)),
              ((select coalesce(sum((e ->> 'total')::numeric), 0) from jsonb_array_elements(j -> 'per_kategori_baris') e))) v(x)
            group by x having count(*) = 4)) from dv

  -- ---------- Overview Finance (seluruh divisi) ----------
  union all
  select 20, 'Overview Finance: total setahun, jumlah program, draft, rata-rata', 1,
         case when (j ->> 'total')::numeric = (select total from gt)
               and (j ->> 'program_count')::int = (select cnt from gt)
               and (j ->> 'draft_count')::int = (select count(*) from pr where status = 'draft')
               and (j ->> 'average')::numeric = (select case when cnt > 0 then round(total / cnt) else 0 end from gt)
              then 0 else 1 end from fj
  union all
  select 21, 'Overview Finance: per bulan', count(*),
         count(*) filter (where (b ->> 'total')::numeric <> coalesce((select sum(total) from ok where ok.periode_bulan = (b ->> 'bulan')::int), 0)
                             or (b ->> 'count')::int <> (select count(*) from ok where ok.periode_bulan = (b ->> 'bulan')::int)) + abs(count(*) - 12) from fb
  union all
  select 22, 'Overview Finance: per kuartal', count(*),
         count(*) filter (where (q ->> 'total')::numeric <> coalesce((select sum(total) from ok where (ok.periode_bulan - 1) / 3 + 1 = (q ->> 'kuartal')::int), 0)) + abs(count(*) - 4) from fq
  union all
  select 23, 'Overview Finance: per kategori program', count(*),
         count(*) filter (where (c ->> 'total')::numeric <> (select sum(total) from ok where ok.program_category_id = (c ->> 'id')::int)
                             or (c ->> 'count')::int <> (select count(*) from ok where ok.program_category_id = (c ->> 'id')::int))
         + abs(count(*) - (select count(distinct program_category_id) from ok)) from fc
  union all
  select 24, 'Overview Finance: per kategori kebutuhan', count(*),
         count(*) filter (where (c ->> 'total')::numeric <> (select sum(calc) from okit where okit.item_category_id = (c ->> 'id')::int)
                             or (c ->> 'item_count')::int <> (select count(*) from okit where okit.item_category_id = (c ->> 'id')::int))
         + abs(count(*) - (select count(distinct item_category_id) from okit)) from fi
  union all
  select 25, 'Overview Finance: per divisi (total, program, draft)', count(*),
         count(*) filter (where (d ->> 'total')::numeric <> coalesce((select sum(total) from ok where ok.division_id = (d ->> 'id')::int), 0)
                             or (d ->> 'count')::int <> (select count(*) from ok where ok.division_id = (d ->> 'id')::int)
                             or (d ->> 'draft_count')::int <> (select count(*) from pr where pr.division_id = (d ->> 'id')::int and pr.status = 'draft'))
         + abs(count(*) - (select count(*) from public.divisions dd where dd.is_active or exists (select 1 from public.programs p where p.division_id = dd.id))) from fd
  union all
  select 26, 'Overview Finance: per grup (rollup divisi)', count(*),
         count(*) filter (where (g ->> 'total')::numeric <> coalesce((select sum(ok.total) from ok join public.division_groups dg on dg.id = ok.group_id where dg.name = g ->> 'name'), 0)
                             or (g ->> 'count')::int <> (select count(*) from ok join public.division_groups dg on dg.id = ok.group_id where dg.name = g ->> 'name')) from fg
  union all
  select 27, 'Overview Finance: persen per divisi/grup/bulan/kuartal/kategori', count(*),
         count(*) filter (where pct <> case when (select total from gt) > 0 then round(val * 100 / (select total from gt), 1) else 0 end) from (
           select (d ->> 'pct')::numeric pct, (d ->> 'total')::numeric val from fd
           union all select (g ->> 'pct')::numeric, (g ->> 'total')::numeric from fg
           union all select (b ->> 'pct')::numeric, (b ->> 'total')::numeric from fb
           union all select (q ->> 'pct')::numeric, (q ->> 'total')::numeric from fq
           union all select (c ->> 'pct')::numeric, (c ->> 'total')::numeric from fc
           union all select (c ->> 'pct')::numeric, (c ->> 'total')::numeric from fi) x
  union all
  select 28, 'Overview Finance: jumlah per divisi = per grup = per bulan = per kuartal = kategori = total', 1,
         case when (select count(distinct x) from (values
                    ((select sum((d ->> 'total')::numeric) from fd)), ((select sum((g ->> 'total')::numeric) from fg)),
                    ((select sum((b ->> 'total')::numeric) from fb)), ((select sum((q ->> 'total')::numeric) from fq)),
                    ((select coalesce(sum((c ->> 'total')::numeric), 0) from fc)), ((select coalesce(sum((c ->> 'total')::numeric), 0) from fi)),
                    ((select total from gt))) v(x)) = 1 then 0 else 1 end
  union all
  select 29, 'Overview Finance: kartu bulan/kategori/program terbesar', 1,
         case when (select cnt from gt) = 0
               or ((j -> 'top_month' ->> 'total')::numeric = (select max(t) from (select sum(total) t from ok group by periode_bulan) x)
                   and (j -> 'top_month' ->> 'bulan')::int = (select periode_bulan from ok group by periode_bulan order by sum(total) desc, periode_bulan limit 1)
                   and (j -> 'top_program_category' ->> 'total')::numeric = (select max(t) from (select sum(total) t from ok group by program_category_id) x)
                   and (j -> 'top_item_category' ->> 'total')::numeric = (select max(t) from (select sum(calc) t from okit group by item_category_id) x)
                   and (j -> 'top_program' ->> 'total')::numeric = (select max(total) from ok))
              then 0 else 1 end from fj
  union all
  select 30, 'Overview Finance: Top 10 program = 10 program terbesar (urut)', count(*),
         count(*) filter (where (t ->> 'total')::numeric <> (select total from ok order by total desc, lower(nama_program), id offset n - 1 limit 1))
         + abs(count(*) - least(10, (select cnt from gt))) from ft
  union all
  select 31, 'Overview Finance: status pengisian (divisi belum mengisi)', 1,
         case when (select coalesce(jsonb_agg(e ->> 'code' order by e ->> 'code'), '[]') from jsonb_array_elements(j -> 'belum_mengisi') e)
                 = (select coalesce(jsonb_agg(d.code order by d.code), '[]') from public.divisions d
                    where d.is_active and not exists (select 1 from ok where ok.division_id = d.id))
              then 0 else 1 end from fj

  -- ---------- Export ----------
  union all
  select 40, 'Export (semua): jumlah baris & total subtotal = data mentah', 1,
         case when jsonb_array_length(j) = (select count(*) from it) + (select count(*) from pr where not exists (select 1 from it where it.program_id = pr.id))
               and (select coalesce(sum((e ->> 'subtotal')::numeric), 0) from jsonb_array_elements(j) e) = (select coalesce(sum(calc), 0) from it)
              then 0 else 1 end from ex_all
  union all
  select 41, 'Export (hanya Diajukan): total subtotal = total Overview Finance', 1,
         case when (select coalesce(sum((e ->> 'subtotal')::numeric), 0) from jsonb_array_elements(j) e) = (select total from gt)
              then 0 else 1 end from ex_ok
)
select urut as no, cek, diperiksa, selisih,
       case when selisih = 0 then 'COCOK' else 'ADA SELISIH' end as hasil
from checks
union all
select 99, 'RINGKASAN: total diajukan ' || to_char((select total from gt), 'FM999G999G999G999G990') || ' dari '
           || (select cnt from gt) || ' program; draft tidak dihitung: ' || (select count(*) from pr where status = 'draft'),
       (select sum(diperiksa) from checks), (select sum(selisih) from checks),
       case when (select sum(selisih) from checks) = 0 then 'SEMUA COCOK' else 'ADA SELISIH' end
order by 1;
