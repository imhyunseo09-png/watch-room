@echo off
rem Browser version (embedded player only). The desktop app is start.bat.
cd /d "%~dp0"
node server.js --open
if errorlevel 1 pause
