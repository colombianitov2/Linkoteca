$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:ELECTRON_BUILDER_DISABLE_WIN_CODE_SIGN = "true"

$DistDir = Join-Path $ProjectRoot "dist"
if (Test-Path -LiteralPath $DistDir) {
  Get-ChildItem -LiteralPath $DistDir -Filter "Linkoteca*.exe" -ErrorAction SilentlyContinue | Remove-Item -Force
  Get-ChildItem -LiteralPath $DistDir -Filter "Linkoteca*.blockmap" -ErrorAction SilentlyContinue | Remove-Item -Force
  $WinUnpacked = Join-Path $DistDir "win-unpacked"
  if (Test-Path -LiteralPath $WinUnpacked) {
    Remove-Item -LiteralPath $WinUnpacked -Recurse -Force
  }
}

npm run check
npx electron-builder --win nsis portable

Write-Host ""
Write-Host "Ejecutables Windows generados en:" -ForegroundColor Green
Write-Host (Join-Path $ProjectRoot "dist")
