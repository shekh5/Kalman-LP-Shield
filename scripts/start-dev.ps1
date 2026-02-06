# PowerShell script for Windows users
# KalmanGuard Local Development Script

Write-Host "🚀 Starting KalmanGuard Local Development Environment" -ForegroundColor Green

# Check for Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is required but not installed." -ForegroundColor Red
    exit 1
}

# Check for .env file
if (-not (Test-Path ".env")) {
    Write-Host "⚠️ .env file not found. Creating from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "📝 Please edit .env with your actual values" -ForegroundColor Cyan
}

# Build and start services
Write-Host "🔨 Building Docker images..." -ForegroundColor Cyan
Set-Location docker
docker compose build

Write-Host "🚀 Starting services..." -ForegroundColor Cyan
docker compose up -d

Write-Host ""
Write-Host "✅ KalmanGuard is running!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Services:" -ForegroundColor Cyan
Write-Host "  - Frontend:       http://localhost:3000"
Write-Host "  - Agent API:      http://localhost:3001"
Write-Host "  - Kalman Engine:  http://localhost:8000"
Write-Host "  - Prometheus:     http://localhost:9090"
Write-Host "  - Grafana:        http://localhost:3030 (admin/admin)"
Write-Host ""
Write-Host "📝 Logs: docker compose -f docker/docker-compose.yml logs -f" -ForegroundColor Gray
Write-Host "🛑 Stop: docker compose -f docker/docker-compose.yml down" -ForegroundColor Gray
