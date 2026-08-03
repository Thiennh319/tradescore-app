#Requires -Version 5.1
# Hourly LOCAL git backup onto branch backup/auto-hourly (Option A - no push).
# Source + small config ONLY. Never stages build artifacts (APK/EXE/dist/bin/obj/...).

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
Write-Log ("START cwd={0} mode=local-only source-only" -f $RepoRoot)

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

# Drop heavy/build paths inherited from parent tree (already tracked historically).
$dropPaths = @(
  'scripts/WebLauncher/bin',
  'scripts/WebLauncher/obj',
  'dist',
  'node_modules',
  'android/app/build',
  'android/build',
  'TradeScore-web-v1',
  'TradeScore-Web.exe'
)
foreach ($d in $dropPaths) {
  git rm -r --cached -f --ignore-unmatch -- $d 2>$null | Out-Null
}
git rm --cached -f --ignore-unmatch -- '*.apk' '*.aab' '*.exe' '*.dll' '*.pdb' 2>$null | Out-Null

# Source trees + small config only (explicit allow-list).
$allowDirs = @(
  'services', 'components', 'hooks', 'screens', 'utils', 'store',
  'constants', 'config', 'adapters'
)
$allowFiles = @(
  'App.tsx', 'app.json', 'package.json', 'package-lock.json',
  'tsconfig.json', 'vitest.config.ts', 'babel.config.js', 'metro.config.js',
  '.gitignore'
)

foreach ($rel in $allowDirs) {
  if (Test-Path (Join-Path $RepoRoot $rel)) {
    git add -A -- $rel 2>$null | Out-Null
  }
}
foreach ($rel in $allowFiles) {
  if (Test-Path (Join-Path $RepoRoot $rel)) {
    git add -A -- $rel 2>$null | Out-Null
  }
}

# scripts: source helpers only — exclude WebLauncher build outputs via pathspec
if (Test-Path (Join-Path $RepoRoot 'scripts')) {
  git add -A -- scripts `
    ':(exclude)scripts/WebLauncher/bin' `
    ':(exclude)scripts/WebLauncher/obj' `
    ':(exclude)**/*.exe' `
    ':(exclude)**/*.dll' `
    ':(exclude)**/*.pdb' `
    ':(exclude)**/*.apk' `
    ':(exclude)**/*.aab' 2>$null | Out-Null
}

# Safety: refuse commit if index still contains heavy extensions under scripts/WebLauncher or dist/
$heavyInIndex = git ls-files --cached | Select-String -Pattern '(?i)(scripts/WebLauncher/(bin|obj)/|/dist/|node_modules/|\.apk$|\.aab$|TradeScore-Web\.exe$)'
if ($heavyInIndex) {
  $n = @($heavyInIndex).Count
  Write-Log ("ABORT safety_gate heavy_still_in_index count={0}" -f $n)
  $heavyInIndex | Select-Object -First 15 | ForEach-Object { Write-Log ("  heavy: {0}" -f $_.Line) }
  Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
  if (Test-Path $IndexFile) { Remove-Item $IndexFile -Force -ErrorAction SilentlyContinue }
  exit 3
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

$msg = "chore(auto-backup): hourly source snapshot $Stamp (empty_canary=$emptyCount)"
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
Write-Log ("COMMIT {0} - {1} (local only, no push, source-only)" -f $newCommit, $msg)

Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
Remove-Item Env:GIT_AUTHOR_NAME -ErrorAction SilentlyContinue
Remove-Item Env:GIT_AUTHOR_EMAIL -ErrorAction SilentlyContinue
Remove-Item Env:GIT_COMMITTER_NAME -ErrorAction SilentlyContinue
Remove-Item Env:GIT_COMMITTER_EMAIL -ErrorAction SilentlyContinue
if (Test-Path $IndexFile) { Remove-Item $IndexFile -Force -ErrorAction SilentlyContinue }
Write-Log 'END'
exit 0
