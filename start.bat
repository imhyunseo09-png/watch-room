@echo off
cd /d "%~dp0"
if exist "node_modules\electron\dist\electron.exe" goto run
echo First run: installing required files. Please wait...
call npm install
if errorlevel 1 goto fail
:run
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
:fail
echo Install failed. Check your internet connection and run this file again.
pause
exit /b 1
