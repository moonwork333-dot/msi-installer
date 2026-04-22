@echo off
REM Watson RMM Agent Service Installation using Node.js runtime

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set NSSM_EXE=%SCRIPT_DIR%nssm.exe
set SERVICE_NAME=WatsonRMMAgent
set SERVICE_WRAPPER=%SCRIPT_DIR%service\run-service.bat
set DATA_DIR=C:\ProgramData\WatsonRMMAgent
set LOG_FILE=%DATA_DIR%\agent.log

echo [%date% %time%] Starting service installation...

REM Verify NSSM exists
if not exist "%NSSM_EXE%" (
  echo [ERROR] nssm.exe not found
  exit /b 1
)

REM Verify service wrapper exists
if not exist "%SERVICE_WRAPPER%" (
  echo [ERROR] service\run-service.bat not found
  exit /b 1
)

REM Create data directory
if not exist "%DATA_DIR%" (
  mkdir "%DATA_DIR%"
)

REM Remove existing service
echo [%date% %time%] Removing existing service if present...
"%NSSM_EXE%" status %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
  "%NSSM_EXE%" stop %SERVICE_NAME% >nul 2>&1
  timeout /t 2 /nobreak >nul
  "%NSSM_EXE%" remove %SERVICE_NAME% confirm >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Install service
echo [%date% %time%] Installing service...
"%NSSM_EXE%" install %SERVICE_NAME% "%SERVICE_WRAPPER%"
if errorlevel 1 (
  echo [ERROR] Failed to install service
  exit /b 1
)

REM Configure service
echo [%date% %time%] Configuring service...
"%NSSM_EXE%" set %SERVICE_NAME% AppDirectory "%SCRIPT_DIR%service"
"%NSSM_EXE%" set %SERVICE_NAME% AppStdout "%LOG_FILE%"
"%NSSM_EXE%" set %SERVICE_NAME% AppStderr "%LOG_FILE%"
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateSeconds 86400
"%NSSM_EXE%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM_EXE%" set %SERVICE_NAME% AppRestartDelay 5000
"%NSSM_EXE%" set %SERVICE_NAME% AppExit Default Restart

REM Start service
echo [%date% %time%] Starting service...
"%NSSM_EXE%" start %SERVICE_NAME%

timeout /t 3 /nobreak >nul

REM Check status
echo [%date% %time%] Service status:
"%NSSM_EXE%" status %SERVICE_NAME%

echo.
echo [%date% %time%] Installation complete
echo Service: %SERVICE_NAME%
echo Wrapper: %SERVICE_WRAPPER%
echo Logs: %LOG_FILE%
echo.

exit /b 0
