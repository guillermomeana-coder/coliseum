@echo off
rem Coliseum launcher for cmd.exe / Explorer: same arguments as tools\launch.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
exit /b %ERRORLEVEL%
