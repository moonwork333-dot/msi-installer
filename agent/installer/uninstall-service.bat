@echo off
REM Uninstall Watson RMM Agent service using NSSM

setlocal enabledelayedexpansion

set INSTALL_DIR=%~dp0
set NSSM_PATH=%INSTALL_DIR%nssm.exe
set SERVICE_NAME=WatsonRMMAgent

echo Uninstalling %SERVICE_NAME% service...

if not exist "%NSSM_PATH%" (
  echo WARNING: nssm.exe not found, attempting direct service removal
  sc stop %SERVICE_NAME% >nul 2>&1
  sc delete %SERVICE_NAME% >nul 2>&1
  exit /b 0
)

REM Stop and remove service using NSSM
"%NSSM_PATH%" stop %SERVICE_NAME% >nul 2>&1
"%NSSM_PATH%" remove %SERVICE_NAME% confirm >nul 2>&1

echo Service removed successfully

exit /b 0
