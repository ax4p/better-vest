// Better Vest P&L card, Replay: today's trades of one account drawn on Vest's own candles (design 05 of docs/pnl-cards, the owner's
// pick, 2026-10-06). Pure: no DOM, no chrome. The dock (src/copy/35-share.js) sends Vest's bars (the chart's own, or Vest's datafeed for
// another timeframe) and the account's raw /v3/positions rows of today; the fills are read with the Calendar's own parser
// (journal/model.js), so a fill sits exactly where Vest executed it: its time picks the candle, its price the height.

import { normalizeFills, normalizePosition, tsMs } from '../journal/model.js';

export const REPLAY_RES = ['1', '5', '15', '60'];   // minutes per candle
export const REPLAY_MAX_BARS = 400;
export const REPLAY_MAX_ROWS = 100;
const MAX_ORDERS = 40;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, max) : '');
const idOk = (v) => typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v);
const scalar = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 40 && /^[\w.:+-]*$/.test(v)) || v == null;

// a time zone name as TradingView and Intl spell it ("Europe/Stockholm", "America/New_York", "Etc/UTC")
export function tzOk(tz) {
    if (typeof tz !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}

// The fields of a /v3/positions row the Replay reads, and of each of its orders; anything else is dropped.
const ROW_KEYS = ['positionId', 'accountId', 'symbol', 'side', 'quantity', 'openPrice', 'closePrice', 'openDate', 'closeDate', 'pnl', 'fee', 'funding', 'closeReason'];
const ORDER_KEYS = ['order_id', 'side', 'position_order_type', 'executed_quantity', 'execution_price', 'execution_time', 'fee', 'updated_at', 'created_at', 'status', 'order_type'];
function cleanRow(r, accountId) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || r.positionId == null || !idOk(String(r.positionId))) return null;
    const o = {};
    for (const k of ROW_KEYS) if (k in r && scalar(r[k])) o[k] = r[k];
    o.positionId = String(r.positionId);
    o.accountId = accountId;
    o.orders = (Array.isArray(r.orders) ? r.orders : []).slice(0, MAX_ORDERS).filter((x) => x && typeof x === 'object' && !Array.isArray(x)).map((x) => {
        const q = {};
        for (const k of ORDER_KEYS) if (k in x && scalar(x[k])) q[k] = x[k];
        return q;
    });
    return o;
}

// The replay part of a snapshot, made safe: known fields, bounded lists, bars as [time s, open, high, low, close] in time order with a
// high and low that hold the open and close. null when there is nothing usable (the card then says why, from `err`).
export function cleanReplay(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const err = /^[a-z-]{1,24}$/.test(String(r.err || '')) ? String(r.err) : '';
    const res = REPLAY_RES.includes(String(r.res)) ? String(r.res) : '';
    const bars = [];
    let last = -Infinity;
    for (const b of Array.isArray(r.bars) ? r.bars.slice(-REPLAY_MAX_BARS) : []) {
        if (!Array.isArray(b) || b.length < 5) continue;
        const [t, o, h, l, c] = b.map(num);
        if (t == null || o == null || h == null || l == null || c == null || t <= last) continue;
        if (!(h >= Math.max(o, c) - 1e-9 && l <= Math.min(o, c) + 1e-9 && l > 0)) continue;
        bars.push([t, o, h, l, c]);
        last = t;
    }
    const accountId = idOk(r.accountId) ? r.accountId : '';
    const rows = accountId ? (Array.isArray(r.rows) ? r.rows : []).slice(0, REPLAY_MAX_ROWS).map((x) => cleanRow(x, accountId)).filter(Boolean) : [];
    const out = {
        accountId, market: /^[A-Z0-9]{1,12}$/.test(String(r.market || '')) ? String(r.market) : '', res, tz: tzOk(r.tz) ? r.tz : 'Etc/UTC',
        // the session's day: today, or the latest day this account traded the market (the card is dated by it)
        day: /^\d{4}-\d{2}-\d{2}$/.test(String(r.day || '')) ? String(r.day) : '',
        bars: res ? bars : [], rows, others: num(r.others) != null && r.others >= 0 ? Math.min(999, Math.round(r.others)) : 0,
        sample: r.sample === true, sampleTarget: num(r.sampleTarget), err
    };
    if (!out.bars.length && !out.err) out.err = 'no-bars';
    return out;
}

// ---------- the trades ----------

const ENTRY = new Set(['open', 'append']);
// One trade as the chart draws it: every fill at its own time and price, the average entry and exit, the net P&L (Vest's pnl, minus the
// fee, plus funding: the Calendar's number).
function tradeOf(row) {
    const p = normalizePosition(row, null);
    if (p.void) return null;
    const fills = normalizeFills(row).filter((f) => f.ts != null && f.px != null).map((f) => ({ t: f.ts, px: f.px, qty: f.qty, entry: ENTRY.has(f.role) }));
    // a row without fills (an old one) still has its open and close: one entry and one exit at Vest's own prices and times
    if (!fills.length && p.openTs != null && p.entryPx != null) {
        fills.push({ t: p.openTs, px: p.entryPx, qty: p.qty || 0, entry: true });
        if (!p.open && p.closeTs != null && p.exitPx != null) fills.push({ t: p.closeTs, px: p.exitPx, qty: p.qty || 0, entry: false });
    }
    if (!fills.length) return null;
    return { id: p.id, side: p.side, qty: p.fills.peakQty || p.qty || 0, open: p.open, openT: fills[0].t, closeT: p.open ? null : fills[fills.length - 1].t,
        entryPx: p.entryPx, exitPx: p.exitPx, net: p.open ? null : Math.round(p.net * 100) / 100, fee: p.fee || 0, fills };
}

// Made-up trades on Vest's real candles, for the copy demo and showcases (the card then says Sample): each one is placed inside its
// candles' real high and low, so the picture stays a true picture of the market. Deterministic: the same bars give the same trades.
// target: about what they should add up to (the size is picked for it), else 1 contract each.
export function sampleTrades(bars, opts) {
    const o = opts || {};
    if (!Array.isArray(bars) || bars.length < 24) return [];
    const resMs = (bars[1][0] - bars[0][0]) * 1000;
    const tick = 0.25;
    const snap = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v / tick) * tick));
    const segs = Math.max(3, Math.min(7, Math.floor(bars.length / 12)));
    const len = Math.floor(bars.length / segs);
    const raw = [];
    for (let s = 0; s < segs; s++) {
        const seg = bars.slice(s * len + 1, (s + 1) * len - 1);
        if (seg.length < 6) continue;
        const half = Math.floor(seg.length / 2);
        // a long from the lowest low of the first half to the highest high after it, or a short the other way: whichever move is bigger
        const lo = seg.slice(0, half).reduce((a, b) => (b[3] < a[3] ? b : a));
        const hiAfter = seg.slice(seg.indexOf(lo) + 1).reduce((a, b) => (b[2] > a[2] ? b : a), seg[seg.indexOf(lo) + 1]);
        const hi = seg.slice(0, half).reduce((a, b) => (b[2] > a[2] ? b : a));
        const loAfter = seg.slice(seg.indexOf(hi) + 1).reduce((a, b) => (b[3] < a[3] ? b : a), seg[seg.indexOf(hi) + 1]);
        const longMove = hiAfter ? hiAfter[2] - lo[3] : -Infinity, shortMove = loAfter ? hi[2] - loAfter[3] : -Infinity;
        // the second-to-last trade of the day goes the wrong way and is cut on the next candle, about 3 points against: nobody wins
        // every trade, and a loss is kept small. In at a candle's close, against the way the next candle went, out at a price it traded
        if (segs >= 4 && s === segs - 2) {
            const e = seg[1], x = seg[2];
            const side = x[4] < e[4] ? 'long' : 'short';
            const ePx = snap(e[4], e[3], e[2]);
            const xPx = snap(side === 'long' ? ePx - 3 : ePx + 3, x[3], x[2]);
            if ((side === 'long' ? ePx - xPx : xPx - ePx) > 0) { raw.push({ side, e, x, ePx, xPx }); continue; }
        }
        const side = longMove >= shortMove ? 'long' : 'short';
        const e = side === 'long' ? lo : hi, x = side === 'long' ? hiAfter : loAfter;
        if (!x) continue;
        const ePx = snap(side === 'long' ? e[3] + (e[2] - e[3]) * 0.25 : e[2] - (e[2] - e[3]) * 0.25, e[3], e[2]);
        const xPx = snap(side === 'long' ? x[2] - (x[2] - x[3]) * 0.25 : x[3] + (x[2] - x[3]) * 0.25, x[3], x[2]);
        if ((side === 'long' ? xPx - ePx : ePx - xPx) > 0) raw.push({ side, e, x, ePx, xPx });
    }
    const pts = raw.reduce((t, r) => t + (r.side === 'long' ? r.xPx - r.ePx : r.ePx - r.xPx), 0);
    const qty = o.target > 0 && pts > 0 ? Math.max(0.1, Math.round((o.target / pts) * 10) / 10) : 1;
    return raw.map((r, i) => {
        // inside its candle's minute: a third of the way in (entry), two thirds (exit)
        const et = r.e[0] * 1000 + Math.round(resMs / 3), xt = r.x[0] * 1000 + Math.round((2 * resMs) / 3);
        const net = Math.round((r.side === 'long' ? r.xPx - r.ePx : r.ePx - r.xPx) * qty * 100) / 100;
        return { id: 'sample-' + i, side: r.side, qty, open: false, openT: et, closeT: xt, entryPx: r.ePx, exitPx: r.xPx, net, fee: 0,
            fills: [{ t: et, px: r.ePx, qty, entry: true }, { t: xt, px: r.xPx, qty, entry: false }] };
    });
}

// Every trade of the session, in time order (the page's Trades list; the sample trades for the demo).
export function replayTrades(replay) {
    const r = replay;
    if (!r || !r.bars || !r.bars.length) return [];
    const all = r.sample ? sampleTrades(r.bars, { target: r.sampleTarget }) : r.rows.map(tradeOf).filter(Boolean);
    return all.sort((a, b) => a.openT - b.openT);
}
const resMsOf = (r) => (Number(r.res) > 0 ? Number(r.res) * 60000 : r.bars.length > 1 ? (r.bars[1][0] - r.bars[0][0]) * 1000 : 60000);

// What the Replay card draws: the candles of the chosen time, the chosen trades that lie inside it, and the totals over exactly those.
// sel = { ids: [trade ids] | null (all), from: ms | null, to: ms | null }: the page's Trades and Time controls.
export function replayModel(replay, sel) {
    const r = replay;
    if (!r || !r.bars || !r.bars.length) return null;
    const s = sel || {};
    const resMs = resMsOf(r);
    let bars = r.bars.filter((b) => (s.from == null || b[0] * 1000 + resMs > s.from) && (s.to == null || b[0] * 1000 <= s.to));
    if (bars.length < 2) bars = r.bars;
    const lo = bars[0][0] * 1000, hi = bars[bars.length - 1][0] * 1000 + resMs;
    const all = replayTrades(r);
    // a trade is on the card when it is picked and every fill of it is inside the time shown (never half a trade)
    const trades = all.filter((t) => (!s.ids || s.ids.includes(t.id)) && t.fills.every((f) => f.t >= lo && f.t < hi));
    const closed = trades.filter((t) => !t.open);
    const net = Math.round(closed.reduce((x, t) => x + t.net, 0) * 100) / 100;
    const allClosed = all.filter((t) => !t.open).length;
    return {
        bars, res: r.res, tz: r.tz, market: r.market, day: r.day || '', trades, net, n: closed.length, open: trades.length - closed.length,
        wins: closed.filter((t) => t.net > 0).length, losses: closed.filter((t) => t.net < 0).length,
        fees: Math.round(closed.reduce((x, t) => x + t.fee, 0) * 100) / 100, others: r.others || 0, sample: !!r.sample,
        all: all.length, allClosed, partial: trades.length < all.length
    };
}

// The time that frames some trades: from a little before the first fill to a little after the last, at least 24 candles, inside the
// session's candles. ids null: every trade. null when there is nothing to frame.
export function replayFit(replay, ids) {
    const r = replay;
    if (!r || !r.bars || !r.bars.length) return null;
    const resMs = resMsOf(r);
    const first = r.bars[0][0] * 1000, last = r.bars[r.bars.length - 1][0] * 1000 + resMs;
    const fills = replayTrades(r).filter((t) => !ids || ids.includes(t.id)).flatMap((t) => t.fills.map((f) => f.t));
    if (!fills.length) return null;
    let a = Math.min(...fills), b = Math.max(...fills);
    const pad = Math.max((b - a) * 0.15, 6 * resMs);
    a -= pad; b += pad;
    const want = 24 * resMs;
    if (b - a < want) { const mid = (a + b) / 2; a = mid - want / 2; b = mid + want / 2; }
    if (a < first) { b = Math.min(last, b + (first - a)); a = first; }
    if (b > last) { a = Math.max(first, a - (b - last)); b = last; }
    return { from: Math.round(a), to: Math.round(b) };
}

// ---------- the chart's geometry ----------

// x of a moment: the centre of the candle it falls in (a candle covers [its time, its time + one bar)), like TradingView's own marks.
// y of a price: linear between the chart's low and high. Pure, so the tests can check every fill lands on its candle.
export function replayGeom(bars, box, extra) {
    const n = bars.length;
    const resS = n > 1 ? bars[1][0] - bars[0][0] : 60;
    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { if (b[3] < lo) lo = b[3]; if (b[2] > hi) hi = b[2]; }
    for (const p of extra || []) { if (p < lo) lo = p; if (p > hi) hi = p; }
    const padP = Math.max((hi - lo) * 0.08, 1);
    lo -= padP; hi += padP;
    const slot = box.w / n;
    const idxOf = (ms) => {
        const s = ms / 1000;
        if (s < bars[0][0]) return -1;
        // the last candle whose time is at or before the moment (bars may skip a quiet minute)
        let a = 0, b = n - 1;
        while (a < b) { const m = (a + b + 1) >> 1; if (bars[m][0] <= s) a = m; else b = m - 1; }
        return a;
    };
    return {
        lo, hi, slot, n, resS,
        idxOf,
        xOfIdx: (i) => box.x + slot * (i + 0.5),
        xOf: (ms) => { const i = idxOf(ms); return i < 0 ? box.x : box.x + slot * (i + 0.5); },
        yOf: (p) => box.y + (1 - (p - lo) / (hi - lo)) * box.h
    };
}

// short times on the axis, in the chart's own time zone: "09:30"
export function hhmm(ms, tz) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)); } catch (e) { return ''; }
}
// the zone as people say it ("CEST", "EDT"), for the card's legend: American English names New York's zones, British English Europe's,
// and "GMT+4" only when neither has a name for it
export function tzShort(tz, ms) {
    const name = (loc) => { try { return (new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName') || {}).value || ''; } catch (e) { return ''; } };
    const us = name('en-US'), gb = name('en-GB');
    return (!/^GMT[+-]/.test(us) && us) || (!/^GMT[+-]/.test(gb) && gb) || us || tz;
}
export { tsMs };
