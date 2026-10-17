"""Broker interface and the paper broker. Live brokers implement the same interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from .costs import CostModel


@dataclass
class Fill:
    symbol: str
    side: str  # "buy" or "sell"
    units: float
    price: float
    fee: float


class Broker(ABC):
    @abstractmethod
    def market_order(self, symbol: str, side: str, units: float, ref_price: float) -> Fill:
        """Execute at (or near) ref_price and return the fill."""


class PaperBroker(Broker):
    """Simulated fills: reference price moved by slippage, plus exchange fee."""

    def __init__(self, costs: CostModel | None = None) -> None:
        self.costs = costs or CostModel()

    def market_order(self, symbol: str, side: str, units: float, ref_price: float) -> Fill:
        if side not in ("buy", "sell") or units <= 0 or ref_price <= 0:
            raise ValueError("invalid order")
        slip = self.costs.slippage_rate
        price = ref_price * (1 + slip) if side == "buy" else ref_price * (1 - slip)
        return Fill(symbol, side, units, price, units * price * self.costs.fee_rate)
