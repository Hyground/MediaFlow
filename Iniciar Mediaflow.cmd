@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas Node.js 22 o superior. Descargalo desde https://nodejs.org
  pause
  exit /b 1
)
node setup-windows.mjs
if errorlevel 1 (
  echo.
  echo No se completo la instalacion. Revisa tu conexion y vuelve a abrir este archivo.
  pause
  exit /b 1
)
node launch-windows.mjs
if errorlevel 1 pause
