#!/bin/bash
# KalmanGuard Local Development Script

set -e

echo "🚀 Starting KalmanGuard Local Development Environment"

# Check for required tools
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ docker-compose is required but not installed."; exit 1; }

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️ .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env with your actual values"
fi

# Build and start services
echo "🔨 Building Docker images..."
cd docker
docker-compose build

echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "✅ KalmanGuard is running!"
echo ""
echo "📊 Services:"
echo "  - Frontend:       http://localhost:3000"
echo "  - Agent API:      http://localhost:3001"
echo "  - Kalman Engine:  http://localhost:8000"
echo "  - Prometheus:     http://localhost:9090"
echo "  - Grafana:        http://localhost:3030 (admin/admin)"
echo ""
echo "📝 Logs: docker-compose -f docker/docker-compose.yml logs -f"
echo "🛑 Stop: docker-compose -f docker/docker-compose.yml down"
