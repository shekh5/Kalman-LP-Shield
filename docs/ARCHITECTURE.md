# KalmanGuard Architecture Documentation

## System Overview

KalmanGuard is an autonomous AI agent system that protects liquidity providers across multiple chains using adaptive Kalman filtering, cross-chain risk intelligence, and privacy-preserving execution on Uniswap v4.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            KalmanGuard Architecture                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐     │
│  │   Mainnet   │   │  Arbitrum   │   │  Optimism   │   │    Base     │     │
│  │    Pool     │   │    Pool     │   │    Pool     │   │    Pool     │     │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘     │
│         │                 │                 │                 │             │
│         └────────────┬────┴────────┬────────┴────────┬────────┘             │
│                      │             │                 │                       │
│              ┌───────▼─────────────▼─────────────────▼───────┐              │
│              │                                               │              │
│              │              Agent Coordinator                │              │
│              │                                               │              │
│              │  ┌───────────┐  ┌───────────┐  ┌───────────┐ │              │
│              │  │   Price   │  │    MEV    │  │   Risk    │ │              │
│              │  │  Monitor  │  │  Detector │  │  Scorer   │ │              │
│              │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ │              │
│              │        │              │              │        │              │
│              │  ┌─────▼──────────────▼──────────────▼─────┐ │              │
│              │  │         Adaptive Kalman Filter          │ │              │
│              │  │   (Price, Velocity, Volatility, Beta)   │ │              │
│              │  └─────────────────┬───────────────────────┘ │              │
│              │                    │                         │              │
│              │  ┌─────────────────▼───────────────────────┐ │              │
│              │  │          Dynamic Fee Calculator          │ │              │
│              │  │     (Regime-Adaptive, MEV-Resistant)    │ │              │
│              │  └─────────────────┬───────────────────────┘ │              │
│              │                    │                         │              │
│              │  ┌───────────┐  ┌──▼────────┐  ┌───────────┐ │              │
│              │  │ Execution │  │ CrossChain│  │  Privacy  │ │              │
│              │  │   Agent   │  │   Agent   │  │   Agent   │ │              │
│              │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ │              │
│              │        │              │              │        │              │
│              └────────┼──────────────┼──────────────┼────────┘              │
│                       │              │              │                       │
│              ┌────────▼──────┐ ┌─────▼──────┐ ┌────▼────────┐              │
│              │   Flashbots   │ │  LI.FI SDK │ │   Private   │              │
│              │   Protect     │ │   Router   │ │ Order Pool  │              │
│              └───────────────┘ └────────────┘ └─────────────┘              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Smart Contracts (Solidity)

#### KalmanGuardHook.sol
The main Uniswap v4 hook that integrates with the pool manager. It:
- Implements `beforeSwap` and `afterSwap` hooks
- Calculates dynamic fees based on Kalman filter state
- Enforces emergency protections during high-risk periods
- Integrates with the Risk Oracle Registry

#### PrivateOrderPool.sol
Privacy-preserving order execution system that:
- Allows private order submission with commitment schemes
- Batches orders to prevent information leakage
- Executes orders after a delay to prevent frontrunning
- Uses cryptographic commitments for order privacy

#### RiskOracleRegistry.sol
Multi-source risk oracle aggregation that:
- Aggregates price feeds from multiple sources (Chainlink, Uniswap TWAP, etc.)
- Provides Byzantine fault-tolerant price consensus
- Updates risk parameters for the hook

#### AgentController.sol
On-chain agent coordination that:
- Manages agent permissions and authorizations
- Records agent actions for transparency
- Enables emergency agent interventions

### 2. Agent System (TypeScript)

#### Price Monitor Agent
- Subscribes to on-chain price events
- Feeds data to Kalman filter
- Detects anomalies and price manipulation attempts

#### MEV Detector Agent
- Monitors mempool for sandwich attacks
- Identifies frontrunning attempts
- Detects JIT liquidity attacks
- Triggers protective fee increases

#### Risk Scoring Agent
- Calculates composite risk scores
- Combines multiple risk factors:
  - Volatility regime
  - MEV activity level
  - Cross-chain correlation
  - Liquidity depth

#### Execution Agent
- Submits transactions via Flashbots
- Manages gas optimization
- Handles transaction retries and monitoring

#### Cross-Chain Agent
- Monitors correlated pools across chains
- Uses LI.FI for cross-chain operations
- Propagates risk signals across chains
- Implements cross-chain arbitrage protection

### 3. Kalman Filter Engine (Python)

#### Adaptive Kalman Filter
5-dimensional state estimation:
```
State Vector: [price, velocity, acceleration, volatility, beta]

State Transition:
x(k+1) = A * x(k) + w(k)

where A =
| 1  dt  0.5dt²  0  0 |
| 0  1   dt      0  0 |
| 0  0   α       0  0 |
| 0  0   0       β  0 |
| 0  0   0       0  γ |
```

Features:
- Online covariance adaptation
- Mahalanobis outlier detection
- Multi-step ahead prediction
- Regime-adaptive parameters

#### Regime Detector
Hidden Markov Model for volatility regimes:
- LOW (< 25% annualized)
- NORMAL (25-50%)
- HIGH (50-100%)
- EXTREME (> 100%)

Transition matrix learned from historical data.

#### Oracle Fusion
Multi-source price aggregation:
- Weighted averaging based on reliability
- Byzantine fault tolerance (up to 1/3 malicious)
- Adaptive weight learning
- Staleness detection

### 4. Frontend (React)

Dashboard components:
- Real-time Kalman filter visualization
- Risk gauge with regime indicator
- Fee heatmap showing optimization history
- Agent status grid
- Alert management

## Data Flow

```
1. Price Event on Chain
         │
         ▼
2. Price Monitor Agent receives event
         │
         ▼
3. Kalman Filter processes observation
   - Predict step (state extrapolation)
   - Update step (incorporate measurement)
   - Detect anomalies
         │
         ▼
4. Regime Detector classifies volatility
         │
         ▼
5. Risk Scoring Agent calculates risk score
         │
         ▼
6. Dynamic Fee Calculator recommends fee
         │
         ▼
7. If MEV detected:
   └─> MEV Detector triggers protection
   └─> Fee increased immediately
         │
         ▼
8. Execution Agent submits fee update
   - Via Flashbots for MEV protection
         │
         ▼
9. KalmanGuardHook enforces new fee
```

## Security Considerations

### MEV Protection
- All fee updates submitted via Flashbots Protect
- Private order pool for sensitive trades
- Dynamic fees that make sandwich attacks unprofitable

### Cross-Chain Risks
- Correlation monitoring prevents arbitrage
- Shared risk intelligence across chains
- Emergency circuit breakers

### Oracle Manipulation
- Multi-source aggregation
- Byzantine fault tolerance
- Outlier detection and rejection

### Smart Contract Security
- Reentrancy guards on all external calls
- Access control for privileged functions
- Emergency pause functionality
- Timelock on parameter updates

## Deployment

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- Python 3.11+
- Foundry

### Quick Start
```bash
# Clone repository
git clone https://github.com/your-org/kalmanguard

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Start with Docker
./scripts/start-dev.sh  # Linux/Mac
.\scripts\start-dev.ps1  # Windows
```

### Production Deployment
See [Deployment Guide](./DEPLOYMENT.md) for production setup.
