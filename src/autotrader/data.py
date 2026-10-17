"""Price data: CSV loading, validation and a synthetic generator for tests."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

REQUIRED = ["open", "high", "low", "close"]


def validate_ohlc(df: pd.DataFrame) -> pd.DataFrame:
    """Return a clean copy or raise ValueError. Catches the data faults that fake profits."""
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    if not isinstance(df.index, pd.DatetimeIndex):
        raise ValueError("index must be a DatetimeIndex")
    if not df.index.is_monotonic_increasing or df.index.has_duplicates:
        raise ValueError("index must be strictly increasing with no duplicates")
    out = df.copy()
    if out[REQUIRED].isna().any().any():
        raise ValueError("NaN in OHLC data")
    if (out[REQUIRED] <= 0).any().any():
        raise ValueError("non-positive price in OHLC data")
    bad = (out["high"] < out[["open", "close", "low"]].max(axis=1)) | (
        out["low"] > out[["open", "close", "high"]].min(axis=1))
    if bad.any():
        raise ValueError(f"{int(bad.sum())} bars have inconsistent high/low")
    return out


def load_csv(path: str | Path) -> pd.DataFrame:
    """Load a CSV with columns timestamp,open,high,low,close[,volume]."""
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    if "timestamp" not in df.columns:
        raise ValueError("CSV needs a 'timestamp' column")
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.set_index("timestamp").sort_index()
    return validate_ohlc(df)


def synthetic_prices(n: int = 1500, *, seed: int = 0, drift: float = 0.0003,
                     vol: float = 0.02, start_price: float = 100.0,
                     freq: str = "1D") -> pd.DataFrame:
    """Geometric random walk OHLC. Used for tests and for the no-edge sanity check."""
    rng = np.random.default_rng(seed)
    rets = rng.normal(drift, vol, n)
    close = start_price * np.exp(np.cumsum(rets))
    open_ = np.concatenate([[start_price], close[:-1]]) * np.exp(rng.normal(0, vol / 4, n))
    spread = np.abs(rng.normal(0, vol / 2, n))
    high = np.maximum(open_, close) * (1 + spread)
    low = np.minimum(open_, close) * (1 - spread)
    idx = pd.date_range("2020-01-01", periods=n, freq=freq, tz="UTC")
    return validate_ohlc(pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": 1.0}, index=idx))
