param(
  [string]$RepoUser   = "y4m4usr",
  [string]$RepoName   = "HL001-quiz-karacon-academia-new",
  [string]$GoodRef    = "<SET_GOOD_COMMIT_SHA_OR_BRANCH>",
  [string[]]$Targets  = @("imagesnew1\samune\samune1","imagesnew1\lens\lens1")
)

$ErrorActionPreference = 'Stop'
chcp 65001 | Out-Null

function Get-Bytes-FromUrl($url){
  try {
    $r = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 25
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300 -and ($r.Headers.'Content-Type' -match '^image/')) {
      return ,([byte[]]$r.Content)
    }
  } catch {}
  return $null
}

function Get-ImageBytesFromGoodRef($relPath){
  $raw = "https://raw.githubusercontent.com/$RepoUser/$RepoName/$GoodRef/$relPath"
  $bytes = Get-Bytes-FromUrl $raw
  if ($bytes -ne $null) { return $bytes }
  $cdn = "https://cdn.jsdelivr.net/gh/$RepoUser/$RepoName@$GoodRef/$relPath"
  return (Get-Bytes-FromUrl $cdn)
}

# Enumerate all target jpg/jpeg files
$files = @()
foreach($t in $Targets){
  if (Test-Path $t) {
    $files += Get-ChildItem -Recurse -File -Path $t -Include *.jpg, *.jpeg
  }
}
if ($files.Count -eq 0) {
  Write-Host "No JPEG files found under targets."; exit 0
}

# Build log
$log = New-Object System.Collections.Generic.List[object]

foreach($f in $files){
  $rel = $f.FullName
  # repo-relative with forward slashes for GitHub URL
  $rel = Resolve-Path -LiteralPath $rel -Relative
  $rel = $rel -replace '^[.\\\/]+','' -replace '\\','/'

  $ok = $false; $note = ""
  try {
    $bytes = Get-ImageBytesFromGoodRef $rel
    if ($bytes -eq $null) {
      $ok = $false; $note = "fetch failed (raw/cdn)"
    } else {
      # Clear read-only then overwrite (no rename)
      try { $fi = Get-Item -LiteralPath $f.FullName; if ($fi.IsReadOnly) { $fi.Attributes = 'Archive' } } catch {}
      [System.IO.File]::WriteAllBytes($f.FullName, $bytes)
      $ok = $true; $note = "replaced from $GoodRef"
    }
  } catch {
    $ok = $false; $note = "error: $($_.Exception.Message)"
  }
  $log.Add([pscustomobject]@{ File=$f.FullName; Fixed=$ok; Note=$note })
}

$csv = "restore_from_goodref_{0:yyyyMMdd_HHmmss}.csv" -f (Get-Date)
$log | Export-Csv -Path $csv -NoTypeInformation -Encoding UTF8
$log | Format-Table -AutoSize
Write-Host "Report: $csv"
