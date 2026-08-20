@echo off
title Hermes - Dev Servers
echo Starting Hermes backend (port 4000)...
start "Hermes Backend" cmd /k "cd /d %~dp0backend && npm run dev"
echo Starting Hermes frontend (port 5173)...
start "Hermes Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.
echo Hermes is running! Open http://localhost:5173
pause