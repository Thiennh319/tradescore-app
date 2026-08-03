#Requires -Version 5.1
# Hourly LOCAL git backup onto branch backup/auto-hourly (Option A - no push).
# Uses temp GIT_INDEX_FILE so current branch is not checked out.

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot '.git'))) {
  $RepoRoot = (Get-Location).Path
}

$Branch = 'backup/auto-hourly'
$LogDir = Join-Path $RepoRoot 'docs\exports'
$LogFile = Join-Path $LogDir 'auto-hourly-backup.log'
$Stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$IndexFile = Join-Path $RepoRoot '.git\autobackup.index'
$env:GIT_INDEX_FILE = $IndexFile

function Write-Log([string]$msg) {
  if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  }
  Add-Content -Path $LogFile -Value ("[{0}] {1}" -f $Stamp, $msg)
}

Set-Location $RepoRoot
Write-Log ("START cwd={0} mode=local-only" -f $RepoRoot)

$emptyCount = 0
$roots = @('services', 'components', 'hooks', 'screens', 'utils')
foreach ($r in $roots) {
  $p = Join-Path $RepoRoot $r
  if (-not (Test-Path $p)) { continue }
  $files = Get-ChildItem -Path $p -Recurse -File -Include *.ts, *.tsx -ErrorAction SilentlyContinue
  foreach ($f in $files) {
    if ($f.Length -le 2) { $emptyCount++ }
  }
}

if ($emptyCount -ge 10) {
  Write-Log ("ABORT empty_canary={0} (>=10) refusing wiped tree" -f $emptyCount)
  Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
  exit 2
}

git show-ref --verify --quiet ("refs/heads/{0}" -f $Branch)
if ($LASTEXITCODE -ne 0) {
  git branch $Branch HEAD
  Write-Log ("created local {0} from HEAD" -f $Branch)
}

$parent = (git rev-parse $Branch).Trim()
if (-not $parent) {
  Write-Log 'ABORT cannot rev-parse branch'
  Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
  exit 1
}

git read-tree $parent
if ($LASTEXITCODE -ne 0) {
  Write-Log 'ABORT read-tree failed'
  Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
  exit 1
}

$paths = @(
  'App.tsx', 'app.json', 'package.json', 'package-lock.json',
  'tsconfig.json', 'vitest.config.ts', 'babel.config.js', 'metro.config.js',
  'services', 'components', 'hooks', 'screens', 'utils', 'store',
  'constants', 'config', 'adapters', 'scripts', 'docs/exports'
)
foreach ($rel in $paths) {
  if (Test-Path (Join-Path $RepoRoot $rel)) {
    git add -A -- $rel 2>$null | Out-Null
  }
}

$tree = (git write-tree).Trim()
$headTree = (git rev-parse ("{0}^{{tree}}" -f $parent)).Trim()
if ($tree -eq $headTree) {
  Write-Log 'SKIP no source-tree delta vs last backup commit'
  Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
  if (Test-Path $IndexFile) { Remove-Item $IndexFile -Force -ErrorAction SilentlyContinue }
  Write-Log 'END'
  exit 0
}

$msg = "chore(auto-backup): hourly snapshot $Stamp (empty_canary=$emptyCount)"
$env:GIT_AUTHOR_NAME = 'TradeScore AutoBackup'
$env:GIT_AUTHOR_EMAIL = 'autobackup@local'
$env:GIT_COMMITTER_NAME = 'TradeScore AutoBackup'
$env:GIT_COMMITTER_EMAIL = 'autobackup@local'
$newCommit = (git commit-tree $tree -p $parent -m $msg).Trim()
if (-not $newCommit) {
  Write-Log 'ABORT commit-tree failed'
  Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
  exit 1
}

git update-ref ("refs/heads/{0}" -f $Branch) $newCommit
Write-Log ("COMMIT {0} - {1} (local only, no push)" -f $newCommit, $msg)

Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
Remove-Item Env:GIT_AUTHOR_NAME -ErrorAction SilentlyContinue
Remove-Item Env:GIT_AUTHOR_EMAIL -ErrorAction SilentlyContinue
Remove-Item Env:GIT_COMMITTER_NAME -ErrorAction SilentlyContinue
Remove-Item Env:GIT_COMMITTER_EMAIL -ErrorAction SilentlyContinue
if (Test-Path $IndexFile) { Remove-Item $IndexFile -Force -ErrorAction SilentlyContinue }
Write-Log 'END'
exit 0
