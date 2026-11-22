@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 is required to serve the static preview.
  pause
  exit /b 1
)
python "%~dp0preview.py" --port 8836
pause
