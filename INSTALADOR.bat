@echo off
echo === INSTALADOR RAPIDO CYBERCONTROL ===
set "DEST=C:\CyberControl"

:: 1. Crear carpeta y copiar todo
if not exist "%DEST%" mkdir "%DEST%"
xcopy /E /Y "%~dp0*" "%DEST%\"

:: 2. Crear el archivo invisible .vbs automaticamente
echo Set WshShell = CreateObject("WScript.Shell") > "%DEST%\silencioso.vbs"
echo Do >> "%DEST%\silencioso.vbs"
echo   WshShell.Run "cmd /c node %%DEST%%\agent.js", 0, True >> "%DEST%\silencioso.vbs"
echo   WScript.Sleep 2000 >> "%DEST%\silencioso.vbs"
echo Loop >> "%DEST%\silencioso.vbs"
echo Set WshShell = Nothing >> "%DEST%\silencioso.vbs"

:: 3. Ponerlo en Inicio automatico de Windows
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /Y "%DEST%\silencioso.vbs" "%STARTUP_FOLDER%\CyberControlLaunch.vbs"

echo.
echo ¡PC CONFIGURADA EN 3 SEGUNDOS!
pause
