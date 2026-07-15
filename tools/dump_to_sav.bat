@echo off
setlocal
cd /d "%~dp0"

REM Builds a save_dump.sav out of save_dump.txt
REM You can also pull a TXT onto this BAT file

set "DUMP=save_dump.txt"
if not "%~1"=="" set "DUMP=%~1"

py -3 fortune_mill_dump_to_sav.py "%DUMP%" "save_dump.sav"
if errorlevel 1 (
  echo.
  echo Error. If Python was not found, please install Python or change "py -3" to "python"
  pause
  exit /b 1
)

echo.
echo Done: save_dump.sav was created.
echo Rename and copy to the Save-Location, after you've made a backup of save_game.sav.
pause
