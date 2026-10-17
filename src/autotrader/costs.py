"""Trading cost model. Every backtest and paper trade pays these costs."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CostModel:
    """Proportional costs charged on traded notional.

    fee_rate: exchange fee per side (0.001 = 0.1%).
    slippage_rate: assumed adverse price move per side (0.0005 = 0.05%).
    """

    fee_rate: float = 0.001
    slippage_rate: float = 0.0005

    def __post_init__(self) -> None:
        if self.fee_rate < 0 or self.slippage_rate < 0:
            raise ValueError("costs cannot be negative")

    @property
    def per_side(self) -> float:
        return self.fee_rate + self.slippage_rate

    def cost(self, notional: float) -> float:
        """Cost in currency for trading `notional` (absolute value used)."""
        return abs(notional) * self.per_side
