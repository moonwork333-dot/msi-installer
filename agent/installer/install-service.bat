@echo off
REM Watson RMM Agent Service Installation Script using NSSM

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set NSSM_EXE=%SCRIPT_DIR%nssm.exe
set SERVICE_NAME=WatsonRMMAgent
set AGENT_EXE=%SCRIPT_DIR%peng-rmm-agent.exe
set CONFIG_FILE=%SCRIPT_DIR%config.json
set DATA_DIR=C:\ProgramData\WatsonRMMAgent
set LOG_FILE=%DATA_DIR%\agent.log

echo [%date% %time%] Starting service installation...

REM Verify NSSM exists
if not exist "%NSSM_EXE%" (
  echo [ERROR] nssm.exe not found at %NSSM_EXE%
  exit /b 1
)

REM Verify Agent EXE exists and is executable
if not exist "%AGENT_EXE%" (
  echo [ERROR] Agent executable not found at %AGENT_EXE%
  exit /b 1
)

echo [%date% %time%] Checking if executable runs directly...
cd /d "%SCRIPT_DIR%"
timeout /t 2 /nobreak >nul
echo Test execution:
"%AGENT_EXE%" 2>&1 | find /V ""
timeout /t 3 /nobreak >nul

REM Create data directory
if not exist "%DATA_DIR%" (
  mkdir "%DATA_DIR%"
  echo [%date% %time%] Created data directory: %DATA_DIR%
)

REM Remove existing service to ensure clean install
echo [%date% %time%] Checking for existing service...
"%NSSM_EXE%" status %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo [%date% %time%] Removing existing service...
  "%NSSM_EXE%" stop %SERVICE_NAME% >nul 2>&1
  timeout /t 2 /nobreak >nul
  "%NSSM_EXE%" remove %SERVICE_NAME% confirm >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Install service with NSSM
echo [%date% %time%] Installing %SERVICE_NAME% service...
"%NSSM_EXE%" install %SERVICE_NAME% "%AGENT_EXE%"
if errorlevel 1 (
  echo [ERROR] Failed to install service with NSSM
  exit /b 1
)

REM Configure service parameters
echo [%date% %time%] Configuring service parameters...

REM Set working directory
"%NSSM_EXE%" set %SERVICE_NAME% AppDirectory "%SCRIPT_DIR%"

REM Configure logging with proper paths
"%NSSM_EXE%" set %SERVICE_NAME% AppStdout "%LOG_FILE%"
"%NSSM_EXE%" set %SERVICE_NAME% AppStderr "%LOG_FILE%"
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateSeconds 86400

REM Set service to start as SYSTEM (default)
REM "%NSSM_EXE%" set %SERVICE_NAME% ObjectName LocalSystem

REM Set service to start automatically
echo [%date% %time%] Setting service to auto-start...
"%NSSM_EXE%" set %SERVICE_NAME% Start SERVICE_AUTO_START

REM Configure restart on failure - 5 second delay with exponential backoff
echo [%date% %time%] Configuring restart on failure...
"%NSSM_EXE%" set %SERVICE_NAME% AppRestartDelay 5000
"%NSSM_EXE%" set %SERVICE_NAME% AppThrottle 1500
"%NSSM_EXE%" set %SERVICE_NAME% AppExit Default Restart

REM Add environment variables for the service
"%NSSM_EXE%" set %SERVICE_NAME% AppEnvironmentExtra NODE_ENV=production
"%NSSM_EXE%" set %SERVICE_NAME% AppEnvironmentExtra PROGRAMDATA=C:\ProgramData

REM Start the service
echo [%date% %time%] Starting %SERVICE_NAME% service...
"%NSSM_EXE%" start %SERVICE_NAME%

timeout /t 3 /nobreak >nul

REM Check service status
echo [%date% %time%] Checking service status...
"%NSSM_EXE%" status %SERVICE_NAME%

REM Dump service configuration for debugging
echo [%date% %time%] Service configuration:
"%NSSM_EXE%" dump %SERVICE_NAME%

echo.
echo [%date% %time%] Service installation completed
echo Service Name: %SERVICE_NAME%
echo Executable: %AGENT_EXE%
echo Data Directory: %DATA_DIR%
echo Log File: %LOG_FILE%
echo.

exit /b 0
