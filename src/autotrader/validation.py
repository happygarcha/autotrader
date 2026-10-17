"""Overfitting defenses: walk-forward testing, permutation test, Monte Carlo trade resampling."""

from __future__ import annotations

import itertools
from collections.abc import Callable, Iterable
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .backtest import run_backtest
from .costs import CostModel
from .metrics import compute_metrics
from .risk import RiskLimits
from .strategies.base import Strategy

StrategyFactory = Callable[..., Strategy]


def param_combinations(grid: dict[str, Iterable]) -> list[dict]:
    keys = list(grid)
    return [dict(zip(keys, vals, strict=True))
            for vals in itertools.product(*(list(grid[k]) for k in keys))]


@dataclass
class WalkForwardResult:
    equity: pd.Series  # chained out-of-sample equity, starts at initial_equity
    folds: list[dict]  # per fold: train/test dates, chosen params, in-sample and OOS return
    n_trials: int  # parameter sets tried per fold (for deflating the result)


def walk_forward(df: pd.DataFrame, factory: StrategyFactory, grid: dict[str, Iterable], *,
                 train_bars: int, test_bars: int, initial_equity: float = 10_000.0,
                 costs: CostModel | None = None, limits: RiskLimits | None = None,
                 objective: str = "sharpe") -> WalkForwardResult:
    """Tune on a train window, trade the next unseen window, slide forward, chain results."""
    combos = []
    for p in param_combinations(grid):
        try:
            factory(**p)
        except ValueError:
            continue  # skip invalid combinations such as fast >= slow
        combos.append(p)
    if not combos:
        raise ValueError("no valid parameter combinations")
    if len(df) < train_bars + test_bars:
        raise ValueError("not enough data for one fold")

    oos_returns: list[pd.Series] = []
    folds: list[dict] = []
    start = 0
    while start + train_bars + test_bars <= len(df):
        train = df.iloc[start:start + train_bars]
        test_end = start + train_bars + test_bars
        best_p, best_score = None, -np.inf
        for p in combos:
            res = run_backtest(train, factory(**p), initial_equity=initial_equity,
                               costs=costs, limits=limits)
            score = getattr(compute_metrics(res), objective)
            if score > best_score:
                best_p, best_score = p, score
        window = df.iloc[start:test_end]  # train bars act as warm-up history for the test
        res = run_backtest(window, factory(**best_p), initial_equity=initial_equity,
                           costs=costs, limits=limits)
        test_eq = res.equity.iloc[train_bars - 1:]  # include last warm-up mark as the base
        rets = test_eq.pct_change().dropna()
        oos_returns.append(rets)
        folds.append({"train_start": train.index[0], "test_start": df.index[start + train_bars],
                      "test_end": df.index[test_end - 1], "params": best_p,
                      "in_sample_score": float(best_score),
                      "oos_return": float((1 + rets).prod() - 1)})
        start += test_bars

    all_rets = pd.concat(oos_returns)
    equity = initial_equity * (1 + all_rets).cumprod()
    return WalkForwardResult(equity=equity, folds=folds, n_trials=len(combos))


def _shuffled_prices(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Same return distribution as `df`, but any serial structure destroyed."""
    logret = np.log(df["close"]).diff().dropna().to_numpy().copy()
    rng.shuffle(logret)
    close = df["close"].iloc[0] * np.exp(np.concatenate([[0.0], np.cumsum(logret)]))
    open_ = np.concatenate([[df["open"].iloc[0]], close[:-1]])
    return pd.DataFrame({"open": open_, "close": close,
                         "high": np.maximum(open_, close), "low": np.minimum(open_, close)},
                        index=df.index)


def permutation_test(df: pd.DataFrame, strategy: Strategy, *, n: int = 200, seed: int = 0,
                     costs: CostModel | None = None, limits: RiskLimits | None = None,
                     objective: str = "sharpe") -> dict:
    """How often does the strategy score as well on return-shuffled (edge-free) prices?

    p_value small (< 0.05) means the real result is unlikely to be luck on this data.
    """
    real = getattr(compute_metrics(run_backtest(df, strategy, costs=costs, limits=limits)),
                   objective)
    rng = np.random.default_rng(seed)
    scores = np.array([
        getattr(compute_metrics(run_backtest(_shuffled_prices(df, rng), strategy,
                                             costs=costs, limits=limits)), objective)
        for _ in range(n)])
    p = float((1 + (scores >= real).sum()) / (1 + n))
    return {"real": float(real), "shuffled_mean": float(scores.mean()), "p_value": p, "n": n}


def monte_carlo_trades(trade_returns: pd.Series, *, n: int = 2000, seed: int = 0,
                       ruin_drawdown: float = 0.5) -> dict:
    """Resample trade order to show the spread of outcomes and the chance of deep drawdown."""
    r = trade_returns.to_numpy()
    if len(r) < 5:
        raise ValueError("need at least 5 trades")
    rng = np.random.default_rng(seed)
    finals, dds = np.empty(n), np.empty(n)
    for i in range(n):
        path = np.cumprod(1 + rng.choice(r, size=len(r), replace=True))
        finals[i] = path[-1] - 1
        peak = np.maximum.accumulate(np.concatenate([[1.0], path]))[1:]
        dds[i] = (1 - path / peak).max()
    return {"final_return_p05": float(np.percentile(finals, 5)),
            "final_return_median": float(np.median(finals)),
            "final_return_p95": float(np.percentile(finals, 95)),
            "max_drawdown_median": float(np.median(dds)),
            "max_drawdown_p95": float(np.percentile(dds, 95)),
            "prob_drawdown_over_ruin": float((dds >= ruin_drawdown).mean())}
