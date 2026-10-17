# Changelog
Format: Keep a Changelog. Versioning: SemVer.

## [0.5.0] - 2026-10-17
### Added
- Terminal v2: Kraken + Binance + Coinbase markets, tick-by-tick live candles, 16 timeframes
  including 1s/5s/15s/30s, MACD, trendlines, Heikin Ashi, practice (fake-money) trading, tape,
  connection diagnostics. Node tests for core, providers, indicators.

## [0.4.0] - 2026-10-17
### Added
- Charts terminal: all Kraken markets, 7 timeframes, indicators, drawing, watchlist, live ticks,
  bot trade overlay. Indicator tests run in CI.

## [0.3.0] - 2026-10-17
### Added
- Chart site (`site/`): candlesticks with entry/exit markers, live Kraken prices, positions,
  equity, trades, decision log. Workflow exports chart data and can deploy to GitHub Pages.
- Trades now record entry and exit prices.

## [0.2.0] - 2026-10-17
### Added
- Kraken public connector, paper broker, runner with persisted state and CLI.
- Learning layer: re-selection with validation gate, post-mortem size adaption, drift monitor.
- Live gate and Kraken adapter (validate-only, not wired to any job).
- GitHub Actions hourly paper-trading workflow. 39 tests.

## [0.1.0] - 2026-10-17
### Added
- Data loading and OHLC validation; synthetic generator.
- Cost model, shared RiskManager, next-open backtester.
- Baseline strategies: buy-and-hold, SMA cross, breakout, mean reversion.
- Metrics, walk-forward, permutation test, Monte Carlo trade resampling.
- CLI, CI workflow, 29 automated tests.
