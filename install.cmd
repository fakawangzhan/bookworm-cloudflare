@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Please install Node.js 22.12+ and npm. & exit /b 1)
call npm ci
if errorlevel 1 exit /b 1
call npm run deploy
if errorlevel 1 exit /b 1
endlocal
