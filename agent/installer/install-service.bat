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
echo Install dir: %INSTALL_DIR%

REM Delete service if it already exists
sc query %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo Service already exists. Stopping and removing...
  net stop %SERVICE_NAME% >nul 2>&1
  sc delete %SERVICE_NAME% >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Create new service with full path and working directory
REM IMPORTANT: Use /Path not binPath to specify working directory
sc create %SERVICE_NAME% binPath= %EXE_PATH% start= auto DisplayName= "%SERVICE_DISPLAY%" 
if errorlevel 1 (
  echo ERROR: Failed to create service
  exit /b 1
)

REM Set service to run in the install directory (working directory)
REM This ensures the process can find all its dependencies
sc config %SERVICE_NAME% binPath= "%EXE_PATH%" start= auto
if errorlevel 1 (
  echo WARNING: Could not configure service working directory
)

REM Set service description
sc description %SERVICE_NAME% "Remote monitoring and management agent for Watson RMM"

REM Set recovery options - restart on failure
sc failure %SERVICE_NAME% reset= 60 actions= restart/5000/restart/5000/restart/5000

REM Allow service to interact with desktop session (might be needed for screenshots)
REM This will fail on some systems but that's OK
sc config %SERVICE_NAME% type= own interact= on >nul 2>&1

REM Start the service immediately
echo Starting service...
timeout /t 1 /nobreak >nul
net start %SERVICE_NAME%
if errorlevel 1 (
  echo WARNING: Could not start service immediately
  echo The service is configured to start automatically on the next system reboot
  timeout /t 2 /nobreak >nul
)

REM Verify service is running
timeout /t 3 /nobreak >nul
sc query %SERVICE_NAME% | find "RUNNING" >nul
if errorlevel 1 (
  echo WARNING: Service may not be running yet
  echo Checking logs at: C:\ProgramData\WatsonRMMAgent\agent.log
  echo Fallback log: C:\watson-agent-startup.log
) else (
  echo Service is running successfully
)

exit /b 0
