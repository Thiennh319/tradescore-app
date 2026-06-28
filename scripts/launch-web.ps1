# TradeScore Web v1 — double-click launcher (bat / exe)
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $ProjectRoot 'TradeScore-web-v1'
$Port = 5173
$Url = "http://localhost:$Port"

function Test-ServerUp {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Show-ErrorBox([string]$Message) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($Message, 'TradeScore Web v1', 'OK', 'Error') | Out-Null
}

Write-Host ''
Write-Host '  TradeScore Web v1' -ForegroundColor Yellow
Write-Host '  -----------------' -ForegroundColor DarkGray
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Show-ErrorBox "Chua cai Node.js.`nTai ve: https://nodejs.org`nCai xong chay lai file nay."
    exit 1
}

if (-not (Test-Path (Join-Path $WebDir 'index.html'))) {
    Write-Host 'Chua co ban web v1 — dang export (lan dau co the mat 1-2 phut)...' -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
        & npx expo export --platform web --output-dir TradeScore-web-v1
        if ($LASTEXITCODE -ne 0) { throw 'expo export that bai' }
    } catch {
        Show-ErrorBox "Khong export duoc web app.`nChay trong thu muc project:`nnpx expo export --platform web --output-dir TradeScore-web-v1"
        Pop-Location
        exit 1
    }
    Pop-Location
}

if (Test-ServerUp) {
    Write-Host "Server da chay san tai $Url" -ForegroundColor Green
    Start-Process $Url
    Write-Host ''
    Write-Host 'Trinh duyet da mo. Dong cua so nay neu khong can gi.' -ForegroundColor DarkGray
    exit 0
}

Write-Host "Khoi dong server tai $Url ..." -ForegroundColor Cyan

$serveCmd = "cd `"$WebDir`"; npx --yes serve -l $Port"
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $serveCmd -WindowStyle Minimized | Out-Null

$ready = $false
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    if (Test-ServerUp) {
        $ready = $true
        break
    }
    Write-Host '.' -NoNewline
}

Write-Host ''

if (-not $ready) {
    Show-ErrorBox "Khong khoi dong duoc server sau 45 giay.`nThu mo PowerShell va chay:`ncd TradeScore-web-v1`nnpx serve -l $Port"
    exit 1
}

Write-Host "OK — $Url" -ForegroundColor Green
Start-Process $Url
Write-Host ''
Write-Host 'App dang chay. Server chay nen (cua so cmd thu nho).' -ForegroundColor DarkGray
Write-Host 'De tat: Task Manager -> tim node/cmd serve, hoac khoi dong lai may.' -ForegroundColor DarkGray
Write-Host ''
