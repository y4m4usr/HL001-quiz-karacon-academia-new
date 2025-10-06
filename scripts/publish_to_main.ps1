Param(
  [string]$SourceBranch = "fix/webapp-core-x-image",
  [string]$Remote = "origin"
)

function Fail($msg){ Write-Error $msg; exit 1 }

$ErrorActionPreference = 'Stop'

Write-Host "==> Detecting current branch" -ForegroundColor Cyan
$cur = git rev-parse --abbrev-ref HEAD
Write-Host "    Current: $cur"

Write-Host "==> Checking for uncommitted changes" -ForegroundColor Cyan
$status = git status --porcelain
if ($status) { Fail "Working tree not clean. Commit or stash changes first." }

Write-Host "==> Fetching remote refs ($Remote)" -ForegroundColor Cyan
git fetch --all --prune

Write-Host "==> Ensuring source branch exists: $SourceBranch" -ForegroundColor Cyan
git show-ref --verify --quiet "refs/heads/$SourceBranch" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Local branch '$SourceBranch' not found." }

Write-Host "==> Switching to main" -ForegroundColor Cyan
git checkout main

Write-Host "==> Reset main to $Remote/main (fast-forward)" -ForegroundColor Cyan
git reset --hard "$Remote/main"

Write-Host "==> Merge $SourceBranch -> main" -ForegroundColor Cyan
git merge --no-ff "$SourceBranch" -m "Merge '$SourceBranch' into main (sync gas/ and imagesnew1)"

Write-Host "==> Push main" -ForegroundColor Cyan
git push "$Remote" main

Write-Host "==> Restore previous branch" -ForegroundColor Cyan
git checkout "$cur"

Write-Host "Done. main is now updated with gas/ and imagesnew1/."

