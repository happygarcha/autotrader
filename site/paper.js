"use strict";
// Manual practice account for the terminal. Fake money, spot only, long only, no leverage.
// One virtual wallet per quote currency (no currency conversion is ever pretended).
class PaperAccount {
  constructor(saved) {
    const s = saved || {};
    this.start = s.start || 10000;
    this.wallets = s.wallets || {}; this.positions = s.positions || {};
    this.orders = s.orders || []; this.history = s.history || []; this.seq = s.seq || 1;
    this.fee = 0.0026; this.slip = 0.001; // same cost assumptions as the bot's paper account
  }
  toJSON() { return { start: this.start, wallets: this.wallets, positions: this.positions, orders: this.orders, history: this.history, seq: this.seq }; }
  wallet(q) { if (!(q in this.wallets)) this.wallets[q] = this.start; return this.wallets[q]; }

  market(key, quote, side, units, price, time) {
    if (!(units > 0) || !(price > 0)) return { error: "Enter a size above zero." };
    return this._fill(key, quote, side, units, side === "buy" ? price * (1 + this.slip) : price * (1 - this.slip), "market", time);
  }
  limit(key, quote, side, units, limitPrice) {
    if (!(units > 0) || !(limitPrice > 0)) return { error: "Enter a size and a price above zero." };
    const o = { id: this.seq++, key, quote, side, units, price: limitPrice };
    this.orders.push(o); return { order: o };
  }
  cancel(id) { this.orders = this.orders.filter((o) => o.id !== id); }

  // Call on every tick for `key`. A limit order fills once price touches it (at the limit price).
  // Optimistic: real queue position may mean no fill at the touch. Returns the fills.
  onPrice(key, price, time) {
    const fills = [];
    for (const o of [...this.orders]) {
      if (o.key !== key) continue;
      if ((o.side === "buy" && price <= o.price) || (o.side === "sell" && price >= o.price)) {
        this.orders = this.orders.filter((x) => x.id !== o.id);
        const f = this._fill(key, o.quote, o.side, o.units, o.price, "limit", time, true);
        fills.push(f);
      }
    }
    return fills;
  }

  _fill(key, quote, side, units, px, type, time, noSlip) {
    const fee = units * px * this.fee;
    const pos = this.positions[key] || { units: 0, cost: 0, quote };
    if (side === "buy") {
      const total = units * px + fee;
      if (this.wallet(quote) < total) return { error: "Not enough " + quote + " in the practice wallet." };
      this.wallets[quote] -= total; pos.units += units; pos.cost += total; pos.quote = quote;
      this.positions[key] = pos;
      return this._log({ key, quote, side, units, price: px, fee, pnl: null, type, time });
    }
    if (units > pos.units + 1e-12) return { error: "You can only sell what you hold (no shorting)." };
    const avg = pos.cost / pos.units, proceeds = units * px - fee, pnl = proceeds - units * avg;
    this.wallets[quote] = this.wallet(quote) + proceeds;
    pos.units -= units; pos.cost -= units * avg;
    if (pos.units <= 1e-12) delete this.positions[key]; else this.positions[key] = pos;
    return this._log({ key, quote, side, units, price: px, fee, pnl, type, time });
  }
  _log(f) { f.id = this.seq++; this.history.push(f); return { fill: f }; }

  unrealized(key, price) {
    const p = this.positions[key]; if (!p) return null;
    return p.units * price - p.cost;
  }
  equity(quote, prices) { // prices: key -> last price; counts only positions quoted in `quote`
    let e = this.wallet(quote);
    for (const [k, p] of Object.entries(this.positions)) if (p.quote === quote && prices[k]) e += p.units * prices[k];
    return e;
  }
}
if (typeof module !== "undefined") module.exports = PaperAccount;
