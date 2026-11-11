-- =====================================================================
-- 01_schema.sql  -  Struktur tabel Portal Pengajuan Anggaran 2027
-- Jalankan PERTAMA. Aman dijalankan ulang (memakai IF NOT EXISTS).
-- Acuan: project-docs/04_ERD.md + keputusan 10_DECISIONS_LOG.md (D-28, D-30, D-31, T-01, T-02)
-- =====================================================================

-- Ekstensi ditaruh di schema "extensions" (sama seperti Supabase).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;  -- crypt(), gen_salt(), digest(), gen_random_bytes()
create extension if not exists pg_trgm  with schema extensions;  -- similarity() untuk alert program mirip

-- ---------------------------------------------------------------------
-- Pengaturan aplikasi (tahun anggaran, hash master PIN, kontak Finance)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Grup dan divisi
-- ---------------------------------------------------------------------
create table if not exists public.division_groups (
  id         smallint generated always as identity primary key,
  name       text not null unique,
  sort_order smallint not null default 0
);

create table if not exists public.divisions (
  id             smallint generated always as identity primary key,
  group_id       smallint not null references public.division_groups(id),
  code           text not null unique check (code ~ '^[a-z0-9-]{2,40}$'),  -- slug URL, mis. 'hr-pd'
  name           text not null,
  pin_hash       text,            -- bcrypt; null = PIN belum diatur Finance
  pin_updated_at timestamptz,
  is_active      boolean not null default true,
  sort_order     smallint not null default 0
);

-- ---------------------------------------------------------------------
-- Kategori (tidak pernah dihapus/diganti nama; hanya ditambah atau dinonaktifkan - D-31)
-- ---------------------------------------------------------------------
create table if not exists public.program_categories (
  id         smallint generated always as identity primary key,
  name       text not null check (char_length(btrim(name)) between 2 and 60),
  is_active  boolean not null default true,
  sort_order smallint not null default 0
);
create unique index if not exists program_categories_name_uq on public.program_categories (lower(btrim(name)));

create table if not exists public.item_categories (
  id         smallint generated always as identity primary key,
  name       text not null check (char_length(btrim(name)) between 2 and 60),
  is_active  boolean not null default true,
  sort_order smallint not null default 0
);
create unique index if not exists item_categories_name_uq on public.item_categories (lower(btrim(name)));

-- ---------------------------------------------------------------------
-- Program (header pengajuan). 1 program = 1 bulan = 1 anggaran.
-- ---------------------------------------------------------------------
create table if not exists public.programs (
  id                  uuid primary key default gen_random_uuid(),
  division_id         smallint not null references public.divisions(id),
  nama_program        text not null check (char_length(btrim(nama_program)) between 3 and 150),
  program_category_id smallint not null references public.program_categories(id),
  periode_bulan       smallint not null check (periode_bulan between 1 and 12),
  pic_nama            text not null check (char_length(btrim(pic_nama)) between 2 and 100),
  status              text not null default 'draft' check (status in ('draft', 'diajukan')),
  tanggal_pengajuan   date,          -- diisi server saat submit PERTAMA (WIB), tidak berubah lagi
  submitted_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by_name     text,
  updated_by_name     text,
  constraint programs_status_tanggal_ck check ((status = 'diajukan') = (tanggal_pengajuan is not null))
);

-- ---------------------------------------------------------------------
-- Baris kebutuhan. Saat Draft boleh belum lengkap (T-01); Submit divalidasi penuh di fungsi.
-- ---------------------------------------------------------------------
create table if not exists public.program_items (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references public.programs(id) on delete cascade,
  urutan           smallint not null check (urutan between 1 and 200),
  uraian           text check (uraian is null or char_length(uraian) <= 200),
  item_category_id smallint references public.item_categories(id),
  qty              numeric(8,2) check (qty is null or (qty > 0 and qty <= 100000)),               -- T-02
  satuan           text check (satuan is null or char_length(satuan) <= 30),
  harga_satuan     bigint check (harga_satuan is null or (harga_satuan between 0 and 1000000000000)),
  catatan          text check (catatan is null or char_length(catatan) <= 300),
  subtotal         bigint generated always as (coalesce(round(qty * harga_satuan), 0)::bigint) stored  -- T-03
);

-- ---------------------------------------------------------------------
-- Sesi (hanya hash token yang disimpan)
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  token_hash   text primary key,     -- sha256 hex dari token
  role         text not null check (role in ('division', 'finance')),
  division_id  smallint references public.divisions(id) on delete cascade,
  actor_name   text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  constraint sessions_role_division_ck check ((role = 'division') = (division_id is not null))
);

-- Percobaan login: hanya untuk informasi (tidak ada lockout - D-28)
create table if not exists public.login_attempts (
  id           bigint generated always as identity primary key,
  scope        text not null,        -- kode divisi atau 'finance'
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);

-- Log riwayat (tidak pernah diubah/dihapus dari aplikasi)
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_role  text not null check (actor_role in ('division', 'finance', 'system')),
  division_id smallint references public.divisions(id),
  actor_name  text,
  action      text not null,   -- create, update, submit, delete, pin_reset, master_pin_change, category_change, export
  entity_type text not null,   -- program, division, category, settings, export
  entity_id   text,
  old_data    jsonb,
  new_data    jsonb,
  reason      text
);

-- ---------------------------------------------------------------------
-- Riwayat perubahan per item (D-43). Hanya ditambah, tidak pernah diubah.
-- Sengaja tanpa foreign key ke program/item: riwayat tetap ada walau itemnya dihapus.
-- ---------------------------------------------------------------------
create table if not exists public.program_item_history (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  program_id  uuid not null,
  item_id     uuid not null,
  division_id smallint not null references public.divisions(id),
  actor_role  text not null check (actor_role in ('division', 'finance')),
  change_type text not null check (change_type in ('tambah', 'ubah', 'hapus')),
  old_data    jsonb,
  new_data    jsonb,
  reason      text check (reason is null or char_length(reason) <= 500)
);

-- ---------------------------------------------------------------------
-- Notifikasi per akun (D-43): divisi tahu revisi Finance, Finance tahu perubahan divisi
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz not null default clock_timestamp(),
  recipient_role        text not null check (recipient_role in ('division', 'finance')),
  recipient_division_id smallint references public.divisions(id),
  division_id           smallint not null references public.divisions(id),  -- divisi pemilik program
  program_id            uuid,
  program_name          text not null,
  kind                  text not null check (kind in ('revisi_finance', 'ubah_divisi', 'hapus_program')),
  item_count            int not null default 0,
  info_changed          boolean not null default false,
  read_at               timestamptz,
  constraint notifications_recipient_ck check ((recipient_role = 'division') = (recipient_division_id is not null))
);

-- ---------------------------------------------------------------------
-- Indeks
-- ---------------------------------------------------------------------
create index if not exists item_history_program_idx     on public.program_item_history (program_id, occurred_at desc);
create index if not exists notifications_recipient_idx  on public.notifications (recipient_role, recipient_division_id, created_at desc);
create index if not exists programs_division_bulan_idx on public.programs (division_id, periode_bulan);
create index if not exists programs_status_idx         on public.programs (status);
create index if not exists programs_nama_trgm_idx      on public.programs using gin (lower(nama_program) extensions.gin_trgm_ops);
create index if not exists program_items_program_idx   on public.program_items (program_id);
create index if not exists audit_log_occurred_idx      on public.audit_log (occurred_at desc);
create index if not exists audit_log_division_idx      on public.audit_log (division_id);
create index if not exists login_attempts_scope_idx    on public.login_attempts (scope, attempted_at desc);
create index if not exists sessions_expires_idx        on public.sessions (expires_at);

-- updated_at otomatis bila baris program diubah langsung (fungsi RPC juga mengisinya)
create or replace function public._touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := clock_timestamp();  -- jam asli (bukan awal transaksi) agar optimistic locking selalu terdeteksi
  return new;
end;
$$;

drop trigger if exists programs_touch_updated_at on public.programs;
create trigger programs_touch_updated_at
  before update on public.programs
  for each row execute function public._touch_updated_at();
