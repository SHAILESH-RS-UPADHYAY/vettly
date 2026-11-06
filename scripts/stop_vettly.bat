@echo off
chcp 65001 >nul
title Stop Vettly Server
echo Stopping Vettly Server on Port 8766...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo Vettly Server stopped cleanly.
timeout /t 2 >nul
