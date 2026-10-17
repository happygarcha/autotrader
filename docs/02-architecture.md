# Architecture

## Principle
One engine, many thin clients. The engine decides and trades; apps only display and control.

```
 [Windows/macOS app]  [iOS app]  [Android app]      <- one Flutter codebase (ADR-0003)
          \               |            /
           \     HTTPS + token (TLS)  /
            +---->  Control API  <---+                (FR-12, planned)
                       |
        +--------------+-------------------+
        |           ENGINE (Python)        |
        |  Scheduler -> Data -> Strategy   |
        |       -> RiskManager -> Broker   |
        |  Trade log / metrics / reports   |
        +--------------+-------------------+
                       |
          Broker adapter: Backtest | Paper | Live exchange
```

## Modules (current)
| Module | Responsibility |
|---|---|
| `data` | load/validate OHLC; synthetic data |
| `strategies` | `Strategy.target_positions(df)`: wished exposure 0..1 per bar |
| `risk` | `RiskLimits` (immutable) + `RiskManager`: clamps wishes to limits, halts |
| `costs` | fee + slippage per side |
| `backtest` | decision at close t, fill at open t+1, mark at close t+1 |
| `metrics`, `report` | evaluation and output |
| `validation` | walk-forward, permutation test, Monte Carlo |

## Planned modules
- `broker/` interface `Broker.submit(order)`, with `SimBroker` (backtest/paper) and one live adapter.
- `runner/` scheduler loop: fetch bars -> signals -> risk -> orders -> log.
- `store/` SQLite (trade log, state), later Postgres if hosted.
- `api/` FastAPI control service (read status, set owner-approved limits, kill switch).

## Where it runs
- **Engine:** always-on host (small VPS or home server). Phones cannot run it reliably because
  mobile operating systems suspend background apps (ADR-0002).
- **Desktop apps:** can talk to a remote engine, or bundle a local engine for personal use.
- **Mobile apps:** monitor and control only. They never hold exchange keys.

## Security model
- Exchange keys: trade-only, withdrawals disabled, IP allow-listed, stored in the host's
  secret store, never sent to clients.
- Client auth: per-device revocable token; kill switch needs only that token.
- Limits can be loosened only from an authenticated owner session with a confirmation delay.
- Audit log of every order, limit change and halt.

## Key interfaces (stable)
```python
class Strategy:   target_positions(df) -> pd.Series      # 0..1, uses data <= t only
class RiskManager: update(day, equity, price, position_frac); allow(wanted, price, in_position)
run_backtest(df, strategy, costs=, limits=) -> BacktestResult
```
