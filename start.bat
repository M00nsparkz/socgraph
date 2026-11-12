@echo off
setlocal
cd /d "%~dp0"

set "URL=http://127.0.0.1:8000"

if not exist ".venv" (
    echo [setup] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 goto :fail
    .venv\Scripts\python -m pip install -r requirements.txt
    if errorlevel 1 goto :fail
)

if not exist ".venv\Lib\site-packages\fastapi" (
    echo [setup] Installing dependencies...
    .venv\Scripts\python -m pip install -r requirements.txt
    if errorlevel 1 goto :fail
)

echo [run] Starting server at %URL%
echo [stop] Press Ctrl+C in this window to stop.
echo.

if not "%SPRJ_NO_BROWSER%"=="1" (
    start "" /b powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$u='%URL%/health'; for($i=0;$i -lt 75;$i++){ try{ $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1; if($r.StatusCode -eq 200){ Start-Process '%URL%/'; break } } catch { Start-Sleep -Milliseconds 400 } }"
)

.venv\Scripts\python -m uvicorn main:app --reload

echo.
echo Server stopped.
pause
exit /b 0

:fail
echo.
echo Setup failed. Check the error above.
pause
exit /b 1