"""One trading cycle: data -> (re)selection -> signal -> risk -> broker -> persisted state.

Runs unchanged for paper and live; only the broker differs. State is a JSON file so the job
can be re-created from scratch every run (GitHub Actions has no memory between runs).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from .broker import Broker
from .connectors import CONNECTORS
from .costs import CostModel
from .learning import Selection, drift_exceeded, postmortem, reselect
from .risk import RiskLimits, RiskManager


@dataclass
class Asset:
    symbol: str
    market: str = "crypto"
    source: str = "kraken"
    interval_minutes: int = 1440


@dataclass
class Config:
    assets: list[Asset]
    start_equity: float = 10_000.0
    limits: RiskLimits = field(default_factory=RiskLimits)
    costs: CostModel = field(default_factory=CostModel)
    max_total_exposure: float = 0.6
    retrain_every_bars: int = 7

    @classmethod
    def load(cls, path: Path) -> Config:
        raw = json.loads(path.read_text())
        return cls(assets=[Asset(**a) for a in raw["assets"]],
                   start_equity=raw.get("start_equity", 10_000.0),
                   limits=RiskLimits(**raw.get("limits", {})),
                   costs=CostModel(**raw.get("costs", {})),
                   max_total_exposure=raw.get("max_total_exposure", 0.6),
                   retrain_every_bars=raw.get("retrain_every_bars", 7))


def new_state(cfg: Config) -> dict:
    return {"cash": cfg.start_equity, "units": {}, "entries": {}, "risk": {}, "selection": {},
            "last_bar": {}, "bars_since_retrain": {}, "cooldown": {}, "multiplier": 1.0,
            "trades": [], "equity_history": [], "events": [], "retrain_requested": {}}


def load_state(path: Path, cfg: Config) -> dict:
    return json.loads(path.read_text()) if path.exists() else new_state(cfg)


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=1, default=str))


def _log(state: dict, ts: object, msg: str) -> None:
    state["events"].append({"ts": str(ts), "msg": msg})
    state["events"] = state["events"][-500:]


def run_cycle(cfg: Config, state: dict, broker: Broker, *, connector_for=None,
              allow_orders: bool = True) -> dict:
    """Process any newly completed bar for every asset. Returns the updated state."""
    connector_for = connector_for or (lambda a: CONNECTORS[a.source]())
    data: dict[str, pd.DataFrame] = {}
    for a in cfg.assets:
        try:
            data[a.symbol] = connector_for(a).fetch_ohlc(a.symbol, a.interval_minutes)
        except Exception as exc:  # data failure for one asset must not stop the others
            _log(state, "-", f"{a.symbol}: data error, skipped ({exc})")

    prices = {s: float(df["close"].iloc[-1]) for s, df in data.items()}
    for sym in state["units"]:
        prices.setdefault(sym, state["entries"].get(sym, {}).get("price", 0.0))
    equity = state["cash"] + sum(u * prices.get(s, 0.0) for s, u in state["units"].items())

    for a in cfg.assets:
        df = data.get(a.symbol)
        if df is None:
            continue
        sym, ts = a.symbol, df.index[-1]
        if state["last_bar"].get(sym) == str(ts):
            continue  # nothing new to decide
        state["last_bar"][sym] = str(ts)
        price = float(df["close"].iloc[-1])

        # (re)select strategy when never chosen, requested, or due
        since = state["bars_since_retrain"].get(sym, 10**6) + 1
        if (sym not in state["selection"] or state["retrain_requested"].pop(sym, False)
                or since >= cfg.retrain_every_bars):
            sel = reselect(df, costs=cfg.costs, limits=cfg.limits)
            if state["selection"].get(sym, {}).get("strategy") != sel.strategy or \
                    state["selection"].get(sym, {}).get("params") != sel.params:
                _log(state, ts, f"{sym}: selected {sel.strategy} {sel.params} ({sel.reason})")
            state["selection"][sym] = sel.as_dict()
            since = 0
        state["bars_since_retrain"][sym] = since
        sel = Selection(**state["selection"][sym])
        strat = sel.build()

        wanted = float(strat.target_positions(df).iloc[-1]) if strat else 0.0
        if state["cooldown"].get(sym, 0) > 0:
            state["cooldown"][sym] -= 1
            wanted = 0.0
        if strat and len(state["equity_history"]) > 1:
            hist = pd.Series([e["equity"] for e in state["equity_history"]])
            if drift_exceeded(hist, sel.val_max_drawdown):
                wanted = 0.0
                _log(state, ts, f"{sym}: live drawdown beyond validation; held in cash, retrain")
                state["retrain_requested"][sym] = True

        rm = RiskManager.from_dict(cfg.limits, state["risk"][sym]) if sym in state["risk"] \
            else RiskManager(cfg.limits)
        units = state["units"].get(sym, 0.0)
        rm.update(day=str(ts.date()), equity=equity, price=price,
                  position_frac=units * price / equity if equity > 0 else 0.0)
        allowed = rm.allow(wanted, price=price, in_position=units > 0)
        was_stop = rm.stopped_out and units > 0
        allowed *= state["multiplier"]
        state["risk"][sym] = rm.to_dict()

        target_units = allowed * equity / price if allowed > 0 else 0.0
        exposure_now = sum(u * prices.get(s, 0) for s, u in state["units"].items()) / equity
        if target_units > units and exposure_now + (target_units - units) * price / equity \
                > cfg.max_total_exposure:
            target_units = units  # total exposure cap: no new buying
        delta = target_units - units
        band = 0.05 * equity / price
        if not allow_orders or (abs(delta) <= band and not (target_units == 0 and units > 0)):
            continue
        side = "buy" if delta > 0 else "sell"
        qty = abs(delta) if side == "buy" else (units if target_units == 0 else abs(delta))
        fill = broker.market_order(sym, side, qty, price)
        if side == "buy":
            cost = fill.units * fill.price + fill.fee
            if cost > state["cash"]:
                continue
            state["cash"] -= cost
            state["units"][sym] = units + fill.units
            if units == 0:
                state["entries"][sym] = {"price": fill.price, "ts": str(ts), "equity": equity}
        else:
            state["cash"] += fill.units * fill.price - fill.fee
            state["units"][sym] = units - fill.units
            if state["units"][sym] <= 1e-12:
                state["units"].pop(sym, None)
                ent = state["entries"].pop(sym, None)
                if ent:
                    ret = fill.price / ent["price"] - 1
                    held = max(1, int((pd.Timestamp(ts) - pd.Timestamp(ent["ts"])) /
                                      pd.Timedelta(minutes=a.interval_minutes)))
                    state["trades"].append({"symbol": sym, "entry": ent["ts"], "exit": str(ts),
                                            "ret": ret, "bars_held": held,
                                            "reason": "stop_loss" if was_stop else "signal"})
                    lessons = postmortem([t for t in state["trades"] if t["symbol"] == sym],
                                         state["multiplier"])
                    state["multiplier"] = lessons.size_multiplier
                    if lessons.cooldown_bars:
                        state["cooldown"][sym] = lessons.cooldown_bars
                    if lessons.retrain_requested:
                        state["retrain_requested"][sym] = True
                    for n in lessons.notes:
                        _log(state, ts, f"{sym}: lesson: {n}")
        prices[sym] = price
        _log(state, ts, f"{sym}: {side} {fill.units:.6f} @ {fill.price:.2f} (fee {fill.fee:.2f})")

    equity = state["cash"] + sum(u * prices.get(s, 0.0) for s, u in state["units"].items())
    stamp = max([df.index[-1] for df in data.values()], default=None)
    if stamp is not None and (not state["equity_history"]
                              or state["equity_history"][-1]["ts"] != str(stamp)):
        state["equity_history"].append({"ts": str(stamp), "equity": equity})
    return state
