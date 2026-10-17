"use strict";
// Public market-data providers. All endpoints are keyless and read-only. Everything here only
// reads prices; nothing can place an order.
const Providers = (() => {
  const num = (x) => +x;
  async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url.split("?")[0] + " -> HTTP " + r.status);
    return r.json();
  }

  /* ---------------- Kraken ---------------- */
  const kraken = {
    id: "kraken", name: "Kraken",
    native: [60, 300, 900, 1800, 3600, 14400, 86400, 604800],
    wsUrl: "wss://ws.kraken.com/v2",
    // REST names (XBT, XDG) differ from WebSocket v2 names (BTC, DOGE).
    wsName: (w) => w.replace(/^XBT\//, "BTC/").replace(/^XDG\//, "DOGE/"),
    parseSymbols(j) {
      if (j.error && j.error.length) throw new Error(j.error.join(", "));
      return Object.values(j.result).filter((p) => p.wsname && (!p.status || p.status === "online")).map((p) => {
        const ws = kraken.wsName(p.wsname);
        return { provider: "kraken", id: p.altname, ws, label: ws, base: ws.split("/")[0], quote: ws.split("/")[1] };
      });
    },
    async symbols() { return kraken.parseSymbols(await getJson("https://api.kraken.com/0/public/AssetPairs")); },
    parseCandles(j) {
      if (j.error && j.error.length) throw new Error(j.error.join(", "));
      const key = Object.keys(j.result).find((k) => k !== "last");
      return j.result[key].map((r) => ({ time: num(r[0]), open: num(r[1]), high: num(r[2]), low: num(r[3]), close: num(r[4]), volume: num(r[6]) }));
    },
    async candles(sym, sec) { return kraken.parseCandles(await getJson(`https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(sym.id)}&interval=${sec / 60}`)); },
    async stats24(sym) {
      const j = await getJson(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(sym.id)}`);
      const t = Object.values(j.result)[0]; const last = num(t.c[0]), open = num(t.o);
      return { last, changePct: open ? (last / open - 1) * 100 : null };
    },
    subMsg: (s) => ({ method: "subscribe", params: { channel: "trade", symbol: [s.ws], snapshot: false } }),
    unsubMsg: (s) => ({ method: "unsubscribe", params: { channel: "trade", symbol: [s.ws] } }),
    parseTicks(msg, idFor) {
      if (msg.channel !== "trade" || !Array.isArray(msg.data) || msg.type === "snapshot") return [];
      return msg.data.map((r) => ({ id: idFor(r.symbol), price: num(r.price), size: num(r.qty), time: Date.parse(r.timestamp) / 1000, side: r.side }))
        .filter((t) => t.id && isFinite(t.price));
    },
    key: (s) => s.ws,
  };

  /* ---------------- Binance (public market-data host, includes 1-second candles) ---------------- */
  const BIN_IV = { 1: "1s", 60: "1m", 180: "3m", 300: "5m", 900: "15m", 1800: "30m", 3600: "1h", 7200: "2h", 14400: "4h", 21600: "6h", 28800: "8h", 43200: "12h", 86400: "1d", 259200: "3d", 604800: "1w" };
  const binance = {
    id: "binance", name: "Binance",
    native: Object.keys(BIN_IV).map(Number),
    wsUrl: "wss://data-stream.binance.vision/ws",
    parseSymbols(j) {
      return j.symbols.filter((s) => s.status === "TRADING").map((s) => ({ provider: "binance", id: s.symbol, label: s.baseAsset + "/" + s.quoteAsset, base: s.baseAsset, quote: s.quoteAsset }));
    },
    async symbols() { return binance.parseSymbols(await getJson("https://data-api.binance.vision/api/v3/exchangeInfo")); },
    parseCandles(rows) { return rows.map((r) => ({ time: Math.floor(r[0] / 1000), open: num(r[1]), high: num(r[2]), low: num(r[3]), close: num(r[4]), volume: num(r[5]) })); },
    async candles(sym, sec) { return binance.parseCandles(await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${sym.id}&interval=${BIN_IV[sec]}&limit=1000`)); },
    async stats24(sym) { const j = await getJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${sym.id}`); return { last: num(j.lastPrice), changePct: num(j.priceChangePercent) }; },
    subMsg: (s) => ({ method: "SUBSCRIBE", params: [s.id.toLowerCase() + "@trade"], id: Math.floor(Math.random() * 1e9) }),
    unsubMsg: (s) => ({ method: "UNSUBSCRIBE", params: [s.id.toLowerCase() + "@trade"], id: Math.floor(Math.random() * 1e9) }),
    parseTicks(msg) {
      if (msg.e !== "trade") return [];
      return [{ id: msg.s, price: num(msg.p), size: num(msg.q), time: msg.T / 1000, side: msg.m ? "sell" : "buy" }];
    },
    key: (s) => s.id,
  };

  /* ---------------- Coinbase Exchange ---------------- */
  const coinbase = {
    id: "coinbase", name: "Coinbase",
    native: [60, 300, 900, 3600, 21600, 86400],
    wsUrl: "wss://ws-feed.exchange.coinbase.com",
    parseSymbols(rows) {
      return rows.filter((p) => !p.status || p.status === "online").map((p) => ({ provider: "coinbase", id: p.id, label: p.base_currency + "/" + p.quote_currency, base: p.base_currency, quote: p.quote_currency }));
    },
    async symbols() { return coinbase.parseSymbols(await getJson("https://api.exchange.coinbase.com/products")); },
    // [time, low, high, open, close, volume], newest first
    parseCandles(rows) { return rows.map((r) => ({ time: r[0], open: num(r[3]), high: num(r[2]), low: num(r[1]), close: num(r[4]), volume: num(r[5]) })).sort((a, b) => a.time - b.time); },
    async candles(sym, sec) { return coinbase.parseCandles(await getJson(`https://api.exchange.coinbase.com/products/${sym.id}/candles?granularity=${sec}`)); },
    async stats24(sym) { const j = await getJson(`https://api.exchange.coinbase.com/products/${sym.id}/stats`); const last = num(j.last), open = num(j.open); return { last, changePct: open ? (last / open - 1) * 100 : null }; },
    subMsg: (s) => ({ type: "subscribe", product_ids: [s.id], channels: ["matches"] }),
    unsubMsg: (s) => ({ type: "unsubscribe", product_ids: [s.id], channels: ["matches"] }),
    parseTicks(msg) {
      if (msg.type !== "match" || !msg.price) return [];
      return [{ id: msg.product_id, price: num(msg.price), size: num(msg.size), time: Date.parse(msg.time) / 1000, side: msg.side }];
    },
    key: (s) => s.id,
  };

  /* ---------------- live trade feed, one socket per provider ---------------- */
  class Feed {
    constructor(p, onTick, onState) { this.p = p; this.onTick = onTick; this.onState = onState; this.subs = new Map(); this.ws = null; this.state = "idle"; this.count = 0; this.last = 0; this.closed = false; this.retry = 1000; }
    idFor(wsSym) { for (const s of this.subs.values()) if (s.ws === wsSym) return s.id; return null; }
    open() {
      if (this.ws || this.closed) return;
      this._set("connecting");
      const ws = new WebSocket(this.p.wsUrl); this.ws = ws;
      ws.onopen = () => { this.retry = 1000; this._set("live"); for (const s of this.subs.values()) this._send(this.p.subMsg(s)); };
      ws.onmessage = (m) => {
        let msg; try { msg = JSON.parse(m.data); } catch (_) { return; }
        for (const t of this.p.parseTicks(msg, (w) => this.idFor(w))) { this.count++; this.last = Date.now(); this.onTick(this.p.id, t); }
      };
      ws.onclose = () => { this.ws = null; if (this.closed) return; this._set("reconnecting"); setTimeout(() => this.open(), this.retry); this.retry = Math.min(this.retry * 2, 15000); };
      ws.onerror = () => { try { ws.close(); } catch (_) { /* already closed */ } };
    }
    _set(st) { this.state = st; if (this.onState) this.onState(this.p.id, st); }
    _send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    add(sym) { const k = this.p.key(sym); if (this.subs.has(k)) return; this.subs.set(k, sym); this.open(); this._send(this.p.subMsg(sym)); }
    remove(sym) { const k = this.p.key(sym); if (!this.subs.delete(k)) return; this._send(this.p.unsubMsg(sym)); }
  }

  return { kraken, binance, coinbase, all: [kraken, binance, coinbase], Feed };
})();
if (typeof module !== "undefined") module.exports = Providers;
