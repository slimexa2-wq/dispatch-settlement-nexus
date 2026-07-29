$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repoRoot "output\internal-system-processes.json"

if (-not (Test-Path -LiteralPath $statePath)) {
  Write-Host "未找到内部系统运行记录，无需停止。" -ForegroundColor Yellow
  exit 0
}

$state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
$stopped = @()
foreach ($property in @("apiPid", "adminPid", "portalPid")) {
  $processId = [int]($state.$property)
  if ($processId -le 0) { continue }
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    Stop-Process -Id $processId -Force
    $stopped += "$property=$processId"
  }
}

Remove-Item -LiteralPath $statePath -Force
if ($stopped.Count -gt 0) {
  Write-Host "祥能内部系统已停止：$($stopped -join '，')" -ForegroundColor Green
} else {
  Write-Host "运行记录中的进程已经结束，状态文件已清理。" -ForegroundColor Yellow
}
