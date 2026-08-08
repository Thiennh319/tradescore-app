# Build TradeScore desktop web app (EXE + static web bundle)
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
# Product/UI build version - source of truth: app.json (expo.version).
# Must stay in sync with package.json; do NOT confuse with Engine Version
# baked into export snapshots (constants/buildInfo.ts) - independent concept.
$AppVersion = (Get-Content (Join-Path $ProjectRoot 'app.json') -Raw | ConvertFrom-Json).expo.version
$PkgVersion = (Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($PkgVersion -ne $AppVersion) {
    throw "Version mismatch: package.json=$PkgVersion app.json=$AppVersion - sync before build."
}
$Version = $AppVersion
$WebDirName = 'TradeScore-web-v1'
$WebDir = Join-Path $ProjectRoot $WebDirName
$OutDir = Join-Path $ProjectRoot "dist/TradeScore-Web-v$Version"
$LauncherProj = Join-Path $ProjectRoot 'scripts/WebLauncher/WebLauncher.csproj'

Write-Host ''
Write-Host "  TradeScore Web EXE v$Version (app.json)" -ForegroundColor Yellow
Write-Host '  ----------------------------' -ForegroundColor DarkGray
Write-Host ''

Push-Location $ProjectRoot
try {
    Write-Host '[0/3] Stamp buildDate (Asia/Ho_Chi_Minh)...' -ForegroundColor Cyan
    # Must run BEFORE expo export so constants/buildDate.generated.ts is baked into the bundle.
    & node (Join-Path $ProjectRoot 'scripts/stamp-build-date.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'stamp-build-date failed' }

    Write-Host '[1/3] Export web (Expo)...' -ForegroundColor Cyan
    # UL-04.2: enable ESM / UL Review in packaged web EXE (__DEV__ is false in release bundle).
    # Expo only inlines EXPO_PUBLIC_* from .env files — shell $env alone is not baked into the bundle.
    $stagingEnvFile = Join-Path $ProjectRoot '.env.production.local'
    $stagingEnvBackup = $null
    if (Test-Path $stagingEnvFile) {
        $stagingEnvBackup = Get-Content $stagingEnvFile -Raw
    }
    @'
EXPO_PUBLIC_TRADESCORE_STAGING=1
'@ | Set-Content -Path $stagingEnvFile -Encoding ASCII -NoNewline
    try {
        & npx expo export --platform web --output-dir $WebDirName
        if ($LASTEXITCODE -ne 0) { throw 'expo export failed' }
    }
    finally {
        if ($null -ne $stagingEnvBackup) {
            Set-Content -Path $stagingEnvFile -Value $stagingEnvBackup -Encoding ASCII -NoNewline
        }
        elseif (Test-Path $stagingEnvFile) {
            Remove-Item $stagingEnvFile -Force
        }
    }

    if (-not (Test-Path (Join-Path $WebDir 'index.html'))) {
        throw 'Missing index.html after export'
    }

    Write-Host '[2/3] Build EXE (dotnet)...' -ForegroundColor Cyan
    & dotnet publish $LauncherProj -c Release -o $OutDir
    if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }

    Write-Host '[3/3] Copy web bundle...' -ForegroundColor Cyan
    $destWeb = Join-Path $OutDir $WebDirName
    if (Test-Path $destWeb) { Remove-Item $destWeb -Recurse -Force }
    Copy-Item $WebDir $destWeb -Recurse

    $batPath = Join-Path $OutDir 'Mo-TradeScore.bat'
    @"
@echo off
start "" "%~dp0TradeScore-Web.exe"
"@ | Set-Content -Path $batPath -Encoding ASCII

    $guidelineSrc = Join-Path $ProjectRoot 'dist/guideline.txt'
    if (Test-Path $guidelineSrc) {
        Copy-Item $guidelineSrc (Join-Path $OutDir 'guideline.txt') -Force
    }

    $buildInfoPath = Join-Path $OutDir 'BUILD_INFO.txt'
    & node (Join-Path $ProjectRoot 'scripts/write-build-info.mjs') exe $buildInfoPath
    & node (Join-Path $ProjectRoot 'scripts/write-build-info.mjs') exe (Join-Path $ProjectRoot "dist/BUILD_INFO_v$Version.txt")

    Write-Host ''
    Write-Host "OK - $OutDir" -ForegroundColor Green
    Write-Host '  TradeScore-Web.exe     (double-click)' -ForegroundColor DarkGray
    Write-Host '  Mo-TradeScore.bat      (shortcut)' -ForegroundColor DarkGray
    Write-Host "  ${WebDirName}\           (web bundle)" -ForegroundColor DarkGray
    Write-Host ''
    Write-Host 'Khong can Cursor/Node khi chay EXE.' -ForegroundColor DarkGray
    Write-Host ''
}
finally {
    Pop-Location
}
