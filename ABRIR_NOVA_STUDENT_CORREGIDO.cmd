@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Nova Student Radar

set "URL=http://127.0.0.1:4310"
set "HEALTH=http://127.0.0.1:4310/api/health"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    pause
    exit /b 1
)

if not exist "server.js" (
    echo [ERROR] No se encontro server.js.
    echo Pon este archivo dentro de la carpeta nova-student-radar.
    pause
    exit /b 1
)

curl.exe -fsS --max-time 1 "%HEALTH%" >nul 2>&1
if not errorlevel 1 goto READY

echo Iniciando Nova Student Radar...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$wd=(Get-Location).Path; Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory $wd -WindowStyle Hidden" >nul 2>&1

for /L %%I in (1,1,40) do (
    curl.exe -fsS --max-time 1 "%HEALTH%" >nul 2>&1
    if not errorlevel 1 goto READY
    timeout /t 1 /nobreak >nul
)

echo.
echo [ERROR] Nova Student Radar no pudo iniciar.
echo.
echo Prueba manual:
echo   node server.js
echo.
pause
exit /b 1

:READY
start "" "%URL%"
exit /b 0
