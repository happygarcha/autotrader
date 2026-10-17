# Requirements (v0.1)

Priority: M = must, S = should, C = could. Status: Done / Planned.

## Functional
| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-01 | Load OHLC history from CSV and reject malformed data | M | Done |
| FR-02 | Backtest long-only spot strategies with fees and slippage | M | Done |
| FR-03 | Execute at next bar open; no look-ahead | M | Done |
| FR-04 | Report return, CAGR, Sharpe, Sortino, max drawdown, win rate, profit factor | M | Done |
| FR-05 | Walk-forward, permutation and Monte Carlo validation | M | Done |
| FR-06 | Pluggable strategy interface | M | Done |
| FR-07 | Exchange data connector (public candles) | M | Planned S2 |
| FR-08 | Paper-trading runner using the live code path | M | Planned S3 |
| FR-09 | Live execution adapter (one exchange/broker) behind the same interface | M | Planned S5 |
| FR-10 | Persistent trade log with reason for every order | M | Planned S3 |
| FR-11 | Daily and weekly performance report | S | Planned S4 |
| FR-12 | Local/remote API for clients (status, positions, limits view, kill switch) | M | Planned S6 |
| FR-13 | Client apps: Windows, macOS, iOS, Android | S | Planned S7+ |
| FR-14 | Alerts (push/email) on halts, errors, drift from backtest | S | Planned S6 |

## Safety (see 04-safety-and-risk.md)
| ID | Requirement | Pri | Status |
|---|---|---|---|
| SAF-01 | Max position fraction enforced on every order | M | Done |
| SAF-02 | Stop-loss per position; no re-entry until strategy goes flat | M | Done |
| SAF-03 | Daily loss limit halts trading until next day | M | Done |
| SAF-04 | Max drawdown halt that only the owner can reset | M | Done |
| SAF-05 | Kill switch: stop and cancel open orders | M | Planned S5 |
| SAF-06 | Auto-halt on stale data, API errors, order mismatch | M | Planned S5 |
| SAF-07 | Spot, long-only, no leverage/margin/derivatives | M | Done (by design) |
| SAF-08 | API keys trade-only, no withdrawal permission | M | Planned S5 |
| SAF-09 | Strategy code cannot modify RiskLimits at runtime | M | Done (frozen dataclass) |

## Non-functional
| ID | Requirement | Pri |
|---|---|---|
| NFR-01 | Deterministic: same data + params give identical results | M |
| NFR-02 | Same RiskManager used in backtest, paper and live | M |
| NFR-03 | Secrets never in git, logs or client apps | M |
| NFR-04 | Engine runs headless 24/7 on a small server | M |
| NFR-05 | Backtest of 5 years daily data per strategy < 5 s | S |
| NFR-06 | All money-touching modules >= 90% line coverage | S |
| NFR-07 | Every release has changelog, version tag and reproducible build | M |

## Out of scope for v1
Leverage, shorting, options/futures, high-frequency trading, managing other people's money.
