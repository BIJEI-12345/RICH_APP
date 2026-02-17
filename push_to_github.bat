@echo off
echo ========================================
echo Pushing RICH_APP to GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Git installation...
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not in PATH
    echo Please install Git from https://git-scm.com/download/win
    pause
    exit /b 1
)

echo Git is installed!
echo.

echo Initializing Git repository (if not already initialized)...
if not exist .git (
    git init
    echo Git repository initialized.
) else (
    echo Git repository already exists.
)
echo.

echo Adding remote repository...
git remote remove origin 2>nul
git remote add origin https://github.com/BIJEI-12345/RICH_APP.git
echo Remote added: https://github.com/BIJEI-12345/RICH_APP.git
echo.

echo Fetching existing content from GitHub...
git fetch origin
echo.

echo Adding all files...
git add .
echo.

echo Committing changes...
git commit -m "Update: Complete RICH APP with census form, registration, and house_no column features"
echo.

echo Pushing to GitHub...
echo Please enter your GitHub credentials when prompted.
git push -u origin main 2>nul
if errorlevel 1 (
    git push -u origin master 2>nul
    if errorlevel 1 (
        echo.
        echo Trying to set default branch...
        git branch -M main
        git push -u origin main
    )
)
echo.

echo ========================================
echo Done! Check your GitHub repository.
echo ========================================
pause
