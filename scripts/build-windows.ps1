$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:ELECTRON_BUILDER_DISABLE_WIN_CODE_SIGN = "true"

npm run check
npx electron-builder --win nsis portable

Write-Host ""
Write-Host "Ejecutables Windows generados en:" -ForegroundColor Green
Write-Host (Join-Path $ProjectRoot "dist")
