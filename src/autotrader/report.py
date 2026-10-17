"""Plain-text and JSON reports so results are reviewable and reproducible."""

from __future__ import annotations

import json

from .metrics import Metrics


def format_table(rows: dict[str, Metrics]) -> str:
    head = f"{'strategy':<28}{'return':>9}{'cagr':>8}{'sharpe':>8}{'maxDD':>8}{'trades':>8}" \
           f"{'winrate':>9}{'PF':>7}{'costs':>10}"
    lines = [head, "-" * len(head)]
    for name, m in rows.items():
        pf = "inf" if m.profit_factor == float("inf") else f"{m.profit_factor:.2f}"
        lines.append(f"{name:<28}{m.total_return:>9.1%}{m.cagr:>8.1%}{m.sharpe:>8.2f}"
                     f"{m.max_drawdown:>8.1%}{m.trades:>8d}{m.win_rate:>9.1%}{pf:>7}"
                     f"{m.total_costs:>10.0f}")
    return "\n".join(lines)


def to_json(rows: dict[str, Metrics]) -> str:
    return json.dumps({k: v.as_dict() for k, v in rows.items()}, indent=2, default=str)
