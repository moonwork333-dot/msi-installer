@echo off
REM Install Watson RMM Agent as Windows Service using NSSM (Non-Sucking Service Manager)
REM NSSM is a lightweight tool that properly wraps any executable as a Windows service
REM Download: https://nssm.cc/download

setlocal enabledelayedexpansion

set INSTALL_DIR=%~dp0
set EXE_PATH=%INSTALL_DIR%peng-rmm-agent.exe
set NSSM_PATH=%INSTALL_DIR%nssm.exe
set SERVICE_NAME=WatsonRMMAgent
set SERVICE_DISPLAY=Watson RMM Agent

echo Installing %SERVICE_DISPLAY% service...
echo Service path: %EXE_PATH%
echo NSSM path: %NSSM_PATH%
echo Install dir: %INSTALL_DIR%

REM Check if NSSM exists
if not exist "%NSSM_PATH%" (
  echo ERROR: nssm.exe not found at %NSSM_PATH%
  echo Please download NSSM from https://nssm.cc/download and place nssm.exe in the installation directory
  exit /b 1
)

REM Stop and remove service if it already exists
sc query %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo Service already exists. Stopping and removing...
  "%NSSM_PATH%" stop %SERVICE_NAME% >nul 2>&1
  "%NSSM_PATH%" remove %SERVICE_NAME% confirm >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Create new service using NSSM
echo Creating service with NSSM...
"%NSSM_PATH%" install %SERVICE_NAME% "%EXE_PATH%"
if errorlevel 1 (
  echo ERROR: Failed to create service with NSSM
  exit /b 1
)

REM Set service properties
"%NSSM_PATH%" set %SERVICE_NAME% AppDirectory "%INSTALL_DIR%"
"%NSSM_PATH%" set %SERVICE_NAME% AppThrottle 1000
"%NSSM_PATH%" set %SERVICE_NAME% DisplayName "%SERVICE_DISPLAY%"
"%NSSM_PATH%" set %SERVICE_NAME% Description "Remote monitoring and management agent for Watson RMM"

REM Set crash recovery - restart service on failure after 5 seconds
"%NSSM_PATH%" set %SERVICE_NAME% AppExit Default Restart
"%NSSM_PATH%" set %SERVICE_NAME% AppRestartDelay 5000

REM Configure service to start automatically
"%NSSM_PATH%" set %SERVICE_NAME% Start SERVICE_AUTO_START

echo Service created successfully with NSSM
timeout /t 1 /nobreak >nul

REM Start the service
echo Starting service...
"%NSSM_PATH%" start %SERVICE_NAME%
if errorlevel 1 (
  echo WARNING: Could not start service immediately
  echo The service is configured to start automatically on the next system reboot
  timeout /t 2 /nobreak >nul
) else (
  echo Service started successfully
)

REM Verify service is running
timeout /t 2 /nobreak >nul
sc query %SERVICE_NAME% | find "RUNNING" >nul
if errorlevel 1 (
  echo WARNING: Service may not be running yet
  echo Check logs at: C:\ProgramData\WatsonRMMAgent\agent.log
) else (
  echo Service is running successfully!
)

exit /b 0
