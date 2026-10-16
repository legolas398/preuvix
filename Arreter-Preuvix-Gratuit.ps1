$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$state = Get-Content .tools/free-phone/processes.json -Raw | ConvertFrom-Json
$expected = @{
    tunnel = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.tools/cloudflared/cloudflared.exe'))
    server = 'scripts/free-phone-server.ts'
    launcher = 'scripts/free-phone.mjs'
}
foreach ($role in @('tunnel', 'server', 'launcher')) {
    $processId = [int]$state.$role
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if (-not $process) { continue }
    if ($role -eq 'tunnel') { $matches = $process.ExecutablePath -eq $expected.tunnel }
    else {
        $matches = $process.ExecutablePath -eq [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.tools/node-v24.21.0-win-x64/node.exe')) -and $process.CommandLine.Contains($expected.$role)
    }
    if (-not $matches) {
        Write-Host 'Ancien identifiant reutilise : processus different laisse intact.'
        continue
    }
    Stop-Process -Id $processId
}
Write-Host 'Tunnel et serveur de test arretes. Donnees conservees.'
