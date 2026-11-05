$ErrorActionPreference = "Stop"

$ports = 3310, 4320, 5173
$stopped = @()
foreach ($port in $ports) {
  $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -in @("node", "pnpm")) {
      Stop-Process -Id $process.Id -Force
      $stopped += "$port/$($process.Id)"
    }
  }
}

if ($stopped.Count -eq 0) {
  Write-Host "No Xiangneng frontend/backend service is running."
} else {
  Write-Host "Stopped Xiangneng services: $($stopped -join ', ')"
}
Write-Host "PostgreSQL and Ollama remain running for other local tasks."
