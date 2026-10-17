const assert = require("node:assert");
const P = require("../../site/providers.js");
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

// Kraken symbols: REST names are mapped to the WebSocket v2 names
const ks = P.kraken.parseSymbols({ error: [], result: {
  XXBTZCAD: { altname: "XBTCAD", wsname: "XBT/CAD", status: "online" },
  XDGUSD: { altname: "XDGUSD", wsname: "XDG/USD", status: "online" },
  OLD: { altname: "OLD", wsname: "OLD/USD", status: "cancel_only" } } });
assert.deepStrictEqual(ks.map((s) => s.label), ["BTC/CAD", "DOGE/USD"]);
assert.strictEqual(ks[0].id, "XBTCAD"); assert.strictEqual(ks[0].ws, "BTC/CAD");
// Kraken candles
const kc = P.kraken.parseCandles({ error: [], result: { XXBTZCAD: [[1700000000, "1", "3", "0.5", "2", "1.5", "10", 4]], last: 1 } });
assert.deepStrictEqual(kc, [{ time: 1700000000, open: 1, high: 3, low: 0.5, close: 2, volume: 10 }]);
// Kraken trade tick (v2) and snapshot ignored
const kt = P.kraken.parseTicks({ channel: "trade", type: "update", data: [{ symbol: "BTC/CAD", side: "buy", qty: 0.5, price: 100.5, timestamp: "2026-10-17T06:00:00.250000Z" }] }, (w) => (w === "BTC/CAD" ? "XBTCAD" : null));
assert.strictEqual(kt.length, 1); assert.strictEqual(kt[0].id, "XBTCAD"); near(kt[0].time, Date.parse("2026-10-17T06:00:00.250Z") / 1000);
assert.deepStrictEqual(P.kraken.parseTicks({ channel: "trade", type: "snapshot", data: [{}] }, () => "x"), []);
assert.deepStrictEqual(P.kraken.parseTicks({ channel: "heartbeat" }, () => "x"), []);
// Binance
const bs = P.binance.parseSymbols({ symbols: [{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" }, { symbol: "XXXBTC", baseAsset: "XXX", quoteAsset: "BTC", status: "BREAK" }] });
assert.strictEqual(bs.length, 1); assert.strictEqual(bs[0].label, "BTC/USDT");
assert.ok(P.binance.native.includes(1) && P.binance.native.includes(604800));
assert.deepStrictEqual(P.binance.parseCandles([[1700000000000, "1", "2", "0.5", "1.5", "7", 0]]), [{ time: 1700000000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 7 }]);
const bt = P.binance.parseTicks({ e: "trade", s: "BTCUSDT", p: "100.1", q: "0.2", T: 1700000000123, m: true });
assert.strictEqual(bt[0].side, "sell"); near(bt[0].time, 1700000000.123); assert.deepStrictEqual(P.binance.parseTicks({ result: null, id: 1 }), []);
assert.strictEqual(P.binance.subMsg({ id: "BTCUSDT" }).params[0], "btcusdt@trade");
// Coinbase candles come as [time, low, high, open, close, volume], newest first
const cc = P.coinbase.parseCandles([[120, 1, 4, 2, 3, 9], [60, 0.5, 2, 1, 1.5, 8]]);
assert.deepStrictEqual(cc[0], { time: 60, open: 1, high: 2, low: 0.5, close: 1.5, volume: 8 }); assert.strictEqual(cc[1].time, 120);
const ct = P.coinbase.parseTicks({ type: "match", product_id: "BTC-USD", price: "100", size: "0.1", time: "2026-10-17T06:00:00.5Z", side: "buy" });
assert.strictEqual(ct[0].id, "BTC-USD"); assert.deepStrictEqual(P.coinbase.parseTicks({ type: "subscriptions" }), []);
assert.strictEqual(P.coinbase.parseSymbols([{ id: "BTC-USD", base_currency: "BTC", quote_currency: "USD", status: "online" }])[0].label, "BTC/USD");
// recent trades -> ascending ticks
const krt = P.kraken.parseTrades({ error: [], result: { XXBTZCAD: [[ "100.5", "0.2", 1700000001.5, "b", "m", "", 1 ], [ "100.7", "0.1", 1700000002.25, "s", "l", "", 2 ]], last: "x" } });
assert.deepStrictEqual(krt.map((t) => t.side), ["buy", "sell"]); near(krt[1].time, 1700000002.25); near(krt[0].price, 100.5);
const cbt = P.coinbase.parseTrades([{ time: "2026-10-17T06:00:02Z", price: "2", size: "1", side: "sell" }, { time: "2026-10-17T06:00:01Z", price: "1", size: "1", side: "buy" }]);
assert.strictEqual(cbt[0].price, 1); assert.ok(cbt[1].time > cbt[0].time);
const bnt = P.binance.parseTrades([{ price: "5", qty: "2", time: 1700000000500, isBuyerMaker: false }]); assert.strictEqual(bnt[0].side, "buy"); near(bnt[0].time, 1700000000.5);
console.log("provider parser tests passed");
