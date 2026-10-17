// TEST ONLY. Mimics Kraken's documented response shapes so the UI code paths can be exercised
// offline. Never shipped to the site and never used to produce any result.
(function () {
  const pairs = { XBTCAD: ["XBT/CAD", "XXBTZCAD"], ETHCAD: ["ETH/CAD", "XETHZCAD"], SOLCAD: ["SOL/CAD", "SOLCAD"], DOGEUSD: ["DOGE/USD", "XDGUSD"] };
  const ap = { error: [], result: {} };
  for (const [alt, [ws, key]] of Object.entries(pairs)) ap.result[key] = { altname: alt, wsname: ws, status: "online" };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function bars(interval) {
    const out = []; let p = 90000; const now = Math.floor(Date.now() / 1000), step = interval * 60;
    for (let i = 600; i > 0; i--) { const o = p; p *= 1 + (rnd() - 0.5) * 0.02; const h = Math.max(o, p) * 1.003, l = Math.min(o, p) * 0.997;
      out.push([Math.floor(now / step) * step - i * step, String(o), String(h), String(l), String(p), String(p), String(rnd() * 10), 5]); }
    return out;
  }
  const realFetch = window.fetch;
  window.fetch = (url) => {
    const u = String(url);
    if (u.includes("AssetPairs")) return Promise.resolve(new Response(JSON.stringify(ap)));
    if (u.includes("/OHLC")) { const iv = +new URL(u).searchParams.get("interval"); return Promise.resolve(new Response(JSON.stringify({ error: [], result: { XXBTZCAD: bars(iv), last: 1 } }))); }
    return realFetch(url);
  };
  window.WebSocket = function () {
    const s = { readyState: 0, send() {}, close() {} };
    setTimeout(() => { s.readyState = 1; s.onopen && s.onopen();
      setTimeout(() => { s.onmessage && s.onmessage({ data: JSON.stringify({ channel: "ticker", type: "update", data: [{ symbol: "BTC/CAD", last: 91234.5, change_pct: 1.25 }] }) }); }, 50); }, 50);
    return s;
  };
})();
