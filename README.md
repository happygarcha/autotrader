# Autotrader

Autonomous long-only spot trading engine. It backtests strategies with realistic costs,
validates them against overfitting, paper-trades them, and (only after gates are passed)
trades live inside hard risk limits that the strategy cannot override.

**Status:** v0.1.0, Phase 1 (research engine). No exchange connection, no real money.
**Independent project:** nothing here shares code, keys or infrastructure with any other project.

> Trading can lose all invested money. No result in this repo is a promise of profit.
> Results on `synthetic_prices` data prove nothing about real markets.

## Quick start
```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest -q
.venv/bin/python -m autotrader.cli --validate            # synthetic data demo
.venv/bin/python -m autotrader.cli --csv data/BTCUSD_1d.csv --validate
```
CSV format: `timestamp,open,high,low,close[,volume]`.

## Layout
| Path | Purpose |
|---|---|
| `src/autotrader/data.py` | CSV loading, OHLC validation, synthetic data |
| `src/autotrader/costs.py` | Fee + slippage model |
| `src/autotrader/risk.py` | Hard limits (position cap, stop, daily loss, drawdown halt) |
| `src/autotrader/strategies/` | Strategy interface and baselines |
| `src/autotrader/backtest.py` | Next-open execution backtester |
| `src/autotrader/metrics.py` | Return, Sharpe, Sortino, drawdown, profit factor |
| `src/autotrader/validation.py` | Walk-forward, permutation test, Monte Carlo |
| `docs/` | Process, requirements, architecture, test plan, safety, release plan, ADRs |

## Documentation
Start with [docs/00-process.md](docs/00-process.md), then
[requirements](docs/01-requirements.md), [architecture](docs/02-architecture.md),
[test plan](docs/03-test-plan.md), [safety](docs/04-safety-and-risk.md),
[release plan](docs/05-release-plan.md), [roadmap](docs/06-roadmap.md).
