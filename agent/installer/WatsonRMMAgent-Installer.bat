@echo off
REM Watson RMM Agent Installer
REM Run this as Administrator

setlocal enabledelayedexpansion

set INSTALL_DIR=C:\Program Files\Watson RMM Agent
set DATA_DIR=C:\ProgramData\WatsonRMMAgent

echo.
echo ============================================================
echo Watson RMM Agent Installation
echo ============================================================
echo.

REM Check if running as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: This installer must be run as Administrator
  echo.
  echo Please right-click this file and select "Run as administrator"
  pause
  exit /b 1
)

REM Create directories
echo [STEP 1] Creating directories...
if not exist "%INSTALL_DIR%" (
  mkdir "%INSTALL_DIR%"
  echo Created: %INSTALL_DIR%
)

if not exist "%DATA_DIR%" (
  mkdir "%DATA_DIR%"
  echo Created: %DATA_DIR%
)

REM Copy files from current directory to installation directory
echo [STEP 2] Copying files...
setlocal enabledelayedexpansion
for %%F in (peng-rmm-agent.exe config.json nssm.exe setup.bat install-service.bat uninstall-service.bat) do (
  if exist "%%F" (
    copy "%%F" "%INSTALL_DIR%\%%F" /Y >nul
    if !errorlevel! equ 0 (
      echo Copied: %%F
    ) else (
      echo ERROR: Failed to copy %%F
      exit /b 1
    )
  ) else (
    echo ERROR: File not found: %%F
    exit /b 1
  )
)
endlocal

REM Verify installation
echo [STEP 3] Verifying installation...
if not exist "%INSTALL_DIR%\peng-rmm-agent.exe" (
  echo ERROR: Installation failed - executable not found
  exit /b 1
)
echo All files copied successfully

REM Run setup.bat to register service
echo [STEP 4] Registering service...
cd /d "%INSTALL_DIR%"
call setup.bat
if %errorlevel% neq 0 (
  echo ERROR: Service registration failed
  exit /b 1
)

echo.
echo ============================================================
echo Installation completed successfully!
echo ============================================================
echo.
echo Service: WatsonRMMAgent
echo Location: %INSTALL_DIR%
echo.
echo Checking service status...
timeout /t 2 >nul
sc query WatsonRMMAgent
echo.
echo Checking running process...
tasklist | find "peng-rmm-agent"
echo.
pause
exit /b 0
