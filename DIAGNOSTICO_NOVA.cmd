@echo off
setlocal
cd /d "%~dp0"
title Diagnostico Nova Student Radar

echo === NOVA STUDENT RADAR - DIAGNOSTICO ===
echo Carpeta: %CD%
echo.
echo [Node]
where node 2>nul
node -v 2>nul
if errorlevel 1 echo ERROR: Node.js no esta disponible.
echo.
echo [Puerto 4310]
netstat -ano | findstr ":4310" || echo No hay ningun proceso escuchando en 4310.
echo.
echo [API]
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4310/api/health' -TimeoutSec 2 | Select-Object StatusCode,Content } catch { Write-Host $_.Exception.Message }"
echo.
echo [server.log]
if exist "storage\server.log" powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content 'storage/server.log' -Tail 30"
echo.
echo =========================================
pause
