/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { CARD_SIZES, heroOf } from './card-model.js';
import { INTENSITY_STEPS, INTENSITY_MAX } from './stats.js';
import { buildStars, paintStar } from './stars.js';

export const ANIM_END = 5.4;
export const CARD_FONT = '"Inter", ui-sans-serif, system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
const RING = [0.22, 0.32, 0.44, 0.58, 0.74];


export function parseColor(s) {
    if (Array.isArray(s)) return s;
    const v = String(s == null ? '' : s).trim().toLowerCase();
    if (!v || v === 'transparent') return [0, 0, 0, 0];
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.6.3. bv-ae71d8a7 */ let m = /^#([0-9a-f]{3,8})$/.exec(v);
    if (m) {
        let h = m[1];
        if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
        const n = (i) => parseInt(h.slice(i, i + 2), 16);
        return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    }
    m = /^rgba?\(([^)]+)\)$/.exec(v);
    if (m) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    return [0, 0, 0, 1];
}
export function mix(a, b, p) {
    const x = parseColor(a), y = parseColor(b);
    const al = x[3] * p + y[3] * (1 - p);
    if (al <= 0) return [0, 0, 0, 0];
    const ch = (i) => (x[i] * x[3] * p + y[i] * y[3] * (1 - p)) / al;
    return [ch(0), ch(1), ch(2), al];
}
export const rgba = (c) => { const v = parseColor(c); return `rgba(${Math.round(v[0])}, ${Math.round(v[1])}, ${Math.round(v[2])}, ${+v[3].toFixed(3)})`; };
const T0 = 'transparent';

export function parseGradient(s) {
    const m = /^radial-gradient\(\s*(circle|ellipse)\s+at\s+([\d.]+)%\s+([\d.]+)%\s*,(.*)\)$/i.exec(String(s || '').trim());
    if (!m) return null;
    const stops = [];
    for (const part of m[4].split(/,(?![^(]*\))/)) {
        const q = /^\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s+([\d.]+)%\s*$/i.exec(part);
        if (!q) return null;
        stops.push([+q[2] / 100, rgba(q[1])]);
    }
    return { shape: m[1].toLowerCase(), x: +m[2] / 100, y: +m[3] / 100, stops };
}

export function cardPalette(def, { name = '', stars = false } = {}) {
    const light = !!def.light;
    const text = parseColor(def.text), ink = light ? [0, 0, 0, 1] : text;
    const tA = (p) => rgba(mix(text, T0, p));
    const inset = def.inset, up = def.up, down = def.down;
    const mx = (INTENSITY_MAX[name] || 30) / 100;
    const level = (sg) => INTENSITY_STEPS.map((s, i) => ({ fill: rgba(mix(sg, inset, s * mx)), ring: rgba(mix(sg, T0, RING[i])) }));
    const base = parseColor(def.base)[3] > 0 ? rgba(def.base) : rgba(parseColor(def.page)[3] ? def.page : '#000000');
    const solidPage = /^(#|rgb)/i.test(String(def.page || '')) ? rgba(def.page) : null;
    const gold = light ? mix(def.big, '#000000', 0.75) : parseColor(def.big);
    return {
        light, stars: !!stars, base, page: parseGradient(def.page), pageSolid: solidPage,
        t1: rgba(text), t2: rgba(def.muted), t3: tA(0.6), meta: tA(0.72), hair: tA(0.09), hair2: tA(0.16),
        up: rgba(mix(up, ink, 0.6)), dn: rgba(mix(down, ink, 0.6)), upRaw: rgba(up), dnRaw: rgba(down),
        gold: rgba(gold), goldGlow: rgba(mix(gold, T0, 0.55)), accent: rgba(def.accent), accentText: rgba(def.accentText), /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.6.3. bv-bd242c67 */
        sim: rgba(mix(light ? mix(def.warn, '#000000', 0.75) : def.warn, T0, 0.55)),
        cell: rgba(mix(inset, T0, 0.52)), empty: rgba(mix(inset, T0, 0.72)), flat: tA(0.06),
        lv: { p: level(up), n: level(down) },
        net: { p: rgba(mix(up, ink, 0.6)), n: rgba(mix(down, ink, 0.6)), '': rgba(def.muted) },
        hero: light ? { p: rgba(mix(up, '#000000', 0.7)), n: rgba(mix(down, '#000000', 0.7)), '': rgba(mix(text, '#000000', 0.7)) }
            : { p: rgba(mix(up, text, 0.34)), n: rgba(mix(down, text, 0.34)), '': rgba(text) },
        wk: rgba(mix(def.surface, T0, 0.4)), tile: rgba(mix(inset, T0, 0.6)),
        curve: { box: rgba(mix(inset, T0, 0.5)), band: rgba(mix(def.accent, T0, 0.06)), zero: tA(0.25), reset: rgba(mix(def.warn, T0, 0.6)),
            axis: rgba(def.muted), line: rgba(def.accent), glow: rgba(mix(def.accent, T0, 0.22)), fill: rgba(mix(def.accent, T0, 0.22)), fill0: rgba(mix(def.accent, T0, 0)),
            dot: { p: rgba(up), n: rgba(down), '': rgba(text) }, dotRing: base },
        bTile: light ? { bg: '#f5f5f7', fg: '#050506', ring: 'rgba(0, 0, 0, 0.1)' } : { bg: '#050506', fg: '#f5f5f7', ring: 'rgba(255, 255, 255, 0.1)' }
    };
}


const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const k = clamp01(x); return 1 - Math.pow(1 - k, 3); };
const DIGIT = /[0-9]/;

function rr(g, x, y, w, h, r) {
    const k = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + k, y);
    g.arcTo(x + w, y, x + w, y + h, k);
    g.arcTo(x + w, y + h, x, y + h, k);
    g.arcTo(x, y + h, x, y, k);
    g.arcTo(x, y, x + w, y, k);
    g.closePath();
}
function box(g, x, y, w, h, r, fill, ring, tint) {
    if (g.__rec) g.__rec.push({ x0: x, y0: y, x1: x + w, y1: y + h });
    if (g.__boxes && !tint) g.__boxes.push({ x0: x, y0: y, x1: x + w, y1: y + h });
    rr(g, x, y, w, h, r);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (ring) { rr(g, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5)); g.lineWidth = 1; g.strokeStyle = ring; g.stroke(); }
}

const digitW = new Map();
function measure(g, s, size, sp) {
    let w = 0;
    const key = g.font;
    if (!digitW.has(key)) digitW.set(key, Math.max(...'0123456789'.split('').map((d) => g.measureText(d).width)));
    const dw = digitW.get(key);
    for (const ch of s) w += (DIGIT.test(ch) ? dw : g.measureText(ch).width) + sp * size;
    return w - (s.length ? sp * size : 0); /* This file is part of Better Vest by Astral and is protected by copyright. ref bv-c772553a */
}
export function text(g, s, o) {
    let str = String(s == null ? '' : s);
    if (o.up) str = str.toUpperCase();
    if (!str) return 0;
    const sp = o.sp || 0;
    let size = o.size;
    const set = () => { g.font = `${o.weight || 400} ${size}px ${o.font || CARD_FONT}`; };
    set();
    let w = measure(g, str, size, sp);
    if (o.max && w > o.max) {
        const min = o.min || size;
        while (w > o.max && size > min) { size = Math.max(min, size - 0.5); set(); w = measure(g, str, size, sp); }
        while (w > o.max && str.length > 1) { str = str.slice(0, -2) + '…'; w = measure(g, str, size, sp); }
    }
    const x0 = o.align === 'right' ? o.x - w : o.align === 'center' ? o.x - w / 2 : o.x;
    const dw = digitW.get(g.font);
    const shown = g.globalAlpha * (o.alpha != null ? clamp01(o.alpha) : 1);
    g.save();
    if (o.alpha != null) g.globalAlpha *= clamp01(o.alpha);
    g.fillStyle = o.color || '#fff';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    let x = x0;
    for (const ch of str) {
        const cw = DIGIT.test(ch) ? dw : g.measureText(ch).width;
        g.fillText(ch, DIGIT.test(ch) ? x + (dw - g.measureText(ch).width) / 2 : x, o.y);
        x += cw + sp * size;
    }
    g.restore();
    if (g.__words) g.__words.push({ s: str, x0, x1: x0 + w, y0: o.y - size * 0.76, y1: o.y + size * 0.22, size, a: shown });
    if (g.__rec) g.__rec.push({ x0, x1: x0 + w, y0: o.y - size * 0.8, y1: o.y + size * 0.25 });
    return w;
}

function pick(g, options, o) {
    const list = options.filter((x) => x != null && x !== '');
    if (!list.length || !o.max) return list[0] || '';
    const fits = (str, size) => { g.font = `${o.weight || 400} ${size}px ${o.font || CARD_FONT}`; return measure(g, o.up ? str.toUpperCase() : str, size, o.sp || 0) <= o.max; };
    for (const str of list) if (fits(str, o.size)) return str;
    if (o.min) for (const str of list) if (fits(str, o.min)) return str;
    return list[list.length - 1];
}
const fitText = (g, options, o) => text(g, pick(g, options, o), o);
const widthOf = (g, str, size, weight, F, sp = 0) => { g.font = `${weight} ${size}px ${F || CARD_FONT}`; return measure(g, str, size, sp); };

function bTile(g, x, y, s, P) {
    box(g, x, y, s, s, s * 0.22, P.bTile.bg, null);
    rr(g, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.22);
    g.lineWidth = 1; g.strokeStyle = P.bTile.ring; g.stroke();
    const bh = s * 0.58, bw = bh * 38 / 64;
    /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-343b5f61 */ const bx = x + (s - bw) / 2 + s * 0.02, by = y + (s - bh) / 2;
    const pts = [[0, 0], [18, 0], [38, 16], [18, 32], [38, 48], [18, 64], [0, 64]];
    g.beginPath();
    pts.forEach(([px, py], i) => { const X = bx + (px / 38) * bw, Y = by + (py / 64) * bh; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.closePath();
    g.fillStyle = P.bTile.fg;
    g.fill();
    if (g.__marks) g.__marks.push({ x0: x, y0: y, x1: x + s, y1: y + s, what: 'tile' });
}
function sparkle(g, x, y, s, color) {
    const k = s / 24, X = (v) => x + (v - 12) * k, Y = (v) => y + (v - 12) * k;
    g.beginPath();
    g.moveTo(X(12), Y(2));
    g.bezierCurveTo(X(12.8), Y(7.5), X(16.5), Y(11.2), X(22), Y(12));
    g.bezierCurveTo(X(16.5), Y(12.8), X(12.8), Y(16.5), X(12), Y(22));
    g.bezierCurveTo(X(11.2), Y(16.5), X(7.5), Y(12.8), X(2), Y(12));
    g.bezierCurveTo(X(7.5), Y(11.2), X(11.2), Y(7.5), X(12), Y(2));
    g.closePath();
    g.fillStyle = color;
    g.fill();
}
function tick(g, x, y, s, color) {
    const k = s / 24;
    g.save();
    g.beginPath();
    g.moveTo(x + (5 - 12) * k, y + (12.5 - 12) * k);
    g.lineTo(x + (9.5 - 12) * k, y + (17 - 12) * k);
    g.lineTo(x + (19 - 12) * k, y + (7 - 12) * k);
    g.lineWidth = Math.max(1.4, 2.2 * k);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = color;
    g.stroke();
    g.restore();
}

function background(g, W, H, P, holes) {
    g.fillStyle = P.base;
    g.fillRect(0, 0, W, H);
    const gr = P.page;
    if (gr) {
        /* Property of Astral (@ax4p). Better Vest 9.6.3. No copying without written permission. bv-70ebb121 */ const cx = gr.x * W, cy = gr.y * H;
        g.save();
        let grad;
        if (gr.shape === 'circle') {
            const R = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
            grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        } else {
            const rx = Math.SQRT2 * Math.max(cx, W - cx), ry = Math.SQRT2 * Math.max(cy, H - cy);
            g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy);
            grad = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
        }
        for (const [p, c] of gr.stops) grad.addColorStop(Math.min(1, p), c);
        g.fillStyle = grad;
        g.fillRect(-W, -H * 4, W * 3, H * 9);
        g.restore();
    } else if (P.pageSolid) { g.fillStyle = P.pageSolid; g.fillRect(0, 0, W, H); }
    if (P.stars) {
        g.save();
        const near = (s) => holes && holes.some((r) => s.x > r.x0 - 4 - s.size && s.x < r.x1 + 4 + s.size && s.y > r.y0 - 4 - s.size && s.y < r.y1 + 4 + s.size);
        for (const s of buildStars(W, H)) {
            if (near(s)) continue;
            const dx = (s.x - W * 0.46) / (W * 0.62), dy = (s.y - H * 0.56) / (H * 0.58);
            const m = 0.2 + 0.8 * Math.min(1, Math.hypot(dx, dy));
            g.fillStyle = g.strokeStyle = `rgba(255,255,255,${(s.a * m * 0.85).toFixed(3)})`;
            paintStar(g, s);
        }
        g.restore();
    }
}

const lab = (g, s, x, y, P, o = {}) => text(g, s, Object.assign({ x, y, size: 9.5, weight: 600, sp: 0.12, up: true, color: P.t2, font: o.font }, o));

function hero(g, h, x, y, size, P, o = {}) {
    const color = h.text === '—' ? P.t3 : P.hero[h.sgn || ''];
    const F = o.font;
    if (!h.parts) return text(g, h.text, { x, y, size, weight: 300, sp: -0.03, color, max: o.max, min: o.min || size * 0.5, align: o.align, font: F, alpha: o.alpha });
    let s = size; /*! Copyright Astral 2026. From Better Vest 9.6.3 (standard), ref bv-2dc256ef. Not licensed for reuse. */
    const widths = (sz) => {
        g.font = `300 ${sz}px ${F || CARD_FONT}`;
        const small = sz * 0.55, cents = sz * 0.5;
        const a = (h.parts.sign + h.parts.cur) ? measureAt(g, h.parts.sign + h.parts.cur, small, F, -0.03) + small * 0.06 : 0;
        const b = measureAt(g, h.parts.int, sz, F, -0.035);
        const c = measureAt(g, h.parts.cents, cents, F, 0);
        return [a, b, c];
    };
    let [a, b, c] = widths(s);
    while (o.max && a + b + c > o.max && s > (o.min || size * 0.5)) { s -= 1; [a, b, c] = widths(s); }
    const total = a + b + c;
    let x0 = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
    const al = o.alpha;
    if (a) text(g, h.parts.sign + h.parts.cur, { x: x0, y: y - s * 0.17, size: s * 0.55, weight: 300, sp: -0.03, color, font: F, alpha: al == null ? 0.72 : al * 0.72 });
    text(g, h.parts.int, { x: x0 + a, y, size: s, weight: 300, sp: -0.035, color, font: F, alpha: al });
    text(g, h.parts.cents, { x: x0 + a + b, y, size: s * 0.5, weight: 300, color, font: F, alpha: al == null ? 0.6 : al * 0.6 });
    return total;
}
function measureAt(g, s, size, F, sp) {
    const keep = g.font;
    g.font = `300 ${size}px ${F || CARD_FONT}`;
    const w = measure(g, s, size, sp);
    g.font = keep;
    return w;
}

const TILE_H = 68;
function tile(g, x, y, w, h, P, l, v, sub, o = {}) {
    g.save();
    if (o.alpha != null) g.globalAlpha *= clamp01(o.alpha);
    box(g, x, y, w, h, 11, P.tile, P.hair);
    const pad = 12, vs = o.vSize || 19;
    lab(g, l, x + pad, y + 18, P, { font: o.font, max: w - pad * 2, min: 8 });
    text(g, v, { x: x + pad, y: y + 18 + vs + 5, size: vs, weight: 600, sp: -0.01, color: o.vColor || P.t1, max: w - pad * 2, min: 11, font: o.font });
    if (sub) text(g, sub, { x: x + pad, y: y + 18 + vs + 5 + 16, size: 10.5, weight: 500, color: o.subColor || P.t2, max: w - pad * 2, min: 8.5, font: o.font });
    g.restore();
}

function brand(g, x, y, s, P, card, F, o = {}) {
    bTile(g, x, y, s, P);
    const ty = y + s / 2 + s * 0.2, size = Math.max(11.5, s * 0.5);
    const room = o.max ? o.max - (s + 9) : 0;
    const handle = card.handle && !o.noHandle ? card.handle : '';
    const bw = widthOf(g, 'Better Vest', size, 600, F);
    const both = !handle || !room || bw + 9 + widthOf(g, handle, size, 500, F) <= room;
    let tx = x + s + 9;
    if (both) tx += text(g, 'Better Vest', { x: tx, y: ty, size, weight: 600, color: P.t1, font: F }) + 9;
    if (handle) text(g, handle, { x: tx, y: ty, size, weight: 500, color: P.t2, font: F, max: room ? room - (tx - x - s - 9) : 0, min: 9 });
}


/* Copyright (c) 2026 Astral. Better Vest 9.6.3 is licensed to its users only to run it, never to copy it. bv-0158b5a9 */ function monthTimeline(card) {
    const N = card.order.length;
    const step = N ? Math.min(0.42, 4.1 / N) : 0;
    const at = new Map(card.order.map((k, i) => [k, 0.7 + i * step]));
    const cells = new Map();
    for (const w of card.weeks) for (const c of w.days) cells.set(c.key, c);
    return {
        at, cells,
        cell: (key, t) => (at.has(key) ? ease((t - at.get(key)) / 0.32) : 1),
        week: (w, t) => { const ks = w.days.filter((c) => !c.empty).map((c) => at.get(c.key)); return ks.length ? ease((t - Math.max(...ks) - 0.15) / 0.3) : ease(t / 0.4); },
        value: (t) => {
            let v = 0;
            for (const k of card.order) { const c = cells.get(k); if (c && c.inMonth && c.v != null) v += c.v * ease((t - at.get(k)) / 0.32); }
            return v;
        }
    };
}

function cellBox(g, c, x, y, w, h, P, o) {
    const r = o.r;
    const k = c.empty ? 1 : (o.k == null ? 1 : o.k);
    g.save();
    g.globalAlpha *= !c.inMonth ? 0.4 : c.future ? 0.25 : 1;
    if (c.empty || k < 1) box(g, x, y, w, h, r, P.empty, P.hair);
    if (!c.empty && k > 0) {
        g.save();
        g.globalAlpha *= k;
        if (k < 1) { const s = 0.94 + 0.06 * k; g.translate(x + w / 2, y + h / 2); g.scale(s, s); g.translate(-(x + w / 2), -(y + h / 2)); }
        if (c.flat || !c.lvl) box(g, x, y, w, h, r, P.flat, null);
        else { const lv = P.lv[c.sgn][c.lvl - 1]; box(g, x, y, w, h, r, lv.fill, lv.ring); }
        if (c.evalOnly) {
            rr(g, x + 3.5, y + 3.5, w - 7, h - 7, Math.max(2, r - 3));
            g.setLineDash([3, 3]); g.lineWidth = 1; g.strokeStyle = P.sim; g.stroke(); g.setLineDash([]);
        }
        let mx = x + w - o.px - o.mark / 2;
        const my = y + o.top - o.dSize * 0.36;
        if (c.pay || c.payPending) {
            g.save(); if (c.payPending) g.globalAlpha *= 0.55;
            g.shadowColor = P.goldGlow; g.shadowBlur = 5;
            sparkle(g, mx, my, o.mark, P.gold);
            g.restore();
            if (c.pay > 1) text(g, String(c.pay), { x: mx - o.mark / 2 - 1, y: my + o.mark * 0.38, size: o.mark * 0.8, weight: 700, color: P.gold, align: 'right', font: o.font });
            mx -= o.mark + (c.pay > 1 ? o.mark * 0.8 + 2 : 3); /* @license Better Vest 9.6.3. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-eb8349e2 */
        }
        if (c.passed) { tick(g, mx, my, o.mark + 2, P.up); mx -= o.mark + 4; }
        if (c.best) sparkle(g, mx, my, o.mark, P.accentText);
        text(g, c.text, { x: x + o.px, y: y + o.netY, size: o.nSize, weight: 600, sp: -0.012, color: P.net[c.flat ? '' : c.sgn], max: w - o.px * 2, min: Math.min(8, o.nSize), font: o.font });
        if (o.meta && c.meta) fitText(g, [c.meta, c.metaShort], { x: x + o.px, y: y + h - o.bottom, size: o.mSize, weight: 500, color: P.meta, max: w - o.px * 2, min: 7.5, font: o.font });
        g.restore();
    }
    const marks = cellMarks(c);
    fitText(g, o.shortOut && !c.inMonth ? [c.labelShort] : [c.label, c.labelShort], { x: x + o.px, y: y + o.top, size: o.dSize, weight: 500, color: P.t3, font: o.font, max: w - o.px * 2 - marks * (o.mark + 4), min: 7 });
    g.restore();
}

const cellMarks = (c) => (c.empty ? 0 : (c.pay || c.payPending ? 1 : 0) + (c.passed ? 1 : 0) + (c.best ? 1 : 0));

function monthGrid(g, card, P, x, y, w, h, o) {
    const F = o.font, t = o.t, TL = o.tl;
    const cols = card.cols, rows = card.weeks.length;
    const gap = o.gap, wk = o.wk;
    const dayW = (w - (wk ? wk + gap : 0) - gap * (cols.length - 1)) / cols.length;
    const headH = o.headH;
    const rowH = (h - headH - gap * (rows - 1)) / rows;
    const names = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
    cols.forEach((d, i) => lab(g, names[d], x + i * (dayW + gap) + o.px, y + headH - 8, P, { size: o.hSize, sp: 0.14, font: F }));
    if (wk) lab(g, 'Week', x + cols.length * (dayW + gap) + o.px, y + headH - 8, P, { size: o.hSize, sp: 0.14, font: F }); /*! All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-98867a28 */
    const big = rowH >= 62 && dayW >= 66;
    const nSize = Math.min(o.nMax, Math.max(11, Math.min(rowH * 0.25, dayW * 0.2)));
    const dSize = Math.max(9, Math.min(12, rowH * 0.15));
    const co = { r: Math.min(12, rowH * 0.16), px: Math.max(7, Math.min(12, dayW * 0.11)), top: Math.max(14, dSize + 7), dSize, nSize, mSize: Math.max(9, Math.min(11.5, rowH * 0.14)),
        mark: Math.max(9, Math.min(11, dSize)), meta: big && o.meta !== false, bottom: Math.max(8, rowH * 0.12), font: F };
    co.netY = big ? Math.round(rowH * 0.5 + nSize * 0.38 + 2) : Math.round(rowH - Math.max(8, rowH * 0.16));
    co.shortOut = card.weeks.some((wr) => wr.days.some((c) => !c.inMonth && pick(g, [c.label, c.labelShort], { size: dSize, weight: 500, font: F, max: dayW - co.px * 2 - cellMarks(c) * (co.mark + 4), min: 7 }) !== c.label));
    card.weeks.forEach((wkRow, ri) => {
        const ry = y + headH + ri * (rowH + gap);
        wkRow.days.forEach((c, ci) => cellBox(g, c, x + ci * (dayW + gap), ry, dayW, rowH, P, Object.assign({}, co, { k: TL ? TL.cell(c.key, t) : 1 })));
        if (!wk) return;
        const wx = x + cols.length * (dayW + gap);
        box(g, wx, ry, wk, rowH, co.r, P.wk, P.hair);
        const a = TL ? TL.week(wkRow, t) : 1;
        lab(g, wkRow.label, wx + o.px + 1, ry + co.top, P, { size: Math.max(8.5, dSize - 1.5), sp: 0.08, color: P.t3, font: F });
        text(g, wkRow.text, { x: wx + o.px + 1, y: ry + co.netY, size: Math.max(10.5, nSize - 2), weight: wkRow.zero ? 400 : 600, color: wkRow.zero ? P.t3 : wkRow.sgn === 'p' ? P.up : wkRow.sgn === 'n' ? P.dn : P.t1, max: wk - o.px * 2 - 2, min: 8.5, font: F, alpha: a });
        if (co.meta) {
            const mw = wk - o.px * 2 - 2;
            const sz = co.mSize * 0.88;
            g.font = `500 ${sz}px ${F || CARD_FONT}`;
            const m = wkRow.metaShort && measure(g, wkRow.meta, sz, 0) > mw ? wkRow.metaShort : wkRow.meta;
            text(g, m, { x: wx + o.px + 1, y: ry + rowH - co.bottom, size: co.mSize, weight: 500, color: P.meta, max: mw, min: 7.5, font: F, alpha: a });
        }
    });
}

function monthStats(card, t, TL) {
    if (!TL || t >= ANIM_END) return { n: card.n, days: card.days, wr: card.winRate, wins: card.wins, losses: card.losses };
    let n = 0, days = 0, wins = 0, losses = 0;
    for (const k of card.order) {
        const c = TL.cells.get(k);
        if (!c || !c.inMonth || t < TL.at.get(k) + 0.1) continue;
        n += c.n; days++; wins += c.wins; losses += c.losses;
    }
    return { n, days, wr: wins + losses ? Math.round((wins / (wins + losses)) * 100) + '%' : '—', wins, losses };
}
function monthHero(card, t, TL) {
    if (!TL || t >= ANIM_END || card.heroValue == null) return card.hero;
    return heroOf(TL.value(t), card.heroUnit, card.hide);
}
function tilesOf(card, S, P, n) {
    /*! Copyright Astral 2026. From Better Vest 9.6.3 (standard), ref bv-97f3e989. Not licensed for reuse. */ const col = (s) => (s === 'p' ? P.up : s === 'n' ? P.dn : null);
    const out = [['Win rate', S.wr, S.wins + S.losses ? `${S.wins}W · ${S.losses}L` : ''], ['Trades', String(S.n), `${S.days} trading day${S.days === 1 ? '' : 's'}`]];
    const best = card.bestDay ? ['Best day', card.bestDay.text, card.bestDay.date, col(card.bestDay.sgn)] : null;
    const pc = card.payouts;
    const pay = !pc ? null : pc.n ? ['Paid out', pc.text || String(pc.n), pc.text ? `${pc.n} payout${pc.n === 1 ? '' : 's'}` : `payout${pc.n === 1 ? '' : 's'} executed`, P.gold]
        : ['Payout', pc.pendingAmt || String(pc.pendingN || 1), 'processing', P.gold];
    const worst = card.worstDay && card.worstDay.sgn === 'n' ? ['Worst day', card.worstDay.text, card.worstDay.date, col(card.worstDay.sgn)] : null;
    const order = n >= 4 || card.ledger ? [best, pay, worst] : [pay, best, worst];
    for (const x of order) if (x && out.length < n) out.push(x);
    return out;
}

function ledgerBox(g, L, P, x, y, w, F, a) {
    if (!L) return 0;
    const h = 84;
    g.save(); g.globalAlpha *= a;
    box(g, x, y, w, h, 11, P.tile, P.hair);
    const c1 = x + 14, c3 = x + w - 14, c2 = x + w - 14 - Math.min(110, (w - 28) * 0.36);
    lab(g, L.head, c2, y + 20, P, { align: 'right', font: F, size: 9 });
    lab(g, 'All time', c3, y + 20, P, { align: 'right', font: F, size: 9 });
    L.rows.forEach((r, i) => {
        const ry = y + 40 + i * 18;
        lab(g, r[0], c1, ry, P, { font: F, size: 9 });
        const col = (s) => (s === 'gold' ? P.gold : s === 'p' ? P.up : s === 'n' ? P.dn : P.t1);
        text(g, r[1], { x: c2, y: ry, size: 13, weight: 500, color: col(r[3]), align: 'right', font: F, max: c2 - c1 - 70, min: 9 });
        text(g, r[2], { x: c3, y: ry, size: 13, weight: 500, color: col(r[4]), align: 'right', font: F, max: c3 - c2 - 12, min: 9 });
    });
    g.restore();
    return h;
}

function drawMonth(g, card, P, o) {
    const [W, H] = CARD_SIZES[o.format];
    const F = o.font, t = o.t;
    const TL = isFinite(t) ? monthTimeline(card) : null;
    const intro = TL ? ease(t / 0.45) : 1;
    const S = monthStats(card, t, TL);
    const H0 = monthHero(card, t, TL);
    const end = TL ? ease((t - ANIM_END + 0.6) / 0.5) : 1;
    const subs = [`${card.basis} · ${card.account}`, card.account];
    if (o.format === 'wide') {
        const pad = 34, L = 268;
        g.save(); g.globalAlpha *= intro;
        text(g, card.title, { x: pad, y: 62, size: 26, weight: 500, sp: -0.02, color: P.t1, max: L, min: 16, font: F });
        fitText(g, subs, { x: pad, y: 86, size: 13, weight: 500, color: P.t2, max: L, min: 9, font: F });
        hero(g, H0, pad, 168, 58, P, { max: L, font: F });
        text(g, `${S.n} trade${S.n === 1 ? '' : 's'} · ${S.days} day${S.days === 1 ? '' : 's'}`, { x: pad, y: 194, size: 13, weight: 500, color: P.t2, max: L, font: F });
        const tiles = tilesOf(card, S, P, 4);
        const tw = (L - 8) / 2, th = TILE_H;
        tiles.forEach((tl, i) => tile(g, pad + (i % 2) * (tw + 8), 216 + Math.floor(i / 2) * (th + 8), tw, th, P, tl[0], tl[1], tl[2], { font: F, vColor: tl[3], subColor: tl[4], alpha: i >= 2 ? end : 1 }));
        const ly = 216 + Math.ceil(tiles.length / 2) * (th + 8) + 4;
        ledgerBox(g, card.ledger, P, pad, ly, L, F, end);
        brand(g, pad, H - pad - 22, 22, P, card, F, { max: L });
        g.restore();
        monthGrid(g, card, P, pad + L + 30, pad - 4, W - pad * 2 - L - 30, H - pad * 2 + 4, { font: F, t, tl: TL, gap: 7, wk: 96, headH: 22, px: 10, hSize: 10, nMax: 18 });
    } else if (o.format === 'story') {
        const pad = 32, IW = W - pad * 2;
        g.save(); g.globalAlpha *= intro;
        brand(g, pad, pad, 28, P, card, F, { noHandle: true });
        if (card.handle) text(g, card.handle, { x: W - pad, y: pad + 14 + 5, size: 14, weight: 500, color: P.t2, align: 'right', max: IW - 170, min: 10, font: F });
        text(g, card.title, { x: pad, y: 118, size: 30, weight: 500, sp: -0.02, color: P.t1, max: IW, min: 18, font: F });
        fitText(g, subs, { x: pad, y: 144, size: 14, weight: 500, color: P.t2, max: IW, min: 10, font: F });
        hero(g, H0, pad, 224, 74, P, { max: IW, font: F });
        text(g, `${S.n} trade${S.n === 1 ? '' : 's'} · ${S.days} day${S.days === 1 ? '' : 's'}`, { x: pad, y: 254, size: 14, weight: 500, color: P.t2, max: IW, font: F });
        const tiles = tilesOf(card, S, P, 3);
        const tw = (IW - 8 * (tiles.length - 1)) / tiles.length;
        /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-35ad8de8 */ tiles.forEach((tl, i) => tile(g, pad + i * (tw + 8), 278, tw, TILE_H, P, tl[0], tl[1], tl[2], { font: F, vColor: tl[3], subColor: tl[4], alpha: i >= 2 ? end : 1 }));
        g.restore();
        const gridTop = 368, gridBottom = card.ledger ? H - pad - 84 - 18 : H - pad;
        monthGrid(g, card, P, pad, gridTop, IW, gridBottom - gridTop, { font: F, t, tl: TL, gap: 6, wk: 72, headH: 22, px: 8, hSize: 9.5, nMax: 16 });
        if (card.ledger) { g.save(); g.globalAlpha *= intro; ledgerBox(g, card.ledger, P, pad, H - pad - 84, IW, F, end); g.restore(); }
    } else {
        const pad = 26, IW = W - pad * 2;
        g.save(); g.globalAlpha *= intro;
        bTile(g, pad, pad, 24, P);
        const tw = text(g, card.title, { x: pad + 34, y: pad + 19, size: 21, weight: 500, sp: -0.02, color: P.t1, max: IW - 34 - (card.handle ? 90 : 0), min: 14, font: F });
        if (card.handle) text(g, card.handle, { x: W - pad, y: pad + 18, size: 13, weight: 500, color: P.t2, align: 'right', max: IW - 34 - tw - 16, min: 9, font: F });
        fitText(g, subs, { x: pad + 34, y: pad + 40, size: 12, weight: 500, color: P.t2, max: IW - 34, min: 9, font: F });
        const stats = [['Win rate', S.wr], ['Trades', String(S.n)], ['Days', String(S.days)]];
        const sw = 70, sx = W - pad - sw * stats.length;
        hero(g, H0, pad, 118, 46, P, { max: sx - pad - 12, font: F });
        stats.forEach(([l, v], i) => {
            const cx = sx + i * sw + sw;
            lab(g, l, cx, 96, P, { align: 'right', font: F, size: 8.5 });
            text(g, v, { x: cx, y: 118, size: 18, weight: 600, color: P.t1, align: 'right', max: sw - 8, min: 11, font: F }); /* @license Better Vest 9.6.3. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-e71ed9ef */
        });
        let lines = null, lineColor = P.gold;
        const pc = card.payouts;
        if (card.ledger) { const r = card.ledger.rows; lines = [`Spent ${r[0][1]} · Paid out ${r[1][1]} · Net ${r[2][1]}`, `Paid out ${r[1][1]} · Net ${r[2][1]}`, `Net ${r[2][1]}`]; lineColor = P.t2; }
        else if (pc && pc.n) {
            const head = `${pc.n} payout${pc.n === 1 ? '' : 's'}${pc.text ? ' · ' + pc.text : ''}`;
            lines = [head + (pc.pending ? ' · ' + pc.pending : ''), head, pc.text || head];
        } else if (pc) lines = [pc.pendingAmt ? 'Processing ' + pc.pendingAmt : 'Payout processing', 'Processing'];
        if (lines) {
            g.save(); g.globalAlpha *= end;
            if (!card.ledger) sparkle(g, pad + 6, 140, 11, P.gold);
            const lx = pad + (card.ledger ? 0 : 17);
            fitText(g, lines, { x: lx, y: 144, size: 12.5, weight: 500, color: lineColor, max: W - pad - lx, min: 9, font: F });
            g.restore();
        }
        g.restore();
        monthGrid(g, card, P, pad, 154, IW, H - pad - 154, { font: F, t, tl: TL, gap: 5, wk: 66, headH: 20, px: 7, hSize: 8.5, nMax: 15, meta: false });
    }
}


function dayTimeline(card) {
    const N = card.trades.length;
    const step = N ? Math.min(0.6, 4.0 / N) : 0;
    const at = card.trades.map((_, j) => 0.9 + j * step);
    const last = N ? at[N - 1] : 0.9;
    return {
        at, last,
        reveal(t) {
            const c = card.curve;
            if (!c || !N) return c ? c.t1 : 0;
            const pts = c.points;
            if (t <= at[0]) return c.t0 + (pts[0].ts - c.t0) * ease((t - 0.45) / (at[0] - 0.45));
            for (let j = 0; j < N - 1; j++) if (t < at[j + 1]) return pts[j].ts + (pts[j + 1].ts - pts[j].ts) * clamp01((t - at[j]) / (at[j + 1] - at[j]));
            return pts[N - 1].ts + (c.t1 - pts[N - 1].ts) * ease((t - last) / 0.45);
        },
        row: (j, t) => ease((t - at[j]) / 0.3),
        value(t) {
            let v = 0;
            card.trades.forEach((tr, j) => { v += tr.v * ease((t - at[j]) / 0.3); });
            return v;
        }
    };
}

function curveBox(g, card, P, x, y, w, h, o) {
    const c = card.curve, F = o.font;
    box(g, x, y, w, h, 12, P.curve.box, P.hair);
    if (!c) return;
    const M = { l: 10, r: 10, t: 16, b: 22 };
    const X = (ts) => x + M.l + ((ts - c.t0) / Math.max(1, c.t1 - c.t0)) * (w - M.l - M.r);
    const Y = (v) => y + h - M.b - ((v - c.lo) / Math.max(1e-9, c.hi - c.lo)) * (h - M.t - M.b);
    g.save();
    rr(g, x, y, w, h, 12); g.clip();
    if (c.rth.end > c.t0 && c.rth.start < c.t1) {
        const a = Math.max(c.t0, c.rth.start), b = Math.min(c.t1, c.rth.end);
        box(g, X(a), y + M.t - 6, X(b) - X(a), h - M.t - M.b + 6, 4, P.curve.band, null, true);
        text(g, 'RTH', { x: X(a) + 6, y: y + M.t + 6, size: 9.5, weight: 500, color: P.curve.axis, font: F });
    /* Better Vest (c) 2026 Astral. All rights reserved. bv-3e108ee2 */ }
    g.beginPath(); g.moveTo(x + M.l, Y(0)); g.lineTo(x + w - M.r, Y(0));
    g.setLineDash([3, 4]); g.lineWidth = 1; g.strokeStyle = P.curve.zero; g.stroke(); g.setLineDash([]);
    for (const rt of [c.start, c.end]) {
        if (rt <= c.t0 || rt >= c.t1) continue;
        g.beginPath(); g.moveTo(X(rt), y + M.t - 6); g.lineTo(X(rt), y + h - M.b);
        g.setLineDash([2, 3]); g.strokeStyle = P.curve.reset; g.stroke(); g.setLineDash([]);
        text(g, c.resetLabel, { x: X(rt) + 4, y: y + M.t + 4, size: 9.5, weight: 500, color: P.curve.axis, font: F });
    }
    const upTo = o.upTo == null ? c.t1 : o.upTo;
    const path = new Path2D();
    let py = Y(0);
    path.moveTo(X(c.t0), py);
    for (const p of c.points) {
        if (p.ts > upTo) break;
        path.lineTo(X(p.ts), py); py = Y(p.cum); path.lineTo(X(p.ts), py);
    }
    const endX = X(Math.min(upTo, c.t1));
    path.lineTo(endX, py);
    const area = new Path2D(path);
    area.lineTo(endX, Y(0)); area.lineTo(X(c.t0), Y(0)); area.closePath();
    const grad = g.createLinearGradient(0, y + M.t, 0, y + h - M.b);
    grad.addColorStop(0, P.curve.fill); grad.addColorStop(1, P.curve.fill0);
    g.fillStyle = grad; g.fill(area);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = 6; g.strokeStyle = P.curve.glow; g.stroke(path);
    g.lineWidth = 1.8; g.strokeStyle = P.curve.line; g.stroke(path);
    c.points.forEach((p, j) => {
        if (p.ts > upTo) return;
        const k = o.dot ? o.dot(j) : 1;
        g.beginPath(); g.arc(X(p.ts), Y(p.cum), 3.2 * (0.5 + 0.5 * k), 0, Math.PI * 2);
        g.fillStyle = P.curve.dot[p.net > 0 ? 'p' : p.net < 0 ? 'n' : '']; g.fill();
        g.lineWidth = 1.5; g.strokeStyle = P.curve.dotRing; g.stroke();
    });
    g.restore();
    const ay = y + h - 7;
    text(g, c.axis[0], { x: x + M.l, y: ay, size: 9.5, weight: 500, color: P.curve.axis, font: F });
    if (c.axis[1]) text(g, c.axis[1], { x: x + w / 2, y: ay, size: 9.5, weight: 500, color: P.curve.axis, align: 'center', font: F });
    text(g, c.axis[2], { x: x + w - M.r, y: ay, size: 9.5, weight: 500, color: P.curve.axis, align: 'right', font: F });
    if (o.labels !== false) {
        const peakV = Math.max(...c.points.map((p) => p.cum)), troughV = Math.min(...c.points.map((p) => p.cum));
        if (c.peak) text(g, c.peak, { x: x + w - M.r, y: Y(peakV) - 5, size: 9.5, weight: 500, color: P.t3, align: 'right', font: F, alpha: o.lab });
        if (c.trough) { const ty = Y(troughV) + 12 > y + h - M.b - 2 ? Y(troughV) - 7 : Y(troughV) + 12; text(g, c.trough, { x: x + w - M.r, y: ty, size: 9.5, weight: 500, color: P.t3, align: 'right', font: F, alpha: o.lab }); }
    }
}

function tradeRows(g, card, P, x, y, w, h, o) {
    /* Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-bd85382c */ const F = o.font, hide = card.hide;
    const rowH = o.rowH || 25;
    const cols = hide ? [['Time', 0, 'l'], ['Side', 0.27, 'l'], ['Pts', 0.72, 'r'], ['R', 1, 'r']]
        : [['Time', 0, 'l'], ['Side', 0.24, 'l'], ['Pts', 0.58, 'r'], ['Net', 0.82, 'r'], ['R', 1, 'r']];
    const cx = (f) => x + 6 + f * (w - 12);
    if (g.__rec) g.__rec.push({ x0: x, y0: y, x1: x + w, y1: y + h });
    cols.forEach(([l, f, a]) => lab(g, l, cx(f), y + 12, P, { size: 9, sp: 0.1, align: a === 'r' ? 'right' : 'left', font: F }));
    g.fillStyle = P.hair; g.fillRect(x, y + 19, w, 1);
    const fit = Math.max(1, Math.floor((h - 22) / rowH));
    const N = card.trades.length;
    const shown = N > fit ? fit - 1 : N;
    const sz = o.size || 12;
    for (let j = 0; j < shown; j++) {
        const tr = card.trades[j];
        const a = o.row ? o.row(j) : 1;
        if (a <= 0) continue;
        const ry = y + 22 + j * rowH + rowH * 0.66 + (1 - a) * 6;
        g.save(); g.globalAlpha *= a;
        text(g, tr.time, { x: cx(0), y: ry, size: sz, weight: 500, color: P.t1, font: F });
        const sw = text(g, tr.side, { x: cx(cols[1][1]), y: ry, size: sz - 1, weight: 700, sp: 0.04, color: tr.long ? P.up : P.dn, font: F });
        const qw = text(g, ' ' + tr.size, { x: cx(cols[1][1]) + sw, y: ry, size: sz, weight: 500, color: P.t1, font: F });
        text(g, ' ' + tr.sym, { x: cx(cols[1][1]) + sw + qw, y: ry, size: sz, weight: 500, color: P.t2, font: F, max: (cols[2][1] - cols[1][1]) * (w - 12) - sw - qw - 40, min: 8 });
        const col = (s) => (s === 'p' ? P.up : s === 'n' ? P.dn : P.t2);
        text(g, tr.pts, { x: cx(cols[2][1]), y: ry, size: sz, weight: 500, color: col(tr.ptsSgn), align: 'right', font: F });
        if (!hide) text(g, tr.net, { x: cx(cols[3][1]), y: ry, size: sz, weight: 600, color: col(tr.netSgn), align: 'right', font: F, max: (cols[3][1] - cols[2][1]) * (w - 12) - 6, min: 8 });
        text(g, tr.r, { x: cx(1), y: ry, size: sz, weight: 500, color: tr.r === '—' ? P.t3 : col(tr.rSgn), align: 'right', font: F });
        g.restore();
        if (j < shown - 1 || N > shown) { g.fillStyle = P.hair; g.fillRect(x, y + 22 + (j + 1) * rowH, w, 1); }
    }
    if (N > shown) {
        g.save(); g.globalAlpha *= o.more == null ? 1 : o.more;
        text(g, `+${N - shown} more`, { x: cx(0), y: y + 22 + shown * rowH + rowH * 0.66, size: sz - 0.5, weight: 600, color: P.t2, font: F });
        g.restore();
    }
}

function eventRows(g, card, P, x, y, w, max, F, a) {
    const evs = card.events.slice(0, max);
    evs.forEach((e, i) => {
        const ry = y + i * 32;
        /*! Property of Astral (@ax4p). Better Vest 9.6.3. No copying without written permission. bv-402ee555 */ g.save(); g.globalAlpha *= a;
        box(g, x, ry, w, 26, 9, P.tile, e.kind === 'payout' ? rgba(mix(P.gold, T0, 0.28)) : P.hair);
        if (e.kind === 'payout') sparkle(g, x + 15, ry + 13, 12, P.gold);
        else if (e.kind === 'passed') tick(g, x + 15, ry + 13, 14, P.up);
        else { g.beginPath(); g.arc(x + 15, ry + 13, 3, 0, Math.PI * 2); g.fillStyle = P.t2; g.fill(); }
        const sw = e.sub ? Math.min(110, w * 0.32) : 0;
        fitText(g, [e.text, e.short], { x: x + 30, y: ry + 17, size: 11.5, weight: 500, color: P.t1, max: w - 40 - sw, min: 8.5, font: F });
        if (e.sub) text(g, e.sub, { x: x + w - 10, y: ry + 17, size: 11, weight: 500, color: P.t2, align: 'right', max: sw - 6, min: 8, font: F });
        g.restore();
    });
    if (card.events.length > max) text(g, `+${card.events.length - max} more`, { x: x + 4, y: y + evs.length * 32 + 10, size: 10.5, weight: 600, color: P.t2, font: F, alpha: a });
    return evs.length ? evs.length * 32 + (card.events.length > max ? 16 : 0) : 0;
}

function dayTiles(card, t, TL) {
    let wins = card.wins, losses = card.losses, n = card.n;
    if (TL && t < ANIM_END) {
        wins = 0; losses = 0; n = 0;
        card.trades.forEach((tr, j) => { if (t >= TL.at[j] + 0.1) { n++; if (tr.cls === 'win') wins++; else if (tr.cls === 'loss') losses++; } });
    }
    const wr = !TL || t >= ANIM_END ? card.winRate : wins + losses ? Math.round((wins / (wins + losses)) * 100) + '%' : '—';
    const out = [['W / L', `${wins} / ${losses}`, `WR ${wr}${card.scratch && (!TL || t >= ANIM_END) ? ' · ' + card.scratch + ' scratch' : ''}`], ['Trades', String(n), card.accounts > 1 ? `${card.accounts} accounts` : '']];
    if (card.best != null) out.push(['Best', card.best, '', card.bestSgn === 'n' ? P_DN : P_UP]);
    if (card.worst != null) out.push(['Worst', card.worst, '', card.worstSgn === 'p' ? P_UP : P_DN]);
    out.wr = wr;
    return out;
}
const P_UP = 'up', P_DN = 'dn';

function drawDay(g, card, P, o) {
    const [W, H] = CARD_SIZES[o.format];
    const F = o.font, t = o.t;
    const TL = isFinite(t) ? dayTimeline(card) : null;
    const intro = TL ? ease(t / 0.45) : 1;
    const end = TL ? ease((t - TL.last - 0.5) / 0.5) : 1;
    const H0 = TL && t < ANIM_END && card.heroValue != null ? heroOf(TL.value(t), 'usd', false) : card.hero;
    const curveO = { font: F, upTo: TL ? TL.reveal(t) : null, dot: TL ? (j) => ease((t - TL.at[j]) / 0.25) : null, lab: end };
    const rowO = { font: F, row: TL ? (j) => TL.row(j, t) : null, more: end };
    const subs = [[card.mode, card.account].filter(Boolean).join(' · '), card.account, card.mode];
    const tiles = dayTiles(card, t, TL);
    const tileColor = (c) => (c === P_UP ? P.up : c === P_DN ? P.dn : null);
    const subLine = `${card.basis} · ${card.n} trade${card.n === 1 ? '' : 's'}${card.accounts > 1 ? ' · ' + card.accounts + ' accounts' : ''}`;
    if (o.format === 'wide') {
        const pad = 34, L = 290;
        g.save(); g.globalAlpha *= intro;
        /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.6.3. bv-575e4aed */ text(g, card.title, { x: pad, y: 62, size: 25, weight: 500, sp: -0.02, color: P.t1, max: L, min: 15, font: F });
        fitText(g, subs, { x: pad, y: 86, size: 12.5, weight: 500, color: P.t2, max: L, min: 9, font: F });
        hero(g, H0, pad, 166, 56, P, { max: L, font: F });
        text(g, subLine, { x: pad, y: 192, size: 13, weight: 500, color: P.t2, max: L, font: F });
        const tw = (L - 8) / 2, th = TILE_H;
        const all = card.events.length ? tiles : tiles.concat([['Profit factor', card.pf, card.pfSub], ['Planned RR', card.rr, card.rrSub]]);
        all.forEach((tl, i) => tile(g, pad + (i % 2) * (tw + 8), 214 + Math.floor(i / 2) * (th + 8), tw, th, P, tl[0], tl[1], tl[2], { font: F, vColor: tileColor(tl[3]), alpha: i >= 2 ? end : 1 }));
        const ey = 214 + Math.ceil(all.length / 2) * (th + 8) + 4;
        eventRows(g, card, P, pad, ey, L, Math.max(0, Math.floor((H - pad - 38 - ey) / 32)), F, end);
        brand(g, pad, H - pad - 22, 22, P, card, F, { max: L });
        const RX = pad + L + 30, RW = W - pad - RX;
        lab(g, `Cumulative ${card.basis.toLowerCase()} · by close time`, RX, 46, P, { font: F, max: RW - 30 });
        lab(g, 'ET', RX + RW, 46, P, { font: F, align: 'right' });
        g.restore();
        curveBox(g, card, P, RX, 56, RW, 196, curveO);
        g.save(); g.globalAlpha *= intro;
        lab(g, 'Trades', RX, 282, P, { font: F });
        g.restore();
        tradeRows(g, card, P, RX, 290, RW, H - pad - 290, rowO);
    } else if (o.format === 'story') {
        const pad = 32, IW = W - pad * 2;
        g.save(); g.globalAlpha *= intro;
        brand(g, pad, pad, 28, P, card, F, { noHandle: true });
        if (card.handle) text(g, card.handle, { x: W - pad, y: pad + 19, size: 14, weight: 500, color: P.t2, align: 'right', max: IW - 170, min: 10, font: F });
        text(g, card.title, { x: pad, y: 118, size: 30, weight: 500, sp: -0.02, color: P.t1, max: IW, min: 18, font: F });
        fitText(g, subs, { x: pad, y: 144, size: 13.5, weight: 500, color: P.t2, max: IW, min: 9, font: F });
        hero(g, H0, pad, 224, 72, P, { max: IW, font: F });
        text(g, subLine, { x: pad, y: 254, size: 14, weight: 500, color: P.t2, max: IW, font: F });
        const tw = (IW - 8) / 2, th = TILE_H;
        tiles.forEach((tl, i) => tile(g, pad + (i % 2) * (tw + 8), 278 + Math.floor(i / 2) * (th + 8), tw, th, P, tl[0], tl[1], tl[2], { font: F, vColor: tileColor(tl[3]), alpha: i >= 2 ? end : 1 }));
        let y = 278 + Math.ceil(tiles.length / 2) * (th + 8) + 6;
        y += eventRows(g, card, P, pad, y, IW, 2, F, end);
        lab(g, `Cumulative ${card.basis.toLowerCase()} · by close time`, pad, y + 22, P, { font: F, max: IW - 30 });
        lab(g, 'ET', W - pad, y + 22, P, { font: F, align: 'right' });
        g.restore();
        const ch = card.events.length ? 170 : 196;
        curveBox(g, card, P, pad, y + 32, IW, ch, curveO);
        y += 32 + ch + 30;
        g.save(); g.globalAlpha *= intro; lab(g, 'Trades', pad, y, P, { font: F }); g.restore();
        /*! Better Vest (c) 2026 Astral. All rights reserved. bv-a029ca60 */ tradeRows(g, card, P, pad, y + 8, IW, H - pad - y - 8, Object.assign(rowO, { rowH: 27, size: 13 }));
    } else {
        const pad = 26, IW = W - pad * 2;
        g.save(); g.globalAlpha *= intro;
        bTile(g, pad, pad, 24, P);
        const tw = text(g, card.title, { x: pad + 34, y: pad + 19, size: 20, weight: 500, sp: -0.02, color: P.t1, max: IW - 34 - (card.handle ? 90 : 0), min: 13, font: F });
        if (card.handle) text(g, card.handle, { x: W - pad, y: pad + 18, size: 13, weight: 500, color: P.t2, align: 'right', max: IW - 34 - tw - 16, min: 9, font: F });
        fitText(g, subs, { x: pad + 34, y: pad + 40, size: 12, weight: 500, color: P.t2, max: IW - 34, min: 9, font: F });
        const stats = [['W / L', tiles[0][1]], ['Win rate', tiles.wr]];
        const sw = 76, sx = W - pad - sw * stats.length;
        hero(g, H0, pad, 118, 46, P, { max: sx - pad - 12, font: F });
        stats.forEach(([l, v], i) => {
            const cx = sx + i * sw + sw;
            lab(g, l, cx, 96, P, { align: 'right', font: F, size: 8.5 });
            text(g, v, { x: cx, y: 118, size: 18, weight: 600, color: P.t1, align: 'right', max: sw - 8, min: 11, font: F });
        });
        const ev = card.events[0];
        if (ev) {
            g.save(); g.globalAlpha *= end;
            if (ev.kind === 'payout') sparkle(g, pad + 6, 140, 11, P.gold); else if (ev.kind === 'passed') tick(g, pad + 6, 140, 13, P.up);
            const more = card.events.length > 1 ? `  +${card.events.length - 1}` : '';
            fitText(g, [ev.text + more, ev.text, ev.short + more, ev.short], { x: pad + 18, y: 144, size: 12, weight: 500, color: ev.kind === 'payout' ? P.gold : P.t2, max: IW - 18, min: 9, font: F });
            g.restore();
        }
        g.restore();
        curveBox(g, card, P, pad, 156, IW, 132, Object.assign(curveO, { labels: true }));
        tradeRows(g, card, P, pad, 300, IW, H - pad - 300, Object.assign(rowO, { rowH: 23, size: 11.5 }));
    }
}

export function drawCard(g, card, P, o) {
    const opt = Object.assign({ format: 'wide', t: Infinity, font: CARD_FONT }, o);
    const [W, H] = CARD_SIZES[opt.format] || CARD_SIZES.wide;
    const paint = card.kind === 'month' ? drawMonth : drawDay;
    let holes = null;
    if (P.stars) {
        const key = opt.format + '|' + opt.font;
        /*! Better Vest (c) 2026 Astral. All rights reserved. bv-0a798c23 */ card.__holes = card.__holes || {};
        if (!card.__holes[key]) {
            const rec = [], words = g.__words, marks = g.__marks;
            g.save(); g.globalAlpha = 0; g.__rec = rec; g.__words = null; g.__marks = null;
            paint(g, card, P, Object.assign({}, opt, { t: Infinity }));
            g.__rec = null; g.__words = words; g.__marks = marks; g.restore();
            card.__holes[key] = rec;
        }
        holes = card.__holes[key];
    }
    g.save();
    background(g, W, H, P, holes);
    paint(g, card, P, opt);
    g.restore();
}
