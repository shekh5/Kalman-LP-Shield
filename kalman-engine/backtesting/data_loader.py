"""
DataLoader - Historical Data Loading Module

This module provides utilities for loading and preprocessing
historical price data for backtesting.
"""

import numpy as np
import pandas as pd
from numpy.typing import NDArray
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass
from pathlib import Path
import json
import structlog

logger = structlog.get_logger()


@dataclass
class PriceData:
    """Container for historical price data."""
    timestamps: NDArray[np.float64]
    prices: NDArray[np.float64]
    volumes: Optional[NDArray[np.float64]] = None
    high: Optional[NDArray[np.float64]] = None
    low: Optional[NDArray[np.float64]] = None
    symbol: str = "ETH/USD"
    source: str = "unknown"
    interval: str = "1m"
    
    def __len__(self) -> int:
        return len(self.prices)
    
    def to_dataframe(self) -> pd.DataFrame:
        """Convert to pandas DataFrame."""
        data = {
            "timestamp": pd.to_datetime(self.timestamps, unit="s"),
            "price": self.prices,
        }
        if self.volumes is not None:
            data["volume"] = self.volumes
        if self.high is not None:
            data["high"] = self.high
        if self.low is not None:
            data["low"] = self.low
        
        df = pd.DataFrame(data)
        df.set_index("timestamp", inplace=True)
        return df


class DataLoader:
    """
    Historical data loader for backtesting.
    
    Supports multiple data sources and formats.
    """
    
    def __init__(self, data_dir: Optional[str] = None):
        """
        Initialize data loader.
        
        Args:
            data_dir: Directory containing data files
        """
        self.data_dir = Path(data_dir) if data_dir else Path("./data")
        self.cache: Dict[str, PriceData] = {}
        
    def load_csv(
        self,
        filepath: str,
        timestamp_col: str = "timestamp",
        price_col: str = "close",
        volume_col: Optional[str] = "volume",
        high_col: Optional[str] = "high",
        low_col: Optional[str] = "low",
    ) -> PriceData:
        """
        Load price data from CSV file.
        
        Args:
            filepath: Path to CSV file
            timestamp_col: Name of timestamp column
            price_col: Name of price column
            volume_col: Name of volume column (optional)
            high_col: Name of high price column (optional)
            low_col: Name of low price column (optional)
            
        Returns:
            PriceData object
        """
        df = pd.read_csv(filepath)
        
        # Parse timestamps
        if df[timestamp_col].dtype == "object":
            timestamps = pd.to_datetime(df[timestamp_col]).values.astype(np.int64) / 1e9
        else:
            timestamps = df[timestamp_col].values.astype(np.float64)
        
        prices = df[price_col].values.astype(np.float64)
        
        volumes = None
        if volume_col and volume_col in df.columns:
            volumes = df[volume_col].values.astype(np.float64)
        
        high = None
        if high_col and high_col in df.columns:
            high = df[high_col].values.astype(np.float64)
        
        low = None
        if low_col and low_col in df.columns:
            low = df[low_col].values.astype(np.float64)
        
        return PriceData(
            timestamps=timestamps,
            prices=prices,
            volumes=volumes,
            high=high,
            low=low,
            source="csv",
        )
    
    def load_json(self, filepath: str) -> PriceData:
        """
        Load price data from JSON file.
        
        Expects format: {"timestamps": [...], "prices": [...], ...}
        """
        with open(filepath, "r") as f:
            data = json.load(f)
        
        return PriceData(
            timestamps=np.array(data["timestamps"], dtype=np.float64),
            prices=np.array(data["prices"], dtype=np.float64),
            volumes=np.array(data.get("volumes", [])) if data.get("volumes") else None,
            symbol=data.get("symbol", "UNKNOWN"),
            source="json",
        )
    
    def generate_synthetic(
        self,
        n_periods: int = 10000,
        initial_price: float = 2000.0,
        volatility: float = 0.02,
        drift: float = 0.0,
        jump_intensity: float = 0.01,
        jump_magnitude: float = 0.05,
        interval_seconds: float = 12.0,
        seed: Optional[int] = None,
    ) -> PriceData:
        """
        Generate synthetic price data with jumps.
        
        Uses jump-diffusion model: dS = μSdt + σSdW + JdN
        
        Args:
            n_periods: Number of data points
            initial_price: Starting price
            volatility: Diffusion volatility (σ)
            drift: Price drift (μ)
            jump_intensity: Jump probability per period (λ)
            jump_magnitude: Jump size volatility
            interval_seconds: Time between observations
            seed: Random seed
            
        Returns:
            PriceData object
        """
        if seed is not None:
            np.random.seed(seed)
        
        # Generate timestamps
        timestamps = np.arange(n_periods) * interval_seconds
        
        # Generate prices
        prices = np.zeros(n_periods)
        prices[0] = initial_price
        
        for t in range(1, n_periods):
            # Diffusion component
            diffusion = drift + volatility * np.random.randn()
            
            # Jump component (Poisson-distributed)
            if np.random.random() < jump_intensity:
                jump = np.random.randn() * jump_magnitude
            else:
                jump = 0
            
            # Update price
            prices[t] = prices[t-1] * np.exp(diffusion + jump)
        
        # Generate correlated volume
        returns = np.diff(prices) / prices[:-1]
        base_volume = 1_000_000
        volume_multiplier = 1 + 2 * np.abs(returns)  # Higher volume on big moves
        volumes = np.zeros(n_periods)
        volumes[0] = base_volume
        volumes[1:] = base_volume * volume_multiplier * (1 + 0.3 * np.random.randn(n_periods - 1))
        
        return PriceData(
            timestamps=timestamps,
            prices=prices,
            volumes=volumes,
            symbol="SYNTH/USD",
            source="synthetic",
            interval=f"{int(interval_seconds)}s",
        )
    
    def resample(
        self,
        data: PriceData,
        new_interval: str,
    ) -> PriceData:
        """
        Resample price data to different interval.
        
        Args:
            data: Original price data
            new_interval: New interval (e.g., "5m", "1h", "1d")
            
        Returns:
            Resampled PriceData
        """
        df = data.to_dataframe()
        
        resampled = df.resample(new_interval).agg({
            "price": "last",
            **({"volume": "sum"} if "volume" in df.columns else {}),
            **({"high": "max"} if "high" in df.columns else {}),
            **({"low": "min"} if "low" in df.columns else {}),
        }).dropna()
        
        return PriceData(
            timestamps=resampled.index.values.astype(np.int64) / 1e9,
            prices=resampled["price"].values,
            volumes=resampled["volume"].values if "volume" in resampled.columns else None,
            high=resampled["high"].values if "high" in resampled.columns else None,
            low=resampled["low"].values if "low" in resampled.columns else None,
            symbol=data.symbol,
            source=data.source,
            interval=new_interval,
        )
    
    def add_noise(
        self,
        data: PriceData,
        noise_std: float = 0.001,
    ) -> PriceData:
        """
        Add measurement noise to price data.
        
        Useful for simulating oracle noise.
        """
        noisy_prices = data.prices * (1 + noise_std * np.random.randn(len(data.prices)))
        
        return PriceData(
            timestamps=data.timestamps.copy(),
            prices=noisy_prices,
            volumes=data.volumes.copy() if data.volumes is not None else None,
            high=data.high.copy() if data.high is not None else None,
            low=data.low.copy() if data.low is not None else None,
            symbol=data.symbol,
            source=f"{data.source}+noise",
            interval=data.interval,
        )
    
    def split(
        self,
        data: PriceData,
        train_ratio: float = 0.7,
        val_ratio: float = 0.15,
    ) -> Tuple[PriceData, PriceData, PriceData]:
        """
        Split data into train/validation/test sets.
        
        Args:
            data: Price data to split
            train_ratio: Fraction for training
            val_ratio: Fraction for validation
            
        Returns:
            Tuple of (train, validation, test) PriceData
        """
        n = len(data)
        train_end = int(n * train_ratio)
        val_end = int(n * (train_ratio + val_ratio))
        
        def slice_data(start: int, end: int) -> PriceData:
            return PriceData(
                timestamps=data.timestamps[start:end],
                prices=data.prices[start:end],
                volumes=data.volumes[start:end] if data.volumes is not None else None,
                high=data.high[start:end] if data.high is not None else None,
                low=data.low[start:end] if data.low is not None else None,
                symbol=data.symbol,
                source=data.source,
                interval=data.interval,
            )
        
        train = slice_data(0, train_end)
        val = slice_data(train_end, val_end)
        test = slice_data(val_end, n)
        
        return train, val, test
