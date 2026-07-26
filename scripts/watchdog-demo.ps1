# Xiangneng HRMS Demo Watchdog
# Ensures all three services (api:3310, admin:5173, portal:4320) stay alive.
# Checks every 30s; auto-restarts any down service via pnpm dev.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/watchdog-demo.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot "output"
$pnpmExe = (Get-Command pnpm.cmd -ErrorAction Stop).Source

$services = @(
  @{ Package = "@xiangneng/api";    Port = 3310; LogName = "api" },
  @{ Package = "@xiangneng/admin";  Port = 5173; LogName = "admin" },
  @{ Package = "@xiangneng/portal"; Port = 4320; LogName = "portal" }
)

function Test-LocalPort([int]$Port) {
  return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Restart-Service([string]$Package, [int]$Port, [string]$LogName) {
  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] RESTARTING $Package on port $Port..." -ForegroundColor Yellow
  $process = Start-Process -FilePath $pnpmExe `
    -ArgumentList "--filter", $Package, "dev" `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $outputDir "$LogName.out.log") `
    -RedirectStandardError (Join-Path $outputDir "$LogName.err.log") `
    -PassThru
  # Wait up to 45s for port to come back
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalPort $Port) {
      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Package is back up (pid=$($process.Id))." -ForegroundColor Green
      return
    }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] WARNING: $Package did not come back within 45s." -ForegroundColor Red
}

# Also ensure PostgreSQL is alive
$postgresRoot = Join-Path $env:LOCALAPPDATA "Programs\PostgreSQL\17-portable\pgsql"
$postgresExe = Join-Path $postgresRoot "bin\postgres.exe"
$postgresData = Join-Path $postgresRoot "data"

function Ensure-Postgres {
  if (-not (Test-LocalPort 5432)) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] PostgreSQL down - restarting..." -ForegroundColor Yellow
    Start-Process -FilePath $postgresExe `
      -ArgumentList "-D", $postgresData, "-p", "5432", "-h", "127.0.0.1" `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $outputDir "postgres.out.log") `
      -RedirectStandardError (Join-Path $outputDir "postgres.err.log") | Out-Null
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
      if (Test-LocalPort 5432) { break }
      Start-Sleep -Milliseconds 500
    }
  }
}

# Main loop
Write-Host "Watchdog started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "Monitoring: PostgreSQL(5432), API(3310), Admin(5173), Portal(4320)" -ForegroundColor Cyan
Write-Host "Check interval: 30s. Press Ctrl+C to stop." -ForegroundColor Cyan
Write-Host ""

while ($true) {
  Ensure-Postgres
  foreach ($svc in $services) {
    if (-not (Test-LocalPort $svc.Port)) {
      Restart-Service $svc.Package $svc.Port $svc.LogName
    }
  }
  $status = "PG:{0} API:{1} Admin:{2} Portal:{3}" -f `
    (Test-LocalPort 5432), (Test-LocalPort 3310), (Test-LocalPort 5173), (Test-LocalPort 4320)
  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $status" -ForegroundColor DarkGray
  Start-Sleep -Seconds 30
}
