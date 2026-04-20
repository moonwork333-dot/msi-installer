@echo off
REM Uninstall Watson RMM Agent Windows Service
REM This script is called by WiX during MSI uninstallation

setlocal enabledelayedexpansion

set SERVICE_NAME=WatsonRMMAgent

echo Uninstalling %SERVICE_NAME% service...

REM Stop the service
net stop %SERVICE_NAME% >nul 2>&1

REM Delete the service
sc delete %SERVICE_NAME%
if errorlevel 1 (
  echo WARNING: Failed to delete service, but continuing uninstall
)

echo Service uninstalled successfully
exit /b 0
