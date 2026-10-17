# Autotrader terminal (chart site)

Static page: candlestick charts with entry/exit markers, live Kraken prices (WebSocket),
positions, equity curve, trade history and the bot's decision log.

- Data comes from `data/paper.json` and `data/candles.json`, written every hour by the
  `paper-trading` workflow (and kept on the `paper-state` branch).
- Chart library: TradingView Lightweight Charts v4.2.0 (Apache-2.0), vendored in `vendor/`.
- Local preview: copy a data folder into `site/data/`, then `python3 -m http.server` in `site/`.
- Hosting: GitHub Pages (free, requires a public repo) or any static host. To enable Pages:
  repo Settings -> Pages -> Source: GitHub Actions, then Settings -> Variables -> add
  `ENABLE_PAGES` = `true`.
