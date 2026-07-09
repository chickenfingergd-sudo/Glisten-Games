@echo off
setlocal
cd /d "%~dp0"

echo Preparing Glisten Games for GitHub Desktop...

if exist "scripts\generate-games-manifest.js" (
  node scripts\generate-games-manifest.js
)

if exist ".git" (
  if not exist ".git\HEAD" (
    for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set DATESTAMP=%%d%%b%%c
    for /f "tokens=1-2 delims=:." %%a in ("%time%") do set TIMESTAMP=%%a%%b
    set TIMESTAMP=%TIMESTAMP: =0%
    move ".git" ".git-broken-%DATESTAMP%-%TIMESTAMP%" >nul
  )
)

if not exist ".git" (
  git init -b main
)

start "" "%LOCALAPPDATA%\GitHubDesktop\GitHubDesktop.exe" "%CD%"
echo GitHub Desktop should open now. Commit the files, then press Publish repository.
pause
