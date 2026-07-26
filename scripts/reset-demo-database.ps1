$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$databaseName = "xiangneng_hrms_demo"
$expectedDatabaseName = "xiangneng_hrms_demo"
$postgresRoot = Join-Path $env:LOCALAPPDATA "Programs\PostgreSQL\17-portable\pgsql"
$psqlExe = Join-Path $postgresRoot "bin\psql.exe"
$createdbExe = Join-Path $postgresRoot "bin\createdb.exe"
$dropdbExe = Join-Path $postgresRoot "bin\dropdb.exe"
$pnpmExe = (Get-Command pnpm.cmd -ErrorAction Stop).Source

if ($databaseName -cne $expectedDatabaseName) {
  throw "Refusing to reset an unexpected database: $databaseName"
}
foreach ($executable in @($psqlExe, $createdbExe, $dropdbExe)) {
  if (-not (Test-Path -LiteralPath $executable)) {
    throw "Required PostgreSQL executable was not found: $executable"
  }
}

$serverIdentity = (& $psqlExe -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT current_database() || '@' || inet_server_addr() || ':' || inet_server_port()").Trim()
if ($LASTEXITCODE -ne 0 -or $serverIdentity -notmatch "^postgres@(127\.0\.0\.1(?:/32)?|::1):5432$") {
  throw "Refusing to reset because the target is not the local PostgreSQL demo server: $serverIdentity"
}

& (Join-Path $repoRoot "scripts\stop-local-demo.ps1")
& $dropdbExe -h 127.0.0.1 -U postgres --if-exists --force $databaseName
if ($LASTEXITCODE -ne 0) { throw "Failed to remove the isolated demo database." }
& $createdbExe -h 127.0.0.1 -U postgres $databaseName
if ($LASTEXITCODE -ne 0) { throw "Failed to recreate the isolated demo database." }

$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5432/$databaseName"
& $pnpmExe --filter @xiangneng/api exec prisma migrate deploy --schema ../../prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
& $pnpmExe --filter @xiangneng/api db:import-demo
if ($LASTEXITCODE -ne 0) { throw "Demo business data import failed." }
& $pnpmExe --filter @xiangneng/api exec tsx ../../scripts/enrich-demo-data.mts
if ($LASTEXITCODE -ne 0) { throw "Demo data enrichment failed." }

Write-Host "The isolated demo database was reset from the deterministic synthetic dataset." -ForegroundColor Green
