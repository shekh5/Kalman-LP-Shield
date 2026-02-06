"""
KalmanGuard Kalman Engine API

FastAPI server exposing the Kalman filter and backtesting functionality.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import time

from kalman.adaptive_kalman import AdaptiveKalmanFilter, KalmanState
from kalman.regime_detector import RegimeDetector
from kalman.oracle_fusion import OracleFusion, OracleSource, OracleReading, OracleType

app = FastAPI(
    title="KalmanGuard Kalman Engine",
    description="Adaptive Kalman filtering API for DeFi risk management",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
kalman_filters: Dict[str, AdaptiveKalmanFilter] = {}
regime_detectors: Dict[str, RegimeDetector] = {}


# Request/Response models
class PriceUpdate(BaseModel):
    pool_id: str
    price: float
    timestamp: Optional[float] = None
    variance: Optional[float] = None


class KalmanStateResponse(BaseModel):
    price: float
    velocity: float
    acceleration: float
    volatility: float
    beta: float
    confidence: float
    regime: str
    risk_score: float
    fee_recommendation: int


class PredictionRequest(BaseModel):
    pool_id: str
    steps: int = 10


class PredictionResponse(BaseModel):
    predictions: List[Dict[str, Any]]


class OracleUpdate(BaseModel):
    pool_id: str
    source: str
    price: float
    confidence: float = 1.0
    latency_ms: int = 0


# Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": time.time()}


@app.get("/metrics")
async def get_metrics():
    """Prometheus metrics endpoint."""
    metrics = []
    
    for pool_id, kalman in kalman_filters.items():
        state = kalman.state
        metrics.append(f'kalmanguard_price{{pool="{pool_id}"}} {state.x[0]}')
        metrics.append(f'kalmanguard_volatility{{pool="{pool_id}"}} {state.x[3]}')
        metrics.append(f'kalmanguard_confidence{{pool="{pool_id}"}} {state.confidence}')
        metrics.append(f'kalmanguard_risk_score{{pool="{pool_id}"}} {kalman.get_risk_score()}')
    
    return "\n".join(metrics)


@app.post("/kalman/update", response_model=KalmanStateResponse)
async def update_kalman(update: PriceUpdate):
    """
    Update Kalman filter with new price observation.
    
    Creates a new filter for the pool if one doesn't exist.
    """
    pool_id = update.pool_id
    
    # Create filter if needed
    if pool_id not in kalman_filters:
        kalman_filters[pool_id] = AdaptiveKalmanFilter(initial_price=update.price)
        regime_detectors[pool_id] = RegimeDetector()
    
    kalman = kalman_filters[pool_id]
    regime_detector = regime_detectors[pool_id]
    
    # Predict step
    kalman.predict()
    
    # Update step
    state, diagnostics = kalman.update(
        measurement=update.price,
        measurement_variance=update.variance,
        timestamp=update.timestamp,
    )
    
    # Update regime detector
    regime_state = regime_detector.update(update.price)
    
    return KalmanStateResponse(
        price=state.x[0],
        velocity=state.x[1],
        acceleration=state.x[2],
        volatility=state.x[3],
        beta=state.x[4],
        confidence=state.confidence,
        regime=state.regime.value,
        risk_score=kalman.get_risk_score(),
        fee_recommendation=kalman.get_fee_recommendation(),
    )


@app.get("/kalman/state/{pool_id}", response_model=KalmanStateResponse)
async def get_kalman_state(pool_id: str):
    """Get current Kalman filter state for a pool."""
    if pool_id not in kalman_filters:
        raise HTTPException(status_code=404, detail=f"Pool {pool_id} not found")
    
    kalman = kalman_filters[pool_id]
    state = kalman.state
    
    return KalmanStateResponse(
        price=state.x[0],
        velocity=state.x[1],
        acceleration=state.x[2],
        volatility=state.x[3],
        beta=state.x[4],
        confidence=state.confidence,
        regime=state.regime.value,
        risk_score=kalman.get_risk_score(),
        fee_recommendation=kalman.get_fee_recommendation(),
    )


@app.post("/kalman/predict", response_model=PredictionResponse)
async def predict_ahead(request: PredictionRequest):
    """Get multi-step ahead predictions."""
    pool_id = request.pool_id
    
    if pool_id not in kalman_filters:
        raise HTTPException(status_code=404, detail=f"Pool {pool_id} not found")
    
    kalman = kalman_filters[pool_id]
    predictions = kalman.predict_ahead(request.steps)
    
    return PredictionResponse(predictions=predictions)


@app.post("/kalman/reset/{pool_id}")
async def reset_kalman(pool_id: str, initial_price: Optional[float] = None):
    """Reset Kalman filter for a pool."""
    if pool_id in kalman_filters:
        kalman_filters[pool_id].reset(initial_price)
        regime_detectors[pool_id].reset()
        return {"status": "reset", "pool_id": pool_id}
    else:
        raise HTTPException(status_code=404, detail=f"Pool {pool_id} not found")


@app.get("/regime/{pool_id}")
async def get_regime(pool_id: str):
    """Get current volatility regime for a pool."""
    if pool_id not in regime_detectors:
        raise HTTPException(status_code=404, detail=f"Pool {pool_id} not found")
    
    detector = regime_detectors[pool_id]
    state = detector.state
    
    return {
        "regime": state.current_regime.value,
        "regime_probability": state.regime_probability,
        "regime_duration": state.regime_duration,
        "volatility_estimate": state.volatility_estimate,
        "stress_indicator": state.stress_indicator,
        "fee_multiplier": detector.get_fee_multiplier(),
    }


@app.get("/regime/forecast/{pool_id}")
async def forecast_regime(pool_id: str, steps: int = 10):
    """Get regime forecast for a pool."""
    if pool_id not in regime_detectors:
        raise HTTPException(status_code=404, detail=f"Pool {pool_id} not found")
    
    detector = regime_detectors[pool_id]
    forecast = detector.get_regime_forecast(steps)
    
    return {"forecast": forecast}


@app.get("/pools")
async def list_pools():
    """List all tracked pools."""
    pools = []
    
    for pool_id, kalman in kalman_filters.items():
        state = kalman.state
        regime = regime_detectors[pool_id].state if pool_id in regime_detectors else None
        
        pools.append({
            "pool_id": pool_id,
            "price": state.x[0],
            "regime": state.regime.value,
            "risk_score": kalman.get_risk_score(),
            "confidence": state.confidence,
            "last_update": state.timestamp,
        })
    
    return {"pools": pools}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
