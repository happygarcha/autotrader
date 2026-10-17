"""Event-by-event backtester.

Timing contract (prevents look-ahead):
  * the decision for bar t uses data up to and including close[t];
  * it is filled at open[t+1] and pays fees and slippage;
  * the position is marked to close[t+1].
The same RiskManager used for live trading gates every decision.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from .costs import CostModel
from .data import validate_ohlc
from .risk import RiskLimits, RiskManager
from .strategies.base import Strategy


@dataclass
class BacktestResult:
    equity: pd.Series
    trades: pd.DataFrame  # one row per round trip: entry, exit, return
    fills: int
    traded_notional: float
    total_costs: float
    halted_bars: int
    strategy: str
    params: dict = field(default_factory=dict)


def run_backtest(df: pd.DataFrame, strategy: Strategy, *, initial_equity: float = 10_000.0,
                 costs: CostModel | None = None, limits: RiskLimits | None = None,
                 rebalance_band: float = 0.05) -> BacktestResult:
    if initial_equity <= 0:
        raise ValueError("initial_equity must be positive")
    if len(df) < 3:
        raise ValueError("need at least 3 bars")
    df = validate_ohlc(df)
    costs = costs or CostModel()
    risk = RiskManager(limits or RiskLimits())
    wanted = strategy.target_positions(df).reindex(df.index).fillna(0.0).clip(0.0, 1.0)

    open_ = df["open"].to_numpy()
    close = df["close"].to_numpy()
    days = df.index.date
    cash, units = float(initial_equity), 0.0
    equity = [cash]
    fills = 0
    notional_total = 0.0
    cost_total = 0.0
    halted_bars = 0
    trades: list[dict] = []
    entry_equity = entry_time = None

    for t in range(len(df) - 1):
        eq_close = cash + units * close[t]
        pos_frac = units * close[t] / eq_close if eq_close > 0 else 0.0
        risk.update(day=days[t], equity=eq_close, price=close[t], position_frac=pos_frac)
        allowed = risk.allow(float(wanted.iloc[t]), price=close[t], in_position=units > 0)
        if risk.halted_until_reset or risk.halted_for_day:
            halted_bars += 1

        px = open_[t + 1]
        eq_open = cash + units * px
        cur_frac = units * px / eq_open if eq_open > 0 else 0.0
        delta_value = 0.0
        if allowed == 0.0 and units > 0:
            delta_value = -units * px  # exit fully
        elif abs(allowed - cur_frac) > rebalance_band:
            delta_value = allowed * eq_open - units * px
            if delta_value > 0:  # never spend more cash than we have, costs included
                delta_value = min(delta_value, cash / (1 + costs.per_side))

        if delta_value != 0.0:
            cost = costs.cost(delta_value)
            units += delta_value / px
            cash -= delta_value + cost
            if units < 1e-12:
                units = 0.0
            fills += 1
            notional_total += abs(delta_value)
            cost_total += cost
            now_eq = cash + units * px
            if delta_value > 0 and entry_equity is None:
                entry_equity, entry_time = eq_open, df.index[t + 1]
            if units == 0.0 and entry_equity is not None:
                trades.append({"entry": entry_time, "exit": df.index[t + 1],
                               "return": now_eq / entry_equity - 1})
                entry_equity = entry_time = None
        equity.append(cash + units * close[t + 1])

    if entry_equity is not None:  # close the open trade at the last mark for statistics
        trades.append({"entry": entry_time, "exit": df.index[-1],
                       "return": equity[-1] / entry_equity - 1})
    return BacktestResult(
        equity=pd.Series(equity, index=df.index, name="equity"),
        trades=pd.DataFrame(trades, columns=["entry", "exit", "return"]),
        fills=fills, traded_notional=notional_total, total_costs=cost_total,
        halted_bars=halted_bars, strategy=strategy.name, params=strategy.params())
