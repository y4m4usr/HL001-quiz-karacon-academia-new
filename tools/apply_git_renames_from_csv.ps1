param(
  [Parameter(Mandatory=$true)][string]$CsvPath,
  [string]$RepoRoot=".",
  [switch]$DryRun,
  [int]$CommitBatch=400
)

Set-StrictMode -Version Latest
$ErrorActionPreference="Stop"
Set-Location $RepoRoot

# 読み込み（UTF-8/BOM 自動）
$csvRaw = Get-Content -LiteralPath $CsvPath -Raw -Encoding utf8
$rows   = $csvRaw | ConvertFrom-Csv

# ヘッダ自動判定
$colMap = @{}
foreach($cand in @(
  @{old='old_path'; new='new_path'},
  @{old='src';      new='dst'},
  @{old='before';   new='after'},
  @{old='from';     new='to'}
)){
  if(($rows | Get-Member -Name $cand.old -MemberType NoteProperty) -and
     ($rows | Get-Member -Name $cand.new -MemberType NoteProperty)){
    $colMap = $cand; break
  }
}
if($colMap.Count -eq 0){ throw "CSVヘッダを判別できません。old/new か src/dst か before/after を使ってください。" }

# 進捗
Write-Host ("Rows: {0}" -f $rows.Count)

# 実行
$pending=0
foreach($r in $rows){
  $src = [string]$r.($colMap.old)
  $dst = [string]$r.($colMap.new)
  if([string]::IsNullOrWhiteSpace($src) -or [string]::IsNullOrWhiteSpace($dst)){ continue }

  # Windows上でも誤爆しないようにリテラルパス & ディレクトリ作成
  $dstDir = Split-Path $dst -Parent
  if($dstDir){ New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }

  if($DryRun){
    Write-Host "[DRY] git mv `"$src`" `"$dst`""
    if(Test-Path -LiteralPath $src){ Write-Host "     └─ OK: $src が存在" } else { Write-Warning "     └─ NG: $src が見つからない" }
  } else {
    if(Test-Path -LiteralPath $src){
      & git mv -f -- "$src" "$dst"
      $pending++
      if($pending -ge $CommitBatch){
        git commit -m "chore(rename): apply CSV batch ($pending files)" ; $pending=0
      }
    } else {
      Write-Warning "skip: $src が見つからない"
    }
  }
}

if(-not $DryRun -and $pending -gt 0){
  git commit -m "chore(rename): apply CSV batch ($pending files)"
}

git status
