@echo off
chcp 65001 >nul
title Vettly - AI Career Architect ^& Prep Studio
cls
echo.
echo   ==============================================================
echo     VETTLY - AI CAREER ARCHITECT ^& TECHNICAL PREP STUDIO
echo   ==============================================================
echo     Dashboard URL  : http://127.0.0.1:8766
echo     API Telemetry  : http://127.0.0.1:8766/api/health
echo     Auto-Browser   : Enabled (Opening in default browser...)
echo   ==============================================================
echo.

REM Ensure port 8766 is free if a previous Vettly instance was left open
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1

cd /d "%~dp0backend"
set AUTO_OPEN_BROWSER=1
set PYTHONUTF8=1

if exist "..\..\acemate\backend\venv\Scripts\python.exe" (
    "..\..\acemate\backend\venv\Scripts\python.exe" main.py
) else if exist "venv\Scripts\python.exe" (
    "venv\Scripts\python.exe" main.py
) else (
    python main.py
)
pause
