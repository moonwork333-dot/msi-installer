@echo off
REM Watson RMM Agent - Complete Installation Script
REM NSSM is already included in the MSI, so this script just sets up the service

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set NSSM_EXE=%SCRIPT_DIR%nssm.exe
set SERVICE_NAME=WatsonRMMAgent

color 0A
title Watson RMM Agent Installation

echo.
echo ============================================================
echo Watson RMM Agent - Service Installation
echo ============================================================
echo.

REM Step 1: Verify NSSM exists
echo [STEP 1/4] Verifying NSSM...
if not exist "%NSSM_EXE%" (
  echo ERROR: nssm.exe not found at %NSSM_EXE%
  echo This should have been included in the MSI installation
  exit /b 1
)
echo NSSM verified: %NSSM_EXE%

REM Step 2: Stop and remove existing service
echo.
echo [STEP 2/4] Preparing service installation...
sc query %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo Stopping existing service...
  "%NSSM_EXE%" stop %SERVICE_NAME% >nul 2>&1
  timeout /t 2 /nobreak >nul
  echo Removing existing service...
  "%NSSM_EXE%" remove %SERVICE_NAME% confirm >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Step 3: Create service
echo.
echo [STEP 3/4] Installing service...
call install-service.bat
if errorlevel 1 (
  echo ERROR: Service installation failed
  exit /b 1
)

REM Step 4: Verify service is running
echo.
echo [STEP 4/4] Verifying service...
timeout /t 3 /nobreak >nul
sc query %SERVICE_NAME% | find "RUNNING" >nul
if errorlevel 1 (
  echo.
  echo ============================================================
  echo WARNING: Service may not be running yet
  echo ============================================================
  echo The service has been installed and configured to start automatically
  echo Check logs at: C:\ProgramData\WatsonRMMAgent\agent.log
  echo.
) else (
  echo.
  echo ============================================================
  echo SUCCESS! Service is running
  echo ============================================================
  echo The Watson RMM Agent service has been installed and started
  echo Check logs at: C:\ProgramData\WatsonRMMAgent\agent.log
  echo.
)

echo.
timeout /t 5 /nobreak

exit /b 0
