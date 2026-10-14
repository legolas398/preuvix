param([switch]$PrepareOnly, [switch]$Build, [switch]$Stop, [string]$Serial)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/AndroidUsb-Tools.ps1')
Set-Location -LiteralPath $projectRoot
try {
    if ($Stop) {
        & node.exe scripts/usb-test.mjs stop
        if ($LASTEXITCODE -ne 0) { throw 'Le serveur USB est deja arrete ou ne peut pas etre arrete.' }
        exit 0
    }
    $mustBuild = $Build -or -not (Test-Path -LiteralPath $apkPath) -or -not (Test-Path -LiteralPath $metadataPath)
    if (-not $mustBuild) {
        $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
        $mustBuild = $metadata.backend -ne 'http://127.0.0.1:3016' -or
            $metadata.apkSha256 -ne (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant() -or
            $metadata.sourceSha256 -ne (Get-UsbSourceHash)
    }
    if ($mustBuild) {
        Write-Host 'Preparation de la version USB actuelle...'
        & (Join-Path $projectRoot 'scripts/Build-AndroidUsb.ps1')
    }
    & node.exe scripts/usb-test.mjs start
    if ($LASTEXITCODE -ne 0) { throw 'Le serveur de test ne repond pas correctement.' }
    Write-Host 'Site de test sur le PC : http://localhost:3016'
    Write-Host 'Mot de passe de test : ouvrir .tools\usb-test\password.txt (ne pas le partager).'
    if ($PrepareOnly) {
        Write-Host 'Preparation terminee. Branchez le telephone puis relancez sans -PrepareOnly.'
        exit 0
    }
    & $adbPath start-server | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'ADB ne demarre pas.' }
    $lines = & $adbPath devices -l
    if ($LASTEXITCODE -ne 0) { throw 'Lecture des appareils impossible.' }
    $authorized = @($lines | Where-Object { $_ -match '^\S+\s+device\s' -and $_ -notmatch '^emulator-' -and $_ -notmatch '^\S*:\d+\s' -and $_ -notmatch '^\S*\._tcp\s' } | ForEach-Object { ($_ -split '\s+')[0] })
    if ($Serial) {
        if ($authorized -notcontains $Serial) { throw 'Le telephone choisi est absent ou non autorise. Acceptez la demande sur son ecran.' }
        $deviceSerial = $Serial
    } elseif ($authorized.Count -eq 1) { $deviceSerial = $authorized[0] }
    elseif ($authorized.Count -gt 1) { throw 'Plusieurs telephones : debranchez les autres ou utilisez -Serial NUMERO.' }
    elseif ($lines -match '\sunauthorized(?:\s|$)') { throw 'Telephone detecte, mais non autorise. Deverrouillez-le et acceptez Autoriser le debogage USB, puis relancez.' }
    elseif ($lines -match '\soffline(?:\s|$)') { throw 'Telephone ADB hors ligne. Rebranchez le cable, deverrouillez puis relancez.' }
    else { throw 'Aucun telephone USB autorise. Branchez un cable de donnees, activez le debogage USB et acceptez la demande sur le telephone.' }
    $sdkVersion = & $adbPath -s $deviceSerial shell getprop ro.build.version.sdk
    if ($LASTEXITCODE -ne 0 -or [int]($sdkVersion.Trim()) -lt 24) { throw 'Android 7.0 (API 24) minimum est requis.' }
    & $adbPath -s $deviceSerial reverse tcp:3016 tcp:3016
    if ($LASTEXITCODE -ne 0) { throw 'Le tunnel USB a echoue.' }
    $reverse = & $adbPath -s $deviceSerial reverse --list
    if ($LASTEXITCODE -ne 0 -or -not ($reverse -match 'tcp:3016\s+tcp:3016')) { throw 'Le tunnel USB ne figure pas dans ADB.' }
    & $adbPath -s $deviceSerial install -r $apkPath
    if ($LASTEXITCODE -ne 0) { throw 'Installation refusee. Voir le message Android ci-dessus et le guide. Aucune desinstallation ni suppression de donnees effectuee.' }
    $launch = & $adbPath -s $deviceSerial shell am start -W -n fr.preuvix.app/.MainActivity
    $launch | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0 -or -not ($launch -match 'Status:\s+ok')) { throw 'Ouverture de Preuvix non confirmee par Android.' }
    Write-Host 'PREUVIX installe et ouvert. Connectez-vous avec le mot de passe de test.'
    Write-Host 'Autorisez la localisation puis la camera. Gardez le cable branche et le PC eveille.'
    Write-Host 'Mode emploi : docs\test-android-usb.md'
} catch {
    Write-Host ("TEST USB NON TERMINE : " + $_.Exception.Message) -ForegroundColor Yellow
    Write-Host 'Guide : docs\test-android-usb.md'
    exit 1
}
