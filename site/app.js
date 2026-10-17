"use strict";
// Data sources tried in order: next to this page (GitHub Pages), then the raw state branch.
const BASES = ["data/", "https://raw.githubusercontent.com/happygarcha/autotrader/paper-state/data/"];
const REFRESH_MS = 5 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const nf = (d) => new Intl.NumberFormat("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v) => (v == null ? "–" : "$" + nf(2).format(v));
const pct = (v) => (v == null ? "–" : (v >= 0 ? "+" : "") + nf(2).format(v * 100) + "%");
const px = (v) => (v == null ? "–" : v >= 100 ? nf(2).format(v) : nf(4).format(v));
const secs = (ts) => Math.floor(new Date(String(ts).replace(" ", "T")).getTime() / 1000);
const fmtDate = (ts) => new Date(String(ts).replace(" ", "T")).toISOString().slice(0, 10);

const S = { tag: "", interval: 1440, data: null, candles: {}, active: null, chart: null, candle: null, lines: [], eq: null,
            live: {}, ws: null, wsOk: false };

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function cell(tr, text, cls) { tr.appendChild(el("td", text, cls)); }

async function getJson(name) {
  for (const b of BASES) {
    try {
      const r = await fetch(b + name + "?t=" + Date.now(), { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch (_) { /* try next source */ }
  }
  throw new Error("could not load " + name);
}

function wsSymbol(sym) {
  const base = sym.replace(/CAD$/, "").replace(/^X(?=[A-Z]{3}$)/, "").replace("XBT", "BTC");
  return base + "/CAD";
}

function lastPrice(sym) {
  if (S.live[sym] && S.live[sym].price) return S.live[sym].price;
  const c = S.candles[sym];
  return c && c.length ? c[c.length - 1][4] : null;
}

function renderTiles() {
  const d = S.data, eq = d.equity_history;
  const start = d.meta.start_equity;
  let held = 0;
  for (const [s, u] of Object.entries(d.units)) held += u * (lastPrice(s) || 0);
  const equity = d.cash + held;
  let peak = start, dd = 0;
  for (const p of eq) { peak = Math.max(peak, p.equity); dd = Math.max(dd, 1 - p.equity / peak); }
  const wins = d.trades.filter((t) => t.ret > 0).length;
  const days = eq.length > 1 ? Math.floor((secs(eq[eq.length - 1].ts) - secs(eq[0].ts)) / 86400) : 0;
  const tiles = [
    ["Equity (fake CAD)", money(equity), ""],
    ["Return", pct(equity / start - 1), equity >= start ? "up" : "down"],
    ["Cash", money(d.cash), ""],
    ["Max drawdown", pct(-dd), dd > 0 ? "down" : ""],
    ["Trades (wins)", d.trades.length + " (" + wins + ")", ""],
    ["Size multiplier", nf(2).format(d.multiplier) + "×", d.multiplier < 1 ? "down" : ""],
    ["Paper days / 28", days + " / 28", ""],
  ];
  const box = $("tiles"); box.textContent = "";
  for (const [l, v, c] of tiles) {
    const t = el("div", null, "tile");
    t.appendChild(el("div", l, "l")); t.appendChild(el("div", v, "v " + c));
    box.appendChild(t);
  }
}

function renderTabs() {
  const box = $("tabs"); box.textContent = "";
  for (const a of S.data.meta.assets) {
    const b = el("button", null, "tab");
    b.setAttribute("aria-selected", String(a.symbol === S.active));
    b.dataset.sym = a.symbol;
    b.appendChild(el("div", a.symbol, "s"));
    const p = el("div", px(lastPrice(a.symbol)), "p"); p.dataset.price = a.symbol;
    b.appendChild(p);
    const c = S.candles[a.symbol];
    const open = c && c.length ? c[c.length - 1][1] : null;
    const last = lastPrice(a.symbol);
    const chg = open && last ? last / open - 1 : null;
    b.appendChild(el("div", chg == null ? "" : pct(chg) + " today", "c " + (chg >= 0 ? "up" : "down")));
    b.addEventListener("click", () => { S.active = a.symbol; renderTabs(); renderChart(); });
    box.appendChild(b);
  }
}

function ensureChart() {
  if (S.chart) return;
  const opts = (h) => ({
    height: h, autoSize: true,
    layout: { background: { color: "#12171c" }, textColor: "#8693a1" },
    grid: { vertLines: { color: "#1c232b" }, horzLines: { color: "#1c232b" } },
    rightPriceScale: { borderColor: "#222a33" }, timeScale: { borderColor: "#222a33", timeVisible: false },
    crosshair: { mode: 0 },
  });
  S.chart = LightweightCharts.createChart($("chart"), opts(440));
  S.candle = S.chart.addCandlestickSeries({ upColor: "#26a69a", downColor: "#ef5350", borderVisible: false,
                                            wickUpColor: "#26a69a", wickDownColor: "#ef5350" });
  S.eqChart = LightweightCharts.createChart($("eq"), opts(200));
  S.eq = S.eqChart.addAreaSeries({ lineColor: "#f0b429", topColor: "#f0b42944", bottomColor: "#f0b42905" });
}

function renderChart() {
  ensureChart();
  S.chart.applyOptions({ timeScale: { timeVisible: S.interval < 1440 } });
  const sym = S.active, rows = S.candles[sym] || [];
  const sel = S.data.selection[sym];
  $("ctitle").textContent = sym + (S.interval < 1440 ? " · " + S.interval + " min" : " · 1 day");
  $("cstrat").textContent = sel ? (sel.strategy + " " + JSON.stringify(sel.params)) : "no strategy selected yet (cash)";
  S.candle.setData(rows.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4] })));
  for (const l of S.lines) S.candle.removePriceLine(l);
  S.lines = [];
  const markers = [];
  for (const t of S.data.trades.filter((x) => x.symbol === sym)) {
    if (t.entry_price) markers.push({ time: secs(t.entry), position: "belowBar", color: "#26a69a", shape: "arrowUp", text: "Buy" });
    markers.push({ time: secs(t.exit), position: "aboveBar", color: t.ret >= 0 ? "#26a69a" : "#ef5350", shape: "arrowDown",
                   text: pct(t.ret) });
  }
  const ent = S.data.entries[sym];
  if (ent) {
    markers.push({ time: secs(ent.ts), position: "belowBar", color: "#26a69a", shape: "arrowUp", text: "Buy" });
    S.lines.push(S.candle.createPriceLine({ price: ent.price, color: "#26a69a", lineStyle: 2, lineWidth: 1, title: "entry" }));
    const stop = ent.price * (1 - S.data.meta.limits.stop_loss_frac);
    S.lines.push(S.candle.createPriceLine({ price: stop, color: "#ef5350", lineStyle: 2, lineWidth: 1, title: "stop" }));
  }
  markers.sort((a, b) => a.time - b.time);
  S.candle.setMarkers(markers);
  S.chart.timeScale().fitContent();
}

function renderEquity() {
  const eq = S.data.equity_history.map((p) => ({ time: secs(p.ts), value: p.equity }));
  const seen = new Set(); const clean = eq.filter((p) => !seen.has(p.time) && seen.add(p.time));
  S.eq.setData(clean);
  S.eqChart.timeScale().fitContent();
  $("eqnote").textContent = clean.length < 2 ? "The equity line fills in as daily results accumulate." : "";
}

function renderTables() {
  const pos = $("pos").tBodies[0]; pos.textContent = "";
  const syms = Object.keys(S.data.units);
  if (!syms.length) { const tr = el("tr"); const td = el("td", "No open positions. The bot is waiting for entry signals.", "muted"); td.colSpan = 6; tr.appendChild(td); pos.appendChild(tr); }
  for (const s of syms) {
    const u = S.data.units[s], e = S.data.entries[s] || {}, now = lastPrice(s);
    const pl = e.price && now ? now / e.price - 1 : null;
    const tr = el("tr"); cell(tr, s); cell(tr, nf(6).format(u)); cell(tr, px(e.price)); cell(tr, px(now));
    cell(tr, pct(pl), pl >= 0 ? "up" : "down"); cell(tr, px(e.price ? e.price * (1 - S.data.meta.limits.stop_loss_frac) : null));
    pos.appendChild(tr);
  }
  const tb = $("trades").tBodies[0]; tb.textContent = "";
  const tr0 = [...S.data.trades].reverse();
  if (!tr0.length) { const tr = el("tr"); const td = el("td", "No closed trades yet.", "muted"); td.colSpan = 7; tr.appendChild(td); tb.appendChild(tr); }
  for (const t of tr0) {
    const tr = el("tr"); cell(tr, t.symbol); cell(tr, fmtDate(t.entry)); cell(tr, fmtDate(t.exit));
    cell(tr, px(t.entry_price)); cell(tr, px(t.exit_price)); cell(tr, pct(t.ret), t.ret >= 0 ? "up" : "down");
    cell(tr, t.reason === "stop_loss" ? "stop-loss" : "strategy signal"); tb.appendChild(tr);
  }
  const sel = $("sel").tBodies[0]; sel.textContent = "";
  for (const [s, v] of Object.entries(S.data.selection)) {
    const tr = el("tr"); cell(tr, s); cell(tr, v.strategy === "cash" ? "cash (nothing passed testing)" : v.strategy + " " + JSON.stringify(v.params));
    cell(tr, pct(v.val_return)); cell(tr, nf(2).format(v.val_sharpe)); cell(tr, pct(v.val_max_drawdown)); sel.appendChild(tr);
  }
  const ev = $("events"); ev.textContent = "";
  for (const e of [...S.data.events].reverse().slice(0, 60)) {
    const li = el("li"); li.appendChild(el("time", e.ts === "-" ? "" : fmtDate(e.ts))); li.appendChild(document.createTextNode(e.msg)); ev.appendChild(li);
  }
}

function renderAll() { renderTiles(); renderTabs(); renderChart(); renderEquity(); renderTables(); }

async function load() {
  try {
    const [d, c] = await Promise.all([getJson("paper" + S.tag + ".json"), getJson("candles" + S.tag + ".json")]);
    S.data = d; S.candles = c; S.interval = (d.meta.assets[0] || {}).interval_minutes || 1440;
    if (!S.active || !c[S.active]) S.active = d.meta.assets.map((a) => a.symbol).find((s) => c[s]) || d.meta.assets[0].symbol;
    const eq = d.equity_history; $("asof").textContent = eq.length ? "state as of " + fmtDate(eq[eq.length - 1].ts) : "";
    renderAll();
  } catch (e) {
    $("conn").textContent = "no data yet: the bot has not saved its first run";
  }
}

function connectLive() {
  if (!S.data) return;
  const map = {}; for (const a of S.data.meta.assets) map[wsSymbol(a.symbol)] = a.symbol;
  const ws = new WebSocket("wss://ws.kraken.com/v2"); S.ws = ws;
  ws.onopen = () => {
    ws.send(JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: Object.keys(map) } }));
    ws.send(JSON.stringify({ method: "subscribe", params: { channel: "ohlc", symbol: Object.keys(map), interval: S.interval } }));
  };
  ws.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch (_) { return; }
    if (!msg.data || !Array.isArray(msg.data)) return;
    S.wsOk = true; $("dot").className = "dot on"; $("conn").textContent = "live prices: Kraken";
    for (const row of msg.data) {
      const sym = map[row.symbol]; if (!sym) continue;
      if (msg.channel === "ticker" && row.last) {
        S.live[sym] = { price: row.last }; const p = document.querySelector('[data-price="' + sym + '"]'); if (p) p.textContent = px(row.last);
      }
      if (msg.channel === "ohlc" && row.interval_begin) {
        const t = Math.floor(new Date(row.interval_begin).getTime() / 1000);
        S.live[sym] = { price: row.close };
        if (sym === S.active && S.candle) S.candle.update({ time: t, open: row.open, high: row.high, low: row.low, close: row.close });
      }
    }
    renderTiles(); renderTables();
  };
  ws.onclose = () => { $("dot").className = "dot off"; $("conn").textContent = "live prices lost, retrying…"; setTimeout(connectLive, 5000); };
  ws.onerror = () => ws.close();
}

$("acct").addEventListener("change", async (e) => {
  S.tag = e.target.value; S.active = null; S.live = {};
  $("badge").textContent = S.tag ? "FAST LAB · fake money · hourly" : "PAPER · fake money";
  if (S.ws) { S.ws.onclose = null; S.ws.close(); }
  $("dot").className = "dot"; $("conn").textContent = "connecting…";
  await load(); connectLive();
});
load().then(connectLive);
setInterval(load, REFRESH_MS);
