"""Gate that must pass before ANY real order can be sent.

All conditions are checked every cycle, not just once:
  1. env AUTOTRADER_LIVE == "YES_I_ACCEPT_THE_RISK"
  2. file LIVE_APPROVED exists and holds the owner's approved limits (JSON) that match config
  3. paper evidence: at least `min_paper_days` of paper history and drawdown inside limits
  4. kill switch file KILL is absent
Anything missing means paper mode. Gate failures never raise into the trading loop; they just
return reasons.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from .risk import RiskLimits


@dataclass
class GateResult:
    allowed: bool
    reasons: list[str]


def check_live_gate(root: Path, limits: RiskLimits, paper_days: int, paper_max_dd: float,
                    min_paper_days: int = 28, env: dict | None = None) -> GateResult:
    env = os.environ if env is None else env
    reasons: list[str] = []
    if (root / "KILL").exists():
        reasons.append("KILL switch file present")
    if env.get("AUTOTRADER_LIVE") != "YES_I_ACCEPT_THE_RISK":
        reasons.append("AUTOTRADER_LIVE not set to the confirmation phrase")
    approved = root / "LIVE_APPROVED"
    if not approved.exists():
        reasons.append("LIVE_APPROVED file missing (owner has not approved limits)")
    else:
        try:
            a = json.loads(approved.read_text())
            if RiskLimits(**a["limits"]) != limits:
                reasons.append("approved limits differ from running limits")
        except (ValueError, KeyError, TypeError):
            reasons.append("LIVE_APPROVED is unreadable or invalid")
    if paper_days < min_paper_days:
        reasons.append(f"only {paper_days} paper days (< {min_paper_days})")
    if paper_max_dd > limits.max_drawdown_frac:
        reasons.append("paper drawdown exceeded the max drawdown limit")
    return GateResult(not reasons, reasons)
