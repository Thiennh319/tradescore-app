# Tạo AVD TradeScore_Pixel (API 34 x86_64) — chạy một lần
$ErrorActionPreference = "Stop"
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$sdkmanager = Join-Path $sdk "cmdline-tools\latest\bin\sdkmanager.bat"
$avdmanager = Join-Path $sdk "cmdline-tools\latest\bin\avdmanager.bat"
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"

if (-not (Test-Path $sdkmanager)) {
  throw "Thiếu cmdline-tools. Chạy scripts/install-android-cmdline.ps1 trước."
}

$yes = "y`n" * 20
$packages = @(
  "platform-tools",
  "platforms;android-34",
  "system-images;android-34;google_apis;x86_64",
  "emulator"
)

Write-Host "==> Cài SDK packages (có thể mất vài phút)..."
$packages | ForEach-Object { $yes | & $sdkmanager $_ --sdk_root=$sdk }

Write-Host "==> Tạo AVD TradeScore_Pixel..."
echo no | & $avdmanager create avd -n TradeScore_Pixel -k "system-images;android-34;google_apis;x86_64" -d pixel_6 --force

Write-Host "Xong. Chạy: npm run android:emu"
