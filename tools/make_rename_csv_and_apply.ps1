<#
make_rename_csv_and_apply.ps1
説明:
 - 新しいファイル名リスト（1列CSV）からリポジトリ内の候補を探し、
   docs/rename/rename_for_git.csv (old_path,new_path) を作成します。
 - DryRun=$true では git mv を実行せずに CSV を生成してプレビューします。
 - DryRun=$false で実際に git mv を順次実行します（履歴を残す）。
#>

param(
  [string]$RepoRoot = 'C:\Users\seran\development\HL001-quiz-karacon-academia\',
  [string]$NewNamesCsv = 'C:\Users\seran\development\HL001-quiz-karacon-academia\docs\rename\250924_lensimage_reneme - シート1.csv',
  [string[]]$SearchDirs = @('images','images/lens2','images/samune','images/lens','images/samune_old'),
  [string]$OutCsv = 'C:\Users\seran\development\HL001-quiz-karacon-academia\docs\rename\rename_for_git.csv',
  [bool]$DryRun = $true
)

# --- パス存在チェック & 正規化 ---
if (-not (Test-Path $RepoRoot)) {
  Write-Error "RepoRoot が存在しません。パスを確認してください: $RepoRoot"
  exit 1
}
$RepoRoot = (Resolve-Path $RepoRoot).ProviderPath.TrimEnd('\') + '\'

if (-not (Test-Path $NewNamesCsv)) {
  Write-Error "NewNamesCsv が存在しません。パスを確認してください: $NewNamesCsv"
  exit 1
}
$NewNamesCsv = (Resolve-Path $NewNamesCsv).ProviderPath

# --- 表示 ---
Write-Host "RepoRoot: $RepoRoot"
Write-Host "NewNamesCsv: $NewNamesCsv"
Write-Host "OutCsv: $OutCsv"
Write-Host "DryRun: $DryRun"
Write-Host "-----"

# --- 新しいファイル名リストを読み込む (UTF-8 対応) ---
try {
  $newNames = Import-Csv -Path $NewNamesCsv -Header 'newfile' -Encoding UTF8 | ForEach-Object { $_.newfile.Trim() } | Where-Object { $_ -ne '' }
} catch {
  try {
    $bytes = [System.IO.File]::ReadAllBytes($NewNamesCsv)
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    $newNames = $text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
  } catch {
    Write-Error "CSV 読み込みに失敗しました: $_"
    exit 1
  }
}

if ($newNames.Count -eq 0) {
  Write-Warning "新ファイル名リストが空です。CSV を確認してください。"
  exit 0
}

# --- 検索ルートを組み立てる ---
$searchRoots = @()
foreach ($d in $SearchDirs) {
  $p = Join-Path $RepoRoot $d
  if (Test-Path $p) { $searchRoots += $p }
}
if ($searchRoots.Count -eq 0) {
  Write-Error "検索ディレクトリが1つも見つかりません。SearchDirs を確認してください。"
  exit 1
}

# --- 比較用正規化関数 ---
function NormalizeForCompare {
  param([string]$s)
  if (-not $s) { return '' }
  $x = $s.ToLower()
  $x = $x -replace '[\u3000]', ' '
  $x = $x -replace '[\s\-_]+', ''   # 空白・ハイフン・アンダースコア を除去
  return $x
}

# --- 検索対象ファイル一覧を取得 ---
Write-Host "検索ルートからファイル一覧を作成しています..."
$allFiles = @()
foreach ($r in $searchRoots) {
  $allFiles += Get-ChildItem -Path $r -Recurse -File -ErrorAction SilentlyContinue
}
Write-Host "合計ファイル数: $($allFiles.Count)"

# --- マッピング作成 ---
$result = @()
foreach ($new in $newNames) {
  $newTrim = $new.Trim()
  if ($newTrim -eq '') { continue }
  $newLower = $newTrim.ToLower()
  $type = if ($newLower -match '_lens\.jpg$') { 'lens' } elseif ($newLower -match '_samune\.jpg$') { 'samune' } else { '' }

  # 簡易分割 (期待する命名規則に基づく)
  $parts = $newTrim -split '_'
  $brand = if ($parts.Length -ge 2) { $parts[1] } else { '' }
  $color = if ($parts.Length -ge 3) { $parts[2] } else { '' }

  $normBrand = NormalizeForCompare $brand
  $normColor = NormalizeForCompare $color

  # 候補検索: ブランド+カラー 両方一致
  $candidates = $allFiles | Where-Object {
    $n = NormalizeForCompare $_.Name
    ($normBrand -ne '' -and $n.Contains($normBrand)) -and ($normColor -ne '' -and $n.Contains($normColor))
  }

  # 緩和: カラー一致のみ
  if ($candidates.Count -eq 0 -and $normColor -ne '') {
    $candidates = $allFiles | Where-Object { NormalizeForCompare($_.Name).Contains($normColor) }
  }

  # さらに緩和: UNKNOWN を代替
  if ($candidates.Count -eq 0) {
    # <-- ここを分解して評価することで構文エラーを回避
    $candidates = $allFiles | Where-Object {
      $isUnknown = ($_.Name -match 'UNKNOWN' -or $_.Name -match 'unknown')
      $typeCheck = ($type -eq '') -or (NormalizeForCompare($_.Name).Contains($type))
      $isUnknown -and $typeCheck
    }
  }

  if ($candidates.Count -eq 0) {
    Write-Warning "未検出: '$newTrim' の候補が見つかりません。"
    continue
  }

  if ($candidates.Count -gt 1) {
    Write-Warning "複数候補 ($($candidates.Count)) が見つかりました: '$newTrim' — 最初の候補を使用します。"
    $candidates | Select-Object -First 5 | ForEach-Object { Write-Host " - 候補: $($_.FullName.Substring($RepoRoot.Length) -replace '\\','/')" }
  }

  $chosen = $candidates | Select-Object -First 1
  $oldRel = $chosen.FullName.Substring($RepoRoot.Length) -replace '\\','/'
  $oldDirRel = (Split-Path -Path $chosen.FullName -Parent).Substring($RepoRoot.Length) -replace '\\','/'
  $finalNewRel = "$oldDirRel/$newTrim"

  $result += [PSCustomObject]@{ old_path = $oldRel; new_path = $finalNewRel }
}

if ($result.Count -eq 0) {
  Write-Warning "マッピング結果がありません。処理を終了します。"
  exit 0
}

# --- CSV 出力 ---
$csvDir = Split-Path -Path $OutCsv -Parent
if (-not (Test-Path $csvDir)) { New-Item -ItemType Directory -Path $csvDir -Force | Out-Null }

$result | Export-Csv -Path $OutCsv -NoTypeInformation -Encoding UTF8

if ($DryRun) {
  Write-Host "`n[DryRun] rename_for_git.csv を作成しました: $OutCsv"
  Write-Host "[DryRun] プレビュー（先頭 50 行）:"
  $result | Select-Object -First 50 | ForEach-Object { Write-Host "$($_.old_path),$($_.new_path)" }
  Write-Host "`nDryRun モードです。本実行するには -DryRun \$false を指定してください。"
  exit 0
}

# --- 実行モード: git mv を順次実行 ---
Push-Location $RepoRoot
try {
  foreach ($r in $result) {
    $old = $r.old_path
    $new = $r.new_path

    # 目的ディレクトリがなければ作成
    $newDir = Split-Path -Path (Join-Path $RepoRoot $new) -Parent
    if (-not (Test-Path $newDir)) {
      New-Item -ItemType Directory -Path $newDir -Force | Out-Null
    }

    Write-Host "git mv -- `"$old`" `"$new`""
    try {
      & git mv -- "$old" "$new"
    } catch {
      Write-Warning "git mv に失敗しました: $old -> $new  エラー: $_"
    }
  }
} finally {
  Pop-Location
}

Write-Host "`n完了しました。git status を確認してください。"
