@echo off
setlocal enabledelayedexpansion

echo Copying service directory...
xcopy /Y /E /I "%~dp0..\..\agent\service" "%ProgramFiles%\Watson RMM Agent\service"
if errorlevel 1 (
  echo Warning: Service copy returned error !errorlevel!
)

echo Service copy completed
exit /b 0
