@echo off
setlocal

set PORT=8010
cd /d "%~dp0"

where php >nul 2>nul
if errorlevel 1 (
  echo PHP was not found on your PATH.
  echo Install PHP, then run this file again.
  pause
  exit /b 1
)

echo Starting Numbas Diagnostic Tool Analysis JS...
echo.
echo URL: http://127.0.0.1:%PORT%/
echo Keep this window open while using the app.
echo Press Ctrl+C in this window to stop the server.
echo.

start "" "http://127.0.0.1:%PORT%/"
php -S 127.0.0.1:%PORT% -t "%CD%"

pause
