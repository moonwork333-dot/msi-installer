@echo off
REM Watson RMM Agent - Complete Installation Script
REM This script downloads NSSM, sets it up, and installs the service
REM Run this from the agent/installer directory

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set NSSM_VERSION=2.26
set NSSM_URL=https://nssm.cc/release/nssm-%NSSM_VERSION%.zip
set NSSM_ZIP=%SCRIPT_DIR%nssm-%NSSM_VERSION%.zip
set NSSM_EXTRACT=%SCRIPT_DIR%nssm-extract
set NSSM_EXE=%SCRIPT_DIR%nssm.exe
set SERVICE_NAME=WatsonRMMAgent

color 0A
title Watson RMM Agent Installation

echo.
echo ============================================================
echo Watson RMM Agent - Complete Installation
echo ============================================================
echo.

REM Step 1: Download NSSM
echo [STEP 1/5] Downloading NSSM %NSSM_VERSION%...
if exist "%NSSM_EXE%" (
  echo nssm.exe already exists, skipping download
) else (
  echo Downloading from: %NSSM_URL%
  powershell -Command "(New-Object System.Net.ServicePointManager).SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%NSSM_URL%', '%NSSM_ZIP%')" 2>nul
  
  if not exist "%NSSM_ZIP%" (
    echo ERROR: Failed to download NSSM
    echo Please check your internet connection and try again
    exit /b 1
  )
  echo Download complete: %NSSM_ZIP%
)

REM Step 2: Extract NSSM
echo.
echo [STEP 2/5] Extracting NSSM...
if exist "%NSSM_EXE%" (
  echo nssm.exe already extracted, skipping extraction
) else (
  if not exist "%NSSM_ZIP%" (
    echo ERROR: NSSM ZIP file not found
    exit /b 1
  )
  
  powershell -Command "Expand-Archive -Path '%NSSM_ZIP%' -DestinationPath '%NSSM_EXTRACT%' -Force" 2>nul
  
  if not exist "%NSSM_EXTRACT%" (
    echo ERROR: Failed to extract NSSM
    exit /b 1
  )
  
  REM Copy 64-bit or 32-bit executable
  if exist "%NSSM_EXTRACT%\nssm-%NSSM_VERSION%\win64\nssm.exe" (
    echo Copying 64-bit nssm.exe...
    copy "%NSSM_EXTRACT%\nssm-%NSSM_VERSION%\win64\nssm.exe" "%NSSM_EXE%" >nul
  ) else if exist "%NSSM_EXTRACT%\nssm-%NSSM_VERSION%\win32\nssm.exe" (
    echo Copying 32-bit nssm.exe...
    copy "%NSSM_EXTRACT%\nssm-%NSSM_VERSION%\win32\nssm.exe" "%NSSM_EXE%" >nul
  ) else (
    echo ERROR: Could not find nssm.exe in extracted files
    exit /b 1
  )
  
  echo Extraction complete: %NSSM_EXE%
)

REM Step 3: Verify NSSM
echo.
echo [STEP 3/5] Verifying NSSM...
if not exist "%NSSM_EXE%" (
  echo ERROR: nssm.exe not found
  exit /b 1
)
echo nssm.exe verified: %NSSM_EXE%

REM Step 4: Stop and remove existing service
echo.
echo [STEP 4/5] Preparing service installation...
sc query %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo Stopping existing service...
  "%NSSM_EXE%" stop %SERVICE_NAME% >nul 2>&1
  timeout /t 2 /nobreak >nul
  echo Removing existing service...
  "%NSSM_EXE%" remove %SERVICE_NAME% confirm >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Step 5: Create and start service
echo.
echo [STEP 5/5] Installing and starting service...
call install-service.bat

if errorlevel 1 (
  echo ERROR: Service installation failed
  exit /b 1
)

REM Verify service is running
timeout /t 3 /nobreak >nul
sc query %SERVICE_NAME% | find "RUNNING" >nul
if errorlevel 1 (
  echo.
  echo ============================================================
  echo WARNING: Service may not be running yet
  echo ============================================================
  echo The service has been installed and configured to start automatically
  echo You may need to reboot the system for the service to start
  echo.
  echo Check logs at:
  echo   - C:\ProgramData\WatsonRMMAgent\agent.log
  echo   - C:\ProgramData\WatsonRMMAgent\nssm-%SERVICE_NAME%.log
  echo.
) else (
  echo.
  echo ============================================================
  echo SUCCESS! Service is running
  echo ============================================================
  echo The Watson RMM Agent service has been installed and started
  echo.
  echo Check logs at:
  echo   - C:\ProgramData\WatsonRMMAgent\agent.log
  echo.
)

REM Cleanup
if exist "%NSSM_ZIP%" del "%NSSM_ZIP%" >nul 2>&1
if exist "%NSSM_EXTRACT%" rmdir /s /q "%NSSM_EXTRACT%" >nul 2>&1

echo.
timeout /t 5 /nobreak

exit /b 0
