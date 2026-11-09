@echo off
rem Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0): this file is the same as Boxshelf's
rem android-app/ci/Install GitHub build.bat apart from the app's name ((T)rustyShelf).
REM Copies the Android build recipe to where GitHub looks for it (.github\workflows). Safe to run more than once.
cd /d "%~dp0..\.."
if not exist ".github\workflows" mkdir ".github\workflows"
copy /Y "android-app\ci\android.yml" ".github\workflows\android.yml" >nul
if exist ".github\workflows\android.yml" (echo Done: .github\workflows\android.yml is in place. Commit and push in GitHub Desktop.) else (echo Something went wrong - the file was not copied.)
pause
