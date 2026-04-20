@echo off
setlocal
title INSTALADOR CYBERCONTROL PRO

echo ===========================================
echo    INICIANDO INSTALACION DE CYBERCONTROL
echo ===========================================
echo.

:: Definir ruta de destino
set "DEST=C:\CyberControl"

:: 0. Verificar si el instalador de Node existe en la USB
if not exist "%~dp0node-installer.msi" (
    echo [ERROR] No se encontro "node-installer.msi" en la USB.
    echo Asegurate de que el instalador este en la misma carpeta que este script.
    goto :error
)

:: 1. Verificar e instalar Node.js
echo [1/4] Verificando motor Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Node.js no detectado. Instalando ahora...
    echo [AVISO] Se abrira una ventana de confirmacion de Windows, dale a "SI".
    msiexec.exe /i "%~dp0node-installer.msi" /qn /norestart
    echo [INFO] Instalacion en curso... espera 30 segundos.
    timeout /t 30 /nobreak
) else (
    echo [OK] Node.js ya esta instalado.
)

:: 2. Crear carpeta de destino y copiar archivos
echo [2/4] Copiando archivos del sistema a %DEST%...
if not exist "%DEST%" mkdir "%DEST%"
xcopy /E /Y /I "%~dp0*" "%DEST%\"
if %errorlevel% neq 0 (
    echo [ERROR] Hubo un problema al copiar los archivos. 
    echo Intenta ejecutar este script como ADMINISTRADOR.
    goto :error
)

:: 3. Generar lanzador invisible
echo [3/4] Configurando inicio silencioso...
(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo Do
echo   WshShell.Run "cmd /c node %DEST%\agent.js", 0, True
echo   WScript.Sleep 5000
echo Loop
) > "%DEST%\silencioso.vbs"

:: 4. Crear acceso directo en Inicio
echo [4/4] Configurando arranque automatico...
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /Y "%DEST%\silencioso.vbs" "%STARTUP_FOLDER%\CyberControlLaunch.vbs" >nul

echo.
echo ===========================================
echo   ¡PC CONFIGURADA EXITOSAMENTE!
echo ===========================================
echo Ya puedes retirar la USB.
pause
exit

:error
echo.
echo ===========================================
echo   LA INSTALACION FALLO. Mira el error arriba.
echo ===========================================
pause
exit
