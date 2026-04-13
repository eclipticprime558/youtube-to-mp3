@echo off
echo ============================================
echo  YouTube to MP3 Converter - Setup
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo [1/3] Installing Python dependencies...
pip install -r server\requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed.
    pause
    exit /b 1
)
echo Done.
echo.

:: Check ffmpeg
ffmpeg -version >nul 2>&1
if not errorlevel 1 (
    echo [2/3] ffmpeg already installed. Skipping.
) else (
    echo [2/3] Installing ffmpeg via winget...
    winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo.
        echo winget install failed. Trying Chocolatey...
        choco install ffmpeg -y 2>nul
        if errorlevel 1 (
            echo.
            echo -----------------------------------------------
            echo  Could not auto-install ffmpeg.
            echo  Please install it manually:
            echo    1. Go to https://ffmpeg.org/download.html
            echo    2. Download the Windows build
            echo    3. Extract and add the bin\ folder to PATH
            echo -----------------------------------------------
        ) else (
            echo ffmpeg installed via Chocolatey.
        )
    ) else (
        echo ffmpeg installed via winget.
    )
)
echo.

:: Create default output folder
echo [3/3] Creating default output folder...
if not exist "%USERPROFILE%\Music\VLC" mkdir "%USERPROFILE%\Music\VLC"
echo Output folder: %USERPROFILE%\Music\VLC
echo.

echo ============================================
echo  Setup complete! Run start.bat to launch.
echo ============================================
pause
