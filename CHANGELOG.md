# Changelog
Format: Keep a Changelog. Versioning: SemVer.

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
