$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

$PreviousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$javaOutput = (& java -version) 2>&1 | Out-String
$ErrorActionPreference = $PreviousErrorActionPreference
if ($javaOutput -match 'version "(\d+)') {
  $javaMajor = [int]$Matches[1]
  if ($javaMajor -gt 21) {
    throw "Android/Gradle no esta compilando con Java $javaMajor. Instala JDK 21 LTS y configura JAVA_HOME antes de ejecutar este comando."
  }
}

npm run check

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "android"))) {
  npx cap add android
}

npx cap sync android

$Gradle = Join-Path $ProjectRoot "android\gradlew.bat"
if (-not (Test-Path -LiteralPath $Gradle)) {
  throw "No encontre android\gradlew.bat. Abre Android Studio y sincroniza el proyecto android."
}

Push-Location (Join-Path $ProjectRoot "android")
try {
  .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle fallo con codigo $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "APK Android generado en:" -ForegroundColor Green
Write-Host (Join-Path $ProjectRoot "android\app\build\outputs\apk\debug\app-debug.apk")
Write-Host ""
Write-Host "Nota: para usarlo desde el celular, abre Linkoteca en el PC y conecta el APK a la IP del PC, por ejemplo http://192.168.1.50:4387"
