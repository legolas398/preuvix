param([string]$BackendUrl = 'http://127.0.0.1:3016')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AndroidUsb-Tools.ps1')
Set-Location -LiteralPath $projectRoot
$jdk = Get-ChildItem -LiteralPath (Join-Path $toolRoot 'jdk') -Directory | Select-Object -First 1
if (-not $jdk) { throw 'JDK 21 manque.' }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = Join-Path $toolRoot 'sdk'
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'user'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle'
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
$env:VITE_BACKEND_URL = $BackendUrl
if ($BackendUrl -eq 'http://127.0.0.1:3016') {
    & npm.cmd run android:build:dev
} elseif ($BackendUrl -match '^https://[a-z0-9-]+\.trycloudflare\.com$') {
    & npm.cmd run android:build
} else { throw 'Adresse de test non reconnue.' }
if ($LASTEXITCODE -ne 0) { throw 'Compilation Android echouee.' }
& npm.cmd run android:sync
if ($LASTEXITCODE -ne 0) { throw 'Synchronisation Capacitor echouee.' }
Push-Location -LiteralPath (Join-Path $projectRoot 'android')
try {
    & .\gradlew.bat assembleDebug --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Compilation APK echouee.' }
} finally { Pop-Location }
$signer = Join-Path $toolRoot 'sdk/build-tools/36.0.0/apksigner.bat'
& $signer verify --verbose $apkPath
if ($LASTEXITCODE -ne 0) { throw 'Signature APK invalide.' }
New-Item -ItemType Directory -Path (Split-Path -Parent $metadataPath) -Force | Out-Null
@{
    backend = $env:VITE_BACKEND_URL
    builtAt = [DateTime]::UtcNow.ToString('o')
    apkSha256 = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
    sourceSha256 = Get-UsbSourceHash
} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8
Write-Host "APK de test pret : $apkPath"
