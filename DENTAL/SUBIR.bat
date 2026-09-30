@echo off
title Subir carpeta DENTAL a GitHub
setlocal

rem ============================================================
rem  Sube a GitHub todo lo que haya en la carpeta DENTAL.
rem  Doble clic y listo.
rem ============================================================

set "REPO=%USERPROFILE%\Documents\Cotizadora"
set "RAMA=claude/age-calculator-insurance-plans-tbygz8"

echo.
echo ===========================================
echo   SUBIR CARPETA DENTAL
echo ===========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No tienes Git instalado. Ejecuta primero INSTALAR.bat
  pause
  exit /b 1
)

if not exist "%REPO%\.git" (
  echo [ERROR] No encuentro el repositorio en %REPO%
  echo         Ejecuta primero INSTALAR.bat
  pause
  exit /b 1
)

cd /d "%REPO%"

rem ---------- Identidad de git, solo la primera vez ----------
for /f "delims=" %%A in ('git config user.email') do set "MAIL=%%A"
if not "%MAIL%"=="" goto :identidad_ok
echo Primera vez: necesito saber quien firma los cambios.
echo.
set /p NOMBRE="Tu nombre: "
set /p CORREO="Tu correo de GitHub: "
git config user.name "%NOMBRE%"
git config user.email "%CORREO%"
echo.
:identidad_ok

rem ---------- Que cambio ----------
echo Revisando cambios...
git add DENTAL
git diff --cached --stat
echo.

git diff --cached --quiet
if not errorlevel 1 (
  echo No hay nada nuevo que subir.
  echo.
  pause
  exit /b 0
)

set "MSG="
set /p MSG="Descripcion del cambio (Enter para una por defecto): "
if "%MSG%"=="" set "MSG=Actualiza material de la carpeta DENTAL"

git commit -m "%MSG%"
if errorlevel 1 (
  echo [ERROR] No se pudo guardar el cambio.
  pause
  exit /b 1
)

echo.
echo Trayendo cambios del servidor...
git pull --rebase origin "%RAMA%"
if errorlevel 1 (
  echo.
  echo [AVISO] Hubo un choque de versiones. Avisame en el chat y lo resolvemos.
  pause
  exit /b 1
)

echo Subiendo...
git push origin "%RAMA%"
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo subir.
  echo         Si te pidio usuario y clave, inicia sesion en GitHub y reintenta.
  pause
  exit /b 1
)

echo.
echo ===========================================
echo   SUBIDO CORRECTAMENTE
echo ===========================================
echo   Avisame en el chat y reviso los archivos.
echo.
pause
