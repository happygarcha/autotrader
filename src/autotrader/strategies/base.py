"""Strategy interface.

A strategy turns price history into a *wished* position fraction in [0, 1] for each bar.
Value at bar t may only use data up to and including bar t (the backtester executes it at
the open of bar t+1). Long-only, spot, no leverage.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd


class Strategy(ABC):
    name: str = "strategy"

    @abstractmethod
    def target_positions(self, df: pd.DataFrame) -> pd.Series:
        """Return wished exposure (0..1) per bar, indexed like `df`."""

    def params(self) -> dict:
        return {}
