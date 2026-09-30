@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Nova Student Radar

if not exist "server.js" goto MISSING
where node.exe >nul 2>&1
if errorlevel 1 goto NODE_MISSING
node.exe -e "if(Number(process.versions.node.split('.')[0]) < 20) process.exit(1)"
if errorlevel 1 goto NODE_MISSING
if not exist ".env" copy /y ".env.example" ".env" >nul
if not exist ".env" goto ENV_MISSING

set "NOVA_LAUNCH_PORT="
for /f "delims=" %%P in ('node.exe --input-type=module -e "await import('./src/env.js'); const p=Number(process.env.PORT || 4310); if(!Number.isInteger(p) || p < 1 || p > 65535) process.exit(1); process.stdout.write(String(p))"') do set "NOVA_LAUNCH_PORT=%%P"
if not defined NOVA_LAUNCH_PORT goto BAD_PORT
set "NOVA_LAUNCH_URL=http://127.0.0.1:%NOVA_LAUNCH_PORT%"
if /i "%~1"=="--diagnostico" goto DIAGNOSE

call :PROBE
if not errorlevel 1 goto READY
echo Iniciando Nova Student Radar. Los errores aparecen en la ventana del servidor.
start "Nova Student Radar Server" /min cmd.exe /d /k "node.exe server.js"
for /L %%I in (1,1,40) do (
    call :PROBE
    if not errorlevel 1 goto READY
    timeout /t 1 /nobreak >nul
)
echo [ERROR] El servidor no respondio. Abre la ventana Nova Student Radar Server.
echo Tambien puedes ejecutar ABRIR_NOVA_STUDENT.cmd --diagnostico
pause
exit /b 1

:READY
if /i "%~1"=="--no-browser" exit /b 0
start "" "%NOVA_LAUNCH_URL%"
exit /b 0

:PROBE
node.exe -e "fetch(process.env.NOVA_LAUNCH_URL+'/api/health',{signal:AbortSignal.timeout(1500)}).then(async r=>{const j=await r.json();if(!r.ok || !j.ok || !j.storage?.ready || j.storage?.error || typeof j.version!=='string')process.exit(1)}).catch(()=>process.exit(1))" >nul 2>&1
exit /b %errorlevel%

:DIAGNOSE
echo Diagnostico local. No imprime secretos, correos ni registros privados.
node.exe --version
echo URL: %NOVA_LAUNCH_URL%
call :PROBE
if errorlevel 1 (
    echo El servidor no esta disponible. Ejecuta npm start para ver el error.
) else (
    echo API de salud disponible y almacenamiento listo.
)
pause
exit /b 0

:MISSING
echo [ERROR] Descomprime todo el proyecto. Falta server.js junto al lanzador.
goto FAIL
:NODE_MISSING
echo [ERROR] Instala Node.js 24 LTS desde https://nodejs.org/ y vuelve a abrir.
echo El codigo conserva compatibilidad con Node.js 20.
goto FAIL
:ENV_MISSING
echo [ERROR] No se pudo crear .env. Comprueba los permisos de esta carpeta.
goto FAIL
:BAD_PORT
echo [ERROR] PORT debe ser un numero entre 1 y 65535 en .env o el entorno.
:FAIL
pause
exit /b 1
