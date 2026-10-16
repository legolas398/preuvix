$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$origin = (Get-Content .tools/free-phone/url.txt -Raw).Trim()
& ./scripts/Build-AndroidUsb.ps1 -BackendUrl $origin
Copy-Item -LiteralPath android/app/build/outputs/apk/debug/app-debug.apk -Destination .tools/free-phone/preuvix-test.apk
Set-Content -LiteralPath .tools/free-phone/apk-origin.txt -Value $origin -Encoding ascii
Write-Host "Telechargement direct de l'APK : $origin/api/test-android.apk"
