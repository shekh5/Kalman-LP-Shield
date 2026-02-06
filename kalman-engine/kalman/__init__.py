"""
KalmanGuard Kalman Filter Module
================================

This module provides adaptive Kalman filtering implementations
for DeFi price prediction and risk management.

Key Components:
- AdaptiveKalmanFilter: Extended Kalman filter with online covariance adaptation
- RegimeDetector: Volatility regime classification
- OracleFusion: Multi-source oracle data fusion
"""

from .adaptive_kalman import AdaptiveKalmanFilter, KalmanState
from .regime_detector import RegimeDetector, VolatilityRegime
from .oracle_fusion import OracleFusion, OracleSource

__all__ = [
    "AdaptiveKalmanFilter",
    "KalmanState",
    "RegimeDetector",
    "VolatilityRegime",
    "OracleFusion",
    "OracleSource",
]

__version__ = "1.0.0"
