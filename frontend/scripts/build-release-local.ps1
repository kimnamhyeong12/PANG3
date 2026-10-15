param([string]$ApiUrl = 'http://127.0.0.1:18081')
$ErrorActionPreference = 'Stop'
$frontendDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectDirectory = (Resolve-Path (Join-Path $frontendDirectory '..')).Path
$runtimeDirectory = Join-Path $projectDirectory 'backend/target/release-local'
$previousApi = $env:EXPO_PUBLIC_API_BASE_URL
$previousTelemetry = $env:EXPO_NO_TELEMETRY
try {
    $env:EXPO_PUBLIC_API_BASE_URL = $ApiUrl
    $env:EXPO_NO_TELEMETRY = '1'
    Push-Location (Join-Path $frontendDirectory 'android')
    try {
        & ./gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --offline --max-workers=2
        if ($LASTEXITCODE -ne 0) { throw 'Local verification APK build failed' }
    } finally { Pop-Location }
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $apk = Join-Path $frontendDirectory 'android/app/build/outputs/apk/release/app-release.apk'
    $target = Join-Path $runtimeDirectory 'pang3-local-preview.apk'
    Copy-Item -LiteralPath $apk -Destination $target -Force
    Write-Output "Local verification APK: $target (API: $ApiUrl; embedded JS; current test signing)"
} finally {
    $env:EXPO_PUBLIC_API_BASE_URL = $previousApi
    $env:EXPO_NO_TELEMETRY = $previousTelemetry
}
