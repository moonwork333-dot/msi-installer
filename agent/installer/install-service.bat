@echo off
REM Install Watson RMM Agent as Windows Service using VBS wrapper
REM This script is called by WiX during MSI installation

setlocal enabledelayedexpansion

set INSTALL_DIR=%~dp0
set EXE_PATH=%INSTALL_DIR%peng-rmm-agent.exe
set VBS_WRAPPER=%INSTALL_DIR%service-wrapper.vbs
set SERVICE_NAME=WatsonRMMAgent
set SERVICE_DISPLAY=Watson RMM Agent

echo Installing %SERVICE_DISPLAY% service...
echo Service path: %EXE_PATH%
echo Wrapper path: %VBS_WRAPPER%
echo Install dir: %INSTALL_DIR%

REM Delete service if it already exists
sc query %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo Service already exists. Stopping and removing...
  net stop %SERVICE_NAME% >nul 2>&1
  sc delete %SERVICE_NAME% >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Create new service pointing to VBS wrapper
REM Important: Pass the installation directory as an argument to VBS
REM This ensures the VBS knows where to find the EXE when running from C:\Windows\system32
sc create %SERVICE_NAME% binPath= "cscript.exe \"%VBS_WRAPPER%\" \"%INSTALL_DIR:~0,-1%\"" start= auto DisplayName= "%SERVICE_DISPLAY%"
if errorlevel 1 (
  echo ERROR: Failed to create service
  echo Attempted command: sc create %SERVICE_NAME% binPath= "cscript.exe \"%VBS_WRAPPER%\" \"%INSTALL_DIR:~0,-1%\"" start= auto DisplayName= "%SERVICE_DISPLAY%"
  exit /b 1
)

echo Service created successfully
timeout /t 1 /nobreak >nul

REM Set service description
sc description %SERVICE_NAME% "Remote monitoring and management agent for Watson RMM"

REM Set recovery options - restart on failure
sc failure %SERVICE_NAME% reset= 60 actions= restart/5000/restart/5000/restart/5000

REM Start the service immediately
echo Starting service...
timeout /t 1 /nobreak >nul
net start %SERVICE_NAME%
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
  echo Checking logs at: C:\ProgramData\WatsonRMMAgent\agent.log
  echo VBS Wrapper log: C:\ProgramData\WatsonRMMAgent\service-wrapper.log
) else (
  echo Service is running successfully!
)

exit /b 0
