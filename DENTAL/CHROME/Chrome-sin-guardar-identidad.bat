@echo off
title Chrome: quitar "Guardar documento de identidad"
echo.
echo ==========================================
echo   CHROME: QUITAR EL AVISO
echo   "Guardar documento de identidad"
echo ==========================================
echo.
echo  En este PC no se puede cambiar Chrome desde afuera
echo  (la empresa lo bloquea). Se abre la pagina exacta de
echo  Chrome y solo hay que apagar un interruptor:
echo.
echo   1. En la pagina que se abre, entra a la seccion de
echo      documentos de identidad (o "Autocompletar con IA").
echo   2. Apaga el interruptor de guardar y completar.
echo.
echo  Queda guardado para siempre: no hay que repetirlo.
echo.
start "" chrome "chrome://settings/autofill"
pause
