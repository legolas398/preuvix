@echo off
cd /d "%~dp0"
set "PATH=%CD%\.tools\node-v24.21.0-win-x64;%PATH%"
call npm.cmd run build
if errorlevel 1 goto end
node.exe scripts/free-phone.mjs
:end
pause
