"""Command line: compare strategies on a CSV (or synthetic data) and run validation."""

from __future__ import annotations

import argparse
import sys

from .backtest import run_backtest
from .data import load_csv, synthetic_prices
from .metrics import compute_metrics
from .report import format_table
from .strategies import Breakout, BuyAndHold, MeanReversion, SmaCross
from .validation import permutation_test, walk_forward


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="autotrader", description=__doc__)
    ap.add_argument("--csv", help="OHLC csv (timestamp,open,high,low,close). Default: synthetic")
    ap.add_argument("--validate", action="store_true",
                    help="also run walk-forward and permutation tests (slower)")
    args = ap.parse_args(argv)

    df = load_csv(args.csv) if args.csv else synthetic_prices(1500, seed=0)
    if not args.csv:
        print("NOTE: synthetic random-walk data. Results here prove nothing about real markets.")
    strategies = [BuyAndHold(), SmaCross(20, 100), Breakout(55, 20), MeanReversion(20, 2.0)]
    rows = {f"{s.name} {s.params()}": compute_metrics(run_backtest(df, s)) for s in strategies}
    print(format_table(rows))

    if args.validate:
        wf = walk_forward(df, SmaCross, {"fast": [10, 20, 30], "slow": [60, 100, 150]},
                          train_bars=500, test_bars=250)
        print(f"\nwalk-forward SMA: {len(wf.folds)} folds, trials/fold={wf.n_trials}, "
              f"OOS return={wf.equity.iloc[-1] / wf.equity.iloc[0] - 1:.1%}")
        pt = permutation_test(df, SmaCross(20, 100), n=100)
        print(f"permutation test SMA(20,100): sharpe={pt['real']:.2f} "
              f"shuffled mean={pt['shuffled_mean']:.2f} p={pt['p_value']:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
