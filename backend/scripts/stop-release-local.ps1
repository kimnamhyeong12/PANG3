$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$pidFile = Join-Path $projectDirectory 'backend/target/release-local/backend.pid'
if (!(Test-Path $pidFile)) { Write-Output 'No local backend PID file'; exit 0 }
$backendId = [int](Get-Content $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $backendId"
if ($process -and $process.CommandLine -match 'PANG3-app.*release-local.*backend.args') {
    Stop-Process -Id $backendId
    Write-Output "Stopped local test backend (PID $backendId)"
}
Remove-Item -LiteralPath $pidFile
