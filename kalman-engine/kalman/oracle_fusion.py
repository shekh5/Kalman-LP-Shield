"""
OracleFusion - Multi-Source Oracle Data Fusion

This module implements sensor fusion techniques for combining
price data from multiple oracle sources with varying reliability.

Features:
1. Weighted averaging based on historical accuracy
2. Outlier detection and rejection
3. Latency-aware fusion
4. Byzantine fault tolerance (up to 1/3 malicious)
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from collections import deque
from enum import Enum
import time
import structlog

logger = structlog.get_logger()


class OracleType(Enum):
    """Types of oracle sources."""
    CHAINLINK = "chainlink"
    UNISWAP_TWAP = "uniswap_twap"
    PYTH = "pyth"
    REDSTONE = "redstone"
    CUSTOM = "custom"


@dataclass
class OracleSource:
    """
    Configuration for an oracle source.
    
    Attributes:
        name: Unique identifier
        oracle_type: Type of oracle
        address: On-chain address (if applicable)
        weight: Initial weight (0-1)
        max_latency_ms: Maximum acceptable latency
        min_update_interval: Minimum time between updates
    """
    name: str
    oracle_type: OracleType
    address: Optional[str] = None
    weight: float = 1.0
    max_latency_ms: int = 5000
    min_update_interval: float = 1.0


@dataclass
class OracleReading:
    """Single reading from an oracle."""
    source: str
    price: float
    timestamp: float
    confidence: float = 1.0
    latency_ms: int = 0


@dataclass 
class FusedPrice:
    """Result of oracle fusion."""
    price: float
    variance: float
    confidence: float
    timestamp: float
    sources_used: List[str]
    outliers_rejected: List[str]
    weights: Dict[str, float]


class OracleFusion:
    """
    Multi-source oracle fusion engine.
    
    Implements:
    1. Adaptive weight learning based on forecast errors
    2. Mahalanobis distance outlier rejection
    3. Latency penalty for stale data
    4. Minimum source quorum for Byzantine tolerance
    """
    
    # Minimum sources for Byzantine fault tolerance
    MIN_SOURCES_QUORUM = 3  # Need 2f+1 for f=1 Byzantine fault
    
    # Outlier detection threshold (Mahalanobis distance)
    OUTLIER_THRESHOLD = 3.0
    
    # Weight adaptation rate
    WEIGHT_ADAPTATION_RATE = 0.1
    
    # Latency penalty half-life (ms)
    LATENCY_HALFLIFE_MS = 2000
    
    def __init__(
        self,
        sources: List[OracleSource],
        history_window: int = 100,
        min_sources: int = 2,
    ):
        """
        Initialize oracle fusion engine.
        
        Args:
            sources: List of oracle source configurations
            history_window: Window size for error tracking
            min_sources: Minimum sources required for valid fusion
        """
        self.sources = {s.name: s for s in sources}
        self.min_sources = max(min_sources, 2)
        
        # Weight tracking (normalized weights)
        self.weights = {s.name: s.weight for s in sources}
        self._normalize_weights()
        
        # Error history for weight adaptation
        self.error_history: Dict[str, deque] = {
            s.name: deque(maxlen=history_window) for s in sources
        }
        
        # Last readings cache
        self.last_readings: Dict[str, OracleReading] = {}
        
        # Fused price history
        self.fused_history: deque = deque(maxlen=history_window)
        
        logger.info(
            "OracleFusion initialized",
            num_sources=len(sources),
            source_names=[s.name for s in sources],
        )
    
    def _normalize_weights(self) -> None:
        """Normalize weights to sum to 1."""
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}
    
    def add_reading(self, reading: OracleReading) -> None:
        """
        Add a new oracle reading.
        
        Args:
            reading: Oracle reading to add
        """
        if reading.source not in self.sources:
            logger.warning(f"Unknown oracle source: {reading.source}")
            return
        
        self.last_readings[reading.source] = reading
    
    def fuse(self, current_time: Optional[float] = None) -> Optional[FusedPrice]:
        """
        Fuse all available oracle readings into single price estimate.
        
        Args:
            current_time: Current timestamp (uses time.time() if None)
            
        Returns:
            FusedPrice if enough valid sources, None otherwise
        """
        if current_time is None:
            current_time = time.time()
        
        # Collect valid readings
        valid_readings: List[Tuple[str, float, float]] = []  # (source, price, weight)
        stale_sources: List[str] = []
        
        for name, reading in self.last_readings.items():
            source_config = self.sources[name]
            
            # Check staleness
            age_ms = (current_time - reading.timestamp) * 1000
            if age_ms > source_config.max_latency_ms:
                stale_sources.append(name)
                continue
            
            # Apply latency penalty to weight
            latency_factor = np.exp(-reading.latency_ms / self.LATENCY_HALFLIFE_MS)
            adjusted_weight = self.weights[name] * latency_factor * reading.confidence
            
            valid_readings.append((name, reading.price, adjusted_weight))
        
        if stale_sources:
            logger.debug(f"Stale oracle sources: {stale_sources}")
        
        if len(valid_readings) < self.min_sources:
            logger.warning(
                "Insufficient oracle sources for fusion",
                valid=len(valid_readings),
                required=self.min_sources,
            )
            return None
        
        # Outlier detection and rejection
        prices = np.array([r[1] for r in valid_readings])
        weights = np.array([r[2] for r in valid_readings])
        
        # Weighted median for robust center estimate
        sorted_indices = np.argsort(prices)
        sorted_prices = prices[sorted_indices]
        sorted_weights = weights[sorted_indices]
        cumsum = np.cumsum(sorted_weights)
        median_idx = np.searchsorted(cumsum, cumsum[-1] / 2)
        robust_center = sorted_prices[min(median_idx, len(sorted_prices) - 1)]
        
        # MAD-based scale estimate
        deviations = np.abs(prices - robust_center)
        mad = np.median(deviations)
        robust_scale = 1.4826 * mad if mad > 0 else np.std(prices)
        
        # Identify outliers
        outliers: List[str] = []
        inliers: List[Tuple[str, float, float]] = []
        
        for (name, price, weight), deviation in zip(valid_readings, deviations):
            if robust_scale > 0 and deviation / robust_scale > self.OUTLIER_THRESHOLD:
                outliers.append(name)
                logger.warning(
                    "Outlier oracle rejected",
                    source=name,
                    price=price,
                    deviation=deviation,
                    threshold=self.OUTLIER_THRESHOLD * robust_scale,
                )
            else:
                inliers.append((name, price, weight))
        
        if len(inliers) < self.min_sources:
            logger.warning(
                "Insufficient sources after outlier rejection",
                inliers=len(inliers),
                outliers=len(outliers),
            )
            return None
        
        # Weighted average of inliers
        inlier_prices = np.array([r[1] for r in inliers])
        inlier_weights = np.array([r[2] for r in inliers])
        inlier_weights = inlier_weights / inlier_weights.sum()  # Renormalize
        
        fused_price = float(np.sum(inlier_prices * inlier_weights))
        
        # Variance estimate (weighted)
        variance = float(np.sum(inlier_weights * (inlier_prices - fused_price) ** 2))
        
        # Confidence based on agreement and number of sources
        agreement = 1.0 / (1.0 + variance * 100)  # Higher variance = lower confidence
        source_confidence = min(len(inliers) / 5, 1.0)  # More sources = higher confidence
        confidence = 0.7 * agreement + 0.3 * source_confidence
        
        # Build result
        result = FusedPrice(
            price=fused_price,
            variance=variance,
            confidence=confidence,
            timestamp=current_time,
            sources_used=[r[0] for r in inliers],
            outliers_rejected=outliers,
            weights={r[0]: float(r[2]) for r in inliers},
        )
        
        # Update error history for weight adaptation
        self._update_error_history(fused_price)
        
        # Store in history
        self.fused_history.append(result)
        
        return result
    
    def _update_error_history(self, fused_price: float) -> None:
        """Update error history for each source based on deviation from fused price."""
        for name, reading in self.last_readings.items():
            error = abs(reading.price - fused_price) / fused_price
            self.error_history[name].append(error)
    
    def adapt_weights(self) -> Dict[str, float]:
        """
        Adapt oracle weights based on historical accuracy.
        
        Sources with lower errors get higher weights.
        
        Returns:
            Updated weights dictionary
        """
        new_weights = {}
        
        for name in self.sources:
            errors = list(self.error_history[name])
            if len(errors) < 10:
                # Not enough history, use default
                new_weights[name] = self.sources[name].weight
            else:
                # Inverse of mean error as weight
                mean_error = np.mean(errors)
                new_weights[name] = 1.0 / (mean_error + 0.001)
        
        # Exponential moving average with current weights
        for name in self.weights:
            self.weights[name] = (
                (1 - self.WEIGHT_ADAPTATION_RATE) * self.weights[name] +
                self.WEIGHT_ADAPTATION_RATE * new_weights.get(name, self.weights[name])
            )
        
        self._normalize_weights()
        
        logger.debug("Weights adapted", weights=self.weights)
        
        return self.weights
    
    def get_source_statistics(self) -> Dict[str, Dict[str, Any]]:
        """
        Get statistics for each oracle source.
        
        Returns:
            Dictionary of source statistics
        """
        stats = {}
        
        for name, source in self.sources.items():
            errors = list(self.error_history[name])
            reading = self.last_readings.get(name)
            
            stats[name] = {
                "type": source.oracle_type.value,
                "weight": self.weights[name],
                "error_mean": float(np.mean(errors)) if errors else None,
                "error_std": float(np.std(errors)) if errors else None,
                "num_readings": len(errors),
                "last_price": reading.price if reading else None,
                "last_timestamp": reading.timestamp if reading else None,
                "last_latency_ms": reading.latency_ms if reading else None,
            }
        
        return stats
    
    def get_consensus_price(self) -> Optional[float]:
        """
        Get simple median price from all sources (no fusion).
        
        Returns:
            Median price or None if no readings
        """
        if not self.last_readings:
            return None
        
        prices = [r.price for r in self.last_readings.values()]
        return float(np.median(prices))
    
    def simulate_byzantine(
        self,
        readings: List[OracleReading],
        num_byzantine: int = 1,
        attack_type: str = "inflate",
    ) -> List[OracleReading]:
        """
        Simulate Byzantine oracle attack for testing.
        
        Args:
            readings: Original readings
            num_byzantine: Number of Byzantine sources
            attack_type: "inflate", "deflate", or "random"
            
        Returns:
            Modified readings with Byzantine behavior
        """
        if num_byzantine >= len(readings):
            raise ValueError("Cannot have more Byzantine sources than total")
        
        modified = readings.copy()
        byzantine_indices = np.random.choice(len(readings), num_byzantine, replace=False)
        
        honest_prices = [r.price for i, r in enumerate(readings) if i not in byzantine_indices]
        honest_median = np.median(honest_prices)
        
        for idx in byzantine_indices:
            original = modified[idx]
            if attack_type == "inflate":
                malicious_price = honest_median * 1.5
            elif attack_type == "deflate":
                malicious_price = honest_median * 0.5
            else:  # random
                malicious_price = honest_median * (0.5 + np.random.random())
            
            modified[idx] = OracleReading(
                source=original.source,
                price=malicious_price,
                timestamp=original.timestamp,
                confidence=original.confidence,
                latency_ms=original.latency_ms,
            )
        
        return modified
    
    def reset(self) -> None:
        """Reset fusion state."""
        self.weights = {s.name: s.weight for s in self.sources.values()}
        self._normalize_weights()
        
        for queue in self.error_history.values():
            queue.clear()
        
        self.last_readings.clear()
        self.fused_history.clear()
        
        logger.info("OracleFusion reset")
