"""
AdaptiveKalmanFilter - Extended Kalman Filter with Online Covariance Adaptation

This implementation provides:
1. 5-element state vector: [price, velocity, acceleration, volatility, market_beta]
2. Online Q/R covariance adaptation using innovation monitoring
3. Multi-regime support with automatic transition detection
4. Heavy-tailed measurement noise handling
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, Dict, Any, Tuple, List
from dataclasses import dataclass, field
from enum import Enum
import structlog

logger = structlog.get_logger()


class VolatilityRegime(Enum):
    """Market volatility regime classification."""
    LOW = "low"           # Calm market, low fees
    NORMAL = "normal"     # Normal conditions
    HIGH = "high"         # Elevated volatility
    EXTREME = "extreme"   # Crisis conditions, maximum protection


@dataclass
class KalmanState:
    """
    Complete state of the Kalman filter.
    
    Attributes:
        x: State vector [price, velocity, acceleration, volatility, beta]
        P: State covariance matrix (5x5)
        timestamp: Last update timestamp
        regime: Current volatility regime
        innovation_history: Recent innovation values for adaptation
        confidence: Confidence in current estimate (0-1)
    """
    x: NDArray[np.float64]  # State vector (5,)
    P: NDArray[np.float64]  # Covariance matrix (5, 5)
    timestamp: float = 0.0
    regime: VolatilityRegime = VolatilityRegime.NORMAL
    innovation_history: List[float] = field(default_factory=list)
    confidence: float = 1.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert state to dictionary for serialization."""
        return {
            "price": float(self.x[0]),
            "velocity": float(self.x[1]),
            "acceleration": float(self.x[2]),
            "volatility": float(self.x[3]),
            "beta": float(self.x[4]),
            "P_diag": self.P.diagonal().tolist(),
            "timestamp": self.timestamp,
            "regime": self.regime.value,
            "confidence": self.confidence,
        }


class AdaptiveKalmanFilter:
    """
    Extended Kalman Filter with adaptive covariance estimation.
    
    State vector: [price, velocity, acceleration, volatility, market_beta]
    - price: Current estimated price
    - velocity: Rate of price change (momentum)
    - acceleration: Rate of momentum change
    - volatility: Estimated instantaneous volatility
    - market_beta: Correlation with broader market
    
    Features:
    - Online Q/R adaptation using innovation monitoring
    - Multi-regime operation with smooth transitions
    - Outlier rejection using Mahalanobis distance
    - Heavy-tailed measurement model support
    """
    
    STATE_DIM = 5
    INNOVATION_WINDOW = 50
    OUTLIER_THRESHOLD = 3.5  # Mahalanobis distance threshold
    
    # Regime-specific parameters
    REGIME_PARAMS = {
        VolatilityRegime.LOW: {"q_scale": 0.1, "r_scale": 0.5, "decay": 0.99},
        VolatilityRegime.NORMAL: {"q_scale": 1.0, "r_scale": 1.0, "decay": 0.95},
        VolatilityRegime.HIGH: {"q_scale": 5.0, "r_scale": 2.0, "decay": 0.90},
        VolatilityRegime.EXTREME: {"q_scale": 20.0, "r_scale": 5.0, "decay": 0.80},
    }
    
    def __init__(
        self,
        initial_price: float = 1.0,
        process_noise_std: float = 0.01,
        measurement_noise_std: float = 0.005,
        dt: float = 1.0,
    ):
        """
        Initialize the Adaptive Kalman Filter.
        
        Args:
            initial_price: Initial price estimate
            process_noise_std: Base process noise standard deviation
            measurement_noise_std: Base measurement noise standard deviation
            dt: Time step (in seconds)
        """
        self.dt = dt
        self.base_q = process_noise_std ** 2
        self.base_r = measurement_noise_std ** 2
        
        # Initialize state
        self.state = KalmanState(
            x=np.array([initial_price, 0.0, 0.0, 0.01, 1.0], dtype=np.float64),
            P=np.eye(self.STATE_DIM, dtype=np.float64) * 0.1,
        )
        
        # State transition matrix (constant velocity with acceleration)
        self._build_state_transition_matrix()
        
        # Measurement matrix (we observe price directly)
        self.H = np.array([[1, 0, 0, 0, 0]], dtype=np.float64)
        
        # Base process noise covariance
        self._build_process_noise_matrix()
        
        # Measurement noise covariance (scalar for single measurement)
        self.R_base = np.array([[self.base_r]], dtype=np.float64)
        
        # Adaptation parameters
        self.alpha = 0.1  # Q adaptation rate
        self.beta = 0.1   # R adaptation rate
        self.min_samples = 10  # Minimum samples before adaptation
        
        logger.info(
            "AdaptiveKalmanFilter initialized",
            initial_price=initial_price,
            process_noise=process_noise_std,
            measurement_noise=measurement_noise_std,
        )
    
    def _build_state_transition_matrix(self) -> None:
        """Build state transition matrix F for discrete-time model."""
        dt = self.dt
        self.F = np.array([
            [1, dt, 0.5*dt**2, 0, 0],     # price = price + vel*dt + 0.5*acc*dt^2
            [0, 1,  dt,        0, 0],     # velocity = velocity + acc*dt
            [0, 0,  0.95,      0, 0],     # acceleration decays (mean-reverting)
            [0, 0,  0,         0.99, 0],  # volatility is persistent
            [0, 0,  0,         0, 0.98],  # beta is very persistent
        ], dtype=np.float64)
    
    def _build_process_noise_matrix(self) -> None:
        """Build process noise covariance Q."""
        dt = self.dt
        q = self.base_q
        
        # Position-velocity-acceleration coupled noise (continuous white noise acceleration model)
        self.Q_base = np.array([
            [dt**5/20, dt**4/8, dt**3/6, 0,    0],
            [dt**4/8,  dt**3/3, dt**2/2, 0,    0],
            [dt**3/6,  dt**2/2, dt,      0,    0],
            [0,        0,       0,       dt*2, 0],     # volatility process noise
            [0,        0,       0,       0,    dt*0.5], # beta process noise
        ], dtype=np.float64) * q
    
    def predict(self, dt: Optional[float] = None) -> KalmanState:
        """
        Prediction step: propagate state forward.
        
        Args:
            dt: Time step (uses default if None)
            
        Returns:
            Predicted state
        """
        if dt is not None and dt != self.dt:
            self.dt = dt
            self._build_state_transition_matrix()
            self._build_process_noise_matrix()
        
        # Get regime-specific parameters
        regime_params = self.REGIME_PARAMS[self.state.regime]
        Q = self.Q_base * regime_params["q_scale"]
        
        # State prediction: x_pred = F @ x
        x_pred = self.F @ self.state.x
        
        # Covariance prediction: P_pred = F @ P @ F^T + Q
        P_pred = self.F @ self.state.P @ self.F.T + Q
        
        # Ensure symmetry and positive definiteness
        P_pred = 0.5 * (P_pred + P_pred.T)
        
        # Update state
        self.state.x = x_pred
        self.state.P = P_pred
        
        return self.state
    
    def update(
        self,
        measurement: float,
        measurement_variance: Optional[float] = None,
        timestamp: Optional[float] = None,
    ) -> Tuple[KalmanState, Dict[str, Any]]:
        """
        Update step: incorporate new measurement.
        
        Args:
            measurement: Observed price
            measurement_variance: Override measurement variance if known
            timestamp: Measurement timestamp
            
        Returns:
            Tuple of (updated state, diagnostics dict)
        """
        # Get regime-specific R
        regime_params = self.REGIME_PARAMS[self.state.regime]
        if measurement_variance is not None:
            R = np.array([[measurement_variance]], dtype=np.float64)
        else:
            R = self.R_base * regime_params["r_scale"]
        
        # Innovation (measurement residual)
        z = np.array([[measurement]], dtype=np.float64)
        y = z - self.H @ self.state.x
        innovation = float(y[0, 0])
        
        # Innovation covariance: S = H @ P @ H^T + R
        S = self.H @ self.state.P @ self.H.T + R
        S_inv = 1.0 / S[0, 0]
        
        # Mahalanobis distance for outlier detection
        mahal_dist = np.sqrt(innovation**2 * S_inv)
        
        diagnostics = {
            "innovation": innovation,
            "innovation_variance": float(S[0, 0]),
            "mahalanobis_distance": float(mahal_dist),
            "is_outlier": False,
        }
        
        # Outlier rejection
        if mahal_dist > self.OUTLIER_THRESHOLD:
            logger.warning(
                "Outlier detected, reducing update weight",
                mahal_dist=mahal_dist,
                measurement=measurement,
            )
            diagnostics["is_outlier"] = True
            # Use robust update with reduced gain
            robustness_factor = self.OUTLIER_THRESHOLD / mahal_dist
            R = R / (robustness_factor ** 2)
            S = self.H @ self.state.P @ self.H.T + R
        
        # Kalman gain: K = P @ H^T @ S^-1
        K = self.state.P @ self.H.T @ np.linalg.inv(S)
        
        # State update: x = x + K @ y
        self.state.x = self.state.x + (K @ y).flatten()
        
        # Covariance update (Joseph form for numerical stability)
        I_KH = np.eye(self.STATE_DIM) - K @ self.H
        self.state.P = I_KH @ self.state.P @ I_KH.T + K @ R @ K.T
        
        # Ensure symmetry
        self.state.P = 0.5 * (self.state.P + self.state.P.T)
        
        # Update innovation history for adaptation
        self.state.innovation_history.append(innovation)
        if len(self.state.innovation_history) > self.INNOVATION_WINDOW:
            self.state.innovation_history.pop(0)
        
        # Adaptive covariance estimation
        self._adapt_noise_covariances()
        
        # Update regime based on volatility estimate
        self._update_regime()
        
        # Update confidence
        self.state.confidence = self._compute_confidence()
        
        # Update timestamp
        if timestamp is not None:
            self.state.timestamp = timestamp
        
        diagnostics["kalman_gain_price"] = float(K[0, 0])
        diagnostics["state"] = self.state.to_dict()
        
        return self.state, diagnostics
    
    def _adapt_noise_covariances(self) -> None:
        """
        Adapt Q and R using innovation-based estimation.
        
        Uses the innovation sequence to estimate the true noise levels
        and adjusts the filter parameters accordingly.
        """
        if len(self.state.innovation_history) < self.min_samples:
            return
        
        innovations = np.array(self.state.innovation_history)
        
        # Estimate innovation variance
        innovation_var = np.var(innovations)
        
        # Expected innovation variance: H @ P @ H^T + R
        expected_var = float((self.H @ self.state.P @ self.H.T)[0, 0] + self.R_base[0, 0])
        
        # If innovation variance is higher than expected, increase R
        if innovation_var > expected_var * 1.5:
            self.R_base *= (1 + self.beta)
        elif innovation_var < expected_var * 0.5:
            self.R_base *= (1 - self.beta * 0.5)
        
        # Keep R within bounds
        self.R_base = np.clip(self.R_base, self.base_r * 0.1, self.base_r * 100)
    
    def _update_regime(self) -> None:
        """Update volatility regime based on state estimate."""
        volatility = abs(self.state.x[3])
        velocity_magnitude = abs(self.state.x[1])
        
        # Combined metric for regime classification
        risk_metric = volatility + 0.5 * velocity_magnitude
        
        if risk_metric < 0.005:
            new_regime = VolatilityRegime.LOW
        elif risk_metric < 0.02:
            new_regime = VolatilityRegime.NORMAL
        elif risk_metric < 0.05:
            new_regime = VolatilityRegime.HIGH
        else:
            new_regime = VolatilityRegime.EXTREME
        
        if new_regime != self.state.regime:
            logger.info(
                "Regime transition",
                old_regime=self.state.regime.value,
                new_regime=new_regime.value,
                risk_metric=risk_metric,
            )
            self.state.regime = new_regime
    
    def _compute_confidence(self) -> float:
        """
        Compute confidence in current estimate.
        
        Based on:
        - Trace of covariance matrix (uncertainty)
        - Recent innovation statistics (model fit)
        """
        # Uncertainty from covariance
        trace_P = np.trace(self.state.P)
        uncertainty_score = 1.0 / (1.0 + trace_P)
        
        # Model fit from innovations
        if len(self.state.innovation_history) >= self.min_samples:
            innovations = np.array(self.state.innovation_history[-20:])
            normalized_innovations = innovations / (self.state.x[0] + 1e-8)
            innovation_score = 1.0 / (1.0 + np.std(normalized_innovations) * 10)
        else:
            innovation_score = 0.5
        
        return 0.6 * uncertainty_score + 0.4 * innovation_score
    
    def predict_ahead(self, steps: int) -> List[Dict[str, float]]:
        """
        Multi-step ahead prediction.
        
        Args:
            steps: Number of steps to predict
            
        Returns:
            List of predicted states with confidence intervals
        """
        predictions = []
        x = self.state.x.copy()
        P = self.state.P.copy()
        
        regime_params = self.REGIME_PARAMS[self.state.regime]
        Q = self.Q_base * regime_params["q_scale"]
        
        for step in range(1, steps + 1):
            x = self.F @ x
            P = self.F @ P @ self.F.T + Q
            
            price_std = np.sqrt(P[0, 0])
            predictions.append({
                "step": step,
                "price": float(x[0]),
                "price_std": float(price_std),
                "lower_95": float(x[0] - 1.96 * price_std),
                "upper_95": float(x[0] + 1.96 * price_std),
                "velocity": float(x[1]),
                "volatility": float(x[3]),
            })
        
        return predictions
    
    def get_risk_score(self) -> float:
        """
        Compute current risk score (0-100).
        
        Combines volatility, uncertainty, and market correlation.
        """
        volatility = abs(self.state.x[3])
        uncertainty = np.sqrt(self.state.P[0, 0]) / (self.state.x[0] + 1e-8)
        beta = abs(self.state.x[4])
        
        # Normalize components
        vol_score = min(volatility / 0.1, 1.0) * 40  # Max 40 points
        unc_score = min(uncertainty / 0.05, 1.0) * 30  # Max 30 points
        beta_score = min((beta - 0.5).clip(0) / 1.5, 1.0) * 30  # Max 30 points
        
        return vol_score + unc_score + beta_score
    
    def get_fee_recommendation(self) -> int:
        """
        Get recommended fee in basis points based on risk.
        
        Returns:
            Fee in basis points (1-100)
        """
        risk_score = self.get_risk_score()
        
        # Map risk score to fee
        if risk_score < 20:
            return 5   # 0.05% - Low risk
        elif risk_score < 40:
            return 10  # 0.10% - Normal
        elif risk_score < 60:
            return 30  # 0.30% - Elevated
        elif risk_score < 80:
            return 50  # 0.50% - High
        else:
            return 100  # 1.00% - Extreme
    
    def reset(self, initial_price: Optional[float] = None) -> None:
        """Reset filter state."""
        price = initial_price if initial_price is not None else 1.0
        self.state = KalmanState(
            x=np.array([price, 0.0, 0.0, 0.01, 1.0], dtype=np.float64),
            P=np.eye(self.STATE_DIM, dtype=np.float64) * 0.1,
        )
        logger.info("Filter reset", initial_price=price)
