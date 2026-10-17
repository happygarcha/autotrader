"""Hard risk limits. Shared by backtest, paper and live so all three behave the same.

The strategy proposes a target position (fraction of equity, 0..1). The RiskManager
may reduce it or force it to zero. Nothing downstream can override a halt.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskLimits:
    max_position_frac: float = 0.25  # largest fraction of equity in the market
    stop_loss_frac: float = 0.08  # exit if price falls this far below entry
    daily_loss_limit_frac: float = 0.03  # halt for the day after losing this much
    max_drawdown_frac: float = 0.15  # halt until owner resets after this drawdown from peak

    def __post_init__(self) -> None:
        for name in ("max_position_frac", "stop_loss_frac", "daily_loss_limit_frac",
                     "max_drawdown_frac"):
            v = getattr(self, name)
            if not 0 < v <= 1:
                raise ValueError(f"{name} must be in (0, 1], got {v}")


class RiskManager:
    """Stateful gate between strategy output and orders."""

    def __init__(self, limits: RiskLimits) -> None:
        self.limits = limits
        self.peak_equity: float | None = None
        self.day_start_equity: float | None = None
        self.current_day: object = None
        self.entry_price: float | None = None
        self.halted_for_day = False
        self.halted_until_reset = False
        self.stopped_out = False
        self.halt_reason = ""

    def reset_halt(self) -> None:
        """Owner action: clear a drawdown halt and restart the peak from current equity."""
        self.halted_until_reset = False
        self.halt_reason = ""
        self.peak_equity = None

    def update(self, *, day: object, equity: float, price: float, position_frac: float) -> None:
        """Record the latest equity/price. Call before `allow` on every decision bar."""
        if self.current_day != day:
            self.current_day = day
            self.day_start_equity = equity
            self.halted_for_day = False
        if self.peak_equity is None or equity > self.peak_equity:
            self.peak_equity = equity

        lim = self.limits
        if (not self.halted_until_reset
                and equity <= self.peak_equity * (1 - lim.max_drawdown_frac)):
            self.halted_until_reset = True
            self.halt_reason = "max drawdown reached"
        if (not self.halted_for_day and self.day_start_equity
                and equity <= self.day_start_equity * (1 - lim.daily_loss_limit_frac)):
            self.halted_for_day = True

        if position_frac <= 0:
            self.entry_price = None
        elif self.entry_price is None:
            self.entry_price = price

    def allow(self, wanted_frac: float, *, price: float, in_position: bool) -> float:
        """Clamp the strategy's wished fraction to what the limits permit."""
        lim = self.limits
        if wanted_frac <= 0:
            self.stopped_out = False  # strategy stepped aside; re-entry allowed again
        if self.halted_until_reset or self.halted_for_day:
            return 0.0
        if in_position and self.entry_price is not None:
            if price <= self.entry_price * (1 - lim.stop_loss_frac):
                self.stopped_out = True
        if self.stopped_out:
            return 0.0  # no re-entry until the strategy first goes flat
        return max(0.0, min(wanted_frac, lim.max_position_frac))
