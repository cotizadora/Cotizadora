@echo off
title Chrome: restaurar el aviso de documentos de identidad
echo.
echo  Quita la configuracion que puso Chrome-sin-guardar-identidad.bat.
echo.
reg delete "HKCU\Software\Policies\Google\Chrome" /v AutofillSettings /f >nul 2>&1
reg delete "HKCU\Software\Policies\Google\Chrome" /v AutofillPredictionSettings /f >nul 2>&1
echo  Listo. Cierra Chrome entero y vuelve a abrirlo.
echo.
pause
