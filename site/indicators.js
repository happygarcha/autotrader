"use strict";
// Pure indicator maths. Inputs are arrays of numbers; outputs align to the input index (null = not enough data).
const Ind = {
  sma(v, n) {
    const out = new Array(v.length).fill(null); let sum = 0;
    for (let i = 0; i < v.length; i++) { sum += v[i]; if (i >= n) sum -= v[i - n]; if (i >= n - 1) out[i] = sum / n; }
    return out;
  },
  ema(v, n) {
    const out = new Array(v.length).fill(null); const k = 2 / (n + 1); let prev = null;
    for (let i = 0; i < v.length; i++) {
      if (i === n - 1) { prev = v.slice(0, n).reduce((a, b) => a + b, 0) / n; out[i] = prev; }
      else if (i >= n) { prev = v[i] * k + prev * (1 - k); out[i] = prev; }
    }
    return out;
  },
  bollinger(v, n, mult) {
    const mid = Ind.sma(v, n), up = [], lo = [];
    for (let i = 0; i < v.length; i++) {
      if (mid[i] == null) { up.push(null); lo.push(null); continue; }
      let s = 0; for (let j = i - n + 1; j <= i; j++) s += (v[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / n); up.push(mid[i] + mult * sd); lo.push(mid[i] - mult * sd);
    }
    return { mid, up, lo };
  },
  rsi(v, n) {
    const out = new Array(v.length).fill(null); if (v.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  },
};
if (typeof module !== "undefined") module.exports = Ind;
Ind.macd = function (v, fast, slow, sig) {
  const f = Ind.ema(v, fast), s = Ind.ema(v, slow), line = v.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
  const first = line.findIndex((x) => x != null), signal = new Array(v.length).fill(null);
  if (first >= 0) { const e = Ind.ema(line.slice(first), sig); e.forEach((x, i) => { signal[first + i] = x; }); }
  const hist = line.map((x, i) => (x == null || signal[i] == null ? null : x - signal[i]));
  return { line, signal, hist };
};
if (typeof module !== "undefined") module.exports = Ind;
