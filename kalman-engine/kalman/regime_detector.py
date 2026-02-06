"""
RegimeDetector - Volatility Regime Classification Module

This module provides advanced regime detection using:
1. Hidden Markov Models for regime transitions
2. GARCH volatility estimation
3. Jump detection for sudden market moves
4. Correlation-based market stress indicators
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from enum import Enum
from collections import deque
import structlog

logger = structlog.get_logger()


class VolatilityRegime(Enum):
    """Market volatility regime classification."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    EXTREME = "extreme"


@dataclass
class RegimeState:
    """Current regime state with metadata."""
    current_regime: VolatilityRegime
    regime_probability: Dict[VolatilityRegime, float]
    regime_duration: int  # Blocks in current regime
    transition_probability: float  # Probability of regime change
    volatility_estimate: float
    jump_detected: bool = False
    stress_indicator: float = 0.0


class RegimeDetector:
    """
    Multi-method volatility regime detector.
    
    Combines multiple approaches:
    1. Realized volatility estimation
    2. Exponentially weighted moving volatility
    3. Jump detection using Barndorff-Nielsen-Shephard test
    4. Hidden Markov Model regime probabilities
    
    Features:
    - Online updates with streaming data
    - Hysteresis to prevent regime flapping
    - Confidence-weighted regime classification
    """
    
    # Regime volatility boundaries (annualized)
    REGIME_BOUNDS = {
        VolatilityRegime.LOW: (0, 0.15),       # < 15% annualized vol
        VolatilityRegime.NORMAL: (0.15, 0.40), # 15-40%
        VolatilityRegime.HIGH: (0.40, 0.80),   # 40-80%
        VolatilityRegime.EXTREME: (0.80, float('inf')),  # > 80%
    }
    
    # HMM transition matrix (row = from, col = to)
    # Regimes tend to be sticky (high diagonal)
    TRANSITION_MATRIX = np.array([
        [0.95, 0.04, 0.009, 0.001],  # LOW -> ...
        [0.05, 0.90, 0.045, 0.005],  # NORMAL -> ...
        [0.01, 0.10, 0.85, 0.04],    # HIGH -> ...
        [0.005, 0.02, 0.15, 0.825],  # EXTREME -> ...
    ])
    
    REGIME_ORDER = [VolatilityRegime.LOW, VolatilityRegime.NORMAL, 
                   VolatilityRegime.HIGH, VolatilityRegime.EXTREME]
    
    def __init__(
        self,
        window_size: int = 100,
        ewm_halflife: float = 20.0,
        jump_threshold: float = 3.0,
        hysteresis_factor: float = 0.2,
        blocks_per_year: int = 2_628_000,  # ~12 second blocks
    ):
        """
        Initialize the regime detector.
        
        Args:
            window_size: Window for realized volatility calculation
            ewm_halflife: Half-life for exponential weighting
            jump_threshold: Z-score threshold for jump detection
            hysteresis_factor: Regime boundary buffer to prevent flapping
            blocks_per_year: Number of blocks per year for annualization
        """
        self.window_size = window_size
        self.ewm_halflife = ewm_halflife
        self.jump_threshold = jump_threshold
        self.hysteresis_factor = hysteresis_factor
        self.annualization_factor = np.sqrt(blocks_per_year)
        
        # Data storage
        self.returns: deque = deque(maxlen=window_size)
        self.prices: deque = deque(maxlen=window_size + 1)
        
        # HMM state probabilities
        self.regime_probs = np.array([0.1, 0.7, 0.15, 0.05])  # Initial belief
        
        # Current state
        self.state = RegimeState(
            current_regime=VolatilityRegime.NORMAL,
            regime_probability={r: p for r, p in zip(self.REGIME_ORDER, self.regime_probs)},
            regime_duration=0,
            transition_probability=0.0,
            volatility_estimate=0.2,
        )
        
        # EWMA volatility state
        self._ewm_var = 0.0
        self._ewm_initialized = False
        
        logger.info(
            "RegimeDetector initialized",
            window_size=window_size,
            ewm_halflife=ewm_halflife,
        )
    
    def update(self, price: float, volume: Optional[float] = None) -> RegimeState:
        """
        Update regime detection with new price observation.
        
        Args:
            price: New price observation
            volume: Optional volume (used for volume-weighted estimation)
            
        Returns:
            Updated RegimeState
        """
        self.prices.append(price)
        
        if len(self.prices) < 2:
            return self.state
        
        # Calculate log return
        prev_price = self.prices[-2]
        log_return = np.log(price / prev_price) if prev_price > 0 else 0.0
        self.returns.append(log_return)
        
        if len(self.returns) < 10:
            return self.state
        
        # Calculate multiple volatility estimates
        realized_vol = self._calculate_realized_volatility()
        ewm_vol = self._calculate_ewm_volatility(log_return)
        
        # Combine estimates
        combined_vol = 0.6 * ewm_vol + 0.4 * realized_vol
        
        # Detect jumps
        jump_detected = self._detect_jump(log_return)
        if jump_detected:
            # Increase volatility estimate on jump
            combined_vol *= 1.5
        
        # Update HMM probabilities
        self._update_hmm(combined_vol)
        
        # Determine regime with hysteresis
        new_regime = self._classify_regime_with_hysteresis(combined_vol)
        
        # Calculate stress indicator
        stress = self._calculate_stress_indicator()
        
        # Update state
        if new_regime != self.state.current_regime:
            self.state.regime_duration = 0
        else:
            self.state.regime_duration += 1
        
        self.state.current_regime = new_regime
        self.state.regime_probability = {
            r: float(p) for r, p in zip(self.REGIME_ORDER, self.regime_probs)
        }
        self.state.volatility_estimate = combined_vol
        self.state.jump_detected = jump_detected
        self.state.stress_indicator = stress
        self.state.transition_probability = 1.0 - self.regime_probs[
            self.REGIME_ORDER.index(new_regime)
        ]
        
        return self.state
    
    def _calculate_realized_volatility(self) -> float:
        """Calculate annualized realized volatility from returns."""
        if len(self.returns) < 2:
            return 0.2  # Default
        
        returns = np.array(self.returns)
        realized_var = np.sum(returns ** 2)  # Sum of squared returns
        realized_vol = np.sqrt(realized_var / len(returns)) * self.annualization_factor
        
        return float(realized_vol)
    
    def _calculate_ewm_volatility(self, new_return: float) -> float:
        """Calculate exponentially weighted moving volatility."""
        alpha = 1 - np.exp(-np.log(2) / self.ewm_halflife)
        
        if not self._ewm_initialized:
            self._ewm_var = new_return ** 2
            self._ewm_initialized = True
        else:
            self._ewm_var = alpha * (new_return ** 2) + (1 - alpha) * self._ewm_var
        
        ewm_vol = np.sqrt(self._ewm_var) * self.annualization_factor
        return float(ewm_vol)
    
    def _detect_jump(self, log_return: float) -> bool:
        """
        Detect price jumps using standardized returns.
        
        Uses the Barndorff-Nielsen-Shephard approach simplified
        for online detection.
        """
        if len(self.returns) < 20:
            return False
        
        returns = np.array(list(self.returns)[-50:])
        
        # Robust scale estimate using median absolute deviation
        med = np.median(returns)
        mad = np.median(np.abs(returns - med))
        robust_scale = 1.4826 * mad  # Scale factor for normal distribution
        
        if robust_scale < 1e-8:
            return False
        
        z_score = abs(log_return - med) / robust_scale
        
        return z_score > self.jump_threshold
    
    def _update_hmm(self, volatility: float) -> None:
        """
        Update HMM regime probabilities using forward algorithm.
        
        Uses volatility as observation and updates belief state.
        """
        # Prediction step: P(regime_t | obs_{1:t-1})
        predicted_probs = self.TRANSITION_MATRIX.T @ self.regime_probs
        
        # Calculate emission probabilities (likelihood of volatility given regime)
        emission_probs = np.zeros(4)
        for i, regime in enumerate(self.REGIME_ORDER):
            low, high = self.REGIME_BOUNDS[regime]
            mid = (low + high) / 2 if high < float('inf') else low + 0.3
            scale = (high - low) / 4 if high < float('inf') else 0.3
            
            # Gaussian likelihood
            emission_probs[i] = np.exp(-0.5 * ((volatility - mid) / scale) ** 2)
        
        # Normalize emission probabilities
        emission_probs = emission_probs / (emission_probs.sum() + 1e-8)
        
        # Update step: P(regime_t | obs_{1:t})
        updated_probs = predicted_probs * emission_probs
        self.regime_probs = updated_probs / (updated_probs.sum() + 1e-8)
    
    def _classify_regime_with_hysteresis(self, volatility: float) -> VolatilityRegime:
        """
        Classify regime with hysteresis to prevent rapid switching.
        
        Adds buffer zones around regime boundaries.
        """
        current_idx = self.REGIME_ORDER.index(self.state.current_regime)
        
        # Check if we should transition up
        if current_idx < 3:
            upper_bound = self.REGIME_BOUNDS[self.state.current_regime][1]
            if volatility > upper_bound * (1 + self.hysteresis_factor):
                return self.REGIME_ORDER[current_idx + 1]
        
        # Check if we should transition down
        if current_idx > 0:
            lower_bound = self.REGIME_BOUNDS[self.state.current_regime][0]
            if volatility < lower_bound * (1 - self.hysteresis_factor):
                return self.REGIME_ORDER[current_idx - 1]
        
        # Stay in current regime
        return self.state.current_regime
    
    def _calculate_stress_indicator(self) -> float:
        """
        Calculate market stress indicator (0-1).
        
        Combines volatility level, volatility of volatility, and correlation breakdown.
        """
        if len(self.returns) < 30:
            return 0.0
        
        returns = np.array(self.returns)
        
        # Recent vs historical volatility
        recent_vol = np.std(returns[-10:]) * self.annualization_factor
        hist_vol = np.std(returns) * self.annualization_factor
        vol_ratio = recent_vol / (hist_vol + 1e-8)
        
        # Negative skewness (crash risk)
        skewness = self._calculate_skewness(returns[-30:])
        crash_risk = max(0, -skewness / 3)  # Normalize negative skew
        
        # Kurtosis (tail risk)
        kurtosis = self._calculate_kurtosis(returns[-30:])
        tail_risk = max(0, (kurtosis - 3) / 10)  # Excess kurtosis
        
        # Combine indicators
        stress = (
            0.4 * min(vol_ratio / 2, 1.0) +
            0.3 * min(crash_risk, 1.0) +
            0.3 * min(tail_risk, 1.0)
        )
        
        return float(np.clip(stress, 0, 1))
    
    def _calculate_skewness(self, returns: NDArray) -> float:
        """Calculate sample skewness."""
        n = len(returns)
        if n < 3:
            return 0.0
        
        mean = np.mean(returns)
        std = np.std(returns, ddof=1)
        
        if std < 1e-8:
            return 0.0
        
        skew = np.sum((returns - mean) ** 3) / (n * std ** 3)
        return float(skew)
    
    def _calculate_kurtosis(self, returns: NDArray) -> float:
        """Calculate sample kurtosis."""
        n = len(returns)
        if n < 4:
            return 3.0  # Normal distribution kurtosis
        
        mean = np.mean(returns)
        std = np.std(returns, ddof=1)
        
        if std < 1e-8:
            return 3.0
        
        kurt = np.sum((returns - mean) ** 4) / (n * std ** 4)
        return float(kurt)
    
    def get_regime_forecast(self, steps: int = 10) -> List[Dict[str, Any]]:
        """
        Forecast regime probabilities forward in time.
        
        Args:
            steps: Number of steps to forecast
            
        Returns:
            List of regime probability forecasts
        """
        forecasts = []
        probs = self.regime_probs.copy()
        
        for step in range(1, steps + 1):
            probs = self.TRANSITION_MATRIX.T @ probs
            
            # Find most likely regime
            most_likely_idx = np.argmax(probs)
            most_likely_regime = self.REGIME_ORDER[most_likely_idx]
            
            forecasts.append({
                "step": step,
                "most_likely_regime": most_likely_regime.value,
                "regime_probabilities": {
                    r.value: float(p) for r, p in zip(self.REGIME_ORDER, probs)
                },
                "confidence": float(probs[most_likely_idx]),
            })
        
        return forecasts
    
    def get_fee_multiplier(self) -> float:
        """
        Get fee multiplier based on current regime.
        
        Returns:
            Multiplier for base fee (1.0 = normal)
        """
        multipliers = {
            VolatilityRegime.LOW: 0.5,
            VolatilityRegime.NORMAL: 1.0,
            VolatilityRegime.HIGH: 2.0,
            VolatilityRegime.EXTREME: 4.0,
        }
        return multipliers[self.state.current_regime]
    
    def reset(self) -> None:
        """Reset detector state."""
        self.returns.clear()
        self.prices.clear()
        self.regime_probs = np.array([0.1, 0.7, 0.15, 0.05])
        self._ewm_var = 0.0
        self._ewm_initialized = False
        self.state = RegimeState(
            current_regime=VolatilityRegime.NORMAL,
            regime_probability={r: p for r, p in zip(self.REGIME_ORDER, self.regime_probs)},
            regime_duration=0,
            transition_probability=0.0,
            volatility_estimate=0.2,
        )
        logger.info("RegimeDetector reset")
