@echo off
title TradeScore Web v1
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-web.ps1"
echo.
pause
