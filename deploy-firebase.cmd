@echo off
if /i "%~1"=="--run" goto run
start "Cell Notebook - Firebase deployment" "%ComSpec%" /d /k ""%~f0" --run"
exit /b

:run
cd /d "%~dp0"
echo Cell Notebook - Firebase deployment
echo Keep this window open until deployment finishes.
echo.

rem A regular Windows terminal needs its own Node.js installation.
if exist "%ProgramFiles%\nodejs\npx.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
where npx.cmd >nul 2>&1
if errorlevel 1 goto missing_node
if not exist "firebase.json" goto missing_files
if not exist "dist-firebase\index.html" goto missing_build

echo Node.js version:
call node --version
echo.
echo Step 1: Download Firebase CLI and sign in with your Google account.
echo The first download may take several minutes.
call npx.cmd --yes firebase-tools login
if errorlevel 1 goto failed

echo.
echo Step 2: Upload the website to Firebase Hosting.
call npx.cmd --yes firebase-tools deploy --project cell-notebook-zihan --only hosting,firestore:rules
if errorlevel 1 goto failed

echo.
echo SUCCESS: https://cell-notebook-zihan.web.app
start "" "https://cell-notebook-zihan.web.app"
exit /b 0

:missing_node
echo ERROR: Node.js or npx was not found in this Windows terminal.
echo Install the Windows LTS version from https://nodejs.org/
echo Enable the installer option to add Node.js to PATH.
echo Then close this window and double-click this file again.
exit /b 1

:missing_files
echo ERROR: firebase.json was not found.
echo Extract the entire deployment ZIP before running this file.
exit /b 1

:missing_build
echo ERROR: dist-firebase\index.html was not found.
echo Use the deployment ZIP, which includes the built website.
echo The source ZIP requires a separate build first.
exit /b 1

:failed
echo.
echo ERROR: Deployment did not finish. Please copy the error above.
echo This window will remain open so you can read it.
exit /b 1

