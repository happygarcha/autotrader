# Test plan

## Levels
| Level | Tooling | What |
|---|---|---|
| Unit | pytest | each module: data validation, risk rules, metrics, strategies |
| Property | pytest | no look-ahead: signals on truncated data equal signals on full data |
| Integration | pytest | backtest with strategy + costs + risk; deterministic output |
| Statistical validation | `validation.py` | walk-forward, permutation test, Monte Carlo |
| Paper trading | runner (S3) | 4-8 weeks live prices, fake money |
| Reconciliation (live) | runner (S5) | exchange fills vs engine records, every cycle |
| Security | review + secret scan | before G3 and G5 |

## Strategy acceptance criteria (gate G2)
A strategy is promoted to paper trading only if ALL hold:
1. Walk-forward out-of-sample return beats buy-and-hold on risk-adjusted terms (Sharpe), after costs.
2. Permutation test p-value < 0.05 on the evaluated asset.
3. Works (not necessarily best) on at least 3 assets and 3 distinct years/regimes.
4. Neighbouring parameter values do not flip the sign of the result.
5. Max drawdown inside the owner's limit; Monte Carlo 95th-percentile drawdown inside 1.5x the limit.
6. At least 30 trades in the evaluated period.
7. Results still positive when costs are doubled.
The number of strategies and parameter sets tried is logged and reported with the result.

## Gate G3 (live small)
Paper results over 4-8 weeks fall inside the backtest's Monte Carlo 5th-95th percentile band,
and paper slippage/fill assumptions are not worse than modelled by more than 50%.

## Coverage of requirements
Requirement IDs are mapped to tests in `tests/`. Current: 29 tests covering FR-01..FR-06,
SAF-01..SAF-04, SAF-07, SAF-09, NFR-01. Run `pytest -q`.

## Known test gaps (tracked)
- No test against real exchange data yet (needs FR-07).
- No failure injection for API outages (needs FR-09).
- Intrabar stop-loss fills are not modelled; stops trigger on close and exit at next open.
