# =====================================================================
# Backup database Supabase ke komputer ini.
# Hasil (folder Dokumen\Backup-Anggaran2027, di LUAR repo - jangan pernah di-commit):
#   1) backup_<LABEL>_<tanggal_jam>.dump  -> file PEMULIHAN lengkap (format pg_dump "custom", schema "public":
#      semua tabel, data, fungsi, aturan RLS). Dipakai untuk memulihkan database bila Supabase rusak.
#   2) backup_<LABEL>_<tanggal_jam>.xlsx  -> salinan yang BISA DIBACA di Excel/Google Sheets (D-49):
#      ringkasan per divisi, semua program (kondisi terakhir), rincian kebutuhan, riwayat revisi, log.
#   3) folder backup_<LABEL>_<tanggal_jam>_csv -> isi yang sama dalam CSV (bisa dibuka di platform database apa pun).
#
# Cara pakai (Terminal VS Code, PowerShell, dari folder repo):
#   powershell -ExecutionPolicy Bypass -File tools\backup.ps1
# Skrip meminta:
#   1) Connection string Supabase TANPA password (Connect -> Session pooler).
#   2) Password database SEKALI (tidak tampil, tidak disimpan; hanya berlaku selama skrip berjalan).
# Salinan Excel/CSV hanya MEMBACA database (transaksi read-only). Hash PIN & token login tidak ikut ke Excel/CSV.
# =====================================================================
param(
  [string]$ConnectionString = "",
  [string]$Label = "DEV",
  [string]$Folder = "$env:USERPROFILE\Documents\Backup-Anggaran2027",
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin"
)
$ErrorActionPreference = "Continue"
$pgDump = Join-Path $PgBin "pg_dump.exe"
$pgRestore = Join-Path $PgBin "pg_restore.exe"
$psql = Join-Path $PgBin "psql.exe"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path $pgDump)) { Write-Host "pg_dump tidak ditemukan di $PgBin" -ForegroundColor Red; exit 1 }

if (-not $ConnectionString) {
  Write-Host "Tempel connection string Supabase (Session pooler), TANPA password." -ForegroundColor Cyan
  Write-Host "Contoh: postgresql://postgres.xxxx@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
  $ConnectionString = Read-Host "Connection string"
}
$ConnectionString = $ConnectionString.Trim().Trim('"')
# Buang placeholder/password bila ikut tertempel, supaya password diminta secara aman
$ConnectionString = $ConnectionString -replace ':\[YOUR-PASSWORD\]@', '@'
if ($ConnectionString -match '^postgres(ql)?://[^:/@]+:[^@]+@') {
  $ConnectionString = $ConnectionString -replace '^(postgres(?:ql)?://[^:/@]+):[^@]+@', '$1@'
  Write-Host "Catatan: password di connection string dibuang; password diminta terpisah." -ForegroundColor Yellow
}
if ($ConnectionString -notmatch '^postgres(ql)?://') { Write-Host "Connection string harus diawali postgresql://" -ForegroundColor Red; exit 1 }

# Password diminta SEKALI untuk backup + salinan Excel/CSV (tidak tampil, tidak disimpan)
if (-not $env:PGPASSWORD) {
  $sec = Read-Host "Password database Supabase (tidak tampil saat diketik)" -AsSecureString
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $setPassword = $true
}

try {
  New-Item -ItemType Directory -Force $Folder | Out-Null
  $base = "backup_{0}_{1}" -f $Label, (Get-Date -Format 'yyyyMMdd_HHmm')
  $file = Join-Path $Folder "$base.dump"
  Write-Host "Membuat backup..." -ForegroundColor Cyan
  & $pgDump --no-owner --no-privileges --format=custom --schema=public --file $file $ConnectionString
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $file)) {
    Write-Host "BACKUP GAGAL. Periksa connection string / password, lalu ulangi." -ForegroundColor Red
    if (Test-Path $file) { Remove-Item $file -Force }
    exit 1
  }

  # Periksa isi: daftar tabel yang datanya ikut tercadang
  $list = & $pgRestore --list $file
  $tables = @($list | Select-String -Pattern 'TABLE DATA public (\S+)' | ForEach-Object { $_.Matches[0].Groups[1].Value })
  $wajib = 'programs', 'program_items', 'divisions', 'division_groups', 'program_categories', 'item_categories', 'audit_log', 'app_settings'
  $kurang = @($wajib | Where-Object { $tables -notcontains $_ })
  $sizeKb = [math]::Round((Get-Item $file).Length / 1KB, 1)
  if ($kurang.Count -gt 0) {
    Write-Host ("BACKUP TIDAK LENGKAP: tabel tidak ada: " + ($kurang -join ', ')) -ForegroundColor Red
    exit 1
  }
  Write-Host ""
  Write-Host "BACKUP BERHASIL" -ForegroundColor Green
  Write-Host "  File   : $file"
  Write-Host "  Ukuran : $sizeKb KB"
  Write-Host ("  Tabel  : " + $tables.Count + " (" + ($tables -join ', ') + ")")

  # ---- Salinan yang bisa dibaca: CSV + Excel (D-49). Gagal di sini TIDAK membatalkan file .dump di atas.
  Write-Host ""
  Write-Host "Membuat salinan yang bisa dibaca (Excel + CSV)..." -ForegroundColor Cyan
  $csvDir = Join-Path $Folder "${base}_csv"
  New-Item -ItemType Directory -Force $csvDir | Out-Null
  $dirSql = ($csvDir -replace '\\', '/') -replace "'", "''"
  $tmpSql = Join-Path $env:TEMP "$base-baca.sql"
  $sqlText = (Get-Content (Join-Path $PSScriptRoot 'backup_baca.sql') -Raw -Encoding UTF8).Replace('__DIR__', $dirSql)
  [IO.File]::WriteAllText($tmpSql, $sqlText, (New-Object Text.UTF8Encoding $false))  # tanpa BOM (psql menolak BOM)
  $env:PGOPTIONS = "-c client_min_messages=warning"
  & $psql -X -q -v ON_ERROR_STOP=1 -f $tmpSql $ConnectionString
  $csvOk = ($LASTEXITCODE -eq 0)
  Remove-Item $tmpSql -Force -ErrorAction SilentlyContinue
  $csvCount = @(Get-ChildItem $csvDir -Filter *.csv -ErrorAction SilentlyContinue).Count
  if (-not $csvOk -or $csvCount -lt 6) {
    Write-Host "Salinan CSV GAGAL dibuat (file .dump tetap aman). Salin pesan di atas ke Claude." -ForegroundColor Red
  } else {
    Write-Host "  CSV    : $csvDir ($csvCount file)"
    $xlsx = Join-Path $Folder "$base.xlsx"
    if (Get-Command node -ErrorAction SilentlyContinue) {
      & node (Join-Path $PSScriptRoot 'backup_excel.mjs') $csvDir $xlsx $Label
      if ($LASTEXITCODE -eq 0 -and (Test-Path $xlsx)) { Write-Host "SALINAN EXCEL BERHASIL" -ForegroundColor Green }
      else { Write-Host "Excel gagal dibuat; CSV di atas tetap bisa dibuka (Excel: Data > From Text/CSV)." -ForegroundColor Yellow }
    } else {
      Write-Host "Node.js tidak ada di komputer ini: Excel dilewati. CSV tetap bisa dibuka (Excel: Data > From Text/CSV)." -ForegroundColor Yellow
    }
  }
  Write-Host ""
  Write-Host "Simpan juga salinannya di tempat lain (mis. Google Drive Finance). Jangan di-commit ke GitHub." -ForegroundColor Yellow
}
finally {
  if ($setPassword) { $env:PGPASSWORD = $null }
}
