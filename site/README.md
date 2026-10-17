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
- **Markets:** every spot market on Kraken, Binance and Coinbase (search any pair, filter by exchange
  and quote currency). Stocks and forex are not included: no keyless live source exists for them.
- **Live:** one WebSocket per exchange streams every trade; the forming candle moves with each trade,
  and the tape shows trades as they print. The header shows ticks per second, and the Connections
  panel shows each exchange's state, tick count and time since the last tick.
- **Timeframes:** 1s, 5s, 15s, 30s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1D, 1W. History for
  seconds exists on Binance only (1-second candles). On Kraken and Coinbase the sub-minute charts are
  built from live trades starting when the page is opened. Timeframes an exchange lacks are aggregated
  from finer candles.
- **Chart:** candles, Heikin Ashi, bars, line, area; log scale; SMA, EMA, Bollinger, volume, RSI, MACD;
  horizontal lines and trendlines; local-time axis; snapshot download; fullscreen.
- **Practice trading:** buy/sell with fake money (market and limit orders, 0.26% fee + 0.1% slippage
  on market orders), spot and long-only. Stored in the browser only; one virtual wallet per quote
  currency. Limit orders fill when price touches them, which is optimistic compared with a real queue.
- **Bot overlay:** the bot's paper entries/exits for Kraken markets it trades. Choosing a market in the
  page does not make the bot trade it; the bot's markets are set in `config/*.json`.
- No code in this site can place a real order.
Tests: `node tests/site/{indicators,core,providers}.test.js`. `tests/site/mock_exchanges.js` is a
test-only stand-in for the exchanges' response shapes and is never deployed.
