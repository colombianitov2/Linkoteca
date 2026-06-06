$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

$isMac = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
  [System.Runtime.InteropServices.OSPlatform]::OSX
)

if (-not $isMac) {
  Write-Host "La app de Mac debe compilarse en macOS para generar .dmg/.app correctamente." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "En una Mac, copia el proyecto y ejecuta:"
  Write-Host "npm install"
  Write-Host "npm run dist:mac"
  exit 0
}

npm run check
npx electron-builder --mac dmg zip

Write-Host ""
Write-Host "Ejecutable Mac generado en:" -ForegroundColor Green
Write-Host (Join-Path $ProjectRoot "dist")
