param([switch]$SkipBuild, [string]$Serial)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/AndroidUsb-Tools.ps1')
Set-Location -LiteralPath $projectRoot
try {
    if (-not $SkipBuild) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'La compilation du site a echoue.' }
    }
    $running = $false
    try { $health = Invoke-RestMethod -Uri http://127.0.0.1:3016/__usb/health -TimeoutSec 3; $running = $health.service -eq 'preuvix-usb-test' } catch { }
    if ($running) {
        & node.exe scripts/usb-test.mjs stop
        if ($LASTEXITCODE -ne 0) { throw 'Arret de l instance de test impossible.' }
        Start-Sleep -Seconds 2
    }
    & node.exe scripts/usb-test.mjs start
    if ($LASTEXITCODE -ne 0) { throw 'Serveur de test indisponible.' }
    $lines = & $adbPath devices -l
    $authorized = @($lines | Where-Object { $_ -match '^\S+\s+device\s' -and $_ -notmatch '^emulator-' -and $_ -notmatch '^\S*:\d+\s' -and $_ -notmatch '^\S*\._tcp\s' } | ForEach-Object { ($_ -split '\s+')[0] })
    if ($Serial) {
        if ($authorized -notcontains $Serial) { throw 'Telephone choisi absent ou non autorise.' }
        $deviceSerial = $Serial
    } elseif ($authorized.Count -eq 1) { $deviceSerial = $authorized[0] }
    else { throw 'Branchez un seul telephone USB, deverrouillez-le et autorisez le debogage USB. Utilisez -Serial si plusieurs telephones sont branches.' }
    & $adbPath -s $deviceSerial reverse tcp:3016 tcp:3016
    if ($LASTEXITCODE -ne 0) { throw 'Echec du tunnel USB.' }
    $launch = & $adbPath -s $deviceSerial shell am start -W -a android.intent.action.VIEW -d http://127.0.0.1:3016
    $launch | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0 -or -not ($launch -match 'Status:\s+ok')) { throw 'Ouverture du navigateur non confirmee.' }
    Write-Host 'Site ouvert via USB. Mot de passe : .tools\usb-test\password.txt.'
    Write-Host 'Choisissez Chrome si Android demande un navigateur. Gardez le PC eveille.'
    Write-Host 'Protocole : docs\validation-telephone-reel.md'
} catch {
    Write-Host ('TEST SITE USB NON TERMINE : ' + $_.Exception.Message) -ForegroundColor Yellow
    exit 1
}
