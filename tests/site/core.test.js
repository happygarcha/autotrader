const assert = require("node:assert");
const Core = require("../../site/core.js");
const Paper = require("../../site/paper.js");
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

// --- applyTick
let bars = [];
let r = Core.applyTick(bars, { price: 100, size: 1, time: 1000 }, 60);
assert.ok(r.isNew); assert.strictEqual(bars[0].time, 960);
r = Core.applyTick(bars, { price: 105, size: 2, time: 1010 }, 60);
assert.ok(!r.isNew); assert.deepStrictEqual(bars[0], { time: 960, open: 100, high: 105, low: 100, close: 105, volume: 3 });
r = Core.applyTick(bars, { price: 98, size: 1, time: 1015 }, 60); near(bars[0].low, 98); near(bars[0].close, 98);
r = Core.applyTick(bars, { price: 99, size: 1, time: 1030 }, 60); assert.ok(r.isNew); assert.strictEqual(bars[1].time, 1020);
assert.strictEqual(Core.applyTick(bars, { price: 1, size: 1, time: 100 }, 60), null); // old tick ignored
// anchored to last bar (odd alignment, e.g. weekly from a Monday start)
const wk = [{ time: 345600, open: 1, high: 1, low: 1, close: 1, volume: 0 }];
Core.applyTick(wk, { price: 2, size: 1, time: 345600 + 1000 }, 604800); assert.strictEqual(wk.length, 1);
Core.applyTick(wk, { price: 3, size: 1, time: 345600 + 604800 + 5 }, 604800); assert.strictEqual(wk.length, 2); assert.strictEqual(wk[1].time, 345600 + 604800);
// seconds bars
const sec = []; for (let t = 0; t < 5; t++) Core.applyTick(sec, { price: 10 + t, size: 1, time: 100 + t * 0.4 }, 1);
assert.ok(sec.length >= 2);

// --- aggregate
const m1 = Array.from({ length: 10 }, (_, i) => ({ time: i * 60, open: i, high: i + 2, low: i - 1, close: i + 1, volume: 1 }));
const m5 = Core.aggregate(m1, 300);
assert.strictEqual(m5.length, 2);
assert.deepStrictEqual(m5[0], { time: 0, open: 0, high: 6, low: -1, close: 5, volume: 5 });
assert.strictEqual(m5[1].open, 5);

// --- resolve
assert.deepStrictEqual(Core.resolve([60, 300, 3600], 300), { base: 300, agg: false });
assert.deepStrictEqual(Core.resolve([60, 300, 3600], 900), { base: 300, agg: true });
assert.deepStrictEqual(Core.resolve([60, 300, 3600], 7200), { base: 3600, agg: true });
assert.deepStrictEqual(Core.resolve([60, 300], 30), { base: null, agg: false }); // sub-minute: ticks only
assert.deepStrictEqual(Core.resolve([1, 60], 30), { base: 1, agg: true });
assert.deepStrictEqual(Core.resolve([1, 60], 5), { base: 1, agg: true });

// --- heikin ashi
const ha = Core.heikinAshi([{ time: 1, open: 10, high: 12, low: 9, close: 11 }, { time: 2, open: 11, high: 13, low: 10, close: 12 }]);
near(ha[0].close, 10.5); near(ha[0].open, 10.5); near(ha[1].open, 10.5); near(ha[1].close, 11.5);

// --- paper account
const p = new Paper();
let f = p.market("k:BTC", "USD", "buy", 0.1, 50000, 1);
assert.ok(f.fill); near(f.fill.price, 50050); near(f.fill.fee, 0.1 * 50050 * 0.0026);
near(p.wallet("USD"), 10000 - 0.1 * 50050 - f.fill.fee);
assert.ok(p.market("k:BTC", "USD", "buy", 10, 50000).error);            // not enough money
assert.ok(p.market("k:BTC", "USD", "sell", 1, 50000).error);            // no shorting
f = p.market("k:BTC", "USD", "sell", 0.1, 55000, 2);
const cost = 0.1 * 50050 + 0.1 * 50050 * 0.0026, proceeds = 0.1 * 55000 * 0.999 - 0.1 * 55000 * 0.999 * 0.0026;
near(f.fill.pnl, proceeds - cost, 1e-6); assert.strictEqual(Object.keys(p.positions).length, 0);
assert.ok(p.wallet("CAD") === 10000);                                    // separate wallet per quote
// limit orders fill only when touched
const q = new Paper(); q.limit("k:ETH", "USD", "buy", 1, 2000);
assert.deepStrictEqual(q.onPrice("k:ETH", 2100, 1), []); const fl = q.onPrice("k:ETH", 1999, 2);
assert.strictEqual(fl.length, 1); near(fl[0].fill.price, 2000); assert.strictEqual(q.orders.length, 0);
// persistence round trip
const q2 = new Paper(JSON.parse(JSON.stringify(q.toJSON()))); near(q2.wallet("USD"), q.wallet("USD"));
console.log("core + paper tests passed");
