"""Performance metrics. All figures are net of costs because they come from the equity curve."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from .backtest import BacktestResult


def periods_per_year(index: pd.DatetimeIndex) -> float:
    step = pd.Series(index).diff().median()
    if pd.isna(step) or step.total_seconds() <= 0:
        raise ValueError("cannot infer bar frequency")
    return 365.25 * 24 * 3600 / step.total_seconds()


def max_drawdown(equity: pd.Series) -> float:
    """Largest peak-to-trough fall as a positive fraction."""
    peak = equity.cummax()
    return float((1 - equity / peak).max())


@dataclass(frozen=True)
class Metrics:
    total_return: float
    cagr: float
    volatility: float
    sharpe: float
    sortino: float
    max_drawdown: float
    trades: int
    win_rate: float
    profit_factor: float
    avg_win: float
    avg_loss: float
    total_costs: float
    bars: int

    def as_dict(self) -> dict:
        return asdict(self)


def compute_metrics(res: BacktestResult) -> Metrics:
    eq = res.equity
    rets = eq.pct_change().dropna()
    ppy = periods_per_year(eq.index)
    years = len(eq) / ppy
    total = float(eq.iloc[-1] / eq.iloc[0] - 1)
    cagr = float((eq.iloc[-1] / eq.iloc[0]) ** (1 / years) - 1) if years > 0 and eq.iloc[-1] > 0 \
        else -1.0
    vol = float(rets.std(ddof=1) * math.sqrt(ppy)) if len(rets) > 1 else 0.0
    mean = float(rets.mean()) * ppy
    sharpe = mean / vol if vol > 0 else 0.0
    downside = rets[rets < 0]
    dvol = float(np.sqrt((downside**2).sum() / len(rets)) * math.sqrt(ppy)) if len(rets) else 0.0
    sortino = mean / dvol if dvol > 0 else 0.0

    tr = res.trades["return"] if len(res.trades) else pd.Series(dtype=float)
    wins, losses = tr[tr > 0], tr[tr <= 0]
    gross_loss = -losses.sum()
    pf = float(wins.sum() / gross_loss) if gross_loss > 0 else (math.inf if wins.sum() > 0 else 0.0)
    return Metrics(
        total_return=total, cagr=cagr, volatility=vol, sharpe=float(sharpe),
        sortino=float(sortino), max_drawdown=max_drawdown(eq), trades=len(tr),
        win_rate=float(len(wins) / len(tr)) if len(tr) else 0.0, profit_factor=pf,
        avg_win=float(wins.mean()) if len(wins) else 0.0,
        avg_loss=float(losses.mean()) if len(losses) else 0.0,
        total_costs=res.total_costs, bars=len(eq))
