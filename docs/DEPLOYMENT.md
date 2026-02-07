# KalmanGuard Deployment Guide

## Prerequisites

- Docker (Docker Desktop on Windows/Mac includes `docker compose`)
- Node.js 20+ (for local development)
- Python 3.11+ (for local development)
- Foundry (for smart contract deployment)

> For hackathon judging, you can run in **DEMO_MODE** with **no API keys** and no RPC URLs.

## Local Development

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/kalmanguard
cd kalmanguard

# Copy environment file (optional)
cp .env.example .env

# Judge-friendly demo mode (no keys required)
# DEMO_MODE=true is the default in docker-compose.yml

# Start all services
./scripts/start-dev.sh     # Linux/Mac
.\scripts\start-dev.ps1    # Windows PowerShell
```

For the Sepolia judging flow (deploy + local brain + local face), use:

- `docs/JUDGE_DEMO_SEPOLIA.md`

### Service URLs
- Frontend: http://localhost:3000
- Agent API: http://localhost:3001
- Kalman Engine: http://localhost:8000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3030

## Smart Contract Deployment

### Prerequisites
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Deploy to Testnet
```bash
cd contracts

# Build
forge build

# Test
forge test

# Deploy to Sepolia
forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL_SEPOLIA \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

### Deploy to Mainnet
```bash
# Deploy to Mainnet (USE CAUTION)
forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL_MAINNET \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --slow
```

### Update Environment
After deployment, update your `.env` file with the deployed contract addresses:
```
KALMANGUARD_HOOK_MAINNET=0x...
PRIVATE_ORDER_POOL_MAINNET=0x...
RISK_ORACLE_REGISTRY_MAINNET=0x...
AGENT_CONTROLLER_MAINNET=0x...
```

## Production Deployment

### One-VM “Judge Demo” Deployment (Recommended)

This is the simplest internet deployment that works with the live UI using `/api/*` and `/ws` behind the frontend reverse proxy.

1) Provision a VM (e.g. Ubuntu 22.04) and open inbound TCP ports:
  - `3000` (KalmanGuard UI)
  - optional: `9090` (Prometheus), `3030` (Grafana)

2) Install Docker and Compose v2.

3) Deploy:

```bash
git clone <your-repo-url>
cd kalmanguard

# Optional: create .env for overrides
cp .env.example .env

# Run in demo mode (default): no RPC URLs or private keys required
docker compose -f docker/docker-compose.yml up -d --build
```

4) Visit:
  - UI: `http://<server-ip>:3000`
  - Agents API: `http://<server-ip>:3001/api/state`

If you want HTTPS, place a TLS-terminating reverse proxy (Caddy/Traefik/NGINX) in front of port `3000`.

### Infrastructure Requirements

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| Agents | 2 cores | 4 GB | 10 GB |
| Kalman Engine | 2 cores | 4 GB | 5 GB |
| Frontend | 1 core | 1 GB | 1 GB |
| Redis | 1 core | 2 GB | 10 GB |
| Prometheus | 1 core | 2 GB | 50 GB |
| Grafana | 1 core | 1 GB | 5 GB |

### Cloud Deployment (AWS)

#### 1. Set up Infrastructure
```bash
# Using AWS ECS or EKS
# (Bring-your-own IaC: Terraform templates are not included in this repo.)
```

#### 2. Configure Secrets
Store sensitive values in AWS Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name kalmanguard/production \
  --secret-string file://secrets.json
```

#### 3. Deploy Services
```bash
# Build and push Docker images
docker build -t your-registry/kalmanguard-agents:latest ./agents
docker push your-registry/kalmanguard-agents:latest

docker build -t your-registry/kalmanguard-kalman:latest ./kalman-engine
docker push your-registry/kalmanguard-kalman:latest

docker build -t your-registry/kalmanguard-frontend:latest ./frontend
docker push your-registry/kalmanguard-frontend:latest
```

### Kubernetes Deployment

```yaml
# Example deployment manifest (see k8s/ directory for full configs)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kalmanguard-agents
spec:
  replicas: 2
  selector:
    matchLabels:
      app: kalmanguard-agents
  template:
    metadata:
      labels:
        app: kalmanguard-agents
    spec:
      containers:
      - name: agents
        image: your-registry/kalmanguard-agents:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
```

## Monitoring & Alerting

### Prometheus Metrics

Key metrics to monitor:
- `kalmanguard_price` - Current filtered price
- `kalmanguard_volatility` - Current volatility estimate
- `kalmanguard_risk_score` - Composite risk score
- `kalmanguard_fee_updates_total` - Total fee updates
- `kalmanguard_mev_detected_total` - MEV detections
- `kalmanguard_agent_latency` - Agent processing latency

### Grafana Dashboards

Import the provided dashboards from `docker/grafana/dashboards/`:
- KalmanGuard Overview
- Risk Analysis
- MEV Activity
- Agent Performance

### Alerting Rules

Configure alerts in Prometheus:
```yaml
groups:
  - name: kalmanguard
    rules:
      - alert: HighRiskScore
        expr: kalmanguard_risk_score > 80
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High risk score detected"
          
      - alert: AgentDown
        expr: up{job="kalmanguard-agents"} == 0
        for: 1m
        labels:
          severity: critical
```

## Security Considerations

### Private Key Management
- Never commit private keys to version control
- Use hardware wallets for production keys
- Consider multi-sig for high-value operations

### Network Security
- Use VPCs and private subnets
- Enable TLS for all services
- Restrict RPC access to known IPs

### Smart Contract Security
- All contracts audited before mainnet
- Timelock on critical parameter changes
- Emergency pause functionality

## Troubleshooting

### Common Issues

#### Agents not connecting to RPC
```bash
# Check RPC connectivity
curl -X POST $RPC_URL_MAINNET \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

#### Kalman filter diverging
```bash
# Reset filter state
curl -X POST http://localhost:8000/kalman/reset/pool-id
```

#### High memory usage
```bash
# Check container stats
docker stats kalmanguard-agents
```

### Logs

```bash
# View all logs
docker compose -f docker/docker-compose.yml logs -f

# View specific service
docker compose -f docker/docker-compose.yml logs -f agents

# Filter for errors
docker-compose logs agents 2>&1 | grep ERROR
```

## Maintenance

### Updating
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d
```

### Backup
```bash
# Backup Redis data
docker-compose exec redis redis-cli BGSAVE

# Backup Prometheus data
docker cp kalmanguard-prometheus:/prometheus ./backup/prometheus

# Backup Grafana dashboards
docker cp kalmanguard-grafana:/var/lib/grafana ./backup/grafana
```
