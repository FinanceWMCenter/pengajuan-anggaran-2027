# =====================================================================
# Uji keamanan lewat internet ke project Supabase (tes S-01, S-02, S-03, S-05, fungsi internal).
# Meniru "orang luar" yang hanya punya Project URL + anon key (yang memang publik).
#
# Cara pakai (Terminal VS Code, PowerShell), dari folder repo:
#   powershell -ExecutionPolicy Bypass -File tests\rest_security_check.ps1 -Url "https://xxxx.supabase.co" -AnonKey "eyJ..."
# Pakai anon/publishable key (BUKAN secret/service key). Hasil akhir yang diharapkan: "SEMUA CEK KEAMANAN LULUS".
# =====================================================================
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$AnonKey
)
$Url = $Url.TrimEnd('/')
if ($AnonKey -match 'sb_secret_' -or $AnonKey -match 'service_role') { Write-Host "Ini terlihat seperti SECRET key. Hentikan dan pakai anon/publishable key." -ForegroundColor Red; exit 1 }
$headers = @{ apikey = $AnonKey; "Content-Type" = "application/json" }
if ($AnonKey.StartsWith("eyJ")) { $headers["Authorization"] = "Bearer $AnonKey" }
$fail = 0

function Call([string]$Method, [string]$Path, [string]$Body = $null) {
  try {
    $p = @{ Uri = "$Url$Path"; Method = $Method; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 30 }
    if ($Body) { $p.Body = $Body }
    $r = Invoke-WebRequest @p
    return @{ Status = [int]$r.StatusCode; Body = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      return @{ Status = [int]$resp.StatusCode; Body = $reader.ReadToEnd() }
    }
    return @{ Status = 0; Body = $_.Exception.Message }
  }
}
function Check([bool]$ok, [string]$name, [string]$detail = "") {
  if ($ok) { Write-Host "LULUS $name" -ForegroundColor Green } else { Write-Host "GAGAL $name $detail" -ForegroundColor Red; $script:fail++ }
}

# S-01 / S-03: tabel tidak bisa dibaca
$tables = "app_settings", "division_groups", "divisions", "program_categories", "item_categories", "programs", "program_items", "sessions", "login_attempts", "audit_log"
foreach ($t in $tables) {
  $r = Call "GET" "/rest/v1/$t`?select=*&limit=1"
  $leak = ($r.Status -eq 200 -and $r.Body.Trim() -ne "[]")
  Check (-not $leak) "S-01 baca tabel $t ditolak" "(HTTP $($r.Status): $($r.Body))"
}
# S-02: tidak bisa menulis
$r = Call "POST" "/rest/v1/programs" '{"nama_program":"Hack","division_id":1,"program_category_id":1,"periode_bulan":1,"pic_nama":"XX"}'
Check ($r.Status -ge 400) "S-02 insert programs ditolak" "(HTTP $($r.Status))"
$r = Call "PATCH" "/rest/v1/divisions?id=eq.1" '{"name":"x"}'
Check ($r.Status -ge 400 -or $r.Body.Trim() -eq "[]" -or $r.Body.Trim() -eq "") "S-02 update divisions ditolak" "(HTTP $($r.Status): $($r.Body))"
$r = Call "DELETE" "/rest/v1/app_settings?key=neq.x"
Check ($r.Status -ge 400 -or $r.Body.Trim() -eq "[]" -or $r.Body.Trim() -eq "") "S-02 delete app_settings ditolak" "(HTTP $($r.Status): $($r.Body))"

# Fungsi publik berjalan
$r = Call "POST" "/rest/v1/rpc/rpc_ping" '{}'
Check ($r.Status -eq 200 -and $r.Body -match '"ok"\s*:\s*true') "rpc_ping berjalan" "(HTTP $($r.Status): $($r.Body))"
$r = Call "POST" "/rest/v1/rpc/rpc_list_divisions" '{}'
Check ($r.Status -eq 200 -and $r.Body -notmatch 'pin_hash') "rpc_list_divisions tanpa pin_hash" "(HTTP $($r.Status))"

# Fungsi internal tidak bisa dipanggil
foreach ($fn in "_program_json", "_require_session", "_overview", "_random_digits", "_audit") {
  $r = Call "POST" "/rest/v1/rpc/$fn" '{}'
  Check ($r.Status -ge 400) "S-04b fungsi internal $fn tertutup" "(HTTP $($r.Status): $($r.Body))"
}
# S-05: tanpa token / token acak
$r = Call "POST" "/rest/v1/rpc/rpc_list_programs" '{"p_token":"","p_division_code":"hr-pd"}'
Check ($r.Body -match 'AUTH_REQUIRED') "S-05 tanpa token ditolak" "($($r.Body))"
$r = Call "POST" "/rest/v1/rpc/rpc_f_overview" '{"p_token":"tebakan-acak"}'
Check ($r.Body -match 'AUTH_EXPIRED') "S-05 token acak ditolak" "($($r.Body))"
# Ruang skema lain tidak terbuka
$r = Call "GET" "/rest/v1/rpc/rpc_ping"
Check ($r.Status -ne 500) "GET rpc tidak error server" "(HTTP $($r.Status))"

if ($fail -eq 0) { Write-Host "`nSEMUA CEK KEAMANAN LULUS" -ForegroundColor Green } else { Write-Host "`n$fail CEK GAGAL - jangan masukkan data asli. Salin hasil ke Claude." -ForegroundColor Red; exit 1 }
