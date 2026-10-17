# Safety and risk

## Risk limits (defaults, set by owner)
| Limit | Default | Behaviour |
|---|---|---|
| Max position | 25% of equity | clamps every order |
| Stop-loss | 8% below entry | exit; no re-entry until strategy goes flat |
| Daily loss | 3% | halt until next day |
| Max drawdown | 15% from peak | halt until the owner resets |
| Leverage / shorting | none | not implemented |

## Failure modes and responses
| Failure | Response |
|---|---|
| Stale or missing data | no new orders, alert |
| Exchange/API error | retry with backoff, then halt and alert |
| Order not filled as expected | reconcile, halt on mismatch |
| Price spike beyond threshold | halt |
| Engine crash | restart from persisted state; open positions keep their stops at the exchange |
| Strategy decays | weekly live-vs-backtest drift check; auto-halt beyond band |
| Key leak | keys cannot withdraw; revoke at exchange; rotate |

## Model risk
Backtests overstate live results (fills, slippage, regime change). Mitigations: costs doubled in
stress tests, paper stage, small live stage, hard limits independent of statistics.

## Legal and tax (owner)
Trading is legal for personal use in most places; gains are taxable. Keep the trade log.
Offering this to other people is regulated (see release plan).
