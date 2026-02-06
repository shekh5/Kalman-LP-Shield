"""
BacktestEngine - Historical Backtesting for KalmanGuard Strategies

This module provides comprehensive backtesting capabilities:
1. Historical price data replay
2. Fee optimization analysis
3. Risk-adjusted performance metrics
4. Comparison with baseline strategies
"""

import numpy as np
import pandas as pd
from numpy.typing import NDArray
from typing import Optional, Dict, Any, List, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
import structlog
from datetime import datetime

from ..kalman.adaptive_kalman import AdaptiveKalmanFilter, KalmanState, VolatilityRegime
from ..kalman.regime_detector import RegimeDetector
from ..kalman.oracle_fusion import OracleFusion, OracleSource, OracleReading, OracleType

logger = structlog.get_logger()


@dataclass
class BacktestConfig:
    """Configuration for backtest run."""
    # Kalman filter parameters
    process_noise_std: float = 0.01
    measurement_noise_std: float = 0.005
    
    # Fee strategy parameters
    base_fee_bps: int = 30  # Base fee in basis points
    min_fee_bps: int = 5
    max_fee_bps: int = 100
    
    # Risk parameters
    emergency_volatility_threshold: float = 0.8
    position_limit_pct: float = 5.0  # Max position as % of pool
    
    # Simulation parameters
    initial_liquidity: float = 1_000_000  # $1M
    block_time_seconds: float = 12.0
    
    # Analysis parameters
    warmup_periods: int = 100  # Periods to skip for warmup


@dataclass
class TradeRecord:
    """Record of a simulated trade."""
    timestamp: float
    price: float
    size: float
    fee_bps: int
    is_buy: bool
    pnl: float
    regime: str
    risk_score: float


@dataclass
class BacktestResult:
    """Results from backtest run."""
    # Performance metrics
    total_pnl: float
    total_fees_collected: float
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float
    
    # Risk metrics
    avg_risk_score: float
    regime_distribution: Dict[str, float]
    emergency_triggers: int
    
    # Detailed records
    trades: List[TradeRecord]
    equity_curve: List[float]
    fee_history: List[int]
    
    # Kalman filter metrics
    prediction_rmse: float
    prediction_mae: float
    regime_accuracy: float
    
    # Timestamps
    start_time: datetime
    end_time: datetime
    config: BacktestConfig


class BacktestEngine:
    """
    Backtesting engine for KalmanGuard strategies.
    
    Features:
    - Replay historical price data
    - Simulate LP behavior and fee collection
    - Track risk metrics and regime changes
    - Compare against baseline strategies
    """
    
    def __init__(self, config: Optional[BacktestConfig] = None):
        """
        Initialize backtest engine.
        
        Args:
            config: Backtest configuration
        """
        self.config = config or BacktestConfig()
        
        # Initialize components
        self.kalman = AdaptiveKalmanFilter(
            process_noise_std=self.config.process_noise_std,
            measurement_noise_std=self.config.measurement_noise_std,
        )
        self.regime_detector = RegimeDetector()
        
        # State tracking
        self.reset()
        
        logger.info("BacktestEngine initialized", config=self.config)
    
    def reset(self) -> None:
        """Reset engine state for new backtest."""
        self.kalman.reset()
        self.regime_detector.reset()
        
        self.trades: List[TradeRecord] = []
        self.equity_curve: List[float] = [self.config.initial_liquidity]
        self.fee_history: List[int] = []
        self.predictions: List[Tuple[float, float]] = []  # (predicted, actual)
        
        self.current_liquidity = self.config.initial_liquidity
        self.peak_liquidity = self.config.initial_liquidity
        self.emergency_triggers = 0
        
    def run(
        self,
        prices: NDArray[np.float64],
        timestamps: Optional[NDArray[np.float64]] = None,
        volumes: Optional[NDArray[np.float64]] = None,
    ) -> BacktestResult:
        """
        Run backtest on historical data.
        
        Args:
            prices: Array of historical prices
            timestamps: Optional timestamps (uses index if None)
            volumes: Optional volume data
            
        Returns:
            BacktestResult with performance metrics
        """
        n = len(prices)
        if timestamps is None:
            timestamps = np.arange(n) * self.config.block_time_seconds
        
        if volumes is None:
            volumes = np.ones(n) * 1_000_000  # Default $1M volume per period
        
        logger.info("Starting backtest", num_periods=n)
        start_time = datetime.now()
        
        # Initialize with first price
        self.kalman.reset(float(prices[0]))
        
        # Main simulation loop
        for i in range(1, n):
            price = float(prices[i])
            prev_price = float(prices[i-1])
            timestamp = float(timestamps[i])
            volume = float(volumes[i])
            
            # Predict step
            self.kalman.predict()
            predicted_price = self.kalman.state.x[0]
            
            # Update step
            state, diagnostics = self.kalman.update(price, timestamp=timestamp)
            
            # Track predictions (after warmup)
            if i >= self.config.warmup_periods:
                self.predictions.append((predicted_price, price))
            
            # Update regime detector
            regime_state = self.regime_detector.update(price)
            
            # Calculate dynamic fee
            fee_bps = self._calculate_fee(state, regime_state)
            self.fee_history.append(fee_bps)
            
            # Simulate trade flow (proportional to volume)
            trade_size = volume * 0.01  # 1% of volume as trade
            fee_amount = trade_size * (fee_bps / 10000)
            
            # Track PnL from fee collection
            self.current_liquidity += fee_amount
            
            # Check for impermanent loss (simplified model)
            price_change = (price - prev_price) / prev_price
            il_loss = self._estimate_il_loss(price_change)
            self.current_liquidity *= (1 - il_loss)
            
            # Track equity curve
            self.equity_curve.append(self.current_liquidity)
            self.peak_liquidity = max(self.peak_liquidity, self.current_liquidity)
            
            # Emergency check
            if state.x[3] > self.config.emergency_volatility_threshold:
                self.emergency_triggers += 1
            
            # Record trade
            if i >= self.config.warmup_periods:
                trade = TradeRecord(
                    timestamp=timestamp,
                    price=price,
                    size=trade_size,
                    fee_bps=fee_bps,
                    is_buy=price > prev_price,
                    pnl=fee_amount - (il_loss * self.current_liquidity),
                    regime=regime_state.current_regime.value,
                    risk_score=self.kalman.get_risk_score(),
                )
                self.trades.append(trade)
        
        end_time = datetime.now()
        
        # Calculate results
        result = self._calculate_results(start_time, end_time)
        
        logger.info(
            "Backtest complete",
            total_pnl=result.total_pnl,
            sharpe=result.sharpe_ratio,
            max_dd=result.max_drawdown,
        )
        
        return result
    
    def _calculate_fee(self, kalman_state: KalmanState, regime_state: Any) -> int:
        """Calculate dynamic fee based on risk state."""
        # Base fee from Kalman filter
        kalman_fee = self.kalman.get_fee_recommendation()
        
        # Regime multiplier
        regime_multiplier = self.regime_detector.get_fee_multiplier()
        
        # Combined fee
        fee = int(kalman_fee * regime_multiplier)
        
        # Clamp to bounds
        fee = max(self.config.min_fee_bps, min(fee, self.config.max_fee_bps))
        
        return fee
    
    def _estimate_il_loss(self, price_change: float) -> float:
        """
        Estimate impermanent loss from price change.
        
        Uses the standard IL formula for 50/50 pools.
        """
        if abs(price_change) < 1e-8:
            return 0.0
        
        price_ratio = 1 + price_change
        il = 2 * np.sqrt(price_ratio) / (1 + price_ratio) - 1
        
        return max(0, -il)  # IL is always negative or zero
    
    def _calculate_results(
        self,
        start_time: datetime,
        end_time: datetime,
    ) -> BacktestResult:
        """Calculate final backtest metrics."""
        # Total PnL
        total_pnl = self.current_liquidity - self.config.initial_liquidity
        
        # Total fees
        total_fees = sum(t.pnl for t in self.trades if t.pnl > 0)
        
        # Returns series for Sharpe calculation
        equity = np.array(self.equity_curve)
        returns = np.diff(equity) / equity[:-1]
        
        # Sharpe ratio (annualized)
        periods_per_year = 365 * 24 * 3600 / self.config.block_time_seconds
        sharpe = 0.0
        if len(returns) > 0 and np.std(returns) > 0:
            sharpe = np.mean(returns) / np.std(returns) * np.sqrt(periods_per_year)
        
        # Max drawdown
        running_max = np.maximum.accumulate(equity)
        drawdowns = (running_max - equity) / running_max
        max_drawdown = float(np.max(drawdowns))
        
        # Win rate
        profitable_trades = sum(1 for t in self.trades if t.pnl > 0)
        win_rate = profitable_trades / len(self.trades) if self.trades else 0.0
        
        # Average risk score
        avg_risk = np.mean([t.risk_score for t in self.trades]) if self.trades else 0.0
        
        # Regime distribution
        regime_counts: Dict[str, int] = {}
        for trade in self.trades:
            regime_counts[trade.regime] = regime_counts.get(trade.regime, 0) + 1
        total_trades = len(self.trades)
        regime_dist = {k: v / total_trades for k, v in regime_counts.items()} if total_trades > 0 else {}
        
        # Prediction metrics
        predictions = np.array(self.predictions)
        if len(predictions) > 0:
            errors = predictions[:, 0] - predictions[:, 1]
            rmse = float(np.sqrt(np.mean(errors ** 2)))
            mae = float(np.mean(np.abs(errors)))
        else:
            rmse = mae = 0.0
        
        return BacktestResult(
            total_pnl=total_pnl,
            total_fees_collected=total_fees,
            sharpe_ratio=sharpe,
            max_drawdown=max_drawdown,
            win_rate=win_rate,
            avg_risk_score=avg_risk,
            regime_distribution=regime_dist,
            emergency_triggers=self.emergency_triggers,
            trades=self.trades,
            equity_curve=self.equity_curve,
            fee_history=self.fee_history,
            prediction_rmse=rmse,
            prediction_mae=mae,
            regime_accuracy=0.0,  # Would need ground truth
            start_time=start_time,
            end_time=end_time,
            config=self.config,
        )
    
    def compare_strategies(
        self,
        prices: NDArray[np.float64],
        strategies: Dict[str, Callable[[float, Any], int]],
    ) -> Dict[str, BacktestResult]:
        """
        Compare multiple fee strategies.
        
        Args:
            prices: Historical prices
            strategies: Dict of strategy name -> fee function
            
        Returns:
            Dict of strategy name -> BacktestResult
        """
        results = {}
        
        for name, strategy in strategies.items():
            logger.info(f"Running strategy: {name}")
            self.reset()
            
            # Override fee calculation
            original_calc = self._calculate_fee
            self._calculate_fee = lambda s, r, strat=strategy: strat(s.x[0], r)
            
            result = self.run(prices)
            results[name] = result
            
            self._calculate_fee = original_calc
        
        return results
    
    def optimize_parameters(
        self,
        prices: NDArray[np.float64],
        param_grid: Dict[str, List[Any]],
    ) -> Tuple[Dict[str, Any], BacktestResult]:
        """
        Grid search for optimal parameters.
        
        Args:
            prices: Historical prices
            param_grid: Dict of parameter name -> list of values to try
            
        Returns:
            Tuple of (best parameters, best result)
        """
        import itertools
        
        param_names = list(param_grid.keys())
        param_values = list(param_grid.values())
        
        best_sharpe = float('-inf')
        best_params = {}
        best_result = None
        
        for values in itertools.product(*param_values):
            params = dict(zip(param_names, values))
            
            # Update config
            for name, value in params.items():
                setattr(self.config, name, value)
            
            # Re-initialize with new params
            self.kalman = AdaptiveKalmanFilter(
                process_noise_std=self.config.process_noise_std,
                measurement_noise_std=self.config.measurement_noise_std,
            )
            
            self.reset()
            result = self.run(prices)
            
            if result.sharpe_ratio > best_sharpe:
                best_sharpe = result.sharpe_ratio
                best_params = params.copy()
                best_result = result
                
                logger.info(
                    "New best parameters found",
                    params=params,
                    sharpe=result.sharpe_ratio,
                )
        
        return best_params, best_result


def generate_synthetic_prices(
    n_periods: int,
    initial_price: float = 1000.0,
    volatility: float = 0.02,
    drift: float = 0.0001,
    regime_changes: int = 3,
    seed: Optional[int] = None,
) -> NDArray[np.float64]:
    """
    Generate synthetic price data with regime changes.
    
    Args:
        n_periods: Number of price observations
        initial_price: Starting price
        volatility: Base volatility
        drift: Price drift
        regime_changes: Number of volatility regime changes
        seed: Random seed
        
    Returns:
        Array of synthetic prices
    """
    if seed is not None:
        np.random.seed(seed)
    
    prices = np.zeros(n_periods)
    prices[0] = initial_price
    
    # Generate regime change points
    change_points = sorted(np.random.choice(range(100, n_periods - 100), regime_changes, replace=False))
    change_points = [0] + list(change_points) + [n_periods]
    
    # Volatility multipliers for each regime
    vol_multipliers = np.random.uniform(0.5, 3.0, len(change_points) - 1)
    
    for i in range(len(change_points) - 1):
        start = change_points[i]
        end = change_points[i + 1]
        vol = volatility * vol_multipliers[i]
        
        for t in range(max(1, start), end):
            # Geometric Brownian motion with occasional jumps
            if np.random.random() < 0.01:  # 1% jump probability
                jump = np.random.normal(0, vol * 5)
            else:
                jump = 0
            
            returns = drift + vol * np.random.randn() + jump
            prices[t] = prices[t-1] * np.exp(returns)
    
    return prices
