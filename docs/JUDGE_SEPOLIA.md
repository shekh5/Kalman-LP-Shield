# KalmanGuard — Sepolia Guide (3 Phases)

This guide matches the intended flow:

- Phase 1: **On-chain truth** (public Sepolia) — deploy + verify
- Phase 2: **Brain** (your laptop) — agents + kalman engine via Docker
- Phase 3: **Face** (your laptop) — UI on localhost

---

## Phase 1 — On-chain truth (Ethereum Sepolia)

**Target chain:** Sepolia (Chain ID `11155111`)

### 1) Prepare env

Create a root `.env` (copy from `.env.example`) and set at least:

- `RPC_URL_SEPOLIA=...` (a working Sepolia JSON-RPC URL)
- `PRIVATE_KEY=0x...` (Sepolia test wallet key; use faucet-funded ETH)
- `ETHERSCAN_API_KEY=...` (for verification)

### 2) Deploy + verify

From repo root:

- Windows PowerShell: `./scripts/deploy-contracts.ps1 -Network sepolia`
- Linux/Mac: `./scripts/deploy-contracts.sh sepolia`

### 3) Record contract addresses

After deployment, copy the printed addresses into your `.env`:

- `KALMANGUARD_HOOK_SEPOLIA=0x...`
- `AGENT_CONTROLLER_SEPOLIA=0x...`

---

## Phase 2 — Brain (Docker on your laptop)

Goal: run Node agents + Python Kalman engine locally, connected to Sepolia, serving state at `http://localhost:3001`.

### 1) Start backend services

From repo root:

`docker compose --env-file ./.env -f docker/docker-compose.yml up -d --build agents kalman-engine redis`

### 2) Validate

- Agents health: `http://localhost:3001/health`
- Snapshot: `http://localhost:3001/api/state`
- WebSocket: `ws://localhost:3001/ws`

If you want on-chain heartbeats:

- Set `ENABLE_HEARTBEAT_TX=true`
- Ensure `AGENT_CONTROLLER_SEPOLIA` is set

---

## Phase 3 — Face (UI on your laptop)

### Option A: Vite dev server

```
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### Option B: Docker UI

If you started the `frontend` service in Compose, open `http://localhost:3000`.
