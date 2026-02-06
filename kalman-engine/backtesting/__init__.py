"""
KalmanGuard Backtesting Module
==============================

This module provides backtesting infrastructure for:
1. Kalman filter parameter optimization
2. Fee strategy evaluation
3. MEV attack simulation and protection analysis
4. Historical performance analysis
"""

from .backtest_engine import BacktestEngine, BacktestConfig, BacktestResult
from .mev_simulator import MEVSimulator, MEVAttack, AttackType
from .data_loader import DataLoader, PriceData

__all__ = [
    "BacktestEngine",
    "BacktestConfig", 
    "BacktestResult",
    "MEVSimulator",
    "MEVAttack",
    "AttackType",
    "DataLoader",
    "PriceData",
]
