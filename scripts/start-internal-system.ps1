$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot "output"
$databaseName = "xiangneng_hrms_internal"
$databaseUrl = "postgresql://postgres@127.0.0.1:5432/$databaseName"
$postgresRoot = Join-Path $env:LOCALAPPDATA "Programs\PostgreSQL\17-portable\pgsql"
$postgresExe = Join-Path $postgresRoot "bin\postgres.exe"
$psqlExe = Join-Path $postgresRoot "bin\psql.exe"
$createdbExe = Join-Path $postgresRoot "bin\createdb.exe"
$postgresData = Join-Path $postgresRoot "data"
$pnpmExe = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$realDataFile = Join-Path $repoRoot "data\internal\real-business-data.json"
$accountFile = Join-Path $repoRoot "data\internal\internal-employee-initial-accounts.json"
$jwtFile = Join-Path $outputDir "internal-jwt-secret.txt"

$requiredSourceFiles = @(
  (Join-Path $repoRoot "data\internal-source\祥能人力周度在离职数据统计_20260719.xlsx"),
  (Join-Path $repoRoot "data\internal-source\所有企业名单汇总2026-07-21.xls"),
  (Join-Path $repoRoot "data\internal-source\202606集团花名册.xlsx")
)

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Test-LocalPort([int]$Port) {
  return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Wait-LocalPort([int]$Port, [int]$TimeoutSeconds = 45) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalPort $Port) { return }
    Start-Sleep -Milliseconds 300
  }
  throw "端口 $Port 未在 $TimeoutSeconds 秒内启动，请查看 output 日志。"
}

function Start-WorkspaceApp([string]$Package, [int]$Port, [string]$LogName) {
  if (Test-LocalPort $Port) {
    throw "端口 $Port 已被占用。请先停止旧演示或旧内部系统，避免把真实数据连到错误进程。"
  }
  $process = Start-Process -FilePath $pnpmExe `
    -ArgumentList "--filter", $Package, "dev" `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $outputDir "$LogName.out.log") `
    -RedirectStandardError (Join-Path $outputDir "$LogName.err.log") `
    -PassThru
  Wait-LocalPort $Port 60
  return $process.Id
}

function Convert-SecureStringToPlainText([Security.SecureString]$SecureString) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

foreach ($sourceFile in $requiredSourceFiles) {
  if (-not (Test-Path -LiteralPath $sourceFile)) {
    throw "缺少真实源数据文件：$sourceFile"
  }
}

if (-not (Test-Path -LiteralPath $postgresExe)) {
  throw "未找到本地 PostgreSQL：$postgresExe"
}
if (-not (Test-LocalPort 5432)) {
  Start-Process -FilePath $postgresExe `
    -ArgumentList "-D", $postgresData, "-p", "5432", "-h", "127.0.0.1" `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $outputDir "postgres.internal.out.log") `
    -RedirectStandardError (Join-Path $outputDir "postgres.internal.err.log") | Out-Null
  Wait-LocalPort 5432 30
}

$pgReadyDeadline = (Get-Date).AddSeconds(30)
do {
  & $psqlExe -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $pgReadyDeadline)
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL 在30秒内未准备完成。" }

$databaseExists = ((& $psqlExe -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$databaseName'") | Out-String).Trim()
if ($databaseExists -ne "1") {
  & $createdbExe -h 127.0.0.1 -U postgres $databaseName
  if ($LASTEXITCODE -ne 0) { throw "创建内部数据库失败。" }
}

$adminUsername = $env:XIANGNENG_BOOTSTRAP_ADMIN_USERNAME
if ([string]::IsNullOrWhiteSpace($adminUsername)) {
  $adminUsername = Read-Host "请输入内部系统管理员账号（建议 xiangneng_admin）"
}
if ([string]::IsNullOrWhiteSpace($adminUsername)) {
  throw "管理员账号不能为空。"
}
$adminPassword = $env:XIANGNENG_BOOTSTRAP_ADMIN_PASSWORD
if ([string]::IsNullOrWhiteSpace($adminPassword)) {
  $adminPassword = Convert-SecureStringToPlainText (Read-Host "请输入不少于12位的管理员密码" -AsSecureString)
}
if ($adminPassword.Length -lt 12) {
  throw "管理员密码不能少于12位。"
}

if (Test-Path -LiteralPath $jwtFile) {
  $jwtSecret = (Get-Content -LiteralPath $jwtFile -Raw -Encoding UTF8).Trim()
} else {
  $randomBytes = New-Object byte[] 48
  $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  $randomGenerator.GetBytes($randomBytes)
  $randomGenerator.Dispose()
  $jwtSecret = [Convert]::ToBase64String($randomBytes)
  Set-Content -LiteralPath $jwtFile -Value $jwtSecret -Encoding UTF8
}

$env:DATABASE_URL = $databaseUrl
$env:API_PORT = "3310"
$env:JWT_SECRET = $jwtSecret
$env:AI_DEMO_MODE = "false"
$env:VITE_ENABLE_DEMO_SESSION = "false"
$env:VITE_PORTAL_DEMO_FALLBACK = "false"
$env:NODE_ENV = "development"
$env:ADMIN_ORIGIN = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4320,http://127.0.0.1:4320"
$env:XIANGNENG_BOOTSTRAP_ADMIN_USERNAME = $adminUsername.Trim()
$env:XIANGNENG_BOOTSTRAP_ADMIN_PASSWORD = $adminPassword
$env:XIANGNENG_BOOTSTRAP_ADMIN_DISPLAY_NAME = "祥能系统管理员"

Write-Host "正在从三份真实源表重新生成内部数据集……" -ForegroundColor Cyan
& $pnpmExe data:normalize-real
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $realDataFile)) {
  throw "真实数据规范化失败。"
}

Write-Host "正在执行数据库迁移……" -ForegroundColor Cyan
& $pnpmExe --filter @xiangneng/api exec prisma migrate deploy --schema ../../prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { throw "数据库迁移失败。" }

Write-Host "正在导入真实组织、项目、人员并自动创建内部员工账号……" -ForegroundColor Cyan
& $pnpmExe --filter @xiangneng/api exec tsx ../../scripts/seed-internal-system.mts
if ($LASTEXITCODE -ne 0) { throw "内部真实数据初始化失败。" }

$apiPid = Start-WorkspaceApp "@xiangneng/api" 3310 "api.internal"
$adminPid = Start-WorkspaceApp "@xiangneng/admin" 5173 "admin.internal"
$portalPid = Start-WorkspaceApp "@xiangneng/portal" 4320 "portal.internal"

$health = Invoke-RestMethod -Uri "http://127.0.0.1:3310/api/health" -TimeoutSec 15
$counts = [ordered]@{
  internalEmployees = [int]((& $psqlExe -h 127.0.0.1 -U postgres -d $databaseName -tAc 'SELECT COUNT(*) FROM internal_employees').Trim())
  people = [int]((& $psqlExe -h 127.0.0.1 -U postgres -d $databaseName -tAc 'SELECT COUNT(*) FROM people').Trim())
  projects = [int]((& $psqlExe -h 127.0.0.1 -U postgres -d $databaseName -tAc 'SELECT COUNT(*) FROM projects').Trim())
  organizationUnits = [int]((& $psqlExe -h 127.0.0.1 -U postgres -d $databaseName -tAc 'SELECT COUNT(*) FROM organization_units').Trim())
}
$state = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  mode = "internal-real-data"
  database = $databaseName
  apiPid = $apiPid
  adminPid = $adminPid
  portalPid = $portalPid
  health = $health.status
  counts = $counts
  employeeAccountFile = $accountFile
}
$state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputDir "internal-system-processes.json") -Encoding UTF8

$env:XIANGNENG_BOOTSTRAP_ADMIN_PASSWORD = $null
$adminPassword = $null

Write-Host ""
Write-Host "祥能内部真实数据系统已启动" -ForegroundColor Green
Write-Host "统一入口：http://127.0.0.1:4320"
Write-Host "管理后台：http://127.0.0.1:5173"
Write-Host "管理员账号：$adminUsername"
Write-Host "内部员工首次账号文件：$accountFile"
Write-Host "数据规模：内部员工 $($counts.internalEmployees)，派遣/候选人员 $($counts.people)，项目 $($counts.projects)，组织单元 $($counts.organizationUnits)"
