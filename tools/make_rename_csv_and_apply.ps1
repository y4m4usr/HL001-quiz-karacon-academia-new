# --- 前提（テストCSVを直接参照） ---
# ※ 環境変数 KARACON_MASTER_CSV が設定されていれば優先（任意）
$masterCsv = $env:KARACON_MASTER_CSV
if ([string]::IsNullOrWhiteSpace($masterCsv)) {
  $masterCsv = 'C:\Users\seran\development\HL001-quiz-karacon-academia\docs\rename\109販促デーのcsvコピー - master.csv'
}

if (!(Test-Path -LiteralPath $masterCsv)) {
  throw "Master CSV not found: $masterCsv"
}

# 読み込みヘルパ（UTF-8優先 → だめならDefault系で再試行）
function Import-MasterCsv {
  param([Parameter(Mandatory)][string]$Path)
  try {
    return Import-Csv -LiteralPath $Path -Encoding UTF8
  } catch {
    Write-Warning "UTF-8での読み込みに失敗。Default エンコードで再試行します: $Path"
    return Import-Csv -LiteralPath $Path -Encoding Default
  }
}

$master = Import-MasterCsv -Path $masterCsv

# BOM 付き見出しにも耐性のある列取得
function Get-ColValue {
  param($row, [Parameter(Mandatory)][string]$name)
  $candidates = @(
    $name,
    ([char]0xFEFF) + $name  # BOM混入ヘッダ対策
  )
  foreach ($n in $candidates) {
    if ($row.PSObject.Properties[$n]) {
      $v = $row.$n
      if ($null -ne $v) { return $v.ToString().Trim() }
    }
  }
  return $null
}

# E|I|J|K の lookup を構築（完全一致のみ）
$masterMap = @{}
$missing = 0
foreach ($r in $master) {
  $E = Get-ColValue $r '元品番'
  $I = Get-ColValue $r 'ブランド(カナ)'
  $J = Get-ColValue $r 'カラー(カナ)'
  $K = Get-ColValue $r '装用期間'
  if ([string]::IsNullOrWhiteSpace($E) -or
      [string]::IsNullOrWhiteSpace($I) -or
      [string]::IsNullOrWhiteSpace($J) -or
      [string]::IsNullOrWhiteSpace($K)) {
    $missing++; continue
  }
  $key = '{0}|{1}|{2}|{3}' -f $E, $I, $J, $K
  $masterMap[$key] = $true
}

Write-Host ("Loaded rows: {0}, Built E/I/J/K keys: {1}, Skipped(incomplete): {2}" `
  -f $master.Count, $masterMap.Count, $missing)

# ファイル名 → E/I/J/K に分解（underscore split; 先頭4トークン採用）
function Parse-FilenameToEIK {
  param([Parameter(Mandatory)][string]$filename)
  $base  = [System.IO.Path]::GetFileNameWithoutExtension($filename)
  $parts = $base -split '_'
  if ($parts.Length -lt 4) { return $null }
  return @{ E=$parts[0].Trim(); I=$parts[1].Trim(); J=$parts[2].Trim(); K=$parts[3].Trim() }
}

# 以降は既存ロジックの「旧:G(品番)比較」→「新:E/I/J/K 完全一致」に置換して利用
# 例（候補1件評価の雛形）:
# $filename は各候補ファイル名（相対でも可）
# $tok = Parse-FilenameToEIK $filename
# if ($tok -ne $null) {
#   $key = '{0}|{1}|{2}|{3}' -f $tok.E, $tok.I, $tok.J, $tok.K
#   if ($masterMap.ContainsKey($key)) { # 採用（自動適用）
#   } else { # 非採用 → manual_fix_queue へ }
# } else { # 不正形式 → manual_fix_queue へ }


$master = Import-Csv -Path $masterCsv -Encoding UTF8

# E|I|J|K の lookup を構築
$masterMap = @{}
foreach ($r in $master) {
  $key = "{0}|{1}|{2}|{3}" -f ($r.'元品番'.Trim()), ($r.'ブランド(カナ)'.Trim()),
                               ($r.'カラー(カナ)'.Trim()), ($r.'装用期間'.Trim())
  $masterMap[$key] = $true
}

function Parse-FilenameToEIK {
  param([string]$filename)
  $base = [System.IO.Path]::GetFileNameWithoutExtension($filename)
  $parts = $base -split '_'
  if ($parts.Length -lt 4) { return $null }
  return @{ E = $parts[0].Trim(); I = $parts[1].Trim(); J = $parts[2].Trim(); K = $parts[3].Trim() }
}

# 旧: G(品番)一致 → 新: E/I/J/K 完全一致
$tok = Parse-FilenameToEIK $filename
if ($tok -ne $null) {
  $key = "{0}|{1}|{2}|{3}" -f $tok.E, $tok.I, $tok.J, $tok.K
  if ($masterMap.ContainsKey($key)) {
    # 採用（自動適用対象）
  } else {
    # 非採用 → manual_fix_queue に積む
  }
}
