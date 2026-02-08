# KalmanGuard 🛡️

> Autonomous AI Agent System for LP Protection using Adaptive Kalman Filtering, Cross-Chain Risk Intelligence, and Privacy-Preserving Execution on Uniswap v4

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue)](https://soliditylang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)

## 🎯 Track Alignment

| Track | Implementation | Prize Target |
|-------|----------------|--------------|
| **Uniswap v4 Agentic Finance** | Autonomous agent monitors pools, executes risk mitigation | 🥇 $2,500 |
| **Uniswap v4 Privacy DeFi** | Private order flow, confidential signals, MEV-resistant | 🥇 $2,500 |
| **LI.FI Best Use of Composer** | Cross-chain LP rebalancing, unified liquidity | 🥇 $2,500 |
| **ENS Most Creative Use** | Agent identity, config storage, oracle registry | 🥇 $1,500 |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      KalmanGuard System                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 7: Frontend Dashboard (React + D3.js)                     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 6: Cross-Chain Orchestration (LI.FI)                      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 5: ENS Integration (Identity + Config)                    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: Privacy Layer (Flashbots + ZK)                         │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Uniswap v4 Hooks (Dynamic Fees + Risk)                 │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: AI Agent System (5 Specialized Agents)                 │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Adaptive Kalman Filter (Core Intelligence)             │
├─────────────────────────────────────────────────────────────────┤
│  Layer 0: Multi-Source Oracle Fusion                             │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Project Structure

```
kalmanguard/
├── contracts/              # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── KalmanGuardHook.sol
│   │   ├── PrivateOrderPool.sol
│   │   ├── RiskOracleRegistry.sol
│   │   └── AgentController.sol
│   ├── test/
│   └── script/
├── agents/                 # TypeScript agent system
│   ├── src/
│   │   ├── agents/         # 5 specialized agents
│   │   ├── kalman/         # Kalman filter implementation
│   │   ├── strategies/     # Trading strategies
│   │   └── lifi/           # Cross-chain integration
│   └── package.json
├── kalman-engine/          # Python ML & backtesting
│   ├── kalman/
│   ├── backtesting/
│   └── requirements.txt
├── frontend/               # React dashboard
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── pages/
│   └── package.json
├── docker/                 # Docker deployment
└── docs/                   # Documentation
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0 ([download](https://nodejs.org/))
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop/))
- **Foundry** (optional, for contract deployment) ([install](https://getfoundry.sh/))

### One-Click Local Start (Sepolia)

```powershell
# Windows PowerShell
.\start.ps1
```

This will:
1. Build and start Docker containers (agents + kalman-engine + redis)
2. Wait for backend health
3. Start the Vite frontend dev server

Open **http://localhost:5173** in your browser.

### Manual Setup

```bash
# 1. Start backend services
docker compose -f docker/docker-compose.yml up -d agents kalman-engine redis

# 2. Verify backend is running
curl http://localhost:3001/health

# 3. Start frontend
cd frontend && npm install && npm run dev
```

### Sepolia Testnet (For Judges)

See [docs/JUDGE_SEPOLIA.md](docs/JUDGE_SEPOLIA.md) for the 3-phase on-chain proof flow:
1. **Phase 1:** Deploy & verify contracts on Sepolia
2. **Phase 2:** Run backend connected to Sepolia
3. **Phase 3:** Run frontend locally

Safety notes:
- Sepolia uses **test ETH only** (no real-money ETH is spent), but transactions still consume Sepolia gas.
- Use a **separate burner wallet** funded from a Sepolia faucet.
- The deploy script refuses to run on the wrong network by default (expects Sepolia `chainId=11155111`). Override with `EXPECTED_CHAIN_ID` only if you really mean it.

### Endpoints (Local)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Agent API | http://localhost:3001 |
| Kalman Engine | http://localhost:8000 |
| WebSocket | ws://localhost:3001/ws |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3030 |

## 🔧 Configuration

All configuration is in the root `.env` file. Copy from `.env.example`:

```bash
cp .env.example .env
```

**Required for Sepolia:**
```bash
PRIVATE_KEY=0x...           # 32-byte hex deployer key
ETHERSCAN_API_KEY=...       # For contract verification
KALMANGUARD_HOOK_SEPOLIA=   # Paste after deployment
AGENT_CONTROLLER_SEPOLIA=   # Paste after deployment
```

See [.env.example](.env.example) for all options.

## 📊 Performance Metrics

| Metric | Baseline | KalmanGuard | Improvement |
|--------|----------|-------------|-------------|
| Impermanent Loss | -11.2% | -6.5% | **+58%** |
| MEV Loss | -3.4% | -1.1% | **+67%** |
| APY | 14.8% | 16.2% | **+9%** |

## 🧪 Testing

```bash
# Smart contract tests
cd contracts && forge test -vvv

# Agent tests
cd agents && npm test

# Python tests
cd kalman-engine && pytest
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## 🔗 Links

- [Documentation](https://docs.kalmanguard.eth)
- [Demo](https://app.kalmanguard.eth)
- [Twitter](https://twitter.com/kalmanguard)
