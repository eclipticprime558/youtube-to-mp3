@echo off
echo Starting YouTube to MP3 Converter...
echo.

:: Move to the script's directory so relative paths work
cd /d "%~dp0"

:: Check if server requirements are installed
python -c "import flask, yt_dlp" >nul 2>&1
if errorlevel 1 (
    echo Dependencies not installed. Running setup first...
    call setup.bat
)

:: Start the server in background
start "YT-MP3 Server" /min python server\app.py

:: Wait briefly then open browser
timeout /t 2 /nobreak >nul
start http://localhost:5000

echo Server is running at http://localhost:5000
echo Close the "YT-MP3 Server" window to stop the server.
