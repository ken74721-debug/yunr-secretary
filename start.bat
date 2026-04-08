@echo off
title Yunr Secretary
echo.
echo  ====================================
echo   Yunr Secretary - Starting...
echo  ====================================
echo.
cd /d "%~dp0"
node server.js
echo.
echo  Server stopped.
pause
