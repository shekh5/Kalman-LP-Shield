param(
    [switch]$SkipBuild,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "+-----------------------------------------------------------+" -ForegroundColor Cyan
Write-Host "|                 KalmanGuard Local Launcher                |" -ForegroundColor Cyan
Write-Host "+-----------------------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

$RootDir = $PSScriptRoot

# Check prerequisites
function Test-Prerequisites {
    $missing = @()
    
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        $missing += "Docker (https://docs.docker.com/get-docker/)"
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        $missing += "Node.js (https://nodejs.org/)"
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        $missing += "npm (comes with Node.js)"
    }
    
    if ($missing.Count -gt 0) {
        Write-Host "Missing prerequisites:" -ForegroundColor Red
        foreach ($m in $missing) {
            Write-Host "  - $m" -ForegroundColor Yellow
        }
        exit 1
    }
    
    Write-Host "[OK] All prerequisites installed" -ForegroundColor Green
}

# Load environment
function Import-DotEnv {
    $envFile = Join-Path $RootDir ".env"
    if (Test-Path $envFile) {
        Write-Host "[*] Loading .env file..." -ForegroundColor Gray
        Get-Content $envFile | ForEach-Object {
            $line = $_.Trim()
            if (-not $line -or $line.StartsWith('#')) { return }
            $idx = $line.IndexOf('=')
            if ($idx -lt 1) { return }
            $key = $line.Substring(0, $idx).Trim()
            $val = $line.Substring($idx + 1).Trim()
            if (-not (Get-Item -Path "Env:$key" -ErrorAction SilentlyContinue)) {
                Set-Item -Path "Env:$key" -Value $val
            }
        }
    }
}

# Start Docker backend
function Start-Backend {
    Write-Host ""
    Write-Host "[1/3] Starting Docker backend..." -ForegroundColor Cyan
    
    $composeFile = Join-Path $RootDir "docker\docker-compose.yml"
    $composeArgs = "--env-file `"$RootDir\.env`" -f `"$composeFile`""
    
    $services = "redis kalman-engine agents"
    
    if (-not $SkipBuild) {
        Write-Host "      Building containers (this may take a few minutes on first run)..." -ForegroundColor Gray
        $buildCmd = "docker compose $composeArgs build $services"
        Invoke-Expression $buildCmd
    }
    
    Write-Host "      Starting services..." -ForegroundColor Gray
    $upCmd = "docker compose $composeArgs up -d $services"
    Invoke-Expression $upCmd
    
    Write-Host "[OK] Backend started" -ForegroundColor Green
}

# Wait for backend health
function Wait-ForBackend {
    Write-Host ""
    Write-Host "[2/3] Waiting for backend to be healthy..." -ForegroundColor Cyan
    
    $maxAttempts = 30
    $attempt = 0
    
    while ($attempt -lt $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "[OK] Backend healthy at http://localhost:3001" -ForegroundColor Green
                return
            }
        } catch {
            # ignore
        }
        
        $attempt++
        Write-Host "      Waiting... ($attempt/$maxAttempts)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
    
    Write-Host "[WARN] Backend may not be fully ready yet" -ForegroundColor Yellow
}

# Start frontend dev server
function Start-Frontend {
    Write-Host ""
    Write-Host "[3/3] Starting frontend dev server..." -ForegroundColor Cyan
    
    $frontendDir = Join-Path $RootDir "frontend"
    Push-Location $frontendDir
    
    # Install deps if needed
    if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
        Write-Host "      Installing frontend dependencies..." -ForegroundColor Gray
        npm install
    }
    
    Write-Host ""
    Write-Host "===========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host " KalmanGuard is starting!" -ForegroundColor Green
    Write-Host ""
    Write-Host " Backend API:  http://localhost:3001" -ForegroundColor White
    Write-Host " Kalman Engine: http://localhost:8000" -ForegroundColor White
    Write-Host " Frontend:     http://localhost:5173 (opening soon...)" -ForegroundColor White
    Write-Host ""
    Write-Host " Network: Sepolia (single mode)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host " Press Ctrl+C to stop the frontend dev server." -ForegroundColor Gray
    Write-Host " Run 'docker compose -f docker/docker-compose.yml down' to stop backend." -ForegroundColor Gray
    Write-Host ""
    Write-Host "===========================================================" -ForegroundColor Green
    Write-Host ""
    
    # Start Vite (this will block)
    npm run dev
    
    Pop-Location
}

# Main
Test-Prerequisites
Import-DotEnv

if (-not $FrontendOnly) {
    Start-Backend
    Wait-ForBackend
}

Start-Frontend
