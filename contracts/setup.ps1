# KalmanGuard Contracts Setup Script
# This script installs all required Foundry dependencies

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  KalmanGuard Contracts Setup          " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if forge is installed
$forgeInstalled = Get-Command forge -ErrorAction SilentlyContinue
if (-not $forgeInstalled) {
    Write-Host "[!] Foundry (forge) is not installed!" -ForegroundColor Red
    Write-Host "    Install it from: https://getfoundry.sh" -ForegroundColor Yellow
    Write-Host "    Run: curl -L https://foundry.paradigm.xyz | bash" -ForegroundColor Yellow
    Write-Host "    Then: foundryup" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Foundry is installed" -ForegroundColor Green
Write-Host ""

# Navigate to contracts directory
Set-Location $PSScriptRoot

# Install dependencies
Write-Host "[1/5] Installing forge-std..." -ForegroundColor Yellow
forge install foundry-rs/forge-std --no-commit 2>$null

Write-Host "[2/5] Installing v4-core..." -ForegroundColor Yellow
forge install uniswap/v4-core --no-commit 2>$null

Write-Host "[3/5] Installing v4-periphery..." -ForegroundColor Yellow
forge install uniswap/v4-periphery --no-commit 2>$null

Write-Host "[4/5] Installing OpenZeppelin contracts..." -ForegroundColor Yellow
forge install OpenZeppelin/openzeppelin-contracts --no-commit 2>$null

Write-Host "[5/5] Building contracts..." -ForegroundColor Yellow
forge build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Contracts setup complete!            " -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Copy .env.example to .env and fill in values" -ForegroundColor White
    Write-Host "  2. Run: forge test" -ForegroundColor White
    Write-Host "  3. Deploy: forge script script/Deploy.s.sol --rpc-url sepolia --broadcast" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "[!] Build failed. Check errors above." -ForegroundColor Red
    exit 1
}
