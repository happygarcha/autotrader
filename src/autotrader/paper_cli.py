"""Run one PAPER cycle (fake money) and write state plus a human-readable report.

Usage: python -m autotrader.paper_cli --config config/paper.json --state state/paper.json
This entry point only ever uses the PaperBroker. Live trading is intentionally not wired here.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from .broker import PaperBroker
from .live_gate import check_live_gate
from .runner import Config, load_state, run_cycle, save_state


def _dd(eq: pd.Series) -> float:
    return float((1 - eq / eq.cummax()).max()) if len(eq) else 0.0


def write_report(cfg: Config, state: dict, path: Path, gate_reasons: list[str]) -> None:
    eq = pd.Series([e["equity"] for e in state["equity_history"]], dtype=float)
    wins = [t for t in state["trades"] if t["ret"] > 0]
    head = (f"- Equity: {eq.iloc[-1]:.2f} (start {cfg.start_equity:.0f}), "
            f"return {eq.iloc[-1] / cfg.start_equity - 1:.2%}") if len(eq) \
        else "- No equity history yet"
    lines = ["# Autotrader report (PAPER, fake money)", "", head,
             f"- Max drawdown: {_dd(eq):.2%}",
             f"- Closed trades: {len(state['trades'])} (wins {len(wins)})",
             f"- Size multiplier: {state['multiplier']:.2f}",
             f"- Open positions: {state['units'] or 'none'}", "", "## Selected strategies"]
    for s, sel in state["selection"].items():
        lines.append(f"- {s}: {sel['strategy']} {sel['params']} - {sel['reason']}")
    lines += ["", "## Live gate (informational; live is not wired in this entry point)",
              *(f"- {r}" for r in (gate_reasons or ["all conditions met"])),
              "", "## Recent events", *(f"- {e['ts']}: {e['msg']}" for e in state["events"][-15:])]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config/paper.json")
    ap.add_argument("--state", default="state/paper.json")
    ap.add_argument("--report", default="state/report.md")
    ap.add_argument("--root", default=".")
    args = ap.parse_args(argv)

    cfg = Config.load(Path(args.config))
    state = load_state(Path(args.state), cfg)
    hist = state["equity_history"]
    days = (pd.Timestamp(hist[-1]["ts"]) - pd.Timestamp(hist[0]["ts"])).days if len(hist) > 1 else 0
    eq = pd.Series([e["equity"] for e in hist], dtype=float)
    gate = check_live_gate(Path(args.root), cfg.limits, days, _dd(eq))

    state = run_cycle(cfg, state, PaperBroker(cfg.costs))
    save_state(Path(args.state), state)
    write_report(cfg, state, Path(args.report), gate.reasons)
    print(Path(args.report).read_text())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
