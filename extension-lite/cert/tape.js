/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { dayKey } from '../journal/time.js';

export const TAPE_KEEP_DAYS = 30;
export const TAPE_SPAN = 600;
export const TAPE_ROWS_MAX = 3600;
const MAX_DEC = 8;

const isPx = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function tapeClean(rows, now, max) {
    if (!Array.isArray(rows)) return [];
    const nowS = Math.floor(now / 1000), lo = nowS - 3 * 86400, hi = nowS + 120;
    const cap = Math.min(max || TAPE_ROWS_MAX, Math.floor(rows.length / 5));
    const recs = [];
    for (let i = 0; i + 4 < rows.length && recs.length < cap; i += 5) {
        const s = rows[i], o = rows[i + 1], h = rows[i + 2], l = rows[i + 3], c = rows[i + 4];
        if (!Number.isInteger(s) || s < lo || s > hi || !isPx(o) || !isPx(h) || !isPx(l) || !isPx(c)) continue;
        recs.push([s, o, Math.max(h, o, c), Math.min(l, o, c), c, recs.length]);
    }
    return tapeMergeRecs(recs);
}
function tapeMergeRecs(recs) {
    recs.sort((a, b) => a[0] - b[0] || a[5] - b[5]);
    const out = [];
    for (const r of recs) {
        const k = out.length - 5;
        /* Copyright Astral 2026. From Better Vest 9.3.0 (lite), ref bv-75e65c61. Not licensed for reuse. */ if (k >= 0 && out[k] === r[0]) {
            if (r[2] > out[k + 2]) out[k + 2] = r[2];
            if (r[3] < out[k + 3]) out[k + 3] = r[3];
            out[k + 4] = r[4];
        } else out.push(r[0], r[1], r[2], r[3], r[4]);
    }
    return out;
}
export function tapeMerge(runs) {
    const recs = [];
    let n = 0;
    for (const rows of runs) for (let i = 0; i + 4 < rows.length; i += 5) recs.push([rows[i], rows[i + 1], rows[i + 2], rows[i + 3], rows[i + 4], n++]);
    return tapeMergeRecs(recs);
}

export function tapeDecimals(rows) {
    for (let d = 0; d <= MAX_DEC; d++) {
        const m = Math.pow(10, d);
        let ok = true;
        for (let i = 0; i < rows.length && ok; i += 5) {
            for (let j = 1; j <= 4; j++) { const v = rows[i + j] * m; if (Math.abs(v - Math.round(v)) > 1e-4) { ok = false; break; } }
        }
        if (ok) return d;
    }
    return MAX_DEC;
}
function putU(out, v) {
    while (v >= 128) { out.push((v % 128) + 128); v = Math.floor(v / 128); }
    out.push(v);
}
const zig = (v) => (v >= 0 ? v * 2 : -v * 2 - 1);
const unzig = (z) => (z % 2 ? -(z + 1) / 2 : z / 2);
export function tapeEncode(rows) {
    const d = tapeDecimals(rows), m = Math.pow(10, d);
    const u = (v) => Math.round(v * m);
    const out = [];
    let ps = rows[0], pc = 0;
    for (let i = 0; i + 4 < rows.length; i += 5) {
        const o = u(rows[i + 1]), h = u(rows[i + 2]), l = u(rows[i + 3]), c = u(rows[i + 4]);
        putU(out, rows[i] - ps); /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-57d1f0ba */
        putU(out, zig(o - pc));
        putU(out, Math.max(0, h - Math.max(o, c)));
        putU(out, Math.max(0, Math.min(o, c) - l));
        putU(out, zig(c - o));
        ps = rows[i];
        pc = c;
    }
    return { t: rows[0], t1: rows[rows.length - 5], n: rows.length / 5, d, x: Uint8Array.from(out) };
}
export function tapeDecode(rec) {
    const out = [];
    if (!rec || !(rec.x instanceof Uint8Array) || !Number.isInteger(rec.n) || !Number.isInteger(rec.t) || !(rec.d >= 0 && rec.d <= MAX_DEC)) return out;
    const b = rec.x, m = Math.pow(10, rec.d);
    let p = 0;
    const getU = () => {
        let v = 0, mul = 1, x;
        do { x = b[p++]; v += (x & 127) * mul; mul *= 128; } while (x >= 128 && p < b.length);
        return v;
    };
    let s = rec.t, pc = 0;
    for (let k = 0; k < rec.n && p < b.length; k++) {
        s += getU();
        const o = pc + unzig(getU());
        const hx = getU(), lx = getU();
        const c = o + unzig(getU());
        out.push(s, o / m, (Math.max(o, c) + hx) / m, (Math.min(o, c) - lx) / m, c / m);
        pc = c;
    }
    return out;
}
const pad = (n) => String(n).padStart(10, '0');
export const tapeKey = (sym, t, t1) => sym + '|' + pad(t) + '|' + pad(t1);
export const tapeKeyFrom = (sym, t) => sym + '|' + pad(t);
export function tapeChunks(sym, rows) {
    const out = [];
    let a = 0, day = '';
    const cut = (from, to) => {
        if (to <= from) return;
        const part = rows.slice(from, to);
        const e = tapeEncode(part);
        out.push(Object.assign({ k: tapeKey(sym, e.t, e.t1), sym, day }, e));
    };
    for (let i = 0; i < rows.length; i += 5) {
        const k = dayKey(rows[i] * 1000, 'vest');
        if (i === a) { day = k; continue; }
        if (k !== day || rows[i] - rows[a] >= TAPE_SPAN) { cut(a, i); a = i; day = k; }
    }
    cut(a, rows.length);
    return out;
}

export function tapeTol(bars) {
    const rows = [];
    for (const b of bars.slice(0, 200)) rows.push(0, b[1], b[2], b[3], b[4]);
    return 1.5 * Math.pow(10, -tapeDecimals(rows));
}
/*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-64204f05 */ export function tapeBars(bars, resS, rows, tol) {
    const out = new Array(bars.length).fill(null);
    const n = Math.floor(rows.length / 5);
    const t0 = tol == null ? tapeTol(bars) : tol;
    let j = 0;
    for (let i = 0; i < bars.length; i++) {
        const b = bars[i], a = b[0], e = Math.min(a + resS, i + 1 < bars.length ? bars[i + 1][0] : Infinity);
        while (j < n && rows[j * 5] < a) j++;
        const secs = [];
        let h = -Infinity, l = Infinity;
        for (; j < n && rows[j * 5] < e; j++) {
            const q = j * 5;
            secs.push([rows[q] - a, rows[q + 1], rows[q + 2], rows[q + 3], rows[q + 4]]);
            if (rows[q + 2] > h) h = rows[q + 2];
            if (rows[q + 3] < l) l = rows[q + 3];
        }
        if (!secs.length) continue;
        const near = (x, y) => Math.abs(x - y) <= t0;
        if (near(secs[0][1], b[1]) && near(h, b[2]) && near(l, b[3]) && near(secs[secs.length - 1][4], b[4])) out[i] = { secs };
    }
    return out;
}
export function tapeFormAt(bar, path, f, resS) {
    const o = bar[1];
    let h = o, l = o, c = o;
    const tau = Math.max(0, Math.min(1, f)) * resS;
    if (path && path.secs) {
        for (const s of path.secs) {
            if (s[0] >= tau) break;
            if (s[2] > h) h = s[2];
            if (s[3] < l) l = s[3];
            c = s[4];
        }
    }
    return { o, h, l, c };
/* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.0. bv-72c3e6c9 */ }

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function seedOf(b) {
    let h = 2166136261;
    for (const v of b.slice(0, 5)) {
        const s = String(v);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    }
    return h >>> 0;
}
export function tapeSample(bar, resS) {
    const [, O, H, L, C] = bar;
    const step = Math.max(1, Math.round(resS / 600));
    const N = Math.max(2, Math.floor(resS / step));
    const r = rng(seedOf(bar));
    const vals = new Array(N); /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-09bd2241 */
    if (!(H > L)) {
        vals.fill(C);
    } else {
        const pick = () => 1 + Math.floor(r() * Math.max(1, N - 2));
        let tA = pick(), tB = pick();
        for (let g = 0; g < 8 && tB === tA; g++) tB = pick();
        if (tB === tA) tB = Math.min(N - 1, tA + 1);
        const hiFirst = r() < 0.5;
        const anchors = [[0, O], [Math.min(tA, tB), hiFirst ? H : L], [Math.max(tA, tB), hiFirst ? L : H], [N - 1, C]];
        const sig = (H - L) * 0.55 / Math.sqrt(N);
        const gauss = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
        for (let k = 0; k + 1 < anchors.length; k++) {
            const [a, va] = anchors[k], [b, vb] = anchors[k + 1];
            if (b <= a) { vals[a] = va; continue; }
            const w = [0];
            for (let s = 1; s <= b - a; s++) w.push(w[s - 1] + gauss() * sig);
            const end = w[b - a];
            for (let s = 0; s <= b - a; s++) {
                const lin = va + ((vb - va) * s) / (b - a);
                vals[a + s] = Math.max(L, Math.min(H, lin + w[s] - (end * s) / (b - a)));
            }
        }
        for (const [t, v] of anchors) vals[t] = v;
    }
    const secs = [];
    let prev = O;
    for (let k = 0; k < N; k++) {
        const c = vals[k];
        secs.push([k * step, prev, Math.max(prev, c), Math.min(prev, c), c]);
        prev = c;
    }
    return { secs };
}
export const tapeSampleBars = (bars, resS) => bars.map((b) => tapeSample(b, resS));
