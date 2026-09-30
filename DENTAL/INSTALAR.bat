@echo off
title Instalar carpeta DENTAL
echo.
echo ==========================================
echo    CARPETA DENTAL
echo ==========================================
echo.
echo  Copia los archivos del proyecto desde GitHub a
echo  tu carpeta Documents\DENTAL.
echo.
echo  No necesita Git. No borra nada tuyo.
echo  Puedes volver a ejecutarlo para actualizar.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=[IO.File]::ReadAllText('%~f0'); $m='#P'+'S>'; Invoke-Expression $c.Substring($c.IndexOf($m)+$m.Length)"
echo.
pause
exit /b
#PS>
$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$repo    = 'cotizadora/Cotizadora'
$rama    = 'claude/age-calculator-insurance-plans-tbygz8'
# La carpeta Documentos puede estar redirigida a OneDrive. Se la pedimos al
# sistema en vez de asumir %USERPROFILE%\Documents, que en ese caso es otra.
$docs = [Environment]::GetFolderPath('MyDocuments')
if ([string]::IsNullOrWhiteSpace($docs)) { $docs = Join-Path $env:USERPROFILE 'Documents' }
$docsAlt = Join-Path $env:USERPROFILE 'Documents'

$destino = Join-Path $docs 'DENTAL'
$log     = Join-Path $docs 'INSTALAR-log.txt'


function Anotar($m) {
  $linea = (Get-Date).ToString('HH:mm:ss') + '  ' + $m
  Add-Content -Path $log -Value $linea -Encoding UTF8
}

Set-Content -Path $log -Value ('=== Instalacion DENTAL ' + (Get-Date) + ' ===') -Encoding UTF8

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  Anotar ('Destino: ' + $destino)
  Write-Host ('  Destino: ' + $destino)
  if ($docs -ne $docsAlt) {
    Write-Host ''
    Write-Host '  Nota: tu carpeta Documentos esta redirigida.'
    Write-Host ('  La otra ruta posible seria: ' + (Join-Path $docsAlt 'DENTAL'))
    Anotar ('Documentos redirigida. Alternativa: ' + (Join-Path $docsAlt 'DENTAL'))
  }
  Write-Host ''

  if (-not (Test-Path $destino)) {
    New-Item -ItemType Directory -Path $destino -Force | Out-Null
    Write-Host '  Carpeta creada.'
    Anotar 'Carpeta creada.'
  } else {
    Write-Host '  La carpeta ya existe. Tus documentos no se tocan.'
    Anotar 'Carpeta existente, se conserva su contenido.'
  }

  Write-Host '  Consultando la lista de archivos...'
  $api  = 'https://api.github.com/repos/' + $repo + '/git/trees/' + $rama + '?recursive=1'
  $tree = Invoke-RestMethod -Uri $api -UseBasicParsing -Headers @{ 'User-Agent' = 'instalador-dental' }
  $archivos = @($tree.tree | Where-Object { $_.type -eq 'blob' -and $_.path -like 'DENTAL/*' })

  if ($archivos.Count -eq 0) { throw 'GitHub no devolvio archivos. Revisa que la rama exista.' }
  Write-Host ('  Archivos a descargar: ' + $archivos.Count)
  Anotar ('Archivos a descargar: ' + $archivos.Count)
  Write-Host ''

  $base = 'https://raw.githubusercontent.com/' + $repo + '/refs/heads/' + $rama + '/'
  $n = 0
  $fallos = 0

  foreach ($a in $archivos) {
    $n++
    $rel = $a.path.Substring(7)
    $dst = Join-Path $destino $rel
    $dir = Split-Path $dst -Parent
    try {
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      Invoke-WebRequest -Uri ($base + $a.path.Replace(' ', '%20')) -OutFile $dst -UseBasicParsing
      Write-Host ('  [' + $n + '/' + $archivos.Count + '] ' + $rel)
      Anotar ('OK  ' + $rel)
    } catch {
      $fallos++
      Write-Host ('  [' + $n + '/' + $archivos.Count + '] ' + $rel + '  <-- no se pudo')
      Anotar ('FALLO  ' + $rel + '  :  ' + $_.Exception.Message)
    }
  }

  if (-not (Test-Path (Join-Path $destino 'calculadora-edad.html'))) {
    throw 'La descarga termino pero no aparecio calculadora-edad.html'
  }

  Anotar ('Terminado. Fallos: ' + $fallos)
  Write-Host ''
  Write-Host '  =========================================='
  if ($fallos -gt 0) {
    Write-Host ('   LISTO, con ' + $fallos + ' archivo(s) sin bajar')
  } else {
    Write-Host '   LISTO'
  }
  Write-Host '  =========================================='
  Write-Host ''
  Write-Host ('  Abre: ' + $destino)
  Write-Host ''
  Write-Host '  Ahora tienes ahi:'
  Write-Host '    calculadora-edad.html   el cotizador, doble clic'
  Write-Host '    PRODUCTO.md             el analisis del producto'
  Write-Host '    extension\              la extension de Chrome y Edge'
  Write-Host '    insumos\                material de referencia'
  Write-Host ''
  Write-Host '  Tus documentos siguen donde estaban.'
  Write-Host '  Para actualizar: vuelve a ejecutar este archivo.'
  Write-Host ''
  Write-Host '  Abriendo la carpeta...'
  Start-Process explorer.exe $destino

  if ($fallos -gt 0) {
    Write-Host ''
    Write-Host ('  Revisa el detalle en: ' + $log)
  }

} catch {
  Anotar ('ERROR: ' + $_.Exception.Message)
  Write-Host ''
  Write-Host '  =========================================='
  Write-Host '   NO SE PUDO COMPLETAR'
  Write-Host '  =========================================='
  Write-Host ''
  Write-Host ('  ' + $_.Exception.Message)
  Write-Host ''
  Write-Host ('  El detalle quedo en: ' + $log)
  Write-Host '  Copiame ese texto en el chat y lo arreglo.'
}
