# Autotrader terminal (chart site)

Static page: candlestick charts with entry/exit markers, live Kraken prices (WebSocket),
positions, equity curve, trade history and the bot's decision log.

- Data comes from `data/paper.json` and `data/candles.json`, written every hour by the
  `paper-trading` workflow (and kept on the `paper-state` branch).
- Chart library: TradingView Lightweight Charts v4.2.0 (Apache-2.0), vendored in `vendor/`.
- Local preview: copy a data folder into `site/data/`, then `python3 -m http.server` in `site/`.
- Hosting: GitHub Pages (free, requires a public repo) or any static host. To enable Pages:
  repo Settings -> Pages -> Source: GitHub Actions. The hourly workflow then redeploys the site.

## Charts terminal (`terminal.html`)
Every Kraken spot market (search any pair), timeframes 1m to 1W, candles or line, SMA/EMA/Bollinger/
Volume/RSI, horizontal-line drawing, a watchlist with live prices, and the bot's paper entries/exits
drawn on the chart for markets it trades. Data and live ticks come straight from Kraken's public API
in the viewer's browser. Only crypto is included: free live stock/forex data needs the user's own API
key and has strict limits. Selecting a market in the page does not make the bot trade it; the bot's
markets are set in `config/*.json`.
Tests: `node tests/site/indicators.test.js` (indicator maths). `tests/site/mock_kraken.js` is a
test-only stand-in for Kraken's response shapes and is never deployed.
