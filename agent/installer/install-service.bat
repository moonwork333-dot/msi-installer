@echo off
REM Install Watson RMM Agent as Windows Service using native sc.exe
REM This script is called by WiX during MSI installation

setlocal enabledelayedexpansion

set INSTALL_DIR=%~dp0
set EXE_PATH="%INSTALL_DIR%peng-rmm-agent.exe"
set SERVICE_NAME=WatsonRMMAgent
set SERVICE_DISPLAY=Watson RMM Agent

echo Installing %SERVICE_DISPLAY% service...
echo Service path: %EXE_PATH%

REM Delete service if it already exists
sc query %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo Service already exists. Stopping...
  net stop %SERVICE_NAME% >nul 2>&1
  sc delete %SERVICE_NAME% >nul 2>&1
)

REM Create new service
sc create %SERVICE_NAME% binPath= %EXE_PATH% start= auto DisplayName= "%SERVICE_DISPLAY%"
if errorlevel 1 (
  echo ERROR: Failed to create service
  exit /b 1
)

REM Set service description
sc description %SERVICE_NAME% "Remote monitoring and management agent for Watson RMM"

REM Set recovery options
sc failure %SERVICE_NAME% reset= 60 actions= restart/5000

REM Start the service
net start %SERVICE_NAME%
if errorlevel 1 (
  echo ERROR: Failed to start service
  exit /b 1
)

echo Service installed and started successfully
exit /b 0
