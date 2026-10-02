@echo off
setlocal

title BLS.Hosting setup

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   This installer needs administrator rights
    echo   Asking Windows for them now
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo.
echo   ============================================================
echo    BLS.Hosting setup
echo    internal bot hosting for blociapps
echo   ============================================================
echo.

set "DOMAIN=bls.blociapps.com"
set /p DOMAIN=  Domain to serve the panel on [%DOMAIN%]: 
if "%DOMAIN%"=="" set "DOMAIN=bls.blociapps.com"

set "EMAIL="
set /p EMAIL=  Email for the certificate notices [skip]: 

set "ROOT=C:\bls"
set /p ROOT=  Install folder [%ROOT%]: 
if "%ROOT%"=="" set "ROOT=C:\bls"

echo.
echo   Installing BLS.Hosting on %DOMAIN% under %ROOT%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" -Domain "%DOMAIN%" -Email "%EMAIL%" -Root "%ROOT%"

echo.
echo   Press any key to close
pause >nul
