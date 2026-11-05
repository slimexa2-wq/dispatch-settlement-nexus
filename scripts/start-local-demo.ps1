$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot "output"
$databaseName = "xiangneng_hrms_demo"
$databaseUrl = "postgresql://postgres@127.0.0.1:5432/$databaseName"
$ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$postgresRoot = Join-Path $env:LOCALAPPDATA "Programs\PostgreSQL\17-portable\pgsql"
$postgresExe = Join-Path $postgresRoot "bin\postgres.exe"
$psqlExe = Join-Path $postgresRoot "bin\psql.exe"
$createdbExe = Join-Path $postgresRoot "bin\createdb.exe"
$dropdbExe = Join-Path $postgresRoot "bin\dropdb.exe"
$postgresData = Join-Path $postgresRoot "data"
$pnpmExe = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$demoDataFile = Join-Path $repoRoot "data\synthetic\demo-data.json"

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Test-LocalPort([int]$Port) {
  return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Wait-LocalPort([int]$Port, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalPort $Port) { return }
    Start-Sleep -Milliseconds 300
  }
  throw "Port $Port did not start within $TimeoutSeconds seconds. Check the output logs."
}

function Start-WorkspaceApp([string]$Package, [int]$Port, [string]$LogName) {
  if (Test-LocalPort $Port) {
    return (Get-NetTCPConnection -State Listen -LocalPort $Port | Select-Object -First 1).OwningProcess
  }
  $process = Start-Process -FilePath $pnpmExe `
    -ArgumentList "--filter", $Package, "dev" `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $outputDir "$LogName.out.log") `
    -RedirectStandardError (Join-Path $outputDir "$LogName.err.log") `
    -PassThru
  Wait-LocalPort $Port 45
  return (Get-NetTCPConnection -State Listen -LocalPort $Port | Select-Object -First 1).OwningProcess
}

if (-not (Test-Path -LiteralPath $postgresExe)) {
  throw "Local PostgreSQL was not found: $postgresExe"
}
if (-not (Test-LocalPort 5432)) {
  Start-Process -FilePath $postgresExe `
    -ArgumentList "-D", $postgresData, "-p", "5432", "-h", "127.0.0.1" `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $outputDir "postgres.out.log") `
    -RedirectStandardError (Join-Path $outputDir "postgres.err.log") | Out-Null
  Wait-LocalPort 5432 30
}

# Wait until PG actually accepts connections (port listening != ready to serve)
$pgReadyDeadline = (Get-Date).AddSeconds(30)
do {
  $pgReady = (& $psqlExe -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1" 2>$null)
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $pgReadyDeadline)
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL did not become ready within 30 seconds." }

$databaseExists = ((& $psqlExe -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$databaseName'") | Out-String).Trim()
if ($databaseExists -ne "1") {
  & $createdbExe -h 127.0.0.1 -U postgres $databaseName
}

$env:DATABASE_URL = $databaseUrl
$env:API_PORT = "3310"
$randomBytes = New-Object byte[] 48
$randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($randomBytes)
$randomGenerator.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($randomBytes)
$env:AI_DEMO_MODE = "true"
$env:ADMIN_ORIGIN = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4320,http://127.0.0.1:4320"
$env:XIANGNENG_LLM_BASE_URL = "http://127.0.0.1:11434/v1"
$env:XIANGNENG_LLM_MODEL = "qwen3.5:4b"
$env:XIANGNENG_LLM_API_KEY = "ollama-local"
$env:AI_MODEL_TIMEOUT_MS = "10000"

function Invoke-DemoMigrations {
  & $pnpmExe --filter @xiangneng/api exec prisma migrate deploy --schema ../../prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
}

Invoke-DemoMigrations

$personCount = [int]((& $psqlExe -h 127.0.0.1 -U postgres -d $databaseName -tAc 'SELECT COUNT(*) FROM people').Trim())
$projectCount = [int]((& $psqlExe -h 127.0.0.1 -U postgres -d $databaseName -tAc 'SELECT COUNT(*) FROM projects').Trim())
$demoData = Get-Content -LiteralPath $demoDataFile -Raw -Encoding UTF8 | ConvertFrom-Json
$expectedPersonCount = @($demoData.people).Count
$expectedProjectCount = @($demoData.projects).Count

if ($personCount -eq 0 -and $projectCount -eq 0) {
  & $pnpmExe --filter @xiangneng/api db:import-demo
  if ($LASTEXITCODE -ne 0) { throw "Demo business data import failed." }
} elseif ($personCount -ne $expectedPersonCount -or $projectCount -ne $expectedProjectCount) {
  Write-Host "Rebuilding isolated demo database because its data version does not match the repository snapshot." -ForegroundColor Yellow
  & $dropdbExe -h 127.0.0.1 -U postgres --if-exists --force $databaseName
  if ($LASTEXITCODE -ne 0) { throw "Failed to remove the isolated demo database." }
  & $createdbExe -h 127.0.0.1 -U postgres $databaseName
  if ($LASTEXITCODE -ne 0) { throw "Failed to recreate the isolated demo database." }
  Invoke-DemoMigrations
  & $pnpmExe --filter @xiangneng/api db:import-demo
  if ($LASTEXITCODE -ne 0) { throw "Demo business data import failed." }
}

& $pnpmExe --filter @xiangneng/api exec tsx ../../scripts/enrich-demo-data.mts
if ($LASTEXITCODE -ne 0) { throw "Demo data enrichment failed." }

if (-not (Test-Path -LiteralPath $ollamaExe)) {
  throw "Ollama was not found: $ollamaExe"
}
if (-not (Test-LocalPort 11434)) {
  Start-Process -FilePath $ollamaExe -ArgumentList "serve" `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $outputDir "ollama.out.log") `
    -RedirectStandardError (Join-Path $outputDir "ollama.err.log") | Out-Null
  Wait-LocalPort 11434 30
}

$models = (& $ollamaExe list | Out-String)
if ($models -notmatch "qwen3\.5:4b") {
  & $ollamaExe pull qwen3.5:4b
  if ($LASTEXITCODE -ne 0) { throw "Qwen3.5 4B model download failed." }
}

try {
  $warmupBody = @{ model = "qwen3.5:4b"; prompt = "ready"; stream = $false; options = @{ num_predict = 1 } } | ConvertTo-Json -Depth 4
  Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $warmupBody -TimeoutSec 30 | Out-Null
} catch {
  Write-Warning "Ollama warmup did not finish; the first semantic request may be slower: $($_.Exception.Message)"
}

$apiPid = Start-WorkspaceApp "@xiangneng/api" 3310 "api"
$adminPid = Start-WorkspaceApp "@xiangneng/admin" 5173 "admin"
$portalPid = Start-WorkspaceApp "@xiangneng/portal" 4320 "portal"

$loginBody = @{ persona = "systemAdmin" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "http://127.0.0.1:3310/api/auth/demo-login" -Method Post -ContentType "application/json" -Body $loginBody -TimeoutSec 15
$health = Invoke-RestMethod -Uri "http://127.0.0.1:3310/api/ai/health" -Headers @{ Authorization = "Bearer $($login.data.token)" } -TimeoutSec 15
$state = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  apiPid = $apiPid
  adminPid = $adminPid
  portalPid = $portalPid
  database = $health.data.database
  model = $health.data.model
}
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputDir "local-demo-processes.json") -Encoding utf8

Write-Host ""
Write-Host "Xiangneng HRMS is ready" -ForegroundColor Green
Write-Host "Unified portal: http://127.0.0.1:4320"
Write-Host "Admin console: http://localhost:5173 (demo code 8888)"
Write-Host "AI health: verified (also available in the authenticated AI drawer)"
Write-Host "Local model: Qwen3.5 4B / Ollama"
