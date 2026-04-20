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
  echo Service already exists. Stopping and removing...
  net stop %SERVICE_NAME% >nul 2>&1
  sc delete %SERVICE_NAME% >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Create new service - use start= auto so it auto-starts on reboot
sc create %SERVICE_NAME% binPath= %EXE_PATH% start= auto DisplayName= "%SERVICE_DISPLAY%"
if errorlevel 1 (
  echo ERROR: Failed to create service
  exit /b 1
)

REM Set service description
sc description %SERVICE_NAME% "Remote monitoring and management agent for Watson RMM"

REM Set recovery options - restart service on failure after 5 seconds, max 3 restarts in 60 seconds
sc failure %SERVICE_NAME% reset= 60 actions= restart/5000/restart/5000/restart/5000

REM Allow service to interact with desktop (for screenshot capture)
REM Note: This may not work on all Windows versions but doesn't hurt to try
sc config %SERVICE_NAME% type= own

REM Start the service immediately (don't wait for reboot)
echo Starting service...
timeout /t 1 /nobreak >nul
net start %SERVICE_NAME%
if errorlevel 1 (
  echo WARNING: Could not start service immediately
  echo The service is configured to start automatically on the next system reboot
  exit /b 0
)

REM Verify service is running
timeout /t 2 /nobreak >nul
sc query %SERVICE_NAME% | find "RUNNING" >nul
if errorlevel 1 (
  echo WARNING: Service may not have started properly
  echo Check the agent log at: C:\ProgramData\WatsonRMMAgent\agent.log
  exit /b 0
)

echo Service installed and started successfully
exit /b 0
