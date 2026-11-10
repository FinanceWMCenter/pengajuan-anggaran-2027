# =====================================================================
# Latihan RESTORE: pulihkan file backup ke Postgres LOKAL (database "anggaran_restore"),
# lalu hitung isi + jalankan audit angka. Membuktikan backup benar-benar bisa dipakai.
# TIDAK menyentuh Supabase. Database lokal "anggaran_restore" dibuat ulang setiap kali dijalankan.
#
# Cara pakai (Terminal VS Code, PowerShell, dari folder repo):
#   powershell -ExecutionPolicy Bypass -File tools\restore_test.ps1
# (memakai file backup TERBARU di Dokumen\Backup-Anggaran2027; ketik password Postgres lokal bila diminta)
# =====================================================================
param(
  [string]$File = "",
  [string]$Folder = "$env:USERPROFILE\Documents\Backup-Anggaran2027",
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$User = "postgres",
  [int]$Port = 5432,
  [string]$Database = "anggaran_restore"
)
$ErrorActionPreference = "Continue"
$env:PGOPTIONS = "-c client_min_messages=warning"

# Password Postgres LOKAL diminta SEKALI (tidak tampil, tidak disimpan; hanya berlaku selama skrip berjalan)
if (-not $env:PGPASSWORD) {
  $sec = Read-Host "Password Postgres lokal (user $User, yang dibuat saat memasang PostgreSQL)" -AsSecureString
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
$psql = Join-Path $PgBin "psql.exe"
$pgRestore = Join-Path $PgBin "pg_restore.exe"
$root = Split-Path -Parent $PSScriptRoot

if (-not $File) {
  $latest = Get-ChildItem -Path $Folder -Filter "backup_*.dump" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { Write-Host "Tidak ada file backup di $Folder. Jalankan tools\backup.ps1 dulu." -ForegroundColor Red; exit 1 }
  $File = $latest.FullName
}
Write-Host "File backup: $File" -ForegroundColor Cyan

function Invoke-Psql([string[]]$ArgsList) {
  & $psql -h localhost -p $Port -U $User -w -v ON_ERROR_STOP=1 -q @ArgsList
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Perintah ke Postgres lokal gagal. Bila tertulis 'password authentication failed', password Postgres lokal salah; ulangi skrip." -ForegroundColor Red
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    exit 1
  }
}

Write-Host "1) Menyiapkan database lokal $Database ..." -ForegroundColor Cyan
Invoke-Psql @("-d", "postgres", "-c", "do `$`$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end `$`$;")
Invoke-Psql @("-d", "postgres", "-c", "drop database if exists $Database with (force)")
Invoke-Psql @("-d", "postgres", "-c", "create database $Database")
# Fungsi aplikasi memakai ekstensi di schema "extensions" (seperti di Supabase)
Invoke-Psql @("-d", $Database, "-c", "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists pg_trgm with schema extensions;")

Write-Host "2) Memulihkan isi backup ..." -ForegroundColor Cyan
$out = & $pgRestore -h localhost -p $Port -U $User -w --no-owner --no-privileges -d $Database $File 2>&1 | ForEach-Object { $_.ToString() }
# Pesan "schema public already exists" wajar (database baru sudah punya schema public); selain itu = masalah
$errors = @($out | Where-Object { $_ -match 'error:' -and $_ -notmatch 'schema "public" already exists' -and $_ -notmatch 'errors ignored on restore: 1$' })
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  Write-Host "RESTORE BERMASALAH. Salin pesan di atas ke Claude." -ForegroundColor Red
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  exit 1
}

Write-Host "3) Memeriksa isi ..." -ForegroundColor Cyan
& $psql -h localhost -p $Port -U $User -w -d $Database -c "select (select count(*) from public.division_groups) as grup, (select count(*) from public.divisions) as divisi, (select count(*) from public.programs) as program, (select count(*) from public.program_items) as baris, (select count(*) from public.audit_log) as log, to_char((select coalesce(sum(i.subtotal),0) from public.program_items i join public.programs p on p.id = i.program_id where p.status = 'diajukan'), 'FM999G999G999G999G990') as total_diajukan;"

Write-Host "4) Audit angka pada hasil restore ..." -ForegroundColor Cyan
$rec = & $psql -h localhost -p $Port -U $User -w -d $Database -f (Join-Path $root "tests\sql\reconcile.sql") 2>&1 | ForEach-Object { $_.ToString() }
$ring = $rec | Where-Object { $_ -match 'RINGKASAN' }
Write-Host $ring
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if (-not ($rec -cmatch 'SEMUA COCOK')) { Write-Host "AUDIT ANGKA ADA SELISIH pada hasil restore." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "RESTORE BERHASIL: backup bisa dipulihkan dan semua angka cocok." -ForegroundColor Green
Write-Host "Bandingkan angka 'program' dan 'total_diajukan' di atas dengan halaman Overview Finance di web." -ForegroundColor Yellow
