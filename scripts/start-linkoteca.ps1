$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Port = 4387
$Url = "http://localhost:$Port"
$LogDir = Join-Path $ProjectRoot "logs"
$OutLog = Join-Path $LogDir "linkoteca.out.log"
$ErrLog = Join-Path $LogDir "linkoteca.err.log"

function Test-LinkotecaRunning {
  try {
    $response = Invoke-WebRequest -Uri "$Url/api/library" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

if (-not (Test-LinkotecaRunning)) {
  $nodeCommand = "node"
  $arguments = @("src/server.js")
  Start-Process -FilePath $nodeCommand `
    -ArgumentList $arguments `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog

  $started = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-LinkotecaRunning) {
      $started = $true
      break
    }
  }

  if (-not $started) {
    Write-Host ""
    Write-Host "No pude iniciar Linkoteca. Revisa este log:" -ForegroundColor Red
    Write-Host $ErrLog
    if (Test-Path -LiteralPath $ErrLog) {
      Get-Content -LiteralPath $ErrLog -Tail 20
    }
    exit 1
  }
}

Start-Process $Url

Write-Host ""
Write-Host "Linkoteca esta abierta." -ForegroundColor Green
Write-Host "Interfaz visual: $Url" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para cerrarla despues, ejecuta:" -ForegroundColor Yellow
Write-Host "npm run stop"
Write-Host ""
