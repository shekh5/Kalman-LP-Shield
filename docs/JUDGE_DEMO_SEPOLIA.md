# KalmanGuard — Sepolia Judge Demo (3 Phases)

This guide matches the demo flow you described:

- Phase 1: **On-Chain Truth** (public Sepolia) — deploy + verify
- Phase 2: **Brain** (your laptop) — agents + kalman engine via Docker
- Phase 3: **Face** (your laptop) — Vite dev server UI on localhost

---

## Phase 1 — On-Chain Truth (Ethereum Sepolia)

**Target Chain:** Sepolia (Chain ID `11155111`)

- RPC: `https://0xrpc.io/sep`
- Explorer: `https://sepolia.etherscan.io`

### 1) Prepare env

Create a root `.env` (copy from `.env.example`) and set at least:

- `RPC_URL_SEPOLIA=https://0xrpc.io/sep`
- `PRIVATE_KEY=0x...` (Sepolia test wallet key; 32-byte hex, 64 hex chars after `0x`)
- `ETHERSCAN_API_KEY=...` (for verification)

Optional but recommended:

- `POOL_MANAGER=0x...` (if you have a Sepolia PoolManager address)
- `ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` (default)

### 2) Deploy + verify

From repo root:

- Linux/Mac: `./scripts/deploy-contracts.sh sepolia`
- Windows PowerShell: `./scripts/deploy-contracts.ps1 -Network sepolia`

This runs `forge script script/Deploy.s.sol --rpc-url $RPC_URL_SEPOLIA --broadcast --verify`.

### 3) Record contract addresses

After deployment, copy the printed addresses into your `.env`:

- `KALMANGUARD_HOOK_SEPOLIA=0x...`
- `AGENT_CONTROLLER_SEPOLIA=0x...`

### 4) Prove it to judges

Open Sepolia Etherscan and show:

- The contracts are **verified**
- You can see live events/transactions later from Phase 2 “heartbeat” transactions

---

## Phase 2 — The Brain (Docker on your laptop)

Goal: run Node agents + Python Kalman engine locally, connected to Sepolia, serving UI state at `http://localhost:3001`.

### 1) Configure for Sepolia mode

In your `.env`:

- `DEMO_MODE=false`
- `TARGET_CHAINS=sepolia`
- `RPC_URL_SEPOLIA=https://0xrpc.io/sep`
- `PRIVATE_KEY=0x...`
- `AGENT_CONTROLLER_SEPOLIA=0x...` (from Phase 1)

Optional:

- `HEARTBEAT_TX_MS=60000` (default 60s)
- `ENABLE_HEARTBEAT_TX=true` (default true)

### 2) Start backend services

If you want only the backend services:

`docker compose -f docker/docker-compose.yml up -d --build agents kalman-engine redis`

Or use the Sepolia override:

`docker compose -f docker/docker-compose.yml -f docker/docker-compose.sepolia.yml up -d --build agents kalman-engine redis`

### 3) Validate

- Agents API: `http://localhost:3001/health`
- UI snapshot: `http://localhost:3001/api/state`
- WebSocket: `ws://localhost:3001/ws`

You should also see periodic Sepolia txs to `AgentController.heartbeat(...)` in Etherscan for your deployer address.

---

## Phase 3 — The Face (Vite dev server on your laptop)

Goal: run the React app locally and have it talk to the local agents service.

### 1) Start frontend

```
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### 2) Connectivity model

In dev mode, the frontend defaults to:

- Agent API: `http://localhost:3001`
- WS: `ws://localhost:3001/ws`

No nginx proxy is required for the localhost demo.

---

## Notes / Troubleshooting

- If Docker commands fail, install Docker Desktop and confirm `docker --version` works in PowerShell.
- If verification fails, ensure `ETHERSCAN_API_KEY` is set and you’re not rate-limited.
- If you don’t have a real PoolManager address, you can still deploy for “proof of on-chain logic”.
