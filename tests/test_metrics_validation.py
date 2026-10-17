import pandas as pd
import pytest

from autotrader.backtest import run_backtest
from autotrader.data import synthetic_prices
from autotrader.metrics import compute_metrics, max_drawdown, periods_per_year
from autotrader.strategies import BuyAndHold, SmaCross
from autotrader.validation import (
    monte_carlo_trades,
    param_combinations,
    permutation_test,
    walk_forward,
)


def test_max_drawdown_known_value():
    eq = pd.Series([100, 120, 90, 110, 60, 130.0])
    assert max_drawdown(eq) == pytest.approx(0.5)


def test_periods_per_year_daily():
    idx = pd.date_range("2024-01-01", periods=10, freq="1D", tz="UTC")
    assert periods_per_year(idx) == pytest.approx(365.25)


def test_metrics_basic_consistency(prices):
    res = run_backtest(prices, SmaCross(10, 40))
    m = compute_metrics(res)
    assert m.total_return == pytest.approx(res.equity.iloc[-1] / res.equity.iloc[0] - 1)
    assert 0 <= m.max_drawdown <= 1
    assert m.trades == len(res.trades)
    assert 0 <= m.win_rate <= 1


def test_param_combinations():
    combos = param_combinations({"a": [1, 2], "b": [3, 4]})
    assert len(combos) == 4 and {"a": 2, "b": 3} in combos


def test_walk_forward_chains_only_out_of_sample(prices):
    wf = walk_forward(prices, SmaCross, {"fast": [5, 10], "slow": [30, 60]},
                      train_bars=300, test_bars=150)
    assert len(wf.folds) == 4
    first_test = wf.folds[0]["test_start"]
    assert wf.equity.index[0] >= first_test
    assert wf.n_trials == 4
    assert wf.equity.iloc[0] > 0


def test_walk_forward_rejects_short_data(prices):
    with pytest.raises(ValueError):
        walk_forward(prices.iloc[:100], SmaCross, {"fast": [5], "slow": [20]},
                     train_bars=300, test_bars=150)


def test_permutation_test_flags_no_edge_on_random_walk():
    df = synthetic_prices(700, seed=11, drift=0.0)
    out = permutation_test(df, SmaCross(10, 50), n=40, seed=1)
    assert 0 < out["p_value"] <= 1
    assert out["p_value"] > 0.05  # a random walk should not show a significant edge


def test_monte_carlo_requires_enough_trades():
    with pytest.raises(ValueError):
        monte_carlo_trades(pd.Series([0.1, -0.05]))
    mc = monte_carlo_trades(pd.Series([0.1, -0.05, 0.02, 0.07, -0.03, 0.04]), n=300)
    assert mc["final_return_p05"] <= mc["final_return_median"] <= mc["final_return_p95"]


def test_buy_and_hold_benchmark_runs(prices):
    assert compute_metrics(run_backtest(prices, BuyAndHold())).bars == len(prices)
