param([switch]$Build, [ValidateSet('Postgres', 'H2')][string]$Database = 'Postgres')
$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runtimeDirectory = Join-Path $projectDirectory 'backend/target/release-local'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$pidFile = Join-Path $runtimeDirectory 'backend.pid'
if (Test-Path $pidFile) {
    $existingId = [int](Get-Content $pidFile)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $existingId"
    if ($existing -and $existing.CommandLine -match 'PANG3-app.*release-local.*backend.args') {
        Write-Output "Local backend already running (PID $existingId)"
        exit 0
    }
}
Push-Location (Join-Path $projectDirectory 'backend')
try {
    if ($Build) {
        & mvn -o package -DskipTests -q
        if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
    }
} finally { Pop-Location }
$jarPath = Join-Path $projectDirectory 'backend/target/fieldwork-helper-0.0.1.jar'
if (!(Test-Path $jarPath)) { throw 'Build the backend first, or run with -Build' }
$configPath = (Join-Path $projectDirectory 'backend/src/main/resources/application-release-local.properties').Replace('\','/')
$uploads = (Join-Path $runtimeDirectory 'uploads').Replace('\','/')
$reports = (Join-Path $runtimeDirectory 'reports').Replace('\','/')
$reportPython = Join-Path $runtimeDirectory 'report-venv/Scripts/python.exe'
if (!(Test-Path $reportPython)) { $reportPython = (Get-Command python -ErrorAction Stop).Source }
# Command-line overrides ensure inherited AWS/production environment values
# cannot redirect this process to a remote DB or existing upload directory.
$javaArguments = @(
    '-jar', $jarPath,
    "--spring.config.location=file:$configPath", '--spring.config.import=',
    '--spring.profiles.active=release-local', '--spring.cloud.aws.parameterstore.enabled=false',
    '--spring.cloud.aws.region.static=ap-northeast-2',
    '--spring.datasource.url=jdbc:postgresql://127.0.0.1:15432/pang3_release_test',
    '--spring.datasource.username=pang3_test', '--spring.datasource.password=local_test_only',
    '--server.port=18081', '--server.address=0.0.0.0',
    "--fieldwork.upload.base-dir=$uploads", "--fieldwork.ai.output-dir=$reports",
    "--fieldwork.ai.python-path=$reportPython",
    '--fieldwork.auth.cookie-secure=false', '--fieldwork.auth.mail-from=', '--fieldwork.auth.public-url=',
    '--gemini.api-key=', '--kakao.rest-api-key='
)
if ($Database -eq 'H2') {
    $javaArguments = @($javaArguments | Where-Object { ! $_.StartsWith('--spring.datasource.') })
    $classpathFile = Join-Path $projectDirectory 'backend/target/release-test-classpath.txt'
    if (!(Test-Path $classpathFile)) { throw 'Generate the Maven test classpath first (H2 is a test dependency)' }
    $classpath = (Join-Path $projectDirectory 'backend/target/classes') + ';' + (Get-Content $classpathFile -Raw).Trim()
    $javaArguments = @('-cp', $classpath, 'com.fieldwork.FieldworkApplication') + $javaArguments[2..($javaArguments.Length - 1)]
    $databasePath = (Join-Path $runtimeDirectory 'database/pang3').Replace('\','/')
    $javaArguments += @("--spring.datasource.url=jdbc:h2:file:$databasePath;MODE=PostgreSQL;DB_CLOSE_ON_EXIT=FALSE",
        '--spring.datasource.driver-class-name=org.h2.Driver', '--spring.datasource.username=sa', '--spring.datasource.password=')
}
$argumentFile = Join-Path $runtimeDirectory 'backend.args'
$argumentLines = $javaArguments | ForEach-Object { '"' + $_.Replace('\','/') + '"' }
[System.IO.File]::WriteAllLines($argumentFile, $argumentLines, [System.Text.UTF8Encoding]::new($false))
$process = Start-Process -FilePath (Get-Command java).Source -ArgumentList "@$argumentFile" -WorkingDirectory $projectDirectory `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'backend.log') `
    -RedirectStandardError (Join-Path $runtimeDirectory 'backend-error.log') -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id
Write-Output "Local backend started (PID $($process.Id)), port 18081, database $Database"
