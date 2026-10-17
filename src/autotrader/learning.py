"""Adaptive layer: how the bot "learns from mistakes" without fooling itself.

What it does:
  1. Re-selection: periodically re-test a pool of strategies/parameters on recent data and pick
     the best one that passes validation, or choose cash if none does.
  2. Post-mortem: classify each losing trade and adapt bounded settings (position size
     multiplier, cool-down, a retrain request).
  3. Drift monitor: switch an asset to cash when live drawdown is far beyond what validation saw.

What it will NOT do (by design): change from a single loss, loosen hard risk limits, add
leverage, or pick parameters that only work on the data they were tuned on.
Every change is logged with its reason.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from .backtest import run_backtest
from .costs import CostModel
from .metrics import max_drawdown
from .risk import RiskLimits
from .strategies import Breakout, MeanReversion, SmaCross, Strategy
from .validation import param_combinations

POOL: dict[str, tuple[type[Strategy], dict]] = {
    "sma_cross": (SmaCross, {"fast": [10, 20, 30], "slow": [60, 100, 150]}),
    "breakout": (Breakout, {"lookback": [30, 55, 90], "exit_lookback": [10, 20, 30]}),
    "mean_reversion": (MeanReversion, {"window": [15, 20, 30], "entry_z": [1.5, 2.0, 2.5]}),
}


@dataclass
class Selection:
    strategy: str  # pool name or "cash"
    params: dict = field(default_factory=dict)
    val_sharpe: float = 0.0
    val_return: float = 0.0
    val_max_drawdown: float = 0.0
    reason: str = ""

    def as_dict(self) -> dict:
        return self.__dict__.copy()

    def build(self) -> Strategy | None:
        if self.strategy == "cash":
            return None
        cls, _ = POOL[self.strategy]
        return cls(**self.params)


def _valid_params(cls: type[Strategy], grid: dict) -> list[dict]:
    out = []
    for p in param_combinations(grid):
        try:
            cls(**p)
        except ValueError:
            continue
        out.append(p)
    return out


def _validation_stats(df: pd.DataFrame, strat: Strategy, split: int, costs, limits) -> dict:
    """Run on all data (train is warm-up) but score only the unseen validation segment."""
    res = run_backtest(df, strat, costs=costs, limits=limits)
    eq = res.equity.iloc[split - 1:]
    rets = eq.pct_change().dropna()
    trades_in_val = int((res.trades["exit"] >= df.index[split]).sum()) if len(res.trades) else 0
    sharpe = float(rets.mean() / rets.std(ddof=1) * (365.25 ** 0.5)) if rets.std() > 0 else 0.0
    return {"ret": float(eq.iloc[-1] / eq.iloc[0] - 1), "sharpe": sharpe,
            "dd": max_drawdown(eq), "trades": trades_in_val}


def reselect(df: pd.DataFrame, *, costs: CostModel | None = None, limits: RiskLimits | None = None,
             val_frac: float = 0.35, min_val_trades: int = 3,
             robust_share: float = 0.5) -> Selection:
    """Pick the best strategy on the unseen tail of `df`; fall back to cash if none passes."""
    if len(df) < 300:
        return Selection("cash", reason="not enough history (<300 bars)")
    split = int(len(df) * (1 - val_frac))
    best: Selection | None = None
    checked = 0
    for name, (cls, grid) in POOL.items():
        combos = _valid_params(cls, grid)
        stats = [(p, _validation_stats(df, cls(**p), split, costs, limits)) for p in combos]
        checked += len(stats)
        positive_share = sum(s["ret"] > 0 for _, s in stats) / len(stats)
        if positive_share < robust_share:  # neighbours must also work, or it is a fluke
            continue
        for p, s in stats:
            if s["ret"] > 0 and s["trades"] >= min_val_trades and s["sharpe"] > 0.3:
                if best is None or s["sharpe"] > best.val_sharpe:
                    best = Selection(name, p, s["sharpe"], s["ret"], s["dd"],
                                     f"passed validation; {positive_share:.0%} of "
                                     f"{name} grid positive; {checked} variants tested so far")
    if best is None:
        return Selection("cash", reason=f"no variant passed validation ({checked} tested)")
    return best


@dataclass
class Lessons:
    size_multiplier: float
    cooldown_bars: int
    retrain_requested: bool
    notes: list[str]


def postmortem(trades: list[dict], current_multiplier: float = 1.0) -> Lessons:
    """Adapt bounded settings from recent closed trades (dicts with ret, bars_held, reason)."""
    notes: list[str] = []
    recent = trades[-6:]
    mult = current_multiplier
    cooldown = 0
    retrain = False
    streak = 0
    for t in reversed(recent):
        if t["ret"] <= 0:
            streak += 1
        else:
            break
    if streak >= 2:
        mult = max(0.25, current_multiplier * 0.5)
        notes.append(f"{streak} losses in a row: position size multiplier -> {mult:.2f}")
    elif recent and all(t["ret"] > 0 for t in recent[-2:]) and current_multiplier < 1.0:
        mult = min(1.0, current_multiplier * 2)
        notes.append(f"two wins in a row: multiplier restored to {mult:.2f}")
    losses = [t for t in recent if t["ret"] <= 0]
    if losses:
        whipsaw = [t for t in losses if t.get("bars_held", 99) <= 3]
        stops = [t for t in losses if t.get("reason") == "stop_loss"]
        if stops:
            cooldown = 5
            notes.append(f"{len(stops)} stop-loss exit(s): 5-bar cool-down before re-entry")
        if len(whipsaw) / len(losses) >= 0.5 and len(losses) >= 2:
            retrain = True
            notes.append("losses are mostly quick whipsaws: retrain requested")
    return Lessons(mult, cooldown, retrain, notes)


def drift_exceeded(live_equity: pd.Series, validated_max_dd: float, factor: float = 1.5,
                   floor: float = 0.05) -> bool:
    """True when live drawdown is far worse than validation suggested."""
    if len(live_equity) < 2:
        return False
    return max_drawdown(live_equity) > factor * max(validated_max_dd, floor)
