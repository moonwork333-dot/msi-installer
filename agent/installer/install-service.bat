@echo off
REM Install Watson RMM Agent as Windows Service using NSSM

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set NSSM_EXE=%SCRIPT_DIR%nssm.exe
set SERVICE_NAME=WatsonRMMAgent
set AGENT_EXE=%SCRIPT_DIR%peng-rmm-agent.exe
set CONFIG_FILE=%SCRIPT_DIR%config.json
set DATA_DIR=C:\ProgramData\WatsonRMMAgent
set LOG_FILE=%DATA_DIR%\agent.log

echo [INSTALL-SERVICE] Starting service installation...

REM Verify NSSM exists
if not exist "%NSSM_EXE%" (
  echo [ERROR] nssm.exe not found at %NSSM_EXE%
  exit /b 1
)

REM Verify Agent EXE exists
if not exist "%AGENT_EXE%" (
  echo [ERROR] Agent executable not found at %AGENT_EXE%
  exit /b 1
)

REM Create data directory if it doesn't exist
if not exist "%DATA_DIR%" (
  mkdir "%DATA_DIR%"
  echo [INSTALL-SERVICE] Created data directory: %DATA_DIR%
)

REM Remove existing service to ensure clean install
echo [INSTALL-SERVICE] Checking for existing service...
"%NSSM_EXE%" status %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo [INSTALL-SERVICE] Removing existing service...
  "%NSSM_EXE%" stop %SERVICE_NAME% >nul 2>&1
  timeout /t 2 /nobreak >nul
  "%NSSM_EXE%" remove %SERVICE_NAME% confirm >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Install service with NSSM
echo [INSTALL-SERVICE] Installing %SERVICE_NAME% service...
"%NSSM_EXE%" install %SERVICE_NAME% "%AGENT_EXE%"
if errorlevel 1 (
  echo [ERROR] Failed to install service with NSSM
  exit /b 1
)

REM Configure service parameters
echo [INSTALL-SERVICE] Configuring service parameters...

REM Set working directory
"%NSSM_EXE%" set %SERVICE_NAME% AppDirectory "%SCRIPT_DIR%"

REM Configure logging
"%NSSM_EXE%" set %SERVICE_NAME% AppStdout "%LOG_FILE%"
"%NSSM_EXE%" set %SERVICE_NAME% AppStderr "%LOG_FILE%"
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateSeconds 86400

REM Set service to start automatically on system boot
echo [INSTALL-SERVICE] Setting service to auto-start...
"%NSSM_EXE%" set %SERVICE_NAME% Start SERVICE_AUTO_START

REM Configure restart behavior - restart on failure after 5 seconds
echo [INSTALL-SERVICE] Configuring restart on failure...
"%NSSM_EXE%" set %SERVICE_NAME% AppRestartDelay 5000
"%NSSM_EXE%" set %SERVICE_NAME% AppThrottle 1500

REM Set service to restart on non-zero exit code
"%NSSM_EXE%" set %SERVICE_NAME% AppExit Default Restart

REM Start the service
echo [INSTALL-SERVICE] Starting %SERVICE_NAME% service...
"%NSSM_EXE%" start %SERVICE_NAME%
if errorlevel 1 (
  echo [ERROR] Failed to start service - checking status...
  "%NSSM_EXE%" status %SERVICE_NAME%
  exit /b 1
)

REM Wait for service to stabilize
timeout /t 3 /nobreak >nul

REM Verify service is running
echo [INSTALL-SERVICE] Verifying service status...
"%NSSM_EXE%" status %SERVICE_NAME%
if errorlevel 1 (
  echo [WARNING] Service may not have started properly
) else (
  echo [INSTALL-SERVICE] Service verification passed
)

echo.
echo [INSTALL-SERVICE] Service installation completed
echo Service Name: %SERVICE_NAME%
echo Executable: %AGENT_EXE%
echo Data Directory: %DATA_DIR%
echo Log File: %LOG_FILE%
echo Auto-start: Enabled
echo.

exit /b 0
