"use strict";
const KR = "https://api.kraken.com/0/public/";
const BASES = ["data/", "https://raw.githubusercontent.com/happygarcha/autotrader/paper-state/data/"];
const TFS = [["1m", 1], ["5m", 5], ["15m", 15], ["1h", 60], ["4h", 240], ["1D", 1440], ["1W", 10080]];
const IND_DEFS = [["sma", "SMA 20"], ["ema", "EMA 50"], ["bb", "Bollinger 20, 2"], ["vol", "Volume"], ["rsi", "RSI 14 (own pane)"]];

const $ = (id) => document.getElementById(id);
const nf = (d) => new Intl.NumberFormat("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPx = (v) => (v == null || !isFinite(v) ? "–" : v >= 1000 ? nf(2).format(v) : v >= 1 ? nf(4).format(v) : v >= 0.01 ? nf(5).format(v) : nf(8).format(v));
const pct = (v) => (v == null ? "–" : (v >= 0 ? "+" : "") + nf(2).format(v * 100) + "%");
const secs = (ts) => Math.floor(new Date(String(ts).replace(" ", "T")).getTime() / 1000);
const fmtDate = (ts) => new Date(String(ts).replace(" ", "T")).toISOString().slice(0, 16).replace("T", " ");
const show = (s) => String(s).replace("XBT", "BTC").replace(/^XDG\//, "DOGE/");
// Kraken's REST names (XBT, XDG) differ from the WebSocket v2 names (BTC, DOGE).
const wsV2 = (w) => w.replace(/^XBT\//, "BTC/").replace(/^XDG\//, "DOGE/");

const store = {
  get(k, d) { try { const v = localStorage.getItem("at." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("at." + k, JSON.stringify(v)); } catch (_) { /* storage unavailable: ignore */ } },
};

function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }

const S = {
  pairs: [], by: {}, quote: store.get("quote", "CAD"),
  sym: store.get("sym", "XBTCAD"), tf: store.get("tf", 60), type: store.get("type", "candle"),
  ind: store.get("ind", { sma: true, ema: false, bb: false, vol: true, rsi: false }),
  tool: "cursor", candles: [], watch: store.get("watch", ["XBTCAD", "ETHCAD", "SOLCAD"]),
  live: {}, ws: null, wsSub: null, bot: {}, extra: [], lines: [], hl: [],
  chart: null, main: null, vol: null, rsiChart: null, rsiSeries: null,
};

async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }

async function loadPairs() {
  const j = await getJson(KR + "AssetPairs");
  if (j.error && j.error.length) throw new Error(j.error.join(", "));
  S.pairs = Object.values(j.result).filter((p) => p.wsname && (!p.status || p.status === "online"))
    .map((p) => ({ alt: p.altname, ws: wsV2(p.wsname), quote: p.wsname.split("/")[1], label: show(p.wsname) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  S.by = {}; for (const p of S.pairs) S.by[p.alt] = p;
}

async function loadBot() {
  S.bot = {};
  for (const [name, file] of [["Main (daily)", "paper.json"], ["Fast lab (hourly)", "paper_fast.json"]]) {
    for (const b of BASES) {
      try { const r = await fetch(b + file + "?t=" + Date.now(), { cache: "no-store" }); if (r.ok) { S.bot[name] = await r.json(); break; } } catch (_) { /* next */ }
    }
  }
}

async function fetchCandles() {
  const p = S.by[S.sym]; if (!p) return [];
  const j = await getJson(KR + "OHLC?pair=" + encodeURIComponent(p.alt) + "&interval=" + S.tf);
  if (j.error && j.error.length) throw new Error(j.error.join(", "));
  const key = Object.keys(j.result).find((k) => k !== "last");
  return j.result[key].map((r) => ({ time: +r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[6] }));
}

function opts() {
  return { autoSize: true, layout: { background: { color: "#12171c" }, textColor: "#8693a1" },
    grid: { vertLines: { color: "#1c232b" }, horzLines: { color: "#1c232b" } },
    rightPriceScale: { borderColor: "#222a33" }, timeScale: { borderColor: "#222a33", timeVisible: S.tf < 1440, secondsVisible: false },
    crosshair: { mode: 0 } };
}

function snap(t) { // move a time onto the bar that contains it
  let lo = 0, hi = S.candles.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (S.candles[m].time <= t) { ans = S.candles[m].time; lo = m + 1; } else hi = m - 1; }
  return ans;
}

function botMarkers() {
  const m = [];
  for (const [acct, st] of Object.entries(S.bot)) {
    for (const t of st.trades || []) {
      if (t.symbol !== S.sym) continue;
      const a = snap(secs(t.entry)), b = snap(secs(t.exit));
      if (a && t.entry_price) m.push({ time: a, position: "belowBar", color: "#26a69a", shape: "arrowUp", text: "Buy" });
      if (b) m.push({ time: b, position: "aboveBar", color: t.ret >= 0 ? "#26a69a" : "#ef5350", shape: "arrowDown", text: pct(t.ret) });
    }
    const e = (st.entries || {})[S.sym];
    if (e) { const a = snap(secs(e.ts)); if (a) m.push({ time: a, position: "belowBar", color: "#26a69a", shape: "arrowUp", text: "Buy" }); }
  }
  return m.sort((x, y) => x.time - y.time);
}

function rebuild() {
  if (!S.chart) {
    S.chart = LightweightCharts.createChart($("chart"), opts());
    S.chart.subscribeCrosshairMove(onCross);
    S.chart.subscribeClick(onClick);
  }
  S.chart.applyOptions({ timeScale: { timeVisible: S.tf < 1440 } });
  for (const s of S.extra) S.chart.removeSeries(s); S.extra = [];
  if (S.main) { S.chart.removeSeries(S.main); S.main = null; }
  if (S.vol) { S.chart.removeSeries(S.vol); S.vol = null; }

  const c = S.candles;
  if (S.type === "candle") {
    S.main = S.chart.addCandlestickSeries({ upColor: "#26a69a", downColor: "#ef5350", borderVisible: false, wickUpColor: "#26a69a", wickDownColor: "#ef5350" });
    S.main.setData(c);
  } else {
    S.main = S.chart.addLineSeries({ color: "#f0b429", lineWidth: 2 });
    S.main.setData(c.map((x) => ({ time: x.time, value: x.close })));
  }
  S.main.setMarkers(botMarkers());
  const closes = c.map((x) => x.close);
  const line = (vals, color, w = 1) => {
    const s = S.chart.addLineSeries({ color, lineWidth: w, priceLineVisible: false, lastValueVisible: false });
    s.setData(vals.map((v, i) => (v == null ? null : { time: c[i].time, value: v })).filter(Boolean)); S.extra.push(s);
  };
  if (S.ind.sma) line(Ind.sma(closes, 20), "#42a5f5");
  if (S.ind.ema) line(Ind.ema(closes, 50), "#ab47bc");
  if (S.ind.bb) { const b = Ind.bollinger(closes, 20, 2); line(b.up, "#90a4ae"); line(b.mid, "#546e7a"); line(b.lo, "#90a4ae"); }
  if (S.ind.vol) {
    S.vol = S.chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false });
    S.chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    S.vol.setData(c.map((x) => ({ time: x.time, value: x.volume, color: x.close >= x.open ? "#26a69a55" : "#ef535055" })));
  }
  drawLines(); drawRsi();
  S.chart.timeScale().fitContent();
}

function drawRsi() {
  const box = $("rsi"); box.hidden = !S.ind.rsi;
  if (!S.ind.rsi) { if (S.rsiChart) { S.rsiChart.remove(); S.rsiChart = null; S.rsiSeries = null; } return; }
  if (!S.rsiChart) {
    S.rsiChart = LightweightCharts.createChart(box, opts());
    S.rsiChart.priceScale("right").applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    S.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (r && S.rsiChart) S.rsiChart.timeScale().setVisibleLogicalRange(r); });
  }
  if (S.rsiSeries) S.rsiChart.removeSeries(S.rsiSeries);
  S.rsiSeries = S.rsiChart.addLineSeries({ color: "#ffa726", lineWidth: 1 });
  const r = Ind.rsi(S.candles.map((x) => x.close), 14);
  S.rsiSeries.setData(r.map((v, i) => (v == null ? null : { time: S.candles[i].time, value: v })).filter(Boolean));
  for (const lvl of [30, 70]) S.rsiSeries.createPriceLine({ price: lvl, color: "#546e7a", lineStyle: 2, lineWidth: 1, title: String(lvl) });
}

function drawLines() {
  for (const l of S.lines) S.main.removePriceLine(l); S.lines = [];
  for (const price of store.get("lines:" + S.sym, [])) S.lines.push(S.main.createPriceLine({ price, color: "#f0b429", lineWidth: 1, lineStyle: 0, title: "" }));
  for (const [, st] of Object.entries(S.bot)) {
    const e = (st.entries || {})[S.sym]; if (!e) continue;
    S.lines.push(S.main.createPriceLine({ price: e.price, color: "#26a69a", lineStyle: 2, lineWidth: 1, title: "bot entry" }));
    S.lines.push(S.main.createPriceLine({ price: e.price * (1 - st.meta.limits.stop_loss_frac), color: "#ef5350", lineStyle: 2, lineWidth: 1, title: "bot stop" }));
  }
}

function onClick(p) {
  if (S.tool !== "hline" || !p.point || !S.main) return;
  const price = S.main.coordinateToPrice(p.point.y); if (price == null) return;
  const arr = store.get("lines:" + S.sym, []); arr.push(price); store.set("lines:" + S.sym, arr);
  drawLines(); setTool("cursor");
}

function onCross(p) {
  const box = $("ohlc"); if (!S.main) return;
  const d = p.seriesData && p.seriesData.get(S.main);
  const x = d || S.candles[S.candles.length - 1]; if (!x) return;
  box.textContent = show(S.by[S.sym] ? S.by[S.sym].label : S.sym) + "  " + (x.open != null ? "O " + fmtPx(x.open) + "  H " + fmtPx(x.high) + "  L " + fmtPx(x.low) + "  C " + fmtPx(x.close) : "C " + fmtPx(x.value));
}

async function loadSymbol() {
  $("symbtn").textContent = (S.by[S.sym] ? S.by[S.sym].label : S.sym) + " ▾";
  try { S.candles = await fetchCandles(); $("conn").textContent = S.wsOk ? "live prices: Kraken" : "loaded"; }
  catch (e) { S.candles = []; $("conn").textContent = "could not load candles: " + e.message; }
  rebuild(); onCross({}); renderBot(); subscribeLive();
}

/* ---------- live ---------- */
function wsSend(o) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); }
function subscribeLive() {
  const p = S.by[S.sym]; if (!p) return;
  if (S.wsSub) wsSend({ method: "unsubscribe", params: S.wsSub });
  S.wsSub = { channel: "ohlc", symbol: [p.ws], interval: S.tf };
  wsSend({ method: "subscribe", params: S.wsSub });
}
function connectLive() {
  const ws = new WebSocket("wss://ws.kraken.com/v2"); S.ws = ws;
  ws.onopen = () => {
    const syms = S.watch.map((a) => S.by[a]).filter(Boolean).map((p) => p.ws);
    if (syms.length) wsSend({ method: "subscribe", params: { channel: "ticker", symbol: syms } });
    subscribeLive();
  };
  ws.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch (_) { return; }
    if (!Array.isArray(msg.data)) return;
    S.wsOk = true; $("dot").className = "dot on"; $("conn").textContent = "live prices: Kraken";
    for (const r of msg.data) {
      const alt = (S.pairs.find((p) => p.ws === r.symbol) || {}).alt; if (!alt) continue;
      if (msg.channel === "ticker") { S.live[alt] = { last: r.last, chg: r.change_pct }; renderWatch(); }
      if (msg.channel === "ohlc" && alt === S.sym && r.interval === S.tf && r.interval_begin) {
        const t = Math.floor(new Date(r.interval_begin).getTime() / 1000);
        const bar = { time: t, open: +r.open, high: +r.high, low: +r.low, close: +r.close, volume: +r.volume };
        const last = S.candles[S.candles.length - 1];
        if (last && last.time === t) S.candles[S.candles.length - 1] = bar; else if (!last || t > last.time) S.candles.push(bar); else continue;
        if (S.type === "candle") S.main.update(bar); else S.main.update({ time: t, value: bar.close });
        if (S.vol) S.vol.update({ time: t, value: bar.volume, color: bar.close >= bar.open ? "#26a69a55" : "#ef535055" });
        S.live[alt] = Object.assign(S.live[alt] || {}, { last: bar.close }); renderWatch();
      }
    }
  };
  ws.onclose = () => { $("dot").className = "dot off"; $("conn").textContent = "live prices lost, retrying…"; S.wsSub = null; setTimeout(connectLive, 4000); };
  ws.onerror = () => ws.close();
}

/* ---------- UI ---------- */
function renderTfs() {
  const box = $("tfs"); box.textContent = "";
  for (const [label, mins] of TFS) {
    const b = el("button", label); if (mins === S.tf) b.className = "on";
    b.addEventListener("click", () => { S.tf = mins; store.set("tf", mins); renderTfs(); loadSymbol(); });
    box.appendChild(b);
  }
}
function renderInd() {
  const box = $("indmenu"); box.textContent = "";
  for (const [k, label] of IND_DEFS) {
    const l = el("label"); const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!S.ind[k];
    c.addEventListener("change", () => { S.ind[k] = c.checked; store.set("ind", S.ind); rebuild(); });
    l.appendChild(c); l.appendChild(document.createTextNode(label)); box.appendChild(l);
  }
}
function setTool(t) {
  S.tool = t;
  if (t === "clear") { store.set("lines:" + S.sym, []); drawLines(); S.tool = "cursor"; }
  for (const b of $("tools").children) b.className = b.dataset.tool === S.tool ? "on" : "";
}
function renderWatch() {
  const box = $("watch"); box.textContent = "";
  for (const a of S.watch) {
    const p = S.by[a]; const lv = S.live[a] || {};
    const r = el("div", null, "wrow" + (a === S.sym ? " sel" : ""));
    r.appendChild(el("span", p ? p.label : a)); r.appendChild(el("span", fmtPx(lv.last)));
    const ch = el("span", lv.chg == null ? "" : (lv.chg >= 0 ? "+" : "") + nf(2).format(lv.chg) + "%", lv.chg >= 0 ? "up" : "down"); r.appendChild(ch);
    const x = el("button", "✕", "x"); x.setAttribute("aria-label", "Remove " + a);
    x.addEventListener("click", (e) => { e.stopPropagation(); S.watch = S.watch.filter((w) => w !== a); store.set("watch", S.watch); renderWatch(); });
    r.appendChild(x);
    r.addEventListener("click", () => selectSym(a)); box.appendChild(r);
  }
  if (!S.watch.length) box.appendChild(el("div", "Empty. Open the symbol search and tap + to add markets.", "muted"));
}
function selectSym(a) { S.sym = a; store.set("sym", a); renderWatch(); loadSymbol(); closePicker(); }

function botSymbols() {
  const s = new Set();
  for (const st of Object.values(S.bot)) for (const a of (st.meta ? st.meta.assets : [])) s.add(a.symbol);
  return s;
}
function renderPicker() {
  const q = $("q").value.trim().toUpperCase(); const list = $("piclist"); list.textContent = "";
  const bots = botSymbols(); let n = 0;
  for (const p of S.pairs) {
    if (S.quote !== "ALL" && p.quote !== S.quote) continue;
    if (q && !(p.label.includes(q) || p.alt.includes(q))) continue;
    if (++n > 250) break;
    const r = el("div", null, "row"); r.tabIndex = 0; r.setAttribute("role", "option");
    const left = el("span", p.label); if (bots.has(p.alt)) left.appendChild(el("span", "  BOT", "tag"));
    r.appendChild(left);
    const add = el("button", S.watch.includes(p.alt) ? "✓ in watchlist" : "+ watchlist");
    add.addEventListener("click", (e) => { e.stopPropagation(); if (!S.watch.includes(p.alt)) { S.watch.push(p.alt); store.set("watch", S.watch); renderWatch(); if (S.ws && S.ws.readyState === 1) wsSend({ method: "subscribe", params: { channel: "ticker", symbol: [p.ws] } }); } renderPicker(); });
    r.appendChild(add);
    r.addEventListener("click", () => selectSym(p.alt)); r.addEventListener("keydown", (e) => { if (e.key === "Enter") selectSym(p.alt); });
    list.appendChild(r);
  }
  if (!n) list.appendChild(el("div", "No market matches. Try BTC, ETH or DOGE.", "muted"));
}
function renderQuotes() {
  const box = $("quotes"); box.textContent = "";
  const quotes = ["CAD", "USD", "USDT", "EUR", "ALL"];
  for (const q of quotes) { const b = el("button", q); if (q === S.quote) b.className = "on"; b.addEventListener("click", () => { S.quote = q; store.set("quote", q); renderQuotes(); renderPicker(); }); box.appendChild(b); }
}
function openPicker() { $("picker").hidden = false; renderQuotes(); renderPicker(); $("q").focus(); }
function closePicker() { $("picker").hidden = true; }

function renderBot() {
  $("botsym").textContent = S.by[S.sym] ? S.by[S.sym].label : S.sym;
  const box = $("botinfo"); box.textContent = "";
  const accts = Object.entries(S.bot);
  if (!accts.length) { box.textContent = "Bot data not available yet."; }
  for (const [name, st] of accts) {
    const inCfg = (st.meta.assets || []).some((a) => a.symbol === S.sym);
    const d = el("div"); d.style.marginBottom = "8px";
    d.appendChild(el("div", name, "bname")); d.firstChild.style.color = "var(--fg)";
    if (!inCfg) { d.appendChild(el("div", "Not traded by the bot on this account.")); box.appendChild(d); continue; }
    const sel = (st.selection || {})[S.sym];
    d.appendChild(el("div", sel ? (sel.strategy === "cash" ? "In cash: no strategy passed testing" : "Strategy: " + sel.strategy + " " + JSON.stringify(sel.params)) : "Not selected yet"));
    const e = (st.entries || {})[S.sym], u = (st.units || {})[S.sym];
    const last = (S.live[S.sym] || {}).last || (S.candles.length ? S.candles[S.candles.length - 1].close : null);
    d.appendChild(el("div", e ? "Open: " + nf(6).format(u) + " @ " + fmtPx(e.price) + (last ? "  (" + pct(last / e.price - 1) + ")" : "") : "No open position"));
    box.appendChild(d);
  }
  renderTrades();
}
function renderTrades() {
  const tb = $("btrades").tBodies[0]; tb.textContent = ""; let n = 0;
  for (const [name, st] of Object.entries(S.bot)) for (const t of [...(st.trades || [])].reverse()) {
    n++; const tr = document.createElement("tr");
    for (const [v, c] of [[name], [show(t.symbol)], [fmtDate(t.entry)], [fmtDate(t.exit)], [fmtPx(t.entry_price)], [fmtPx(t.exit_price)], [pct(t.ret), t.ret >= 0 ? "up" : "down"]]) tr.appendChild(el("td", v, c));
    tb.appendChild(tr);
  }
  if (!n) { const tr = document.createElement("tr"); const td = el("td", "No closed bot trades yet.", "muted"); td.colSpan = 7; tr.appendChild(td); tb.appendChild(tr); }
}

async function init() {
  renderTfs(); renderInd(); setTool("cursor");
  $("symbtn").addEventListener("click", openPicker); $("pickclose").addEventListener("click", closePicker);
  $("q").addEventListener("input", renderPicker);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePicker(); });
  $("indbtn").addEventListener("click", () => { $("indmenu").hidden = !$("indmenu").hidden; });
  for (const b of $("tools").children) b.addEventListener("click", () => setTool(b.dataset.tool));
  for (const b of $("types").children) b.addEventListener("click", () => { S.type = b.dataset.type; store.set("type", S.type); for (const x of $("types").children) x.className = x === b ? "on" : ""; rebuild(); });
  for (const x of $("types").children) x.className = x.dataset.type === S.type ? "on" : "";
  try { await loadPairs(); } catch (e) { $("conn").textContent = "could not load markets: " + e.message; $("symbtn").textContent = "No markets"; return; }
  await loadBot();
  if (!S.by[S.sym]) S.sym = "XBTCAD";
  renderWatch(); await loadSymbol(); connectLive();
  setInterval(async () => { await loadBot(); renderBot(); }, 5 * 60 * 1000);
}
init();
