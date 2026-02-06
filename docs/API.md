# KalmanGuard API Documentation

## Agent API (Port 3001)

### Health Check
```
GET /health
```
Returns service health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1704067200,
  "uptime": 3600
}
```

### Pool Information

#### Get All Pools
```
GET /api/pools
```

**Response:**
```json
{
  "pools": [
    {
      "id": "0x...",
      "chainId": 1,
      "token0": "WETH",
      "token1": "USDC",
      "currentFee": 30,
      "tvl": 1000000,
      "volume24h": 500000,
      "riskScore": 35
    }
  ]
}
```

#### Get Pool Details
```
GET /api/pools/:poolId
```

**Response:**
```json
{
  "id": "0x...",
  "chainId": 1,
  "token0": {
    "address": "0x...",
    "symbol": "WETH",
    "decimals": 18
  },
  "token1": {
    "address": "0x...",
    "symbol": "USDC",
    "decimals": 6
  },
  "currentFee": 30,
  "kalmanState": {
    "price": 1850.5,
    "velocity": 0.1,
    "volatility": 0.3,
    "confidence": 0.95,
    "regime": "NORMAL"
  },
  "protectionHistory": [...]
}
```

### Agent Management

#### Get Agent Status
```
GET /api/agents
```

**Response:**
```json
{
  "agents": [
    {
      "id": "price-monitor",
      "name": "Price Monitor",
      "status": "running",
      "lastUpdate": 1704067200,
      "eventsProcessed": 15000,
      "metrics": {
        "updatesPerMinute": 12.5,
        "latencyMs": 15
      }
    }
  ]
}
```

#### Get Agent Activity
```
GET /api/agents/:agentId/activity
```

**Query Parameters:**
- `limit` - Number of activities (default: 50)
- `since` - Unix timestamp

**Response:**
```json
{
  "activities": [
    {
      "timestamp": 1704067200,
      "action": "FEE_UPDATE",
      "poolId": "0x...",
      "details": {
        "oldFee": 30,
        "newFee": 45,
        "reason": "Elevated MEV risk detected"
      }
    }
  ]
}
```

### Risk Management

#### Get Risk Score
```
GET /api/risk/:poolId
```

**Response:**
```json
{
  "poolId": "0x...",
  "riskScore": 35,
  "breakdown": {
    "volatilityRisk": 20,
    "mevRisk": 10,
    "liquidityRisk": 5,
    "correlationRisk": 0
  },
  "regime": "NORMAL",
  "recommendation": "STANDARD_PROTECTION"
}
```

#### Get Risk History
```
GET /api/risk/:poolId/history
```

**Query Parameters:**
- `period` - Time period (1h, 24h, 7d, 30d)
- `resolution` - Data resolution (1m, 5m, 1h)

### Fee Recommendations

#### Get Current Fee Recommendation
```
GET /api/fees/:poolId
```

**Response:**
```json
{
  "poolId": "0x...",
  "currentFee": 30,
  "recommendedFee": 35,
  "feeRange": {
    "min": 5,
    "max": 100
  },
  "factors": {
    "baseRate": 30,
    "volatilityAdjustment": 3,
    "mevPremium": 2,
    "liquidityDiscount": 0
  }
}
```

#### Update Fee
```
POST /api/fees/:poolId/update
```

**Request Body:**
```json
{
  "newFee": 35,
  "reason": "Elevated volatility"
}
```

**Response:**
```json
{
  "status": "submitted",
  "txHash": "0x...",
  "estimatedConfirmation": 15
}
```

### Alerts

#### Get Active Alerts
```
GET /api/alerts
```

**Query Parameters:**
- `severity` - Filter by severity (critical, warning, info)
- `poolId` - Filter by pool

**Response:**
```json
{
  "alerts": [
    {
      "id": "alert-123",
      "timestamp": 1704067200,
      "severity": "warning",
      "type": "MEV_DETECTED",
      "poolId": "0x...",
      "message": "Potential sandwich attack detected",
      "details": {
        "attackerAddress": "0x...",
        "estimatedProfit": 150
      },
      "acknowledged": false
    }
  ]
}
```

#### Acknowledge Alert
```
POST /api/alerts/:alertId/acknowledge
```

---

## Kalman Engine API (Port 8000)

### Health Check
```
GET /health
```

### Update Kalman Filter
```
POST /kalman/update
```

**Request Body:**
```json
{
  "pool_id": "eth-usdc-mainnet",
  "price": 1850.5,
  "timestamp": 1704067200.5,
  "variance": 0.0001
}
```

**Response:**
```json
{
  "price": 1850.48,
  "velocity": 0.12,
  "acceleration": -0.002,
  "volatility": 0.32,
  "beta": 0.85,
  "confidence": 0.96,
  "regime": "NORMAL",
  "risk_score": 28,
  "fee_recommendation": 30
}
```

### Get Current State
```
GET /kalman/state/{pool_id}
```

### Multi-Step Prediction
```
POST /kalman/predict
```

**Request Body:**
```json
{
  "pool_id": "eth-usdc-mainnet",
  "steps": 10
}
```

**Response:**
```json
{
  "predictions": [
    {
      "step": 1,
      "predicted_price": 1850.6,
      "uncertainty": 0.5,
      "confidence_interval": [1849.6, 1851.6]
    },
    ...
  ]
}
```

### Regime Detection
```
GET /regime/{pool_id}
```

**Response:**
```json
{
  "regime": "NORMAL",
  "regime_probability": 0.82,
  "regime_duration": 3600,
  "volatility_estimate": 0.35,
  "stress_indicator": 0.15,
  "fee_multiplier": 1.0
}
```

### Regime Forecast
```
GET /regime/forecast/{pool_id}?steps=10
```

---

## WebSocket API (Port 3002)

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3002');
```

### Subscribe to Pool Updates
```json
{
  "type": "subscribe",
  "channel": "pool",
  "poolId": "0x..."
}
```

### Subscribe to Alerts
```json
{
  "type": "subscribe",
  "channel": "alerts",
  "severity": ["critical", "warning"]
}
```

### Message Types

#### Price Update
```json
{
  "type": "price_update",
  "poolId": "0x...",
  "data": {
    "price": 1850.5,
    "kalmanPrice": 1850.48,
    "confidence": 0.96,
    "timestamp": 1704067200
  }
}
```

#### Fee Update
```json
{
  "type": "fee_update",
  "poolId": "0x...",
  "data": {
    "oldFee": 30,
    "newFee": 35,
    "reason": "Volatility increase",
    "timestamp": 1704067200
  }
}
```

#### Risk Alert
```json
{
  "type": "alert",
  "data": {
    "id": "alert-123",
    "severity": "warning",
    "type": "MEV_DETECTED",
    "message": "Potential sandwich attack"
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Missing or invalid API key |
| 404 | Not Found - Resource doesn't exist |
| 429 | Rate Limited - Too many requests |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Temporarily down |

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Read operations | 100/minute |
| Write operations | 20/minute |
| WebSocket connections | 5/IP |
