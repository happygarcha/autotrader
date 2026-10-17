// TEST ONLY. Mimics the documented response shapes of Kraken, Binance and Coinbase so the UI code
// paths can be exercised offline. Never shipped to the site and never used to produce any result.
(function () {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = () => Math.floor(Date.now() / 1000);
  const series = (iv, n, p0) => { const out = []; let p = p0; const st = Math.floor(now() / iv) * iv; for (let i = n; i > 0; i--) { const o = p; p *= 1 + (rnd() - 0.5) * 0.01; out.push({ t: st - i * iv, o, h: Math.max(o, p) * 1.001, l: Math.min(o, p) * 0.999, c: p, v: rnd() * 5 }); } return out; };
  const json = (o) => Promise.resolve(new Response(JSON.stringify(o)));
  const realFetch = window.fetch;
  window.fetch = (url) => {
    const u = String(url), q = new URL(u, location.href).searchParams;
    if (u.includes("kraken.com") && u.includes("AssetPairs")) return json({ error: [], result: { XXBTZCAD: { altname: "XBTCAD", wsname: "XBT/CAD", status: "online" }, XETHZCAD: { altname: "ETHCAD", wsname: "ETH/CAD", status: "online" }, SOLCAD: { altname: "SOLCAD", wsname: "SOL/CAD", status: "online" }, XDGUSD: { altname: "XDGUSD", wsname: "XDG/USD", status: "online" } } });
    if (u.includes("kraken.com") && u.includes("/OHLC")) return json({ error: [], result: { XXBTZCAD: series(+q.get("interval") * 60, 600, 90000).map((b) => [b.t, String(b.o), String(b.h), String(b.l), String(b.c), String(b.c), String(b.v), 3]), last: 1 } });
    if (u.includes("kraken.com") && u.includes("/Trades")) { let p = 112000; const t0 = now() - 300; return json({ error: [], result: { XXBTZCAD: Array.from({ length: 200 }, (_, i) => { p *= 1 + (rnd() - 0.5) * 0.0004; return [String(p), String(rnd()), t0 + i * 1.5, rnd() > 0.5 ? "b" : "s", "m", "", i]; }), last: "x" } }); }
    if (u.includes("kraken.com") && u.includes("/Ticker")) return json({ error: [], result: { XXBTZCAD: { c: ["91000", "1"], o: "90000" } } });
    if (u.includes("binance.vision") && u.includes("exchangeInfo")) return json({ symbols: [{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" }, { symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT", status: "TRADING" }] });
    if (u.includes("binance.vision") && u.includes("/klines")) { const m = { "1s": 1, "1m": 60, "5m": 300, "1h": 3600, "1d": 86400 }[q.get("interval")] || 60; return json(series(m, 600, 65000).map((b) => [b.t * 1000, String(b.o), String(b.h), String(b.l), String(b.c), String(b.v), 0])); }
    if (u.includes("binance.vision") && u.includes("ticker/24hr")) return json({ lastPrice: "65000", priceChangePercent: "-1.5" });
    if (u.includes("coinbase.com") && u.endsWith("/products")) return json([{ id: "BTC-USD", base_currency: "BTC", quote_currency: "USD", status: "online" }, { id: "ETH-USD", base_currency: "ETH", quote_currency: "USD", status: "online" }]);
    if (u.includes("coinbase.com") && u.includes("/candles")) return json(series(+q.get("granularity"), 300, 66000).map((b) => [b.t, b.l, b.h, b.o, b.c, b.v]).reverse());
    if (u.includes("coinbase.com") && u.includes("/stats")) return json({ last: "66000", open: "65000" });
    return realFetch(url);
  };
  // each mock socket streams one trade every 120 ms for every subscribed symbol, in the provider's own format
  window.WebSocket = function (url) {
    const s = { readyState: 0, subs: new Set(), send(m) { const o = JSON.parse(m);
      if (url.includes("kraken")) { if (o.method === "subscribe") o.params.symbol.forEach((x) => s.subs.add(x)); else o.params.symbol.forEach((x) => s.subs.delete(x)); }
      else if (url.includes("binance")) { if (o.method === "SUBSCRIBE") o.params.forEach((x) => s.subs.add(x.split("@")[0].toUpperCase())); else o.params.forEach((x) => s.subs.delete(x.split("@")[0].toUpperCase())); }
      else if (o.type === "subscribe") o.product_ids.forEach((x) => s.subs.add(x)); }, close() { clearInterval(s.iv); s.readyState = 3; } };
    const px = { "BTC/CAD": 112000, ETHCAD: 4000, BTCUSDT: 65000, "BTC-USD": 66000 };
    setTimeout(() => { s.readyState = 1; s.onopen && s.onopen();
      s.iv = setInterval(() => { for (const sym of s.subs) { px[sym] = (px[sym] || 100) * (1 + (rnd() - 0.5) * 0.0004); const iso = new Date().toISOString();
        let msg; if (url.includes("kraken")) msg = { channel: "trade", type: "update", data: [{ symbol: sym, side: rnd() > 0.5 ? "buy" : "sell", qty: rnd(), price: px[sym], timestamp: iso }] };
        else if (url.includes("binance")) msg = { e: "trade", s: sym, p: String(px[sym]), q: String(rnd()), T: Date.now(), m: rnd() > 0.5 };
        else msg = { type: "match", product_id: sym, price: String(px[sym]), size: String(rnd()), time: iso, side: "buy" };
        s.onmessage && s.onmessage({ data: JSON.stringify(msg) }); } }, 120); }, 30);
    return s;
  };
})();
