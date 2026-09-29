@echo off
chcp 65001 >nul
title Roy Envanter
cd /d "%~dp0"

REM Telefondan başkalarının girmesini istemiyorsan aşağıdaki satırın başındaki REM'i sil ve PIN'i değiştir:
REM set ROY_PIN=1234

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurup tekrar dene.
  pause
  exit /b 1
)

start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node --no-warnings=ExperimentalWarning server.js
pause
