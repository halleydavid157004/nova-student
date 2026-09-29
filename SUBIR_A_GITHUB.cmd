@echo off
color 0A
title Subiendo Nova Radar a GitHub
echo ========================================================
echo        SUBIENDO TU RADAR A GITHUB (NOVA STUDENT)
echo ========================================================
echo.
echo Te pedira iniciar sesion en GitHub. Sigue las instrucciones.
echo.
cd /d "%~dp0"
git push -u origin main
echo.
echo ========================================================
echo ¡Terminado! Si no hubo errores en rojo, ya esta en tu GitHub.
echo ========================================================
pause
