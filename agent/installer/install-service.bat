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

echo.
echo Installing %SERVICE_NAME% service...

REM Verify NSSM exists
if not exist "%NSSM_EXE%" (
  echo ERROR: nssm.exe not found at %NSSM_EXE%
  exit /b 1
)

REM Verify Agent EXE exists
if not exist "%AGENT_EXE%" (
  echo ERROR: Agent executable not found at %AGENT_EXE%
  exit /b 1
)

REM Create data directory if it doesn't exist
if not exist "%DATA_DIR%" (
  mkdir "%DATA_DIR%"
  echo Created data directory: %DATA_DIR%
)

REM Remove service if it already exists
"%NSSM_EXE%" status %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  echo Removing existing service...
  "%NSSM_EXE%" stop %SERVICE_NAME% >nul 2>&1
  timeout /t 1 /nobreak >nul
  "%NSSM_EXE%" remove %SERVICE_NAME% confirm >nul 2>&1
  timeout /t 1 /nobreak >nul
)

REM Install service with NSSM
echo Installing service: %SERVICE_NAME%
"%NSSM_EXE%" install %SERVICE_NAME% "%AGENT_EXE%"
if errorlevel 1 (
  echo ERROR: Failed to install service
  exit /b 1
)

REM Configure service parameters
echo Configuring service parameters...
"%NSSM_EXE%" set %SERVICE_NAME% AppDirectory "%SCRIPT_DIR%"
"%NSSM_EXE%" set %SERVICE_NAME% AppStdout "%LOG_FILE%"
"%NSSM_EXE%" set %SERVICE_NAME% AppStderr "%LOG_FILE%"
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateSeconds 86400

REM Set service to start automatically
echo Setting service to start automatically...
"%NSSM_EXE%" set %SERVICE_NAME% Start SERVICE_AUTO_START

REM Start the service
echo Starting service...
"%NSSM_EXE%" start %SERVICE_NAME%
if errorlevel 1 (
  echo ERROR: Failed to start service
  exit /b 1
)

echo.
echo Service installation completed successfully
echo Service Name: %SERVICE_NAME%
echo Executable: %AGENT_EXE%
echo Data Directory: %DATA_DIR%
echo Log File: %LOG_FILE%
echo.

exit /b 0
