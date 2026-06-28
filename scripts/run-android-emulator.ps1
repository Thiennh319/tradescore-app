# TradeScore — chạy APK trên giả lập Android (Windows)
# Yêu cầu: ANDROID_HOME trỏ tới Android SDK, đã có AVD tên "TradeScore_Pixel"

param(
  [string]$ApkPath = "$PSScriptRoot\..\dist\TradeScore-v1.0.1.apk",
  [string]$AvdName = "TradeScore_Pixel",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$adb = Join-Path $sdk "platform-tools\adb.exe"
$emu = Join-Path $sdk "emulator\emulator.exe"
$env:PATH = "$(Split-Path $adb);$env:PATH"

if (-not (Test-Path $adb)) { throw "Không tìm thấy adb tại $adb. Cài Android SDK Platform-Tools." }
if (-not (Test-Path $emu)) { throw "Không tìm thấy emulator tại $emu. Cài Android Emulator trong SDK Manager." }

if (-not $SkipBuild) {
  Write-Host "==> Build APK (ARM + x86_64 cho giả lập)..."
  $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
  Push-Location (Join-Path $PSScriptRoot "..")
  npm run build:apk
  Pop-Location
  $src = Join-Path $PSScriptRoot "..\android\app\build\outputs\apk\release\app-release.apk"
  $distDir = Join-Path $PSScriptRoot "..\dist"
  New-Item -ItemType Directory -Force -Path $distDir | Out-Null
  $ver = (Get-Content (Join-Path $PSScriptRoot "..\package.json") | ConvertFrom-Json).version
  $out = Join-Path $distDir "TradeScore-v$ver.apk"
  Copy-Item $src $out -Force
  $ApkPath = $out
}

if (-not (Test-Path $ApkPath)) { throw "Không tìm thấy APK: $ApkPath" }

$devices = & $adb devices | Select-String "device$"
if (-not $devices) {
  $avds = & $emu -list-avds 2>$null
  if ($avds -notcontains $AvdName) {
    Write-Host @"

Chưa có giả lập '$AvdName'.
Mở Android Studio -> Device Manager -> Create Device -> Pixel 6 -> API 34 (x86_64) -> tên AVD: $AvdName
Hoặc chạy: npm run android:setup-avd

"@
    throw "Chưa có thiết bị/emulator."
  }
  Write-Host "==> Khởi động giả lập $AvdName ..."
  Start-Process -FilePath $emu -ArgumentList @("-avd", $AvdName, "-no-snapshot-load") -WindowStyle Normal
  Write-Host "    Đợi emulator boot (có thể 1–3 phút)..."
  & $adb wait-for-device
  $deadline = (Get-Date).AddMinutes(5)
  do {
    $boot = & $adb shell getprop sys.boot_completed 2>$null
    if ($boot -match "1") { break }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
}

Write-Host "==> Gỡ bản cũ (nếu có) và cài APK..."
& $adb uninstall com.tradescore.app 2>$null | Out-Null
& $adb install -r $ApkPath
Write-Host "==> Mở TradeScore..."
& $adb shell am start -n com.tradescore.app/.MainActivity
Write-Host ""
Write-Host "Xong. Xem log crash: npm run android:log"
Write-Host "APK: $ApkPath"
