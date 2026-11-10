# =====================================================================
# Backup database Supabase ke komputer ini (format pg_dump "custom").
# Yang dicadangkan: schema "public" (semua tabel, data, fungsi, aturan RLS aplikasi ini).
#
# Cara pakai (Terminal VS Code, PowerShell, dari folder repo):
#   powershell -ExecutionPolicy Bypass -File tools\backup.ps1
# Skrip meminta:
#   1) Connection string Supabase TANPA password (Connect -> Session pooler).
#   2) Password database (diketik saat diminta pg_dump; tidak tampil, tidak disimpan).
# Hasil: file backup_<LABEL>_<tanggal_jam>.dump di folder Dokumen\Backup-Anggaran2027
# (di LUAR repo - jangan pernah di-commit).
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
if (-not (Test-Path $pgDump)) { Write-Host "pg_dump tidak ditemukan di $PgBin" -ForegroundColor Red; exit 1 }

if (-not $ConnectionString) {
  Write-Host "Tempel connection string Supabase (Session pooler), TANPA password." -ForegroundColor Cyan
  Write-Host "Contoh: postgresql://postgres.xxxx@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
  $ConnectionString = Read-Host "Connection string"
}
$ConnectionString = $ConnectionString.Trim().Trim('"')
# Buang placeholder/password bila ikut tertempel, supaya password diminta secara aman oleh pg_dump
$ConnectionString = $ConnectionString -replace ':\[YOUR-PASSWORD\]@', '@'
if ($ConnectionString -match '^postgres(ql)?://[^:/@]+:[^@]+@') {
  $ConnectionString = $ConnectionString -replace '^(postgres(?:ql)?://[^:/@]+):[^@]+@', '$1@'
  Write-Host "Catatan: password di connection string dibuang; pg_dump akan memintanya." -ForegroundColor Yellow
}
if ($ConnectionString -notmatch '^postgres(ql)?://') { Write-Host "Connection string harus diawali postgresql://" -ForegroundColor Red; exit 1 }

New-Item -ItemType Directory -Force $Folder | Out-Null
$file = Join-Path $Folder ("backup_{0}_{1}.dump" -f $Label, (Get-Date -Format 'yyyyMMdd_HHmm'))
Write-Host "Membuat backup... (ketik password database bila diminta, lalu Enter)" -ForegroundColor Cyan
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
Write-Host "Simpan juga salinannya di tempat lain (mis. Google Drive Finance). Jangan di-commit ke GitHub." -ForegroundColor Yellow
