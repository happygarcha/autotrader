"""Market data connectors. Public endpoints only; no keys needed for paper trading.

Each connector returns a validated OHLC DataFrame of COMPLETED bars (the still-forming bar is
dropped so decisions never use a half-built candle).
"""

from __future__ import annotations

import json
import urllib.request
from collections.abc import Callable
from typing import Protocol

import pandas as pd

from .data import validate_ohlc

HttpGet = Callable[[str], str]


def http_get(url: str, timeout: float = 20.0) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "autotrader/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (https only, fixed hosts)
        return r.read().decode()


class Connector(Protocol):
    def fetch_ohlc(self, symbol: str, interval_minutes: int) -> pd.DataFrame: ...


class KrakenPublic:
    """Kraken public OHLC (crypto, includes CAD pairs). Max ~720 bars per call."""

    BASE = "https://api.kraken.com/0/public/OHLC"

    def __init__(self, get: HttpGet = http_get) -> None:
        self._get = get

    def fetch_ohlc(self, symbol: str, interval_minutes: int = 1440) -> pd.DataFrame:
        payload = json.loads(self._get(f"{self.BASE}?pair={symbol}&interval={interval_minutes}"))
        return self.parse(payload)

    @staticmethod
    def parse(payload: dict) -> pd.DataFrame:
        if payload.get("error"):
            raise RuntimeError(f"Kraken error: {payload['error']}")
        result = payload["result"]
        key = next(k for k in result if k != "last")
        rows = result[key]
        df = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "vwap",
                                         "volume", "count"])
        df.index = pd.to_datetime(df.pop("time").astype(int), unit="s", utc=True)
        df = df[["open", "high", "low", "close", "volume"]].astype(float)
        df = df.iloc[:-1]  # last row is the bar still forming
        return validate_ohlc(df)


CONNECTORS: dict[str, Callable[[], Connector]] = {"kraken": KrakenPublic}
# Planned adapters (same interface): "alpaca" (US stocks/ETFs), "oanda" (forex), "yahoo"-style
# research data. They need account keys or have usage terms; add per ADR when chosen.
