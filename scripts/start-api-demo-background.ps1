$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$randomBytes = New-Object byte[] 48
$randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($randomBytes)
$randomGenerator.Dispose()
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5432/xiangneng_hrms_demo"
$env:JWT_SECRET = [Convert]::ToBase64String($randomBytes)
$env:AI_DEMO_MODE = "true"
$env:ADMIN_ORIGIN = "http://localhost:5173,http://localhost:4320"
$env:XIANGNENG_LLM_BASE_URL = "http://127.0.0.1:11434/v1"
$env:XIANGNENG_LLM_MODEL = "qwen3.5:4b"
$pnpm = (Get-Command pnpm.cmd).Source
$stdout = Join-Path $repoRoot "output\api-demo.out.log"
$stderr = Join-Path $repoRoot "output\api-demo.err.log"
$process = Start-Process -FilePath $pnpm `
  -ArgumentList "--filter", "@xiangneng/api", "dev" `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru
Write-Output $process.Id
