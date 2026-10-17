"use strict";
// Pure helpers shared by the terminal and the node tests. No DOM, no network.
const Core = {
  // [seconds, label]
  TFS: [[1, "1s"], [5, "5s"], [15, "15s"], [30, "30s"], [60, "1m"], [180, "3m"], [300, "5m"], [900, "15m"],
        [1800, "30m"], [3600, "1h"], [7200, "2h"], [14400, "4h"], [21600, "6h"], [43200, "12h"],
        [86400, "1D"], [604800, "1W"]],

  floor(t, tf) { return Math.floor(t / tf) * tf; },

  // Fold one trade tick into the bar series (mutates `bars`). Returns {bar, isNew} or null for an
  // old tick. Bars are anchored to the last known bar so exchange-specific alignment (4h, weekly)
  // is never guessed.
  applyTick(bars, tick, tf) {
    const last = bars[bars.length - 1];
    let t;
    if (!last) t = Core.floor(tick.time, tf);
    else if (tick.time < last.time) return null;
    else t = last.time + Math.floor((tick.time - last.time) / tf) * tf;
    if (!last || t > last.time) {
      const b = { time: t, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.size || 0 };
      bars.push(b); return { bar: b, isNew: true };
    }
    last.high = Math.max(last.high, tick.price); last.low = Math.min(last.low, tick.price);
    last.close = tick.price; last.volume += tick.size || 0;
    return { bar: last, isNew: false };
  },

  // Merge finer bars into coarser ones of `tf` seconds.
  aggregate(bars, tf) {
    const out = [];
    for (const b of bars) {
      const t = Core.floor(b.time, tf), last = out[out.length - 1];
      if (last && last.time === t) {
        last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low);
        last.close = b.close; last.volume += b.volume;
      } else out.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    }
    return out;
  },

  // Which native interval to fetch for a wanted timeframe.
  // {base, agg}: agg=true means fetch `base` and aggregate. base=null: no history, ticks only.
  resolve(native, tf) {
    if (native.includes(tf)) return { base: tf, agg: false };
    const cands = native.filter((n) => n < tf && tf % n === 0);
    return cands.length ? { base: Math.max(...cands), agg: true } : { base: null, agg: false };
  },

  heikinAshi(bars) {
    const out = []; let po = null, pc = null;
    for (const b of bars) {
      const c = (b.open + b.high + b.low + b.close) / 4;
      const o = po == null ? (b.open + b.close) / 2 : (po + pc) / 2;
      out.push({ time: b.time, open: o, high: Math.max(b.high, o, c), low: Math.min(b.low, o, c), close: c });
      po = o; pc = c;
    }
    return out;
  },
};
if (typeof module !== "undefined") module.exports = Core;
