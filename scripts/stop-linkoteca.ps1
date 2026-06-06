$Port = 4387
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $connections) {
  Write-Host "Linkoteca no parece estar corriendo."
  exit 0
}

$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $processIds) {
  try {
    Stop-Process -Id $processId -Force
    Write-Host "Linkoteca detenida. Proceso: $processId"
  } catch {
    Write-Host "No pude detener el proceso $processId"
  }
}
