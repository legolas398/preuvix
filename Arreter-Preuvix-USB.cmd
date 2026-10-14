@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Test-Android-USB.ps1" -Stop
echo.
pause
