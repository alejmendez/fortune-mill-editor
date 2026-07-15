@echo off
setlocal
cd /d "%~dp0"
py -3 fortune_mill_dumper.py "%APPDATA%\Godot\app_userdata\Fortune Mill\save_game.sav" --txt save_dump.txt
pause
