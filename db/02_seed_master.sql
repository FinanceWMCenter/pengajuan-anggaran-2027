-- =====================================================================
-- 02_seed_master.sql  -  Data awal: grup, divisi, kategori, pengaturan
-- Sumber: project-docs/09_MASTER_DATA.md. Aman dijalankan ulang (tidak menggandakan data).
-- TIDAK berisi PIN apa pun. PIN diatur lewat 06_bootstrap.sql.
-- =====================================================================

-- Pengaturan
insert into public.app_settings (key, value) values
  ('tahun_anggaran',  '2027'),
  ('contact_email_1', 'finance.wmcenter@gmail.com'),
  ('contact_email_2', 'finance@wmcenter.id'),
  ('contact_wa',      '+62 852-8454-5564'),
  ('contact_wa_link', 'https://wa.me/6285284545564')
on conflict (key) do nothing;

-- Grup divisi
insert into public.division_groups (name, sort_order)
select v.name, v.sort_order
from (values
  ('Human Resource', 1),
  ('Business Development', 2),
  ('Operation', 3),
  ('Marketing', 4),
  ('Legal and Compliance', 5),
  ('Finance & Data Analyst', 6),
  ('Physiotherapist', 7),
  ('Project Expansion', 8)                 -- D-40: divisi baru, berdiri sendiri
) as v(name, sort_order)
where not exists (select 1 from public.division_groups g where g.name = v.name)
order by v.sort_order;

-- Divisi (13)
insert into public.divisions (group_id, code, name, sort_order)
select g.id, v.code, v.name, v.sort_order
from (values
  ('Human Resource',         'hr-pd',                'HR-PD',                   1),
  ('Human Resource',         'hr-eb',                'HR-EB',                   2),
  ('Human Resource',         'hr-ta',                'HR-TA',                   3),
  ('Human Resource',         'hr-ga-purchasing',     'HR-GA / Purchasing',      4),
  ('Human Resource',         'hr-ops',               'HR-OPS',                  5),
  ('Business Development',   'business-development', 'Business Development',    6),
  ('Operation',              'operation',            'Operation',               7),
  ('Marketing',              'brand-communication',  'Brand and Communication', 8),
  ('Marketing',              'creative',             'Creative',                9),
  ('Legal and Compliance',   'legal-compliance',     'Legal and Compliance',   10),
  ('Finance & Data Analyst', 'finance-data-analyst', 'Finance & Data Analyst', 11),
  ('Physiotherapist',        'physiotherapist',      'Physiotherapist',        12),
  ('Project Expansion',      'project-expansion',    'Project Expansion',      13)
) as v(group_name, code, name, sort_order)
join public.division_groups g on g.name = v.group_name
order by v.sort_order
on conflict (code) do nothing;

-- Kategori program: 2 awal dari Finance + 8 tambahan
insert into public.program_categories (name, sort_order)
select v.name, v.sort_order
from (values
  ('Event', 1),
  ('Training', 2),
  ('Rekrutmen', 3),
  ('Kampanye & Promosi', 4),
  ('Pengadaan Barang & Aset', 5),
  ('Renovasi & Pemeliharaan', 6),
  ('Pengembangan Sistem / IT', 7),
  ('Perizinan, Legal & Kepatuhan', 8),
  ('Kesejahteraan Karyawan', 9),
  ('Riset & Pengembangan Layanan', 10)
) as v(name, sort_order)
where not exists (select 1 from public.program_categories c where lower(c.name) = lower(v.name))
order by v.sort_order;

-- Kategori baris kebutuhan: 5 awal dari Finance + 8 tambahan
insert into public.item_categories (name, sort_order)
select v.name, v.sort_order
from (values
  ('Jasa', 1),
  ('Konsumsi', 2),
  ('Transport', 3),
  ('Operasional', 4),
  ('Marketing', 5),
  ('Akomodasi', 6),
  ('Honorarium / Narasumber', 7),
  ('Sewa (venue, alat)', 8),
  ('ATK & Cetak', 9),
  ('Perlengkapan & Merchandise', 10),
  ('Peralatan / Aset', 11),
  ('Perizinan & Legal', 12),
  ('Software & Langganan', 13)
) as v(name, sort_order)
where not exists (select 1 from public.item_categories c where lower(c.name) = lower(v.name))
order by v.sort_order;
