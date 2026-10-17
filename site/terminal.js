"use strict";
const BASES = ["data/", "https://raw.githubusercontent.com/happygarcha/autotrader/paper-state/data/"];
const IND_DEFS = [["sma", "SMA 20"], ["ema", "EMA 50"], ["bb", "Bollinger 20, 2"], ["vol", "Volume"], ["rsi", "RSI 14 (pane)"], ["macd", "MACD 12,26,9 (pane)"]];

const $ = (id) => document.getElementById(id);
const nf = (d) => new Intl.NumberFormat("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPx = (v) => (v == null || !isFinite(v) ? "–" : v >= 1000 ? nf(2).format(v) : v >= 1 ? nf(4).format(v) : v >= 0.01 ? nf(5).format(v) : nf(8).format(v));
const fmtQty = (v) => (v == null || !isFinite(v) ? "–" : v >= 100 ? nf(2).format(v) : nf(6).format(v));
const pct = (v) => (v == null || !isFinite(v) ? "–" : (v >= 0 ? "+" : "") + nf(2).format(v * 100) + "%");
const pct100 = (v) => (v == null || !isFinite(v) ? "" : (v >= 0 ? "+" : "") + nf(2).format(v) + "%");
const secs = (ts) => Math.floor(new Date(String(ts).replace(" ", "T")).getTime() / 1000);
const fmtDT = (s) => new Date(s * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const key = (s) => s.provider + ":" + s.id;
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
const store = {
  get(k, d) { try { const v = localStorage.getItem("at2." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("at2." + k, JSON.stringify(v)); } catch (_) { /* storage unavailable */ } },
};

const S = {
  syms: {}, byKey: {}, diag: {}, sym: null, tf: store.get("tf", 60), type: store.get("type", "candle"),
  ind: store.get("ind", { sma: true, ema: false, bb: false, vol: true, rsi: false, macd: false }),
  log: store.get("log", false), tool: "cursor", pending: null,
  bars: [], watch: store.get("watch", ["kraken:XBTCAD", "kraken:ETHCAD", "kraken:SOLCAD", "binance:BTCUSDT", "coinbase:BTC-USD"]),
  live: {}, stats: {}, feeds: {}, tape: [], ticks: 0, tickWin: [], dirty: false, dirtyAt: 0,
  chart: null, main: null, ser: {}, lines: [], prims: [], rsiC: null, macdC: null, rsiS: null, macdS: {},
  bot: {}, paper: new PaperAccount(store.get("paper", null)), side: "buy", otype: "market", tab: "watch", loadSeq: 0,
};

/* ================= chart ================= */
function localFmt(t, withSec) {
  return new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: withSec ? "2-digit" : undefined });
}
function chartOpts() {
  return { autoSize: true, layout: { background: { color: "#12171c" }, textColor: "#8693a1" },
    grid: { vertLines: { color: "#1c232b" }, horzLines: { color: "#1c232b" } },
    rightPriceScale: { borderColor: "#222a33", mode: S.log ? 1 : 0 },
    timeScale: { borderColor: "#222a33", timeVisible: S.tf < 86400, secondsVisible: S.tf < 60,
      tickMarkFormatter: (t, type) => { const d = new Date(t * 1000); return type >= 3 ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: S.tf < 60 ? "2-digit" : undefined }) : d.toLocaleDateString([], { month: "short", day: "numeric" }); } },
    localization: { timeFormatter: (t) => localFmt(t, S.tf < 60) },
    crosshair: { mode: 0 } };
}

class TrendLine {
  constructor(p1, p2) { this.p1 = p1; this.p2 = p2; this._v = [{ update() {}, renderer: () => ({ draw: (target) => this.draw(target) }) }]; }
  attached(a) { this.chart = a.chart; this.series = a.series; }
  detached() { this.chart = this.series = null; }
  updateAllViews() {}
  paneViews() { return this._v; }
  draw(target) {
    if (!this.chart) return;
    const ts = this.chart.timeScale(), x1 = ts.timeToCoordinate(this.p1.time), x2 = ts.timeToCoordinate(this.p2.time);
    const y1 = this.series.priceToCoordinate(this.p1.price), y2 = this.series.priceToCoordinate(this.p2.price);
    if ([x1, x2, y1, y2].some((v) => v == null)) return;
    target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      c.strokeStyle = "#f0b429"; c.lineWidth = Math.max(1, Math.round(hr)); c.beginPath(); c.moveTo(x1 * hr, y1 * vr); c.lineTo(x2 * hr, y2 * vr); c.stroke();
    });
  }
}

function barData() {
  const b = S.bars;
  if (S.type === "ha") return Core.heikinAshi(b);
  if (S.type === "line" || S.type === "area") return b.map((x) => ({ time: x.time, value: x.close }));
  return b.map((x) => ({ time: x.time, open: x.open, high: x.high, low: x.low, close: x.close }));
}
function snapTime(t) {
  const b = S.bars; let lo = 0, hi = b.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m].time <= t) { ans = b[m].time; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function markers() {
  const m = [], k = S.sym ? key(S.sym) : null; if (!k) return m;
  for (const st of Object.values(S.bot)) {
    for (const t of st.trades || []) {
      if ("kraken:" + t.symbol !== k) continue;
      const a = snapTime(secs(t.entry)), b = snapTime(secs(t.exit));
      if (a && t.entry_price) m.push({ time: a, position: "belowBar", color: "#26a69a", shape: "arrowUp", text: "Bot buy" });
      if (b) m.push({ time: b, position: "aboveBar", color: t.ret >= 0 ? "#26a69a" : "#ef5350", shape: "arrowDown", text: "Bot " + pct(t.ret) });
    }
    const e = (st.entries || {})[k.slice(7)];
    if (k.startsWith("kraken:") && e) { const a = snapTime(secs(e.ts)); if (a) m.push({ time: a, position: "belowBar", color: "#26a69a", shape: "arrowUp", text: "Bot buy" }); }
  }
  for (const f of S.paper.history) {
    if (f.key !== k) continue; const t = snapTime(f.time); if (!t) continue;
    m.push(f.side === "buy" ? { time: t, position: "belowBar", color: "#42a5f5", shape: "arrowUp", text: "You buy" }
                            : { time: t, position: "aboveBar", color: "#42a5f5", shape: "arrowDown", text: "You sell" });
  }
  return m.sort((x, y) => x.time - y.time);
}

function rebuild() {
  if (!S.chart) {
    S.chart = LightweightCharts.createChart($("chart"), chartOpts());
    S.chart.subscribeCrosshairMove(onCross); S.chart.subscribeClick(onClick);
    S.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (!r) return; for (const c of [S.rsiC, S.macdC]) if (c) c.timeScale().setVisibleLogicalRange(r); });
  }
  S.chart.applyOptions(chartOpts());
  for (const pc of [S.rsiC, S.macdC]) if (pc) pc.applyOptions(chartOpts());
  for (const s of Object.values(S.ser)) S.chart.removeSeries(s); S.ser = {};
  if (S.main) { S.chart.removeSeries(S.main); S.main = null; }
  const c = S.chart;
  const up = "#26a69a", dn = "#ef5350";
  if (S.type === "line") S.main = c.addLineSeries({ color: "#f0b429", lineWidth: 2 });
  else if (S.type === "area") S.main = c.addAreaSeries({ lineColor: "#f0b429", topColor: "#f0b42944", bottomColor: "#f0b42905" });
  else if (S.type === "bars") S.main = c.addBarSeries({ upColor: up, downColor: dn });
  else S.main = c.addCandlestickSeries({ upColor: up, downColor: dn, borderVisible: false, wickUpColor: up, wickDownColor: dn });
  const ln = (name, color, w) => { S.ser[name] = c.addLineSeries({ color, lineWidth: w || 1, priceLineVisible: false, lastValueVisible: false }); };
  if (S.ind.sma) ln("sma", "#42a5f5"); if (S.ind.ema) ln("ema", "#ab47bc");
  if (S.ind.bb) { ln("bbu", "#90a4ae"); ln("bbm", "#546e7a"); ln("bbl", "#90a4ae"); }
  if (S.ind.vol) {
    S.ser.vol = c.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
  }
  buildPanes(); refreshData(true); drawDrawings(); c.timeScale().fitContent();
}

function paneChart(box, on, cur) {
  box.hidden = !on;
  if (!on) { if (cur) cur.remove(); return null; }
  if (cur) return cur;
  const p = LightweightCharts.createChart(box, chartOpts());
  const r = S.chart.timeScale().getVisibleLogicalRange(); if (r) p.timeScale().setVisibleLogicalRange(r);
  return p;
}
function buildPanes() {
  S.rsiC = paneChart($("rsi"), S.ind.rsi, S.rsiC);
  if (S.rsiC) {
    if (S.rsiS) { try { S.rsiC.removeSeries(S.rsiS); } catch (_) { /* gone */ } }
    S.rsiS = S.rsiC.addLineSeries({ color: "#ffa726", lineWidth: 1 });
    for (const l of [30, 70]) S.rsiS.createPriceLine({ price: l, color: "#546e7a", lineStyle: 2, lineWidth: 1, title: String(l) });
  } else S.rsiS = null;
  S.macdC = paneChart($("macd"), S.ind.macd, S.macdC);
  if (S.macdC) {
    for (const s of Object.values(S.macdS)) { try { S.macdC.removeSeries(s); } catch (_) { /* gone */ } }
    S.macdS = { hist: S.macdC.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }),
      line: S.macdC.addLineSeries({ color: "#42a5f5", lineWidth: 1, priceLineVisible: false }),
      sig: S.macdC.addLineSeries({ color: "#ffa726", lineWidth: 1, priceLineVisible: false }) };
  } else S.macdS = {};
}

function refreshData(full) {
  if (!S.main) return;
  S.main.setData(barData()); S.main.setMarkers(markers());
  const b = S.bars, cl = b.map((x) => x.close);
  const series = (arr) => arr.map((v, i) => (v == null ? null : { time: b[i].time, value: v })).filter(Boolean);
  if (S.ser.sma) S.ser.sma.setData(series(Ind.sma(cl, 20)));
  if (S.ser.ema) S.ser.ema.setData(series(Ind.ema(cl, 50)));
  if (S.ser.bbu) { const bb = Ind.bollinger(cl, 20, 2); S.ser.bbu.setData(series(bb.up)); S.ser.bbm.setData(series(bb.mid)); S.ser.bbl.setData(series(bb.lo)); }
  if (S.ser.vol) S.ser.vol.setData(b.map((x) => ({ time: x.time, value: x.volume, color: x.close >= x.open ? "#26a69a55" : "#ef535055" })));
  if (S.rsiS) S.rsiS.setData(series(Ind.rsi(cl, 14)));
  if (S.macdS.line) {
    const m = Ind.macd(cl, 12, 26, 9); S.macdS.line.setData(series(m.line)); S.macdS.sig.setData(series(m.signal));
    S.macdS.hist.setData(m.hist.map((v, i) => (v == null ? null : { time: b[i].time, value: v, color: v >= 0 ? "#26a69a88" : "#ef535088" })).filter(Boolean));
  }
  if (full) onCross({});
}

function updateLast() { // fast path: only the forming bar moves
  const b = S.bars[S.bars.length - 1]; if (!b || !S.main) return;
  if (S.type === "ha") { S.main.setData(barData()); }
  else if (S.type === "line" || S.type === "area") S.main.update({ time: b.time, value: b.close });
  else S.main.update({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close });
  if (S.ser.vol) S.ser.vol.update({ time: b.time, value: b.volume, color: b.close >= b.open ? "#26a69a55" : "#ef535055" });
}

/* ================= drawings ================= */
function drawDrawings() {
  for (const l of S.lines) S.main.removePriceLine(l); S.lines = [];
  for (const p of S.prims) { try { S.main.detachPrimitive(p); } catch (_) { /* gone */ } } S.prims = [];
  if (!S.sym) return; const k = key(S.sym);
  for (const price of store.get("h:" + k, [])) S.lines.push(S.main.createPriceLine({ price, color: "#f0b429", lineWidth: 1, lineStyle: 0, title: "" }));
  for (const t of store.get("t:" + k, [])) { const p = new TrendLine(t[0], t[1]); S.main.attachPrimitive(p); S.prims.push(p); }
  for (const st of Object.values(S.bot)) {
    const e = k.startsWith("kraken:") ? (st.entries || {})[S.sym.id] : null; if (!e) continue;
    S.lines.push(S.main.createPriceLine({ price: e.price, color: "#26a69a", lineStyle: 2, lineWidth: 1, title: "bot entry" }));
    S.lines.push(S.main.createPriceLine({ price: e.price * (1 - st.meta.limits.stop_loss_frac), color: "#ef5350", lineStyle: 2, lineWidth: 1, title: "bot stop" }));
  }
  for (const o of S.paper.orders) if (o.key === k) S.lines.push(S.main.createPriceLine({ price: o.price, color: "#42a5f5", lineStyle: 1, lineWidth: 1, title: "your " + o.side + " limit" }));
}
function setTool(t) {
  S.pending = null;
  if (t === "clear") { const k = key(S.sym); store.set("h:" + k, []); store.set("t:" + k, []); drawDrawings(); t = "cursor"; }
  S.tool = t; for (const b of $("tools").children) b.className = b.dataset.tool === t ? "on" : "";
  $("notice").textContent = t === "hline" ? "Click the chart to place a horizontal line." : t === "trend" ? "Click two points on the chart to draw a trendline." : "";
}
function onClick(p) {
  if (!p.point || !p.time || !S.main || S.tool === "cursor") return;
  const price = S.main.coordinateToPrice(p.point.y); if (price == null) return; const k = key(S.sym);
  if (S.tool === "hline") { const a = store.get("h:" + k, []); a.push(price); store.set("h:" + k, a); drawDrawings(); setTool("cursor"); }
  else if (S.tool === "trend") {
    if (!S.pending) { S.pending = { time: p.time, price }; $("notice").textContent = "Click the second point."; }
    else { const a = store.get("t:" + k, []); a.push([S.pending, { time: p.time, price }]); store.set("t:" + k, a); drawDrawings(); setTool("cursor"); }
  }
}
function onCross(p) {
  if (!S.main) return;
  const d = p.seriesData && p.seriesData.get(S.main), x = d || S.bars[S.bars.length - 1];
  $("ohlc").textContent = x ? (x.open != null ? "O " + fmtPx(x.open) + "  H " + fmtPx(x.high) + "  L " + fmtPx(x.low) + "  C " + fmtPx(x.close) : "C " + fmtPx(x.value)) : "";
}

/* ================= symbols, history, live ================= */
async function loadSymbols() {
  await Promise.all(Providers.all.map(async (p) => {
    S.diag[p.id] = Object.assign(S.diag[p.id] || {}, { rest: "loading…" });
    try { S.syms[p.id] = await p.symbols(); S.diag[p.id].rest = S.syms[p.id].length + " markets"; }
    catch (e) { S.syms[p.id] = []; S.diag[p.id].rest = "failed: " + e.message; }
    for (const s of S.syms[p.id]) S.byKey[key(s)] = s;
  }));
}
function provOf(s) { return Providers[s.provider]; }

async function loadSymbol() {
  const seq = ++S.loadSeq, sym = S.sym; if (!sym) return;
  const p = provOf(sym), res = Core.resolve(p.native, S.tf);
  $("symbtn").textContent = sym.label + "  ·  " + p.name + " ▾"; $("pname").textContent = sym.label + " · " + p.name;
  S.tape = []; $("notice").textContent = "";
  let bars = [];
  if (res.base) {
    try { bars = await p.candles(sym, res.base); if (res.agg) bars = Core.aggregate(bars, S.tf); S.diag[p.id].history = "ok"; }
    catch (e) { S.diag[p.id].history = "failed: " + e.message; $("notice").textContent = "Could not load history (" + e.message + "). Live ticks still build the chart."; }
  } else $("notice").textContent = p.name + " has no " + S.tf + "s history, so this chart builds from live trades starting now. Binance offers 1-second history.";
  if (seq !== S.loadSeq) return;
  S.bars = bars; rebuild(); renderAll(); syncFeeds();
}

function ensureFeed(id) {
  if (!S.feeds[id]) S.feeds[id] = new Providers.Feed(Providers[id], onTick, (pid, st) => { S.diag[pid] = Object.assign(S.diag[pid] || {}, { ws: st }); });
  return S.feeds[id];
}
function syncFeeds() {
  const want = new Set(S.watch); if (S.sym) want.add(key(S.sym));
  for (const id of Object.keys(Providers).filter((x) => Providers[x].wsUrl)) {
    const feed = S.feeds[id]; if (feed) for (const [k, s] of [...feed.subs]) if (!want.has(provKey(id, s))) feed.remove(s);
  }
  for (const k of want) { const s = S.byKey[k]; if (s) ensureFeed(s.provider).add(s); }
}
const provKey = (id, s) => id + ":" + s.id;

function onTick(pid, t) {
  const k = pid + ":" + t.id, lv = S.live[k] || (S.live[k] = {});
  lv.prev = lv.last; lv.last = t.price; lv.dir = lv.prev == null ? 0 : t.price > lv.prev ? 1 : t.price < lv.prev ? -1 : lv.dir || 0;
  S.ticks++; S.tickWin.push(Date.now());
  for (const f of S.paper.onPrice(k, t.price, t.time)) { if (f.fill) { store.set("paper", S.paper.toJSON()); S.dirty = true; $("omsg").textContent = "Limit order filled at " + fmtPx(f.fill.price); } }
  if (S.sym && k === key(S.sym)) {
    S.tape.push(t); if (S.tape.length > 60) S.tape.shift();
    if (Core.applyTick(S.bars, t, S.tf)) S.dirty = true;
  }
  S.panelsDirty = true;
}

/* ================= panels ================= */
function renderHeader() {
  if (!S.sym) return; const lv = S.live[key(S.sym)] || {}, last = lv.last != null ? lv.last : (S.bars.length ? S.bars[S.bars.length - 1].close : null);
  const p = $("pprice"); p.textContent = fmtPx(last); p.className = "pprice " + (lv.dir > 0 ? "up" : lv.dir < 0 ? "down" : "");
  const st = S.stats[key(S.sym)]; const c = $("pchg"); c.textContent = st && st.changePct != null ? pct100(st.changePct) + " (24h)" : ""; c.className = "pchg " + (st && st.changePct >= 0 ? "up" : "down");
  const now = Date.now(); S.tickWin = S.tickWin.filter((x) => now - x < 5000);
  $("tickrate").textContent = S.tickWin.length ? "● " + (S.tickWin.length / 5).toFixed(1) + " ticks/s" : "waiting for ticks…";
}
function renderWatch() {
  const box = $("watch"); box.textContent = "";
  for (const k of S.watch) {
    const s = S.byKey[k], lv = S.live[k] || {}, st = S.stats[k] || {};
    const r = el("div", null, "wrow" + (S.sym && k === key(S.sym) ? " sel" : ""));
    const name = el("span", s ? s.label : k); name.appendChild(el("span", s ? Providers[s.provider].name : "", "prov")); r.appendChild(name);
    r.appendChild(el("span", fmtPx(lv.last != null ? lv.last : st.last), "p " + (lv.dir > 0 ? "up" : lv.dir < 0 ? "down" : "")));
    r.appendChild(el("span", pct100(st.changePct), st.changePct >= 0 ? "up" : "down"));
    const x = el("button", "✕", "x"); x.setAttribute("aria-label", "Remove " + k);
    x.addEventListener("click", (e) => { e.stopPropagation(); S.watch = S.watch.filter((w) => w !== k); store.set("watch", S.watch); syncFeeds(); renderWatch(); });
    r.appendChild(x); r.addEventListener("click", () => selectKey(k)); box.appendChild(r);
  }
  if (!S.watch.length) box.appendChild(el("div", "Empty. Open the symbol search and tap + to add markets.", "muted"));
}
function renderTape() {
  const box = $("tape"); box.textContent = "";
  for (let i = S.tape.length - 1, prev; i >= 0; i--) {
    const t = S.tape[i]; prev = S.tape[i - 1];
    const r = el("div"); r.appendChild(el("span", new Date(t.time * 1000).toLocaleTimeString()));
    r.appendChild(el("span", fmtPx(t.price), prev && t.price < prev.price ? "down" : "up")); r.appendChild(el("span", fmtQty(t.size), "muted")); box.appendChild(r);
  }
  if (!S.tape.length) box.appendChild(el("div", "Waiting for trades on this market…", "muted"));
}
function lastPx() { const lv = S.live[key(S.sym)] || {}; return lv.last != null ? lv.last : (S.bars.length ? S.bars[S.bars.length - 1].close : null); }
function renderTrade() {
  if (!S.sym) return; const k = key(S.sym), q = S.sym.quote, a = S.paper, last = lastPx();
  $("ubase").textContent = S.sym.base; $("wallet").textContent = "Wallet: " + fmtPx(a.wallet(q)) + " " + q + " (separate wallet per currency, starts at 10,000)";
  const pos = a.positions[k];
  $("opos").textContent = pos ? fmtQty(pos.units) + " " + S.sym.base + ", avg cost " + fmtPx(pos.cost / pos.units) + (last ? ", P/L " + fmtPx(a.unrealized(k, last)) + " " + q : "") : "No position";
  const ob = $("oorders"); ob.textContent = "";
  const mine = a.orders.filter((o) => o.key === k);
  if (!mine.length) ob.textContent = "None";
  for (const o of mine) { const d = el("div", o.side + " " + fmtQty(o.units) + " @ " + fmtPx(o.price) + "  "); const b = el("button", "cancel"); b.addEventListener("click", () => { a.cancel(o.id); store.set("paper", a.toJSON()); drawDrawings(); renderTrade(); }); d.appendChild(b); ob.appendChild(d); }
  const size = +$("osize").value, px = S.otype === "limit" ? +$("olimit").value : last;
  $("oest").textContent = size > 0 && px > 0 ? "≈ " + fmtPx(size * px) + " " + q + " + fee " + (a.fee * 100).toFixed(2) + "%" + (S.otype === "market" ? " + slippage " + (a.slip * 100).toFixed(1) + "%" : "") : "";
  const sb = $("osubmit"); sb.textContent = (S.side === "buy" ? "Buy " : "Sell ") + S.sym.base + (S.otype === "limit" ? " limit" : " at market"); sb.className = "submit " + S.side;
  renderMTrades();
}
function renderMTrades() {
  const tb = $("mtrades").tBodies[0]; tb.textContent = "";
  const h = [...S.paper.history].reverse().slice(0, 100);
  if (!h.length) { const tr = document.createElement("tr"), td = el("td", "No practice trades yet. Use the Trade tab.", "muted"); td.colSpan = 8; tr.appendChild(td); tb.appendChild(tr); }
  for (const f of h) {
    const s = S.byKey[f.key], tr = document.createElement("tr");
    for (const [v, c] of [[fmtDT(f.time)], [s ? s.label : f.key], [f.side, f.side === "buy" ? "up" : "down"], [f.type], [fmtQty(f.units)], [fmtPx(f.price)], [fmtPx(f.fee)], [f.pnl == null ? "–" : fmtPx(f.pnl), f.pnl >= 0 ? "up" : "down"]]) tr.appendChild(el("td", v, c));
    tb.appendChild(tr);
  }
}
function renderBot() {
  const box = $("botinfo"); box.textContent = ""; const k = S.sym ? key(S.sym) : "";
  const accts = Object.entries(S.bot);
  if (!accts.length) box.textContent = "Bot data not available yet.";
  for (const [name, st] of accts) {
    const d = el("div"); d.style.marginBottom = "10px"; const h = el("div", name); h.style.color = "var(--fg)"; d.appendChild(h);
    const inCfg = k.startsWith("kraken:") && (st.meta.assets || []).some((a) => a.symbol === S.sym.id);
    if (!inCfg) d.appendChild(el("div", "The bot does not trade this market on this account. Its markets are set in config/*.json."));
    else {
      const sel = (st.selection || {})[S.sym.id];
      d.appendChild(el("div", sel ? (sel.strategy === "cash" ? "In cash: no strategy passed testing" : "Strategy: " + sel.strategy + " " + JSON.stringify(sel.params)) : "Not selected yet"));
      const e = (st.entries || {})[S.sym.id], u = (st.units || {})[S.sym.id], last = lastPx();
      d.appendChild(el("div", e ? "Open: " + fmtQty(u) + " @ " + fmtPx(e.price) + (last ? "  (" + pct(last / e.price - 1) + ")" : "") : "No open position"));
    }
    box.appendChild(d);
  }
  const tb = $("btrades").tBodies[0]; tb.textContent = ""; let n = 0;
  for (const [name, st] of accts) for (const t of [...(st.trades || [])].reverse()) {
    n++; const tr = document.createElement("tr");
    for (const [v, c] of [[name], [t.symbol], [t.entry.slice(0, 16)], [t.exit.slice(0, 16)], [fmtPx(t.entry_price)], [fmtPx(t.exit_price)], [pct(t.ret), t.ret >= 0 ? "up" : "down"]]) tr.appendChild(el("td", v, c));
    tb.appendChild(tr);
  }
  if (!n) { const tr = document.createElement("tr"), td = el("td", "No closed bot trades yet.", "muted"); td.colSpan = 7; tr.appendChild(td); tb.appendChild(tr); }
}
function renderDiag() {
  const box = $("diag"); box.textContent = "";
  for (const p of Providers.all) {
    const d = S.diag[p.id] || {}, f = S.feeds[p.id];
    const age = f && f.last ? ((Date.now() - f.last) / 1000).toFixed(1) + "s ago" : "never";
    box.appendChild(el("div", p.name + ": markets " + (d.rest || "–") + " · history " + (d.history || "–") + " · live feed " + (d.ws || "idle") + " · ticks " + (f ? f.count : 0) + " · last tick " + age));
  }
  const ok = Object.values(S.feeds).some((f) => f.state === "live");
  $("dot").className = "dot " + (ok ? "on" : Object.keys(S.feeds).length ? "off" : ""); $("conn").textContent = ok ? "live" : (Object.keys(S.feeds).length ? "connecting…" : "starting…");
}
function renderAll() { renderHeader(); renderWatch(); renderTape(); renderTrade(); renderBot(); renderDiag(); }

/* ================= picker ================= */
const P = { prov: store.get("pprov", "all"), quote: store.get("pquote", "ALL") };
function renderPicker() {
  const q = $("q").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""), list = $("piclist"); list.textContent = "";
  const pool = Object.values(S.syms).flat().filter((s) => P.prov === "all" || s.provider === P.prov);
  const counts = {}; for (const s of pool) counts[s.quote] = (counts[s.quote] || 0) + 1;
  const quotes = ["ALL", ...Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 7)];
  const qb = $("quotes"); qb.textContent = ""; for (const x of quotes) { const b = el("button", x); if (x === P.quote) b.className = "on"; b.addEventListener("click", () => { P.quote = x; store.set("pquote", x); renderPicker(); }); qb.appendChild(b); }
  const pb = $("provs"); pb.textContent = ""; for (const [id, name] of [["all", "All"], ...Providers.all.map((p) => [p.id, p.name])]) { const b = el("button", name); if (id === P.prov) b.className = "on"; b.addEventListener("click", () => { P.prov = id; store.set("pprov", id); renderPicker(); }); pb.appendChild(b); }
  const bots = new Set(Object.values(S.bot).flatMap((st) => (st.meta ? st.meta.assets.map((a) => "kraken:" + a.symbol) : [])));
  const rows = pool.filter((s) => (P.quote === "ALL" || s.quote === P.quote) && (!q || (s.base + s.quote).includes(q) || s.id.toUpperCase().includes(q)))
    .sort((a, b) => (bots.has(key(b)) - bots.has(key(a))) || a.label.localeCompare(b.label));
  for (const s of rows.slice(0, 300)) {
    const r = el("div", null, "row"); r.tabIndex = 0; r.setAttribute("role", "option");
    const left = el("span", s.label); left.appendChild(el("span", Providers[s.provider].name, "prov")); if (bots.has(key(s))) left.appendChild(el("span", "BOT", "tag")); r.appendChild(left);
    const k = key(s), add = el("button", S.watch.includes(k) ? "✓ in watchlist" : "+ watchlist");
    add.addEventListener("click", (e) => { e.stopPropagation(); if (!S.watch.includes(k)) { S.watch.push(k); store.set("watch", S.watch); syncFeeds(); renderWatch(); loadStats(); } renderPicker(); });
    r.appendChild(add); r.addEventListener("click", () => selectKey(k)); r.addEventListener("keydown", (e) => { if (e.key === "Enter") selectKey(k); });
    list.appendChild(r);
  }
  if (!rows.length) list.appendChild(el("div", Object.keys(S.syms).length ? "No market matches. Try BTC, ETH or DOGE." : "Loading markets…", "muted"));
  else if (rows.length > 300) list.appendChild(el("div", rows.length - 300 + " more. Type to narrow the search.", "muted"));
}
function selectKey(k) { const s = S.byKey[k]; if (!s) return; S.sym = s; store.set("sym", k); $("picker").hidden = true; loadSymbol(); loadStats(); }

async function loadStats() {
  for (const k of new Set([...S.watch, S.sym ? key(S.sym) : null])) {
    const s = S.byKey[k]; if (!s) continue;
    try { S.stats[k] = await provOf(s).stats24(s); } catch (_) { /* leave blank */ }
  }
  S.panelsDirty = true;
}

/* ================= bot data ================= */
async function loadBot() {
  S.bot = {};
  for (const [name, file] of [["Main (daily)", "paper.json"], ["Fast lab (hourly)", "paper_fast.json"]])
    for (const b of BASES) { try { const r = await fetch(b + file + "?t=" + Date.now(), { cache: "no-store" }); if (r.ok) { S.bot[name] = await r.json(); break; } } catch (_) { /* next source */ } }
}

/* ================= wiring ================= */
function renderTfs() {
  const box = $("tfs"); box.textContent = "";
  for (const [sec, label] of Core.TFS) { const b = el("button", label); if (sec === S.tf) b.className = "on"; b.addEventListener("click", () => { S.tf = sec; store.set("tf", sec); renderTfs(); loadSymbol(); }); box.appendChild(b); }
}
function renderInd() {
  const box = $("indmenu"); box.textContent = "";
  for (const [k, label] of IND_DEFS) { const l = el("label"), c = document.createElement("input"); c.type = "checkbox"; c.checked = !!S.ind[k]; c.addEventListener("change", () => { S.ind[k] = c.checked; store.set("ind", S.ind); rebuild(); }); l.appendChild(c); l.appendChild(document.createTextNode(label)); box.appendChild(l); }
}
function setTab(t) { S.tab = t; for (const b of $("tabs2").children) b.className = b.dataset.tab === t ? "on" : ""; for (const x of ["watch", "trade", "bot", "tape"]) $("p-" + x).hidden = x !== t; renderAll(); }

function submitOrder() {
  if (!S.sym) return; const k = key(S.sym), q = S.sym.quote, size = +$("osize").value, last = lastPx(), a = S.paper; let r;
  if (S.otype === "market") r = a.market(k, q, S.side, size, last, Date.now() / 1000);
  else r = a.limit(k, q, S.side, size, +$("olimit").value);
  $("omsg").textContent = r.error ? r.error : r.fill ? (r.fill.side === "buy" ? "Bought " : "Sold ") + fmtQty(r.fill.units) + " @ " + fmtPx(r.fill.price) + " (fee " + fmtPx(r.fill.fee) + ")" : "Limit order placed.";
  store.set("paper", a.toJSON()); drawDrawings(); S.main.setMarkers(markers()); renderTrade();
}

function frame() {
  const now = performance.now();
  if (S.dirty) { S.dirty = false; updateLast(); if (now - S.dirtyAt > 300) { S.dirtyAt = now; S.main.setMarkers(markers()); refreshIndLight(); } }
  requestAnimationFrame(frame);
}
function refreshIndLight() { // indicators follow the forming bar a few times a second
  const b = S.bars, cl = b.map((x) => x.close), n = b.length - 1; if (n < 0) return;
  const last = (arr) => (arr[n] == null ? null : { time: b[n].time, value: arr[n] });
  const set = (s, v) => { if (s && v) s.update(v); };
  set(S.ser.sma, last(Ind.sma(cl, 20))); set(S.ser.ema, last(Ind.ema(cl, 50)));
  if (S.ser.bbu) { const bb = Ind.bollinger(cl, 20, 2); set(S.ser.bbu, last(bb.up)); set(S.ser.bbm, last(bb.mid)); set(S.ser.bbl, last(bb.lo)); }
  set(S.rsiS, last(Ind.rsi(cl, 14)));
  if (S.macdS.line) { const m = Ind.macd(cl, 12, 26, 9); set(S.macdS.line, last(m.line)); set(S.macdS.sig, last(m.signal)); if (m.hist[n] != null) S.macdS.hist.update({ time: b[n].time, value: m.hist[n], color: m.hist[n] >= 0 ? "#26a69a88" : "#ef535088" }); }
}

async function init() {
  renderTfs(); renderInd(); setTool("cursor"); $("ctype").value = S.type; $("logbtn").className = S.log ? "on" : "";
  $("symbtn").addEventListener("click", () => { $("picker").hidden = false; renderPicker(); $("q").focus(); });
  $("pickclose").addEventListener("click", () => { $("picker").hidden = true; });
  $("q").addEventListener("input", renderPicker);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("picker").hidden = true; });
  $("indbtn").addEventListener("click", () => { $("indmenu").hidden = !$("indmenu").hidden; });
  for (const b of $("tools").children) b.addEventListener("click", () => setTool(b.dataset.tool));
  $("ctype").addEventListener("change", (e) => { S.type = e.target.value; store.set("type", S.type); rebuild(); });
  $("logbtn").addEventListener("click", () => { S.log = !S.log; store.set("log", S.log); $("logbtn").className = S.log ? "on" : ""; if (S.chart) S.chart.applyOptions({ rightPriceScale: { mode: S.log ? 1 : 0 } }); });
  $("shot").addEventListener("click", () => { if (!S.chart) return; S.chart.takeScreenshot().toBlob((bl) => { const a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = (S.sym ? S.sym.label.replace("/", "-") : "chart") + ".png"; a.click(); }); });
  $("full").addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
  for (const b of $("tabs2").children) b.addEventListener("click", () => setTab(b.dataset.tab));
  for (const [id, side] of [["sbuy", "buy"], ["ssell", "sell"]]) $(id).addEventListener("click", () => { S.side = side; $("sbuy").className = side === "buy" ? "on" : ""; $("ssell").className = side === "sell" ? "on" : ""; renderTrade(); });
  for (const [id, t] of [["omkt", "market"], ["olim", "limit"]]) $(id).addEventListener("click", () => { S.otype = t; $("omkt").className = t === "market" ? "on" : ""; $("olim").className = t === "limit" ? "on" : ""; $("limfld").hidden = t !== "limit"; if (t === "limit" && !$("olimit").value && lastPx()) $("olimit").value = lastPx(); renderTrade(); });
  for (const f of [25, 50, 100]) { const b = el("button", f + "%"); b.addEventListener("click", () => { if (!S.sym) return; const px = S.otype === "limit" && +$("olimit").value ? +$("olimit").value : lastPx(); const k = key(S.sym); if (S.side === "buy") $("osize").value = ((S.paper.wallet(S.sym.quote) * f / 100) / (px * (1 + S.paper.slip + S.paper.fee))).toPrecision(6); else $("osize").value = (((S.paper.positions[k] || {}).units || 0) * f / 100).toPrecision(6); renderTrade(); }); $("pcts").appendChild(b); }
  for (const id of ["osize", "olimit"]) $(id).addEventListener("input", renderTrade);
  $("osubmit").addEventListener("click", submitOrder);
  $("oreset").addEventListener("click", () => { S.paper = new PaperAccount(); store.set("paper", S.paper.toJSON()); $("omsg").textContent = "Practice account reset."; drawDrawings(); if (S.main) S.main.setMarkers(markers()); renderTrade(); });

  await Promise.all([loadSymbols(), loadBot()]);
  const saved = store.get("sym", "kraken:XBTCAD");
  S.sym = S.byKey[saved] || S.byKey["kraken:XBTCAD"] || S.byKey["binance:BTCUSDT"] || Object.values(S.byKey)[0] || null;
  if (!S.sym) { $("conn").textContent = "could not load any market list (see Connections below)"; renderDiag(); return; }
  await loadSymbol(); loadStats(); requestAnimationFrame(frame);
  setInterval(() => { if (S.panelsDirty) { S.panelsDirty = false; renderHeader(); renderWatch(); if (S.tab === "tape") renderTape(); if (S.tab === "trade") renderTrade(); if (S.tab === "bot") renderBot(); } renderDiag(); }, 250);
  setInterval(loadStats, 60000); setInterval(async () => { await loadBot(); renderBot(); }, 300000);
}
init();
