$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portableNode = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '.tools') -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $portableNode) {
        throw 'Install Node.js 24 LTS, then run this script again.'
    }
    $env:PATH = $portableNode.FullName + ';' + $env:PATH
}

if (-not (Test-Path -LiteralPath 'node_modules')) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}

& npm.cmd run setup
if ($LASTEXITCODE -ne 0) { throw 'Configuration failed.' }
& npm.cmd run dev
