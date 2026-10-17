import pytest

from autotrader.backtest import run_backtest
from autotrader.costs import CostModel
from autotrader.data import synthetic_prices
from autotrader.risk import RiskLimits
from autotrader.strategies import Breakout, BuyAndHold, MeanReversion, SmaCross
from conftest import make_bars

FREE = CostModel(0.0, 0.0)
FULL = RiskLimits(max_position_frac=1.0, stop_loss_frac=1.0, daily_loss_limit_frac=1.0,
                  max_drawdown_frac=1.0)


def test_buy_and_hold_fills_at_next_open_no_costs():
    bars = make_bars(opens=[100, 110, 120, 130], closes=[105, 115, 125, 135])
    res = run_backtest(bars, BuyAndHold(), costs=FREE, limits=FULL, initial_equity=1000)
    # decision at close of bar0, fill at open of bar1 (110), marked at close of bar3 (135)
    assert res.equity.iloc[0] == 1000
    assert res.equity.iloc[-1] == pytest.approx(1000 * 135 / 110)
    assert res.fills == 1


def test_costs_reduce_profit():
    df = synthetic_prices(600, seed=4)
    free = run_backtest(df, SmaCross(10, 40), costs=FREE).equity.iloc[-1]
    paid = run_backtest(df, SmaCross(10, 40), costs=CostModel(0.002, 0.001)).equity.iloc[-1]
    assert paid < free


def test_position_cap_limits_exposure():
    bars = make_bars(opens=[100] * 6, closes=[100] * 6)
    res = run_backtest(bars, BuyAndHold(), costs=FREE, limits=RiskLimits(max_position_frac=0.25),
                       initial_equity=1000)
    assert res.traded_notional == pytest.approx(250)


def test_never_spends_more_than_cash():
    df = synthetic_prices(300, seed=5)
    res = run_backtest(df, BuyAndHold(), limits=FULL, initial_equity=1000)
    assert (res.equity > 0).all()


def test_stop_loss_cuts_a_crash():
    closes = [100, 100, 100, 70, 50, 40, 30, 30]
    bars = make_bars(opens=[100, 100, 100, 100, 70, 50, 40, 30], closes=closes)
    guarded = run_backtest(bars, BuyAndHold(), costs=FREE, initial_equity=1000,
                           limits=RiskLimits(max_position_frac=1.0, stop_loss_frac=0.1,
                                             daily_loss_limit_frac=1.0, max_drawdown_frac=1.0))
    naked = run_backtest(bars, BuyAndHold(), costs=FREE, limits=FULL, initial_equity=1000)
    assert guarded.equity.iloc[-1] > naked.equity.iloc[-1]


def test_drawdown_halt_stops_trading():
    df = synthetic_prices(500, seed=6, drift=-0.004, vol=0.03)
    res = run_backtest(df, BuyAndHold(), limits=RiskLimits(max_position_frac=1.0,
                       stop_loss_frac=1.0, daily_loss_limit_frac=1.0, max_drawdown_frac=0.2))
    assert res.halted_bars > 0
    assert (1 - res.equity / res.equity.cummax()).max() < 0.35  # bounded near the limit


@pytest.mark.parametrize("strategy", [SmaCross(5, 20), Breakout(20, 10), MeanReversion(20, 1.5)])
def test_strategies_have_no_lookahead(strategy):
    """Signals up to bar t must not change when future bars are removed."""
    df = synthetic_prices(400, seed=7)
    full = strategy.target_positions(df)
    for cut in (150, 250, 399):
        part = strategy.target_positions(df.iloc[:cut])
        assert part.equals(full.iloc[:cut])


def test_run_is_deterministic():
    df = synthetic_prices(400, seed=8)
    a = run_backtest(df, Breakout(20, 10)).equity
    b = run_backtest(df, Breakout(20, 10)).equity
    assert a.equals(b)


def test_input_validation():
    df = synthetic_prices(10, seed=1)
    with pytest.raises(ValueError):
        run_backtest(df, BuyAndHold(), initial_equity=0)
    with pytest.raises(ValueError):
        run_backtest(df.iloc[:2], BuyAndHold())
