param(
  [Parameter(Mandatory=$false)]
  [ValidateSet('localhost','sepolia','mainnet','arbitrum','optimism','base')]
  [string]$Network = 'sepolia'
)

Write-Host "KalmanGuard Contract Deployment" -ForegroundColor Cyan
Write-Host "Deploying to: $Network" -ForegroundColor Green

function Import-DotEnv {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Path
  )
  if (-not (Test-Path $Path)) { return }
  Write-Host "Loading environment from $Path" -ForegroundColor Gray
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"') -and $val.Length -ge 2) { $val = $val.Substring(1, $val.Length - 2) }
    if ($val.StartsWith("'") -and $val.EndsWith("'") -and $val.Length -ge 2) { $val = $val.Substring(1, $val.Length - 2) }
    if (-not $key) { return }
    $envPath = "Env:$key"
    $existing = (Get-Item -Path $envPath -ErrorAction SilentlyContinue).Value
    if ([string]::IsNullOrEmpty($existing)) {
      Set-Item -Path $envPath -Value $val
    }
  }
}

$rootEnv = Join-Path $PSScriptRoot '..\.env'
Import-DotEnv -Path $rootEnv

if (-not (Get-Command forge -ErrorAction SilentlyContinue)) {
  Write-Host "Foundry (forge) is required. Install from https://getfoundry.sh" -ForegroundColor Red
  exit 1
}

Push-Location (Join-Path $PSScriptRoot '..\contracts')

Write-Host "Building contracts..." -ForegroundColor Cyan
forge build

Write-Host "Running tests..." -ForegroundColor Cyan
forge test

switch ($Network) {
  'localhost' {
    Write-Host "Deploying to local Anvil..." -ForegroundColor Cyan
    forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast
  }
  'sepolia' {
    if (-not $env:RPC_URL_SEPOLIA) { $env:RPC_URL_SEPOLIA = 'https://ethereum-sepolia-rpc.publicnode.com' }
    Write-Host "Deploying to Sepolia..." -ForegroundColor Cyan
    Write-Host "RPC: $env:RPC_URL_SEPOLIA" -ForegroundColor Gray
    Write-Host "Explorer: https://sepolia.etherscan.io" -ForegroundColor Gray
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url $env:RPC_URL_SEPOLIA --broadcast --verify
  }
  'mainnet' {
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url $env:RPC_URL_MAINNET --broadcast --verify
  }
  'arbitrum' {
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url $env:RPC_URL_ARBITRUM --broadcast --verify
  }
  'optimism' {
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url $env:RPC_URL_OPTIMISM --broadcast --verify
  }
  'base' {
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url $env:RPC_URL_BASE --broadcast --verify
  }
}

Pop-Location

Write-Host "Deployment complete. Update your .env with the deployed addresses." -ForegroundColor Green
