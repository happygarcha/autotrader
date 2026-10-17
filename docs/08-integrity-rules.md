# Integrity rules (owner's standing order, 2026-10-17)

"Do not fake anything at any time." These rules bind every change to this project.

1. **No invented results.** Every number shown (equity, trades, returns, prices, candles) comes
   from the bot's own saved state or from the exchange's public data. Nothing is typed in by hand,
   estimated, rounded up, or back-filled.
2. **Synthetic data is for unit tests only.** It never appears on the live site, in reports, or in
   any figure presented as a result. Anything built on synthetic data is labelled as such.
3. **Paper trading is a simulation and is always called that.** Fills are modelled (price moved by
   assumed slippage, plus the exchange's published fee rate). Paper results are evidence, not proof,
   and are described that way. Costs are set to be conservative, never flattering.
4. **Losses are reported like wins.** No deleting trades, no resetting an account after a bad run,
   no restarting the clock. If a state file is ever reset it is logged in the events with the reason
   and the old state stays in git history. The `paper-state` branch history is the audit trail.
5. **No cherry-picking.** Every account (main and fast lab) and every tested strategy variant is
   reported, including the ones that failed. The number of variants tested accompanies any
   "best strategy" claim.
6. **Gates are not bypassed.** Real money requires the live gate (28 paper days, drawdown inside
   limits, owner-approved limits file). Results from the fast lab do not count toward it.
7. **Backtests are labelled backtests.** They are never presented as live or paper results.
8. **Known simulation limits are stated.** Paper fills assume the order executes at the bar close
   plus slippage; real orders can fill worse. Backtests cannot show regime changes.
9. **Changes to results code need a test** and are listed in the CHANGELOG.
