$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.tools/android-toolchain'
$portableNode = Join-Path $projectRoot '.tools/node-v24.21.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $portableNode 'node.exe')) {
    $env:PATH = $portableNode + ';' + $env:PATH
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node 24 manque. Voir docs/test-android-usb.md.' }
$adbPath = Join-Path $toolRoot 'sdk/platform-tools/adb.exe'
if (-not (Test-Path -LiteralPath $adbPath)) { throw 'ADB manque. Voir docs/test-android-usb.md.' }
$apkPath = Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug.apk'
$metadataPath = Join-Path $projectRoot '.tools/usb-test/apk.json'
function Get-UsbSourceHash {
    $inputs = @('package.json', 'package-lock.json', 'capacitor.config.ts', 'vite.android.config.ts', 'index.html')
    foreach ($directory in @('src', 'shared', 'public', 'android/app/src/main/java', 'android/app/src/main/res', 'android/app/src/debug')) {
        $location = Join-Path $projectRoot $directory
        if (Test-Path -LiteralPath $location) {
            $inputs += Get-ChildItem -LiteralPath $location -File -Recurse | ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1) }
        }
    }
    $inputs += @('android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle', 'android/variables.gradle', 'android/build.gradle', 'android/gradle.properties', 'android/gradle/wrapper/gradle-wrapper.properties')
    $text = ($inputs | Sort-Object -Unique | ForEach-Object {
        $_ + ':' + (Get-FileHash -LiteralPath (Join-Path $projectRoot $_) -Algorithm SHA256).Hash
    }) -join "`n"
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
