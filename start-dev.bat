@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  모바일 즉시 확인 (dev + Cloudflare 터널)
echo  - 코드 저장 시 모바일 HMR 자동 반영
echo  - 종료: Ctrl+C
echo.

npm run dev:mobile
if errorlevel 1 pause
