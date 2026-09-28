@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Nova Student Radar - Launcher

set "URL=http://127.0.0.1:4310"

if not exist "server.js" (
    echo.
    echo [ERROR] No se encontro server.js.
    echo Coloca este archivo dentro de la carpeta nova-student-radar.
    echo.
    pause
    exit /b 1
)

where node.exe >NUL 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js no esta instalado o no esta en PATH.
    echo Instala Node.js y vuelve a intentarlo.
    echo.
    pause
    exit /b 1
)

where curl.exe >NUL 2>&1
if not errorlevel 1 (
    curl.exe -fsS --connect-timeout 1 --max-time 2 "%URL%" >NUL 2>&1
    if not errorlevel 1 goto OPEN
)

echo Iniciando Nova Student Radar...

start "Nova Student Radar Server" /min cmd.exe /d /k "node server.js"

where curl.exe >NUL 2>&1
if errorlevel 1 (
    timeout /t 4 /nobreak >NUL
    goto OPEN
)

for /L %%I in (1,1,30) do (
    curl.exe -fsS --connect-timeout 1 --max-time 1 "%URL%" >NUL 2>&1
    if not errorlevel 1 goto OPEN
    timeout /t 1 /nobreak >NUL
)

echo.
echo [ERROR] El servidor no respondio en 30 segundos.
echo Se dejo abierta una ventana minimizada llamada:
echo "Nova Student Radar Server"
echo Abrela para ver el error real de Node.
echo.
pause
exit /b 1

:OPEN
start "" "%URL%"
exit /b 0
