@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Descargar proyecto Carritos Kimbo

set "DEST=%USERPROFILE%\Documents\Kimbo"
set "API=https://api.github.com/repos/cotizadora/Cotizadora/contents/kimbo?ref=main"

echo.
echo ==========================================================
echo    CARRITOS KIMBO - Descarga del proyecto
echo    Destino: %DEST%
echo ==========================================================
echo.

if not exist "%USERPROFILE%\Documents" mkdir "%USERPROFILE%\Documents"
if not exist "%DEST%" mkdir "%DEST%"

echo Descargando archivos del proyecto...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $ErrorActionPreference='Stop'; $dest='%DEST%'; $h=@{'User-Agent'='kimbo-dl'}; try { $items=Invoke-RestMethod -Uri '%API%' -Headers $h; foreach($it in $items){ if($it.type -eq 'file'){ Write-Host ('  - ' + $it.name); Invoke-WebRequest -Uri $it.download_url -OutFile (Join-Path $dest $it.name) -Headers $h -UseBasicParsing } }; Write-Host ''; Write-Host 'Descarga completa.' -ForegroundColor Green } catch { Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }"

if errorlevel 1 (
  echo.
  echo Hubo un problema en la descarga. Revisa tu conexion e intenta de nuevo.
  echo.
  pause
  exit /b 1
)

echo.
echo ==========================================================
echo   LISTO. Proyecto en:   %DEST%
echo.
echo   Abre el menu:         editor.html
echo ==========================================================
echo.
echo Abriendo la carpeta...
start "" "%DEST%"
pause
