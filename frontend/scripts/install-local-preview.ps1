param([string]$Serial)
$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$apk = Join-Path $projectDirectory 'backend/target/release-local/pang3-local-preview.apk'
if (!(Test-Path $apk)) { throw 'Run frontend/scripts/build-release-local.ps1 first.' }
$adb = Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe'
if (!(Test-Path $adb)) {
    $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
    if ($adbCommand) { $adb = $adbCommand.Source }
}
if (!(Test-Path $adb)) { throw 'Android platform-tools/adb.exe was not found.' }
$devices = & $adb devices
if ($LASTEXITCODE -ne 0) { throw 'Cannot read connected Android devices.' }
$serials = @($devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if ($Serial) {
    if ($Serial -notin $serials) { throw 'Requested device is not connected or has not authorized USB debugging.' }
} elseif ($serials.Count -eq 1) { $Serial = $serials[0] }
else { throw 'Connect one Android device, or select a connected device with -Serial.' }
# Replace the existing test APK while preserving its login, photos and local data.
& $adb -s $Serial install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'APK update failed. Existing app data was not removed.' }
& $adb -s $Serial reverse tcp:18081 tcp:18081
if ($LASTEXITCODE -ne 0) { throw 'Cannot connect the phone to the local backend through USB.' }
& $adb -s $Serial shell am start -n com.pang3.fieldworkhelper/.MainActivity
if ($LASTEXITCODE -ne 0) { throw 'Cannot launch the local preview APK.' }
Write-Output 'Local preview installed and opened. Keep USB connected for the local backend; Metro is not required.'
