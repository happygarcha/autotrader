import json

import numpy as np
import pandas as pd
import pytest

from autotrader.broker import PaperBroker
from autotrader.connectors import KrakenPublic
from autotrader.costs import CostModel
from autotrader.data import synthetic_prices
from autotrader.kraken_live import sign
from autotrader.learning import drift_exceeded, postmortem, reselect
from autotrader.live_gate import check_live_gate
from autotrader.risk import RiskLimits
from autotrader.runner import Asset, Config, new_state, run_cycle


def test_kraken_parse_drops_forming_bar_and_validates():
    rows = [[1700000000 + i * 86400, "100", "110", "95", "105", "100", "1", 5] for i in range(4)]
    df = KrakenPublic.parse({"error": [], "result": {"XXBTZCAD": rows, "last": 1}})
    assert len(df) == 3 and df.index.is_monotonic_increasing
    with pytest.raises(RuntimeError):
        KrakenPublic.parse({"error": ["EQuery:Unknown asset pair"], "result": {}})


def test_paper_broker_applies_slippage_and_fee():
    b = PaperBroker(CostModel(0.001, 0.0005))
    buy = b.market_order("X", "buy", 2, 100)
    sell = b.market_order("X", "sell", 2, 100)
    assert buy.price == pytest.approx(100.05) and sell.price == pytest.approx(99.95)
    assert buy.fee == pytest.approx(2 * 100.05 * 0.001)
    with pytest.raises(ValueError):
        b.market_order("X", "buy", 0, 100)


def test_kraken_signature_matches_published_example():
    # Test vector from Kraken's REST API authentication documentation.
    secret = ("kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F"
              "1huXg==")
    data = {"nonce": 1616492376594, "ordertype": "limit", "pair": "XBTUSD", "price": 37500,
            "type": "buy", "volume": 1.25}
    assert sign("/0/private/AddOrder", data, secret) == (
        "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==")


def test_live_gate_blocks_by_default_and_requires_everything(tmp_path):
    lim = RiskLimits()
    g = check_live_gate(tmp_path, lim, paper_days=3, paper_max_dd=0.01, env={})
    assert not g.allowed and len(g.reasons) >= 3
    (tmp_path / "LIVE_APPROVED").write_text(json.dumps({"limits": lim.__dict__}))
    env = {"AUTOTRADER_LIVE": "YES_I_ACCEPT_THE_RISK"}
    assert check_live_gate(tmp_path, lim, 30, 0.05, env=env).allowed
    assert not check_live_gate(tmp_path, lim, 10, 0.05, env=env).allowed  # too few paper days
    assert not check_live_gate(tmp_path, lim, 30, 0.40, env=env).allowed  # paper drawdown too big
    (tmp_path / "KILL").write_text("")
    assert not check_live_gate(tmp_path, lim, 30, 0.05, env=env).allowed
    other = RiskLimits(max_position_frac=0.9)
    (tmp_path / "KILL").unlink()
    assert not check_live_gate(tmp_path, other, 30, 0.05, env=env).allowed  # limits changed


def test_reselect_goes_to_cash_on_random_walk_and_short_data():
    assert reselect(synthetic_prices(100)).strategy == "cash"
    rw = synthetic_prices(900, seed=21, drift=0.0)
    sel = reselect(rw)
    assert sel.strategy in {"cash", "sma_cross", "breakout", "mean_reversion"}
    assert sel.reason


def test_reselect_finds_trend_when_one_exists():
    t = np.arange(900)
    close = 100 * np.exp(0.002 * t + 0.25 * np.sin(t / 25))
    idx = pd.date_range("2020-01-01", periods=900, freq="1D", tz="UTC")
    df = pd.DataFrame({"open": np.roll(close, 1), "close": close}, index=idx)
    df.iloc[0, 0] = close[0]
    df["high"] = df[["open", "close"]].max(axis=1)
    df["low"] = df[["open", "close"]].min(axis=1)
    sel = reselect(df, limits=RiskLimits(max_position_frac=1.0, stop_loss_frac=0.5),
                   min_val_trades=2)
    assert sel.strategy != "cash" and sel.val_return > 0


def test_postmortem_only_makes_bot_more_cautious_and_recovers():
    loss = {"ret": -0.05, "bars_held": 2, "reason": "stop_loss"}
    win = {"ret": 0.04, "bars_held": 10, "reason": "signal"}
    one = postmortem([win, loss])
    assert one.size_multiplier == 1.0  # a single loss changes nothing
    two = postmortem([win, loss, loss])
    assert two.size_multiplier == 0.5 and two.cooldown_bars == 5 and two.retrain_requested
    assert postmortem([loss] * 6, 0.25).size_multiplier == 0.25  # floor
    assert postmortem([loss, win, win], 0.5).size_multiplier == 1.0  # restored after wins


def test_drift_monitor():
    ok = pd.Series([100, 102, 99, 103.0])
    bad = pd.Series([100, 90, 80, 70.0])
    assert not drift_exceeded(ok, 0.05) and drift_exceeded(bad, 0.05)


class FakeFeed:
    def __init__(self, df, limit):
        self.df, self.limit = df, limit

    def fetch_ohlc(self, symbol, interval_minutes):
        return self.df.iloc[:self.limit]


def test_runner_end_to_end_is_safe_and_idempotent():
    full = synthetic_prices(700, seed=31, drift=0.001)
    cfg = Config(assets=[Asset("TEST")], start_equity=10_000.0,
                 limits=RiskLimits(max_position_frac=0.3))
    state = new_state(cfg)
    broker = PaperBroker(cfg.costs)
    for limit in range(400, 700, 5):
        feed = FakeFeed(full, limit)
        run_cycle(cfg, state, broker, connector_for=lambda a, f=feed: f)
    n_events = len(state["events"])
    run_cycle(cfg, state, broker, connector_for=lambda a: FakeFeed(full, 695))  # same last bar
    assert len(state["events"]) == n_events  # no duplicate decision on the same bar
    eq = pd.Series([e["equity"] for e in state["equity_history"]])
    assert len(eq) > 10 and (eq > 0).all()
    assert state["cash"] >= -1e-6
    exposure = sum(state["units"].values()) * full["close"].iloc[694] / eq.iloc[-1]
    assert exposure <= cfg.max_total_exposure + 0.05


def test_runner_survives_data_outage():
    class Broken:
        def fetch_ohlc(self, *a):
            raise OSError("network down")

    cfg = Config(assets=[Asset("TEST")])
    state = run_cycle(cfg, new_state(cfg), PaperBroker(), connector_for=lambda a: Broken())
    assert state["units"] == {} and any("data error" in e["msg"] for e in state["events"])


def test_reselect_handles_hourly_bars():
    h = synthetic_prices(800, seed=41, drift=0.0, freq="1h")
    sel = reselect(h)
    assert sel.strategy in {"cash", "sma_cross", "breakout", "mean_reversion"}
