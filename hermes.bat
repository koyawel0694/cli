@echo off
setlocal
cd /d "%~dp0"

set HERMES_HEALTH=%TEMP%\hermes-health.txt
curl.exe -s -o nul -w "%%{http_code}" http://localhost:4000/api/health > "%HERMES_HEALTH%" 2>nul
set /p HEALTH=<"%HERMES_HEALTH%"

if "%HEALTH%"=="200" (
  echo Backend already running on port 4000.
) else (
  echo Starting Hermes backend...
  pushd "%~dp0backend"
  start "Hermes backend" /min cmd /c "node server.js"
  popd
  set /a TRY=0
  :wait
  timeout /t 1 /nobreak > nul
  set /a TRY+=1
  curl.exe -s -o nul -w "%%{http_code}" http://localhost:4000/api/health > "%HERMES_HEALTH%" 2>nul
  set /p HEALTH2=<"%HERMES_HEALTH%"
  if "%HEALTH2%"=="200" goto up
  if %TRY% GEQ 30 goto fail
  goto wait
  :fail
  echo.
  echo Backend failed to start. Check the "Hermes backend" window for errors.
  exit /b 1
  :up
  echo Backend is up.
)

node cli\hermes.js %*
exit /b %ERRORLEVEL%