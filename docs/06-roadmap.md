# Roadmap (2-week sprints)

| Sprint | Goal | Closes |
|---|---|---|
| S1 (done) | Research engine: data, costs, risk, backtester, metrics, validation, CLI, CI | FR-01..06, SAF-01..04,07,09 |
| S2 (done, untested live) | Kraken public-candle connector; parsing tested on fixtures; live fetch to be verified by first Actions run | FR-07 |
| S3 (done) | Broker interface, paper broker, runner, JSON trade log, learning layer, GitHub Actions | FR-08, FR-10 |
| S4 | Scheduler, daily/weekly reports, drift monitor | FR-11 |
| S5 | One live adapter, reconciliation, kill switch, auto-halts, key handling | FR-09, SAF-05,06,08 |
| S6 | Control API, alerts | FR-12, FR-14 |
| S7 | Flutter app: status, positions, report, kill switch (desktop + mobile) | FR-13 |
| S6b | MT5 Expert Advisor port with parity test and Strategy Tester report (ADR-0005) | FR-15 |
| S8 | Packaging, signing, store/TestFlight builds, security review | NFR-07 |

Gates G2/G3 sit between S3-S5 and are time-based (paper period), not sprint-based.
