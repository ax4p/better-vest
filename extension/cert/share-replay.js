/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { normalizeFills, normalizePosition, tsMs } from '../journal/model.js';

export const REPLAY_RES = ['1', '5', '15', '60'];
export const REPLAY_MAX_BARS = 400;
export const REPLAY_MAX_ROWS = 100;
export const REPLAY_MAX_ALT = 2;
export const REPLAY_FINE_RES = ['1', '5', '15'];
export const REPLAY_MAX_FINE = 720;
const MAX_ORDERS = 40;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, max) : '');
const idOk = (v) => typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v);
/*! Property of Astral (@ax4p). Better Vest 9.3.1. No copying without written permission. bv-49c256ae */ const scalar = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 40 && /^[\w.:+-]*$/.test(v)) || v == null;

export function tzOk(tz) {
    if (typeof tz !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}

const ROW_KEYS = ['positionId', 'accountId', 'symbol', 'side', 'quantity', 'openPrice', 'closePrice', 'openDate', 'closeDate', 'pnl', 'fee', 'funding', 'closeReason'];
const STOP_KEYS = ['id', 'triggerPrice', 'createdAt', 'updatedAt'];
const MAX_STOPS = 10;
function cleanStops(list) {
    return (Array.isArray(list) ? list : []).slice(0, MAX_STOPS).filter((x) => x && typeof x === 'object' && !Array.isArray(x)).map((x) => {
        const q = {};
        for (const k of STOP_KEYS) if (k in x && scalar(x[k])) q[k] = x[k];
        return q;
    });
}
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
    if (Array.isArray(r.stopLosses) && r.stopLosses.length) o.stopLosses = cleanStops(r.stopLosses);
    if (Array.isArray(r.stopLossHistory) && r.stopLossHistory.length) o.stopLossHistory = cleanStops(r.stopLossHistory);
    return o;
}

export function cleanTradeRow(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || !idOk(String(r.accountId || ''))) return null;
    const o = cleanRow(Object.assign({}, r, { orders: [] }), String(r.accountId));
    if (!o) return null;
    delete o.orders;
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.1. bv-0668d11e */ return o;
}
export { cleanStops };

function cleanBars(list, max) {
    const bars = [];
    let last = -Infinity;
    for (const b of Array.isArray(list) ? list.slice(-max) : []) {
        if (!Array.isArray(b) || b.length < 5) continue;
        const [t, o, h, l, c] = b.slice(0, 5).map(num);
        if (t == null || o == null || h == null || l == null || c == null || t <= last) continue;
        if (!(h >= Math.max(o, c) - 1e-9 && l <= Math.min(o, c) + 1e-9 && l > 0)) continue;
        const v = num(b[5]);
        bars.push(v != null && v >= 0 ? [t, o, h, l, c, v] : [t, o, h, l, c]);
        last = t;
    }
    return bars;
}

export function cleanReplay(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const err = /^[a-z-]{1,24}$/.test(String(r.err || '')) ? String(r.err) : '';
    const res = REPLAY_RES.includes(String(r.res)) ? String(r.res) : '';
    const bars = cleanBars(r.bars, REPLAY_MAX_BARS);
    const accountId = idOk(r.accountId) ? r.accountId : '';
    const rows = accountId ? (Array.isArray(r.rows) ? r.rows : []).slice(0, REPLAY_MAX_ROWS).map((x) => cleanRow(x, accountId)).filter(Boolean) : [];
    const out = {
        accountId, market: /^[A-Z0-9]{1,12}$/.test(String(r.market || '')) ? String(r.market) : '', res, tz: tzOk(r.tz) ? r.tz : 'Etc/UTC',
        day: /^\d{4}-\d{2}-\d{2}$/.test(String(r.day || '')) ? String(r.day) : '',
        bars: res ? bars : [], rows, others: num(r.others) != null && r.others >= 0 ? Math.min(999, Math.round(r.others)) : 0,
        sample: r.sample === true, sampleTarget: num(r.sampleTarget), err
    };
    if (!out.bars.length && !out.err) out.err = 'no-bars';
    if (typeof r.sym === 'string' && /^[A-Z0-9][A-Z0-9._-]{0,40}$/.test(r.sym)) out.sym = r.sym;
    if (r.fine && typeof r.fine === 'object' && !Array.isArray(r.fine) && out.bars.length) {
        const fr = REPLAY_FINE_RES.includes(String(r.fine.res)) ? String(r.fine.res) : '';
        const fb = fr && Number(fr) < Number(res) && Number(res) % Number(fr) === 0 ? cleanBars(r.fine.bars, REPLAY_MAX_FINE) : [];
        if (fb.length) out.fine = { res: fr, bars: fb };
    }
    if (Array.isArray(r.alt) && r.alt.length) {
        const alt = [];
        for (const a of r.alt.slice(0, REPLAY_MAX_ALT * 3)) {
            if (alt.length >= REPLAY_MAX_ALT) break;
            if (!a || typeof a !== 'object' || Array.isArray(a) || a.alt) continue;
            const c = cleanReplay(Object.assign({}, a, { accountId: out.accountId, day: a.day || out.day, others: 0, sample: false }));
            if (c && !c.err && c.market && c.market !== out.market && !alt.some((x) => x.market === c.market)) { delete c.alt; alt.push(c); }
        }
        if (alt.length) out.alt = alt;
    }
    return out;
}

export function replayPick(replay, market) {
    if (!replay) return null;
    if (!market || market === replay.market || !Array.isArray(replay.alt)) return replay;
    return replay.alt.find((a) => a.market === market) || replay;
}

export function aggBars(bars, min) {
    const out = [];
    const step = min * 60;
    const vol = bars.length > 0 && bars.every((b) => b.length > 5);
    for (const b of bars) {
        const t = Math.floor(b[0] / step) * step;
        const last = out[out.length - 1];
        if (last && last[0] === t) { last[2] = Math.max(last[2], b[2]); last[3] = Math.min(last[3], b[3]); last[4] = b[4]; if (vol) last[5] += b[5]; }
        else out.push(vol ? [t, b[1], b[2], b[3], b[4], b[5]] : [t, b[1], b[2], b[3], b[4]]); /* Copyright Astral 2026. From Better Vest 9.3.1 (standard), ref bv-63deec6e. Not licensed for reuse. */
    }
    return out;
}
export function heikinAshi(bars) {
    const out = [];
    let po = null, pc = null;
    for (const b of bars) {
        const c = (b[1] + b[2] + b[3] + b[4]) / 4;
        const o = po == null ? (b[1] + b[4]) / 2 : (po + pc) / 2;
        const x = [b[0], o, Math.max(b[2], o, c), Math.min(b[3], o, c), c];
        if (b.length > 5) x.push(b[5]);
        out.push(x);
        po = o; pc = c;
    }
    return out;
}
export const TF_PRESETS = [1, 2, 3, 5, 10, 15, 30, 60, 120, 240];
export const TF_MAX_BARS = 600;
export const TF_MIN_BARS = 4;
export const tfLabel = (min) => { const n = Number(min); return n >= 60 && n % 60 === 0 ? n / 60 + 'h' : n + 'm'; };
function span(r) { const resS = Number(r.res) * 60; return [r.bars[0][0], r.bars[r.bars.length - 1][0] + resS]; }
function tfSource(r, min) {
    const [a, b] = span(r);
    for (const src of [r.fine, r]) {
        if (!src || !src.bars || !src.bars.length) continue;
        const res = Number(src.res);
        if (!(res > 0) || min < res || min % res) continue;
        if (src.bars[0][0] > a + res * 60) continue;
        const step = min * 60;
        const n = Math.ceil(b / step) - Math.floor(a / step);
        return { src, n };
    }
    return null;
}
export function replayTfs(r, extra) {
    if (!r || !r.bars || !r.bars.length) return [];
    const list = [...new Set(TF_PRESETS.concat(Number(r.res), extra > 0 ? [Number(extra)] : []))].sort((x, y) => x - y);
    return list.map((min) => {
        const s = tfSource(r, min);
        const why = !s ? (min < Number(r.res) ? 'Vest sent no finer candles for this time' : 'Not a whole number of ' + tfLabel((r.fine || r).res) + ' candles')
            : s.n > TF_MAX_BARS ? 'Too many candles for one card' : s.n < TF_MIN_BARS ? 'Too few candles for one card' : '';
        return { min, label: tfLabel(min), ok: !why, why, n: s ? s.n : 0, own: min === Number(r.res) };
    /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-4e54a0fd */ });
}
export function replayTf(r, min) {
    const m = Math.round(Number(min));
    if (!r || r.err || !r.bars || !r.bars.length || !(m > 0) || String(m) === String(r.res)) return r;
    const s = tfSource(r, m);
    if (!s || s.n > TF_MAX_BARS || s.n < TF_MIN_BARS) return r;
    const [a, b] = span(r);
    const step = m * 60, from = Math.floor(a / step) * step;
    const bars = aggBars(s.src.bars.filter((x) => x[0] >= from && x[0] < b), m);
    if (!bars.length) return r;
    const out = Object.assign({}, r, { res: String(m), bars });
    delete out.fine;
    if (r.sample) out.sampleBars = r.sampleBars || r.bars;
    return out;
}


const ENTRY = new Set(['open', 'append']);
/*! Owned by Astral (@ax4p): Better Vest standard 9.3.1. Licence: LICENSE, not open source. bv-32966470 */ function tradeOf(row) {
    const p = normalizePosition(row, null);
    if (p.void) return null;
    const fills = normalizeFills(row).filter((f) => f.ts != null && f.px != null).map((f) => ({ t: f.ts, px: f.px, qty: f.qty, entry: ENTRY.has(f.role) }));
    if (!fills.length && p.openTs != null && p.entryPx != null) {
        fills.push({ t: p.openTs, px: p.entryPx, qty: p.qty || 0, entry: true });
        if (!p.open && p.closeTs != null && p.exitPx != null) fills.push({ t: p.closeTs, px: p.exitPx, qty: p.qty || 0, entry: false });
    }
    if (!fills.length) return null;
    return { id: p.id, side: p.side, qty: p.fills.peakQty || p.qty || 0, open: p.open, openT: fills[0].t, closeT: p.open ? null : fills[fills.length - 1].t,
        entryPx: p.entryPx, exitPx: p.exitPx, net: p.open ? null : Math.round(p.net * 100) / 100, fee: p.fee || 0, fills,
        pts: p.points, r: p.rMult };
}

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
        const lo = seg.slice(0, half).reduce((a, b) => (b[3] < a[3] ? b : a));
        const hiAfter = seg.slice(seg.indexOf(lo) + 1).reduce((a, b) => (b[2] > a[2] ? b : a), seg[seg.indexOf(lo) + 1]);
        const hi = seg.slice(0, half).reduce((a, b) => (b[2] > a[2] ? b : a));
        const loAfter = seg.slice(seg.indexOf(hi) + 1).reduce((a, b) => (b[3] < a[3] ? b : a), seg[seg.indexOf(hi) + 1]);
        const longMove = hiAfter ? hiAfter[2] - lo[3] : -Infinity, shortMove = loAfter ? hi[2] - loAfter[3] : -Infinity;
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
        /* Better Vest (c) 2026 Astral. All rights reserved. bv-36a0a02c */ const ePx = snap(side === 'long' ? e[3] + (e[2] - e[3]) * 0.25 : e[2] - (e[2] - e[3]) * 0.25, e[3], e[2]);
        const xPx = snap(side === 'long' ? x[2] - (x[2] - x[3]) * 0.25 : x[3] + (x[2] - x[3]) * 0.25, x[3], x[2]);
        if ((side === 'long' ? xPx - ePx : ePx - xPx) > 0) raw.push({ side, e, x, ePx, xPx });
    }
    const pts = raw.reduce((t, r) => t + (r.side === 'long' ? r.xPx - r.ePx : r.ePx - r.xPx), 0);
    const qty = o.target > 0 && pts > 0 ? Math.max(0.1, Math.round((o.target / pts) * 10) / 10) : 1;
    return raw.map((r, i) => {
        const et = r.e[0] * 1000 + Math.round(resMs / 3), xt = r.x[0] * 1000 + Math.round((2 * resMs) / 3);
        const net = Math.round((r.side === 'long' ? r.xPx - r.ePx : r.ePx - r.xPx) * qty * 100) / 100;
        const pts = r.side === 'long' ? r.xPx - r.ePx : r.ePx - r.xPx;
        const risk = Math.max(8 * tick, Math.round((r.ePx * 0.00015) / tick) * tick);
        return { id: 'sample-' + i, side: r.side, qty, open: false, openT: et, closeT: xt, entryPx: r.ePx, exitPx: r.xPx, net, fee: 0,
            fills: [{ t: et, px: r.ePx, qty, entry: true }, { t: xt, px: r.xPx, qty, entry: false }], pts, r: risk > 0 ? Math.round((pts / risk) * 100) / 100 : null };
    });
}

export function replayTrades(replay) {
    const r = replay;
    if (!r || !r.bars || !r.bars.length) return [];
    const all = r.sample ? sampleTrades(r.sampleBars || r.bars, { target: r.sampleTarget }) : r.rows.map(tradeOf).filter(Boolean);
    return all.sort((a, b) => a.openT - b.openT);
}
const resMsOf = (r) => (Number(r.res) > 0 ? Number(r.res) * 60000 : r.bars.length > 1 ? (r.bars[1][0] - r.bars[0][0]) * 1000 : 60000);

export function replayModel(replay, sel) {
    const r = replay;
    if (!r || !r.bars || !r.bars.length) return null;
    const s = sel || {};
    const resMs = resMsOf(r);
    let bars = r.bars.filter((b) => (s.from == null || b[0] * 1000 + resMs > s.from) && (s.to == null || b[0] * 1000 <= s.to));
    if (bars.length < 2) bars = r.bars;
    const lo = bars[0][0] * 1000, hi = bars[bars.length - 1][0] * 1000 + resMs;
    const all = replayTrades(r);
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
    return { from: Math.round(a), to: Math.round(b) }; /* @license Better Vest 9.3.1. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-2b8dd3d6 */
}


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

export function hhmm(ms, tz) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)); } catch (e) { return ''; }
}
export function tzShort(tz, ms) {
    const name = (loc) => { try { return (new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName') || {}).value || ''; } catch (e) { return ''; } };
    const us = name('en-US'), gb = name('en-GB');
    return (!/^GMT[+-]/.test(us) && us) || (!/^GMT[+-]/.test(gb) && gb) || us || tz;
}
export { tsMs };


export const VIDEO_FPS = 30;
export function videoPlan(n, opts) {
    const o = opts || {};
    const fps = o.fps > 0 ? o.fps : VIDEO_FPS;
    const intro = 0.6, hold = 2.2;
    const reveal = Math.min(7, Math.max(3, n * 0.05));
    /*! Better Vest (c) 2026 Astral. All rights reserved. bv-4db1a665 */ const total = intro + reveal + hold;
    const frames = Math.round(total * fps);
    const stepAt = (f) => {
        const t = f / fps;
        if (t < intro) return -1;
        if (t >= intro + reveal) return n - 1;
        return Math.min(n - 1, Math.floor(((t - intro) / reveal) * n));
    };
    return { fps, frames, intro, reveal, hold, total, stepAt };
}
export const videoItems = (scene, step) => scene.items.filter((x) => x.step <= step);
