@echo off
title Actualizar Cotizador Dental
echo.
echo ==========================================
echo    ACTUALIZAR SOLO EL COTIZADOR DENTAL
echo ==========================================
echo.
echo  Baja la ultima version del Cotizador Dental a
echo  tu carpeta Documentos\DENTAL\extension.
echo.
echo  NO toca ShortCut-Vicidial-GO ni tus otros archivos.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=[IO.File]::ReadAllText('%~f0'); $m='#P'+'S>'; Invoke-Expression $c.Substring($c.IndexOf($m)+$m.Length)"
echo.
pause
exit /b
#PS>
$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$repo = 'cotizadora/Cotizadora'
$rama = 'claude/age-calculator-insurance-plans-tbygz8'
# Documentos puede estar redirigida a OneDrive: se le pregunta al sistema.
$docs = [Environment]::GetFolderPath('MyDocuments')
if ([string]::IsNullOrWhiteSpace($docs)) { $docs = Join-Path $env:USERPROFILE 'Documents' }
$destino = Join-Path (Join-Path $docs 'DENTAL') 'extension'

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Write-Host ('  Carpeta del cotizador: ' + $destino)
  Write-Host ''
  if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino -Force | Out-Null }

  Write-Host '  Consultando la lista de archivos...'
  $api  = 'https://api.github.com/repos/' + $repo + '/git/trees/' + $rama + '?recursive=1'
  $tree = Invoke-RestMethod -Uri $api -UseBasicParsing -Headers @{ 'User-Agent' = 'actualizar-cotizador' }
  # SOLO la carpeta del cotizador (DENTAL/extension). ShortCut no se toca.
  $archivos = @($tree.tree | Where-Object { $_.type -eq 'blob' -and $_.path -like 'DENTAL/extension/*' })
  if ($archivos.Count -eq 0) { throw 'GitHub no devolvio archivos del cotizador.' }

  $base = 'https://raw.githubusercontent.com/' + $repo + '/refs/heads/' + $rama + '/'
  $n = 0; $fallos = 0
  foreach ($a in $archivos) {
    $n++
    $rel = $a.path.Substring(17)          # quita 'DENTAL/extension/'
    $dst = Join-Path $destino $rel
    $dir = Split-Path $dst -Parent
    try {
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      Invoke-WebRequest -Uri ($base + $a.path.Replace(' ', '%20')) -OutFile $dst -UseBasicParsing
      Write-Host ('  [' + $n + '/' + $archivos.Count + '] ' + $rel)
    } catch {
      $fallos++
      Write-Host ('  [' + $n + '/' + $archivos.Count + '] ' + $rel + '  <-- no se pudo')
    }
  }

  $man = Join-Path $destino 'manifest.json'
  $ver = ''
  try { $ver = (Get-Content $man -Raw | ConvertFrom-Json).version } catch { }

  Write-Host ''
  Write-Host '  =========================================='
  if ($fallos -gt 0) { Write-Host ('   LISTO, con ' + $fallos + ' archivo(s) sin bajar') } else { Write-Host ('   LISTO: Cotizador Dental v' + $ver) }
  Write-Host '  =========================================='
  Write-Host ''
  Write-Host '  Los archivos quedaron en:'
  Write-Host ('    ' + $destino)
  Write-Host ''
  Write-Host '  Ultimo paso: en Chrome abre  chrome://extensions'
  Write-Host '  y aprieta el boton de recargar (flecha circular) en'
  Write-Host ('  "Cotizador Dental Bci". Debe decir la version v' + $ver + '.')
  Write-Host ''
  Start-Process explorer.exe $destino
} catch {
  Write-Host ''
  Write-Host '  =========================================='
  Write-Host '   NO SE PUDO COMPLETAR'
  Write-Host '  =========================================='
  Write-Host ''
  Write-Host ('  ' + $_.Exception.Message)
  Write-Host ''
  Write-Host '  Copiame este mensaje en el chat y lo arreglo.'
}
