<#
make_rename_from_both_csvs.ps1
説明:
 - lens と samune の「新しいファイル名」CSV（1列）を読み、リポジトリ内の既存ファイルを探索して
   docs/rename/rename_for_git.csv (old_path,new_path) を作ります。
 - samune の場合は new_path の末尾を自動的に _samune.jpg に揃えます。
 - DryRun モード（Apply=$false）でプレビュー。Apply=$true で git mv を実行します。
#>

param(
  [string]$RepoRoot = 'C:\Users\seran\development\HL001-quiz-karacon-academia\',
  [string]$LensCsv = 'C:\Users\seran\development\HL001-quiz-karacon-academia\docs\rename\250924_lensimage_reneme - シート1.csv',
  [string]$SamuneCsv = 'C:\Users\seran\development\HL001-quiz-karacon-academia\docs\rename\250924_samuneimage_reneme - シート1 (1).csv',
  [string]$OutCsv = 'C:\Users\seran\development\HL001-quiz-karacon-academia\docs\rename\rename_for_git.csv',
  [bool]$Apply = $false   # $false=DryRun(既定) / $true=実行
)

# 基本チェック
if (-not (Test-Path $RepoRoot)) { Write-Error "RepoRoot が存在しません: $RepoRoot"; exit 1 }
$RepoRoot = (Resolve-Path $RepoRoot).ProviderPath.TrimEnd('\') + '\'
if (-not (Test-Path $LensCsv))  { Write-Error "LensCsv が見つかりません: $LensCsv"; exit 1 }
if (-not (Test-Path $SamuneCsv)) { Write-Error "SamuneCsv が見つかりません: $SamuneCsv"; exit 1 }

Write-Host "RepoRoot: $RepoRoot"
Write-Host "LensCsv: $LensCsv"
Write-Host "SamuneCsv: $SamuneCsv"
Write-Host "OutCsv: $OutCsv"
Write-Host "Apply: $Apply"
Write-Host "-----"

# CSV 読み込み関数（簡潔・BOM 考慮）
function ReadOneColumnCsv($path){
  try {
    $arr = Import-Csv -Path $path -Header newname -Encoding UTF8 | ForEach-Object { $_.newname.Trim() } | Where-Object { $_ -ne '' }
  } catch {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    $arr = $text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
  }
  return $arr
}

$lensList = ReadOneColumnCsv $LensCsv
$samuneList = ReadOneColumnCsv $SamuneCsv

Write-Host "lens entries: $($lensList.Count), samune entries: $($samuneList.Count)"

# 検索ルート（必要ならここに他の画像フォルダを追加）
$searchDirs = @('images','images/lens2','images/samune','images/lens','images/samune_old')

$searchRoots = @()
foreach ($d in $searchDirs) {
  $p = Join-Path $RepoRoot $d
  if (Test-Path $p) { $searchRoots += $p }
}
if ($searchRoots.Count -eq 0) { Write-Error "検索ディレクトリがありません。"; exit 1 }

# 正規化関数
function NormalizeForCompare([string]$s) {
  if (-not $s) { return '' }
  $x = $s.ToLower()
  $x = $x -replace '[\u3000]',' '
  $x = $x -replace '[\s\-_]+',''
  return $x
}

# 全ファイルキャッシュ
Write-Host "ファイル一覧作成中..."
$allFiles = @()
foreach ($r in $searchRoots) { $allFiles += Get-ChildItem -Path $r -Recurse -File -ErrorAction SilentlyContinue }
Write-Host "検索対象ファイル数: $($allFiles.Count)"

# 探索ロジック（共通）
function FindOldFileForNewName([string]$newName, [string]$typeHint) {
  $parts = $newName -split '_'
  $brand = if ($parts.Length -ge 2) { $parts[1] } else { '' }
  $color = if ($parts.Length -ge 3) { $parts[2] } else { '' }
  $nBrand = NormalizeForCompare $brand
  $nColor = NormalizeForCompare $color

  # 1) ブランド+カラー 両方一致
  $candidates = $allFiles | Where-Object {
    $nn = NormalizeForCompare $_.Name
    ($nBrand -ne '' -and $nn.Contains($nBrand)) -and ($nColor -ne '' -and $nn.Contains($nColor))
  }

  # 2) カラーのみ
  if ($candidates.Count -eq 0 -and $nColor -ne '') {
    $candidates = $allFiles | Where-Object { NormalizeForCompare($_.Name).Contains($nColor) }
  }

  # 3) UNKNOWN 代替（typeHint があればそれを含むファイルを優先）
  if ($candidates.Count -eq 0) {
    $candidates = $allFiles | Where-Object {
      $isUnknown = ($_.Name -match 'UNKNOWN' -or $_.Name -match 'unknown')
      $typeCheck = if ($typeHint -eq '') { $true } else { NormalizeForCompare($_.Name).Contains(NormalizeForCompare $typeHint) }
      $isUnknown -and $typeCheck
    }
  }

  if ($candidates.Count -eq 0) { return $null }
  if ($candidates.Count -gt 1) {
    Write-Warning "複数候補: '$newName' に対して $($candidates.Count) 個。最初を採用します。"
    $candidates | Select-Object -First 5 | ForEach-Object { Write-Host " - 候補: $($_.FullName.Substring($RepoRoot.Length) -replace '\\','/')" }
  }
  return ($candidates | Select-Object -First 1)
}

# マッピング作成
$result = @()

# lens
foreach ($n in $lensList) {
  $new = $n.Trim()
  if ($new -eq '') { continue }
  $type = 'lens'
  $found = FindOldFileForNewName -newName $new -typeHint $type
  if (-not $found) { Write-Warning "未検出（lens）: $new"; continue }
  $oldRel = $found.FullName.Substring($RepoRoot.Length) -replace '\\','/'
  $oldDirRel = (Split-Path -Path $found.FullName -Parent).Substring($RepoRoot.Length) -replace '\\','/'
  $finalNewRel = "$oldDirRel/$new"
  $result += [PSCustomObject]@{ old_path = $oldRel; new_path = $finalNewRel }
}

# samune — new の末尾は必ず _samune.jpg に揃える
foreach ($n in $samuneList) {
  $new = $n.Trim()
  if ($new -eq '') { continue }
  $type = 'samune'
  $found = FindOldFileForNewName -newName $new -typeHint $type
  if (-not $found) { Write-Warning "未検出（samune）: $new"; continue }
  $oldRel = $found.FullName.Substring($RepoRoot.Length) -replace '\\','/'
  $oldDirRel = (Split-Path -Path $found.FullName -Parent).Substring($RepoRoot.Length) -replace '\\','/'
  # 強制: new の末尾を _samune.jpg に
  $newFixed = if ($new -match '_samune\.jpg$') { $new } elseif ($new -match '_lens\.jpg$') { $new -replace '_lens\.jpg$','_samune.jpg' } else { $new -replace '\.jpg$','_samune.jpg' }
  $finalNewRel = "$oldDirRel/$newFixed"
  $result += [PSCustomObject]@{ old_path = $oldRel; new_path = $finalNewRel }
}

# 出力 CSV
$csvDir = Split-Path -Path $OutCsv -Parent
if (-not (Test-Path $csvDir)) { New-Item -ItemType Directory -Path $csvDir -Force | Out-Null }
$result | Export-Csv -Path $OutCsv -NoTypeInformation -Encoding UTF8

Write-Host "`n生成されたマッピング数: $($result.Count). CSV 保存: $OutCsv`n"
Write-Host "先頭 100 行プレビュー:"
$result | Select-Object -First 100 | ForEach-Object { Write-Host "$($_.old_path) => $($_.new_path)" }

if (-not $Apply) {
  Write-Host "`nDryRun モードです。内容を確認して、実行する場合は -Apply \$true を指定して再実行してください。"
  exit 0
}

# Apply = true の場合、git mv を順次実行
Push-Location $RepoRoot
try {
  foreach ($r in $result) {
    $old = $r.old_path
    $new = $r.new_path
    $newDir = Split-Path -Path (Join-Path $RepoRoot $new) -Parent
    if (-not (Test-Path $newDir)) { New-Item -ItemType Directory -Path $newDir -Force | Out-Null }
    Write-Host "git mv -- $old -> $new"
    try { & git mv -- "$old" "$new" } catch { Write-Warning "git mv 失敗: $old -> $new : $_" }
  }
} finally { Pop-Location }

Write-Host "`n実行完了: git status を確認してください。"
