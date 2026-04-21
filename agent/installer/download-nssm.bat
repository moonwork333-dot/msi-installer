@echo off
REM Download NSSM (Non-Sucking Service Manager) and extract nssm.exe
REM This script should be run before building the MSI

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set NSSM_VERSION=2.26
set NSSM_URL=https://nssm.cc/release/nssm-%NSSM_VERSION%.zip
set NSSM_ZIP=%SCRIPT_DIR%nssm-%NSSM_VERSION%.zip
set NSSM_EXTRACT=%SCRIPT_DIR%nssm-extract
set NSSM_EXE=%SCRIPT_DIR%nssm.exe

echo Downloading NSSM %NSSM_VERSION%...
echo URL: %NSSM_URL%

REM Use PowerShell to download (more reliable than bitsadmin on older Windows)
powershell -Command "(New-Object System.Net.ServicePointManager).SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%NSSM_URL%', '%NSSM_ZIP%')"

if not exist "%NSSM_ZIP%" (
  echo ERROR: Failed to download NSSM
  exit /b 1
)

echo Downloaded: %NSSM_ZIP%
echo Extracting...

REM Extract the ZIP file
powershell -Command "Expand-Archive -Path '%NSSM_ZIP%' -DestinationPath '%NSSM_EXTRACT%' -Force"

if not exist "%NSSM_EXTRACT%" (
  echo ERROR: Failed to extract NSSM
  exit /b 1
)

REM Find and copy the 64-bit or 32-bit executable
if exist "%NSSM_EXTRACT%\nssm-%NSSM_VERSION%\win64\nssm.exe" (
  echo Copying 64-bit nssm.exe...
  copy "%NSSM_EXTRACT%\nssm-%NSSM_VERSION%\win64\nssm.exe" "%NSSM_EXE%"
) else if exist "%NSSM_EXTRACT%\nssm-%NSSM_VERSION%\win32\nssm.exe" (
  echo Copying 32-bit nssm.exe...
  copy "%NSSM_EXTRACT%\nssm-%NSSM_VERSION%\win32\nssm.exe" "%NSSM_EXE%"
) else (
  echo ERROR: Could not find nssm.exe in extracted files
  exit /b 1
)

echo Cleaning up...
rmdir /s /q "%NSSM_EXTRACT%" >nul 2>&1
del "%NSSM_ZIP%" >nul 2>&1

if exist "%NSSM_EXE%" (
  echo SUCCESS: nssm.exe is ready at %NSSM_EXE%
  exit /b 0
) else (
  echo ERROR: nssm.exe was not copied successfully
  exit /b 1
)
