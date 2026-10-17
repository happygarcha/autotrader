# ADR-0005: MetaTrader 5 support via a ported Expert Advisor (EA)
Status: proposed (needs owner answers: MT4 or MT5, broker, demo account).

Context: the owner has MetaTrader. MT4/MT5 run automated strategies as Expert Advisors written in
MQL4/MQL5, inside the terminal. The terminal must be running (Windows PC or Windows VPS). The phone
apps cannot run EAs; they can only watch and trade by hand. The macOS terminal is limited.

Options:
A. Port validated strategies to an MQL5 EA, with the same risk limits (SAF-01..04) written in MQL5.
B. Keep the Python engine and drive MT5 through the `MetaTrader5` Python package (Windows only,
   terminal must be running next to Python).

Decision: A is the primary path; B is optional later. Python stays the research and validation lab
(walk-forward, permutation test), and only strategies that pass gate G2 are ported.

Consequences:
- Strategy logic exists twice (Python, MQL5). A parity test exports bars from MT5, runs both, and
  requires matching signals before a port is accepted.
- MT5 Strategy Tester gives a second, independent backtest with the broker's real spreads.
- Run the EA on a Windows VPS (MetaQuotes VPS or broker VPS) for 24/7 operation.
- Brokers on MT5 are mostly forex/CFD with leverage. The EA enforces exposure caps, no martingale,
  no grid, no averaging down; leverage on the account is set low. This revisits ADR-0004 and needs
  owner sign-off.
