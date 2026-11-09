# =====================================================================
# Uji database di Postgres LOKAL (komputer Anda), bukan Supabase.
# Membuat ulang database "anggaran_test", menjalankan semua file db/, data uji, lalu tests/sql/run_all.sql.
#
# Cara pakai (Terminal VS Code, PowerShell), dari folder repo:
#   powershell -ExecutionPolicy Bypass -File tests\run_db_tests.ps1
# psql akan menanyakan password user "postgres" (password saat memasang PostgreSQL). Ketik, lalu Enter.
# Hasil akhir yang diharapkan: "SEMUA TES SQL LULUS".
# =====================================================================
param(
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$User = "postgres",
  [string]$Database = "anggaran_test",
  [int]$Port = 5432
)
$ErrorActionPreference = "Continue"   # psql menulis NOTICE ke stderr; jangan dianggap error
$env:PGOPTIONS = "-c client_min_messages=warning"
$psql = Join-Path $PgBin "psql.exe"
if (-not (Test-Path $psql)) { Write-Host "psql tidak ditemukan di $PgBin. Jalankan dengan -PgBin 'C:\Program Files\PostgreSQL\<versi>\bin'" -ForegroundColor Red; exit 1 }
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Psql([string[]]$ArgsList) {
  & $psql -h localhost -p $Port -U $User @ArgsList
  if ($LASTEXITCODE -ne 0) { throw "psql gagal: $($ArgsList -join ' ')" }
}

Write-Host "1) Menyiapkan role anon/authenticated (meniru Supabase) dan database $Database ..." -ForegroundColor Cyan
Invoke-Psql @("-d", "postgres", "-q", "-c", "do `$`$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end `$`$;")
Invoke-Psql @("-d", "postgres", "-q", "-c", "drop database if exists $Database with (force)")
Invoke-Psql @("-d", "postgres", "-q", "-c", "create database $Database")

Write-Host "2) Menjalankan file db/ ..." -ForegroundColor Cyan
foreach ($f in @("01_schema", "02_seed_master", "03_functions", "04_security", "05_overview", "06_bootstrap", "99_test_seed")) {
  Write-Host "   - $f.sql"
  Invoke-Psql @("-d", $Database, "-v", "ON_ERROR_STOP=1", "-q", "-o", "NUL", "-f", (Join-Path $root "db\$f.sql"))
}

Write-Host "3) Menjalankan tes (tests/sql/run_all.sql) ..." -ForegroundColor Cyan
$env:PGOPTIONS = "-c client_min_messages=notice"   # hasil LULUS dikirim sebagai NOTICE
$out = & $psql -h localhost -p $Port -U $User -d $Database -q -t -f (Join-Path $root "tests\sql\run_all.sql") 2>&1 |
  ForEach-Object { $_.ToString() -replace '^psql:[^ ]* ', '' -replace '^NOTICE:  ', '' } |
  Where-Object { $_ -cmatch '^(LULUS|GAGAL|ERROR:)|SEMUA TES' }
$out | ForEach-Object { if ($_ -cmatch '^(GAGAL|ERROR:)') { Write-Host $_ -ForegroundColor Red } else { Write-Host $_ } }
if (($out -cmatch '^(GAGAL|ERROR:)') -or -not ($out -cmatch 'SEMUA TES SQL LULUS')) {
  Write-Host "ADA TES YANG GAGAL. Salin hasil di atas ke Claude." -ForegroundColor Red
  exit 1
}
Write-Host ("Jumlah tes lulus: " + @($out -cmatch '^LULUS').Count) -ForegroundColor Green

Write-Host "4) Audit angka (tests/sql/reconcile.sql) ..." -ForegroundColor Cyan
$rec = & $psql -h localhost -p $Port -U $User -d $Database -f (Join-Path $root "tests\sql\reconcile.sql") 2>&1 | ForEach-Object { $_.ToString() }
$rec | ForEach-Object { if ($_ -cmatch 'ADA SELISIH') { Write-Host $_ -ForegroundColor Red } else { Write-Host $_ } }
if (-not ($rec -cmatch 'SEMUA COCOK')) {
  Write-Host "AUDIT ANGKA MENEMUKAN SELISIH. Salin hasil di atas ke Claude." -ForegroundColor Red
  exit 1
}
Write-Host "Audit angka: SEMUA COCOK" -ForegroundColor Green
