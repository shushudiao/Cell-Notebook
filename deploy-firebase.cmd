@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Cell Notebook Firebase 免费发布
echo.
echo 第一次运行会打开浏览器，请登录创建 Firebase 项目时使用的 Google 账号。
echo 登录完成后，本窗口会自动继续发布网站。
echo.

call npx --yes firebase-tools login
if errorlevel 1 goto failed

call npx --yes firebase-tools deploy --only hosting,firestore:rules
if errorlevel 1 goto failed

echo.
echo 发布完成：https://cell-notebook-zihan.web.app
start "" "https://cell-notebook-zihan.web.app"
pause
exit /b 0

:failed
echo.
echo 发布没有完成。请保留本窗口中的错误信息。
pause
exit /b 1

