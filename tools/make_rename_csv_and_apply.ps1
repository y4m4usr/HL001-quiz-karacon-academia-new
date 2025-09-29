# --- マスターCSVからE/I/J/Kキーを構築するユーティリティ ---
param(
    [string]$MasterCsvPath = $null
)

$repoRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$defaultDir = Join-Path $repoRoot 'docs\rename'
$defaultMasterName = '109販促データのcsvコピー - master.csv'
$hardcodedPath = Join-Path $defaultDir $defaultMasterName

if ([string]::IsNullOrWhiteSpace($MasterCsvPath)) {
    if (Test-Path -LiteralPath $defaultDir) {
        $candidate = Get-ChildItem -LiteralPath $defaultDir -Filter '*master.csv' -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($candidate) {
            $MasterCsvPath = $candidate.FullName
        }
    }
}

if ([string]::IsNullOrWhiteSpace($MasterCsvPath) -and (Test-Path -LiteralPath $hardcodedPath)) {
    $MasterCsvPath = $hardcodedPath
}

if ([string]::IsNullOrWhiteSpace($MasterCsvPath) -or -not (Test-Path -LiteralPath $MasterCsvPath)) {
    throw "Master CSV not found: $MasterCsvPath"
}

if (-not ([System.AppDomain]::CurrentDomain.GetAssemblies().GetName().Name -contains 'Microsoft.VisualBasic')) {
    Add-Type -AssemblyName Microsoft.VisualBasic
}

function Resolve-HeaderName {
    param(
        [Parameter(Mandatory)][AllowNull()][string]$RawValue,
        [Parameter(Mandatory)][int]$Index,
        [Parameter(Mandatory)][hashtable]$UsedNames
    )

    $candidate = if ($null -ne $RawValue) { $RawValue.Trim() } else { '' }
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        $candidate = 'H{0}' -f ($Index + 1)
    }

    $base = $candidate
    $suffix = 1
    while ($UsedNames.ContainsKey($candidate)) {
        $candidate = '{0}_{1}' -f $base, $suffix
        $suffix++
    }
    $UsedNames[$candidate] = $true
    return $candidate
}

function Import-MasterCsv {
    param([Parameter(Mandatory)][string]$Path)

    $encNames = @('utf-8', 'utf-8-bom', 'shift_jis', [System.Text.Encoding]::Default.WebName)
    foreach ($encName in ($encNames | Select-Object -Unique)) {
        try {
            $encoding = [System.Text.Encoding]::GetEncoding($encName)
        } catch {
            Write-Verbose "Encoding unavailable: $encName"
            continue
        }

        try {
            $parser = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($Path, $encoding, $true)
        } catch {
            Write-Verbose "TextFieldParser init failed (${encName}): $($_.Exception.Message)"
            continue
        }

        try {
            $parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
            $parser.SetDelimiters(',')
            $parser.HasFieldsEnclosedInQuotes = $true

            $headerNames = $null
            $usedNames = @{}
            $rows = New-Object System.Collections.Generic.List[object]
            while (-not $parser.EndOfData) {
                $fields = $parser.ReadFields()
                if (-not $fields) { continue }

                if (-not $headerNames) {
                    $joined = ($fields -join '')
                    if ($joined -notmatch '元品番' -or $joined -notmatch 'ブランド' -or $joined -notmatch 'カラー' -or $joined -notmatch '装用期間') {
                        continue
                    }

                    $headerNames = for ($i = 0; $i -lt $fields.Count; $i++) {
                        Resolve-HeaderName -RawValue $fields[$i] -Index $i -UsedNames $usedNames
                    }
                    continue
                }

                if ($fields.Count -gt $headerNames.Count) {
                    for ($i = $headerNames.Count; $i -lt $fields.Count; $i++) {
                        $headerNames += Resolve-HeaderName -RawValue $null -Index $i -UsedNames $usedNames
                    }
                } elseif ($fields.Count -lt $headerNames.Count) {
                    $missingCount = $headerNames.Count - $fields.Count
                    $fields += (New-Object string[] $missingCount)
                }

                $row = [ordered]@{}
                for ($i = 0; $i -lt $headerNames.Count; $i++) {
                    $value = if ($i -lt $fields.Count) { $fields[$i] } else { $null }
                    $row[$headerNames[$i]] = if ($null -ne $value) { $value.Trim() } else { $null }
                }

                $rows.Add([pscustomobject]$row) | Out-Null
            }

            if ($headerNames -and $rows.Count -gt 0) {
                return ,$rows
            }
        } finally {
            $parser.Close()
        }
    }

    throw "CSV の解析に失敗しました: $Path"
}

$script:masterCsvPath = $MasterCsvPath
$script:masterRows = Import-MasterCsv -Path $script:masterCsvPath

function Get-ColValue {
    param(
        [Parameter(Mandatory)]$Row,
        [Parameter(Mandatory)][string[]]$CandidateNames
    )
    foreach ($name in $CandidateNames) {
        $namesToCheck = @($name, ([char]0xFEFF) + $name)
        foreach ($n in $namesToCheck) {
            $prop = $Row.PSObject.Properties[$n]
            if ($prop) {
                $v = $prop.Value
                if ($null -ne $v) { return $v.ToString().Trim() }
            }
        }
    }
    return $null
}

$colNameCandidates = @{
    E = @('元品番', '品番')
    I = @('ブランド名（カナ）', 'ブランド名(カナ)', 'ブランド（カナ）', 'ブランド(カナ)', 'ブランド名（ｶﾅ）', 'ブランド名(ｶﾅ)')
    J = @('カラー名（カナ）', 'カラー名(カナ)', 'カラー（カナ）', 'カラー(カナ)', 'カラー名（ｶﾅ）', 'カラー名(ｶﾅ)')
    K = @('装用期間', '装用期間（英語）', '装用期間(英語)')
}

$script:masterMap = @{}
$missing = 0
foreach ($r in $script:masterRows) {
    $E = Get-ColValue -Row $r -CandidateNames $colNameCandidates.E
    $I = Get-ColValue -Row $r -CandidateNames $colNameCandidates.I
    $J = Get-ColValue -Row $r -CandidateNames $colNameCandidates.J
    $K = Get-ColValue -Row $r -CandidateNames $colNameCandidates.K
    if ([string]::IsNullOrWhiteSpace($E) -or
        [string]::IsNullOrWhiteSpace($I) -or
        [string]::IsNullOrWhiteSpace($J) -or
        [string]::IsNullOrWhiteSpace($K)) {
        $missing++
        continue
    }
    $key = '{0}|{1}|{2}|{3}' -f $E, $I, $J, $K
    $script:masterMap[$key] = $true
}

Write-Host ("Loaded rows: {0}, Built E/I/J/K keys: {1}, Skipped(incomplete): {2}" `
    -f $script:masterRows.Count, $script:masterMap.Count, $missing)

function Parse-FilenameToEIK {
    param([Parameter(Mandatory)][string]$Filename)
    $base = [System.IO.Path]::GetFileNameWithoutExtension($Filename)
    $parts = $base -split '_'
    if ($parts.Length -lt 4) { return $null }

    return @{
        E = $parts[0].Trim()
        I = $parts[1].Trim()
        J = $parts[2].Trim()
        K = $parts[3].Trim()
    }
}

function Test-MasterKey {
    param([Parameter(Mandatory)][hashtable]$Token)

    if (-not ($script:masterMap -is [hashtable])) {
        throw "masterMap が初期化されていません。CSV: $script:masterCsvPath"
    }

    $fields = 'E','I','J','K'
    foreach ($f in $fields) {
        if (-not $Token.ContainsKey($f) -or [string]::IsNullOrWhiteSpace($Token[$f])) {
            return $false
        }
    }

    $key = '{0}|{1}|{2}|{3}' -f `
        $Token.E.Trim(), $Token.I.Trim(), $Token.J.Trim(), $Token.K.Trim()

    return $script:masterMap.ContainsKey($key)
}

function Test-MasterKeyFromFilename {
    param([Parameter(Mandatory)][string]$Filename)

    $tok = Parse-FilenameToEIK -Filename $Filename
    if ($null -eq $tok) { return $false }

    return Test-MasterKey -Token $tok
}

# Usage sample:
# $tok = Parse-FilenameToEIK -Filename $filename
# if ($tok) {
#     if (Test-MasterKey -Token $tok) {
#         # マスターに存在
#     } else {
#         # 手動対応キューへ回す
#     }
# } else {
#     # ファイル名のフォーマットが不正
# }
