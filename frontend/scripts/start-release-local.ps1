param([string]$ApiUrl = 'http://127.0.0.1:18081', [int]$Port = 18082, [switch]$Restart)
$ErrorActionPreference = 'Stop'
$frontendDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectDirectory = (Resolve-Path (Join-Path $frontendDirectory '..')).Path
$runtimeDirectory = Join-Path $projectDirectory 'backend/target/release-local'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$pidFile = Join-Path $runtimeDirectory 'metro.pid'
if (Test-Path $pidFile) {
    $existingId = [int](Get-Content $pidFile)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $existingId"
    if ($existing -and $existing.CommandLine -match "expo.*cli.*$Port") {
        if (!$Restart -and $existing.CommandLine -match '--localhost') {
            Write-Output "Frontend already running (PID $existingId), Metro $Port"
            exit 0
        }
        # USB testing needs loopback URLs in both the manifest and its bundle.
        Stop-Process -Id $existingId
    }
}
$cli = Join-Path $frontendDirectory 'node_modules/expo/bin/cli'
$env:EXPO_PUBLIC_API_BASE_URL = $ApiUrl
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_OFFLINE = '1'
# On Windows localhost may resolve to ::1; adb reverse connects over IPv4.
if ($env:NODE_OPTIONS -notmatch '--dns-result-order=ipv4first') {
    $env:NODE_OPTIONS = ($env:NODE_OPTIONS + ' --dns-result-order=ipv4first').Trim()
}
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '127.0.0.1'
$env:TEMP = Join-Path $runtimeDirectory 'metro-temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$metro = Start-Process -FilePath (Get-Command node).Source -ArgumentList @($cli, 'start', '--dev-client', '--localhost', '--port', $Port) `
    -WorkingDirectory $frontendDirectory -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeDirectory 'metro.log') -RedirectStandardError (Join-Path $runtimeDirectory 'metro-error.log') -PassThru
Set-Content -LiteralPath $pidFile -Value $metro.Id
Write-Output "Frontend started (PID $($metro.Id)), Metro $Port, API $ApiUrl"
