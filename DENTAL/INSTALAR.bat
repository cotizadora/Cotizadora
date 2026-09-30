@echo off
title Instalar carpeta DENTAL
setlocal enabledelayedexpansion

rem ============================================================
rem  Deja C:\Users\<tu usuario>\Documents\DENTAL mostrando solo
rem  el material dental, conectado al repositorio de GitHub.
rem  Se ejecuta UNA SOLA VEZ. No borra nada: lo que ya tienes
rem  se copia a insumos y se guarda un respaldo.
rem ============================================================

set "DOCS=%USERPROFILE%\Documents"
set "LOCAL=%DOCS%\DENTAL"
set "REPO=%DOCS%\Cotizadora"
set "RESPALDO=%DOCS%\DENTAL_respaldo"
set "RAMA=claude/age-calculator-insurance-plans-tbygz8"
set "URL=https://github.com/cotizadora/Cotizadora.git"

echo.
echo ===========================================
echo   INSTALACION DE LA CARPETA DENTAL
echo ===========================================
echo.
echo   Carpeta visible : %LOCAL%
echo   Repositorio     : %REPO%
echo.

rem ---------- 1. Comprobar que git existe ----------
where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No tienes Git instalado.
  echo         Descargalo de https://git-scm.com/download/win
  echo         Instalalo con las opciones por defecto y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

rem ---------- 2. Si ya esta instalado, no repetir ----------
if exist "%LOCAL%\calculadora-edad.html" (
  echo La carpeta ya estaba instalada. No hay nada que hacer.
  echo Para subir archivos usa SUBIR.bat
  echo.
  pause
  exit /b 0
)

rem ---------- 3. Clonar o actualizar el repositorio ----------
if exist "%REPO%\.git" (
  echo [1/4] El repositorio ya existe, actualizando...
  git -C "%REPO%" fetch origin "%RAMA%"
  git -C "%REPO%" checkout "%RAMA%"
  git -C "%REPO%" pull origin "%RAMA%"
) else (
  echo [1/4] Descargando el repositorio ^(solo la parte dental^)...
  git clone --filter=blob:none --sparse -b "%RAMA%" "%URL%" "%REPO%"
  if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo descargar el repositorio.
    echo         Si te pidio usuario y clave, inicia sesion en GitHub y reintenta.
    echo.
    pause
    exit /b 1
  )
  git -C "%REPO%" sparse-checkout set --no-cone "/DENTAL/" 2>nul
  if errorlevel 1 git -C "%REPO%" sparse-checkout set DENTAL
)

if not exist "%REPO%\DENTAL" (
  echo [ERROR] No aparecio la carpeta DENTAL dentro del repositorio.
  pause
  exit /b 1
)

rem ---------- 4. Guardar tus archivos actuales en insumos ----------
if exist "%LOCAL%" (
  if exist "%RESPALDO%" (
    echo.
    echo [ERROR] Ya existe %RESPALDO%
    echo         Revisa esa carpeta, borrala o renombrala, y vuelve a ejecutar.
    echo.
    pause
    exit /b 1
  )
  echo [2/4] Copiando tus archivos actuales a insumos...
  if not exist "%REPO%\DENTAL\insumos" mkdir "%REPO%\DENTAL\insumos"
  robocopy "%LOCAL%" "%REPO%\DENTAL\insumos" /E /NFL /NDL /NJH /NJS /NP >nul
  if errorlevel 8 (
    echo [ERROR] Fallo la copia de tus archivos. No se modifico nada.
    pause
    exit /b 1
  )
  echo [3/4] Guardando respaldo en %RESPALDO%
  move "%LOCAL%" "%RESPALDO%" >nul
  if errorlevel 1 (
    echo [ERROR] No se pudo mover la carpeta. Cierrala en el Explorador y reintenta.
    pause
    exit /b 1
  )
) else (
  echo [2/4] No habia carpeta previa, nada que respaldar.
  echo [3/4] ...
)

rem ---------- 5. Crear el acceso directo ----------
echo [4/4] Creando la carpeta DENTAL...
mklink /J "%LOCAL%" "%REPO%\DENTAL" >nul
if errorlevel 1 (
  echo [ERROR] No se pudo crear el enlace.
  echo         Tus archivos estan a salvo en %RESPALDO%
  pause
  exit /b 1
)

echo.
echo ===========================================
echo   LISTO
echo ===========================================
echo.
echo   Abre  %LOCAL%
echo   y vas a ver la calculadora y la carpeta insumos.
echo.
echo   Tus 7 archivos quedaron copiados en  DENTAL\insumos
echo   El respaldo quedo en  %RESPALDO%
echo   Revisa que este todo y recien ahi borra el respaldo.
echo.
echo   Para subir cambios: doble clic en SUBIR.bat
echo.
pause
