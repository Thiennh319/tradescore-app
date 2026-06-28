# Cài Android SDK command-line tools (sdkmanager / avdmanager)
$ErrorActionPreference = "Stop"
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$dest = Join-Path $sdk "cmdline-tools\latest"
if (Test-Path (Join-Path $dest "bin\sdkmanager.bat")) {
  Write-Host "cmdline-tools đã có sẵn."
  exit 0
}
$zip = Join-Path $env:TEMP "cmdline-tools.zip"
$url = "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip"
Write-Host "Tải cmdline-tools..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
$extract = Join-Path $env:TEMP "cmdline-tools-extract"
Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $extract -Force
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $extract "cmdline-tools\*") $dest -Recurse -Force
Write-Host "Đã cài cmdline-tools tại $dest"
