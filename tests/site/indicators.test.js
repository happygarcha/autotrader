const assert = require("node:assert");
const Ind = require("../../site/indicators.js");
const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

// SMA of 1..5 with n=3 -> [null,null,2,3,4]
assert.deepStrictEqual(Ind.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
// EMA seeds with SMA, then k = 2/(n+1) = 0.5 for n=3
const e = Ind.ema([1, 2, 3, 4, 5], 3);
assert.deepStrictEqual(e.slice(0, 2), [null, null]); close(e[2], 2); close(e[3], 3); close(e[4], 4);
// Bollinger: flat series -> zero width
const b = Ind.bollinger([5, 5, 5, 5], 3, 2); close(b.up[3], 5); close(b.lo[3], 5);
// Bollinger known value: [1,2,3] n=3 -> mean 2, sd sqrt(2/3)
const b2 = Ind.bollinger([1, 2, 3], 3, 2); close(b2.mid[2], 2); close(b2.up[2], 2 + 2 * Math.sqrt(2 / 3));
// RSI: strictly rising -> 100; strictly falling -> 0
const up = Ind.rsi(Array.from({ length: 20 }, (_, i) => i), 14); close(up[19], 100);
const dn = Ind.rsi(Array.from({ length: 20 }, (_, i) => 20 - i), 14); close(dn[19], 0);
assert.strictEqual(Ind.rsi([1, 2, 3], 14)[2], null);
// RSI known value (Wilder, n=2): closes 1,2,1 -> avg gain .5 avg loss .5 at i=2 -> 50
close(Ind.rsi([1, 2, 1], 2)[2], 50);
console.log("indicator tests passed");
