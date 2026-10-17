"""Baseline strategies. Each uses only past data at every bar (no look-ahead)."""

from __future__ import annotations

import pandas as pd

from .base import Strategy


class BuyAndHold(Strategy):
    name = "buy_and_hold"

    def target_positions(self, df: pd.DataFrame) -> pd.Series:
        return pd.Series(1.0, index=df.index)


class SmaCross(Strategy):
    """Long while the fast moving average is above the slow one."""

    name = "sma_cross"

    def __init__(self, fast: int = 20, slow: int = 100) -> None:
        if not 0 < fast < slow:
            raise ValueError("need 0 < fast < slow")
        self.fast, self.slow = fast, slow

    def params(self) -> dict:
        return {"fast": self.fast, "slow": self.slow}

    def target_positions(self, df: pd.DataFrame) -> pd.Series:
        c = df["close"]
        fast = c.rolling(self.fast).mean()
        slow = c.rolling(self.slow).mean()
        return (fast > slow).astype(float).where(slow.notna(), 0.0)


class Breakout(Strategy):
    """Enter on a new `lookback`-bar high, exit on a new `exit_lookback`-bar low."""

    name = "breakout"

    def __init__(self, lookback: int = 55, exit_lookback: int = 20) -> None:
        if lookback < 2 or exit_lookback < 2:
            raise ValueError("lookbacks must be >= 2")
        self.lookback, self.exit_lookback = lookback, exit_lookback

    def params(self) -> dict:
        return {"lookback": self.lookback, "exit_lookback": self.exit_lookback}

    def target_positions(self, df: pd.DataFrame) -> pd.Series:
        c = df["close"]
        hi = c.shift(1).rolling(self.lookback).max()
        lo = c.shift(1).rolling(self.exit_lookback).min()
        out = []
        pos = 0.0
        for price, h, low in zip(c.to_numpy(), hi.to_numpy(), lo.to_numpy(), strict=True):
            if pos == 0.0 and h == h and price > h:  # h == h filters NaN
                pos = 1.0
            elif pos == 1.0 and low == low and price < low:
                pos = 0.0
            out.append(pos)
        return pd.Series(out, index=df.index)


class MeanReversion(Strategy):
    """Buy when price is `entry_z` std devs below its mean; sell when back to `exit_z`."""

    name = "mean_reversion"

    def __init__(self, window: int = 20, entry_z: float = 2.0, exit_z: float = 0.0) -> None:
        if window < 5:
            raise ValueError("window must be >= 5")
        self.window, self.entry_z, self.exit_z = window, entry_z, exit_z

    def params(self) -> dict:
        return {"window": self.window, "entry_z": self.entry_z, "exit_z": self.exit_z}

    def target_positions(self, df: pd.DataFrame) -> pd.Series:
        c = df["close"]
        z = (c - c.rolling(self.window).mean()) / c.rolling(self.window).std()
        out = []
        pos = 0.0
        for v in z.to_numpy():
            if v == v:
                if pos == 0.0 and v < -self.entry_z:
                    pos = 1.0
                elif pos == 1.0 and v >= self.exit_z:
                    pos = 0.0
            out.append(pos)
        return pd.Series(out, index=df.index)
