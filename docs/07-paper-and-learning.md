# Paper trading, self-learning and going live

## What runs
`python -m autotrader.paper_cli` runs one cycle: fetch completed daily bars (Kraken public data,
CAD pairs), re-select strategy if due, ask the strategy for a wish, clamp it with the RiskManager,
fill with the PaperBroker (fees and slippage), save state to JSON, write `report.md`.
Scheduled hourly by `.github/workflows/paper.yml` (free). The bot acts only when a new daily
bar has closed; other runs are no-ops. State lives on the `paper-state` branch.

## Markets
- Crypto: implemented (Kraken public candles, CAD pairs: XBTCAD, XETHCAD, SOLCAD configured).
- Stocks/ETFs and forex: same `Connector` interface; adapters need a free broker data key
  (e.g. Alpaca for US stocks, OANDA for forex) and are planned (S4). The engine is
  market-agnostic; the risk limits apply to every asset the same way.

## How the bot "learns from mistakes" (and what it will not do)
1. **Re-selection (every 7 bars, or on request):** test a pool of strategies and parameters on the
   unseen last 35% of recent data. A variant is accepted only if it is profitable after costs,
   has Sharpe > 0.3 and at least 3 trades there, and at least half its neighbouring parameters
   are also profitable (so a lucky single setting is rejected). If nothing passes, the asset
   goes to **cash**. Staying out is a valid decision.
2. **Post-mortem after each closed trade:** two losses in a row halve the position size
   (floor 25%); two wins restore it. A stop-loss exit adds a 5-bar cool-down. If losses are
   mostly quick whipsaws, a retrain is requested.
3. **Drift monitor:** if live drawdown exceeds 1.5x what validation saw (minimum 5%), the asset
   is held in cash and a retrain is requested.
4. Every change is written to the events log with its reason.

It will not: rewrite its strategy after one loss (that is overfitting to noise), loosen the hard
limits, add leverage, or promise profit. "Aim for profit" means: only trade what passes tests, cut
size when it is wrong, and stand aside when nothing works.

## Going live (Canada, crypto first)
Live is built but **not wired into any scheduled job**. Pieces that exist:
- `live_gate.py`: every one of these must hold, every cycle: env `AUTOTRADER_LIVE` confirmation
  phrase; a `LIVE_APPROVED` file written by the owner containing the exact limits in use;
  at least 28 days of paper history; paper drawdown inside the limit; no `KILL` file.
- `kraken_live.py`: Kraken spot adapter (signature verified against Kraken's published test
  vector). Orders are **validate-only** (Kraken checks the order but does not place it) unless
  explicitly switched on. It has no withdrawal function.
Still to do before real money (owner decisions, S5): connect `KrakenBroker` into a separate live
entry point with its own state file; reconciliation against exchange balances; API key created at
Kraken with trade-only permission and no withdrawal; funds limited to what you accept losing.
Why not already switched on: the gate requires paper evidence first, and wiring real orders is
a step the owner should approve explicitly.

## Owner setup (GitHub, free)
1. Create an empty private repo `autotrader` in your GitHub account.
2. Push this project to it (or give Claude access to that repo).
3. Actions -> enable workflows -> run `paper-trading` once by hand.
4. Read `report.md` on the `paper-state` branch, or ask Claude to summarise it.
Note: GitHub pauses scheduled workflows after 60 days of repo inactivity on public repos; a
private repo is not affected, but monthly minutes are limited (about 2,000 on the free plan;
this job uses about 1 minute per run, so hourly runs fit).
