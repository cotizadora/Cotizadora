@echo off
title Chrome sin "Guardar documento de identidad"
echo.
echo ==========================================
echo   CHROME: QUITAR EL AVISO
echo   "Guardar documento de identidad"
echo ==========================================
echo.
echo  Chrome deja de ofrecer guardar RUT, carnet o pasaporte
echo  en Google Wallet. No borra nada guardado ni toca tus
echo  contrasenas, direcciones ni tarjetas.
echo  No necesita permisos de administrador.
echo.
rem Politica nueva (Chrome 154+): bloquea solo los documentos de identidad en todos los sitios
reg add "HKCU\Software\Policies\Google\Chrome" /v AutofillSettings /t REG_SZ /d "[{\"url_pattern\":\"*\",\"blocked_types\":[\"identity_docs\"]}]" /f >nul
rem Politica anterior: apaga el autocompletado con IA, que es el que guarda los documentos
reg add "HKCU\Software\Policies\Google\Chrome" /v AutofillPredictionSettings /t REG_DWORD /d 2 /f >nul
if errorlevel 1 (
  echo  No se pudo escribir la configuracion. Avisale a Claude.
) else (
  echo  Listo.
  echo.
  echo  Ahora CIERRA Chrome entero y vuelve a abrirlo.
  echo  Para comprobar: escribe chrome://policy en la barra y aprieta
  echo  "Volver a cargar politicas". Deben aparecer AutofillSettings
  echo  y AutofillPredictionSettings.
  echo.
  echo  Chrome dira arriba "Tu organizacion administra el navegador":
  echo  es normal, es por esta configuracion.
  echo  Para deshacerlo: Chrome-restaurar-aviso.bat
)
echo.
pause
