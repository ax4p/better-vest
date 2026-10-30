/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { cardToCanvas } from './raster.js';
import { videoPlan, videoItems } from './share-replay.js';
import { bareCard, cardGeom, clipCard } from './share-bg.js';

const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export function videoMime() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    return MIMES.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
}
export const videoExt = (mime) => (/mp4/.test(mime) ? 'mp4' : 'webm');

function palette(card) {
    const cs = getComputedStyle(card);
    const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    const cu = v('--k-cu', '#00d68f'), cd = v('--k-cd', '#ff3b5c');
    return { grid: v('--k-grid', 'rgba(255,255,255,.05)'), dim: v('--k-dim', '#737373'), mut: v('--k-mut', '#a3a3a3'), text: v('--k-text', '#fafafa'), bg: v('--k-bg', '#0a0a0a'),
        up: v('--k-up', '#22c55e'), down: v('--k-down', '#ff3b5c'), cu, cd, wu: v('--k-wu', cu), wd: v('--k-wd', cd), bu: v('--k-bu', cu), bd: v('--k-bd', cd) };
}
function paint(ctx, d, P) {
    const has = (c) => (' ' + d.c + ' ').includes(' ' + c + ' ');
    ctx.save();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (d.t === 'line') {
        ctx.lineWidth = 1;
        if (has('gl')) ctx.strokeStyle = P.grid;
        else if (has('wu')) ctx.strokeStyle = P.wu;
        else if (has('wd')) ctx.strokeStyle = P.wd;
        else if (has('pz')) { ctx.strokeStyle = P.grid; ctx.setLineDash([2, 3]); }
        else if (has('cw') || has('cl') || has('co')) { ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.strokeStyle = has('cw') ? P.up : has('cl') ? P.down : P.mut; }
        /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-2e1e50b5 */ ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
    } else if (d.t === 'rect') {
        if (has('ch')) { ctx.lineWidth = 1; ctx.strokeStyle = P.bu; ctx.strokeRect(d.x, d.y, d.w, d.h); ctx.restore(); return; }
        if (has('vu') || has('vd')) { ctx.fillStyle = has('vu') ? P.cu : P.cd; ctx.globalAlpha = 0.32; }
        else if (has('cu')) ctx.fillStyle = P.cu;
        else if (has('cd')) ctx.fillStyle = P.cd;
        else if (has('zw') || has('zl') || has('zo')) { ctx.fillStyle = has('zw') ? P.up : has('zl') ? P.down : P.mut; ctx.globalAlpha = has('zb') ? 0.26 : has('zo') ? 0.08 : 0.11; }
        else if (has('ss')) { ctx.fillStyle = P.text; ctx.globalAlpha = 0.035; }
        if (d.rx) { ctx.beginPath(); ctx.roundRect(d.x, d.y, d.w, d.h, d.rx); ctx.fill(); } else ctx.fillRect(d.x, d.y, d.w, d.h);
        if (has('cb')) { ctx.lineWidth = 1; ctx.strokeStyle = has('cu') ? P.bu : P.bd; ctx.strokeRect(d.x, d.y, d.w, d.h); }
    } else if (d.t === 'path') {
        const path = new Path2D(d.d);
        if (has('ab')) { ctx.fillStyle = P.up; ctx.fill(path); }
        else if (has('as')) { ctx.fillStyle = P.down; ctx.fill(path); }
        else if (has('pn')) { ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = has('pnd') ? P.down : P.up; ctx.stroke(path); }
        else if (has('ou') || has('od')) { ctx.lineWidth = 1.4; ctx.strokeStyle = has('ou') ? P.cu : P.cd; ctx.stroke(path); }
        else if (has('ln')) { ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = P.cu; ctx.stroke(path); }
        else if (has('ar')) { ctx.globalAlpha = 0.1; ctx.fillStyle = P.cu; ctx.fill(path); }
    } else if (d.t === 'circle') {
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        if (has('db') || has('ds')) { ctx.fillStyle = has('db') ? P.up : P.down; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = P.bg; ctx.stroke(); }
        else { ctx.fillStyle = P.bg; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = P.text; ctx.stroke(); }
    } else if (d.t === 'text') {
        let size = 10, weight = 400, fill = P.dim, halo = 0;
        if (has('ax')) { size = 10; fill = P.dim; }
        else if (has('pl')) { size = has('pb') ? 9 : 11; weight = 700; halo = 4; fill = has('pw') ? P.up : has('pd') ? P.down : has('pb') ? P.text : P.mut; }
        else if (has('lp')) { size = 10; weight = 700; fill = '#000'; }
        else if (has('px')) { size = 9.5; weight = 600; halo = 3; fill = P.mut; }
        else if (has('sl')) { size = 9; weight = 700; fill = P.dim; } /* @license Better Vest 9.3.3. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-0ee9e68c */
        else if (has('pt')) { size = 10; weight = 700; fill = has('pw') ? P.up : has('pd') ? P.down : P.dim; }
        ctx.font = `${weight} ${size}px Inter, sans-serif`;
        ctx.textAlign = d.a === 'middle' ? 'center' : d.a === 'end' ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        if (halo) { ctx.lineWidth = halo; ctx.lineJoin = 'round'; ctx.strokeStyle = P.bg; ctx.strokeText(d.s, d.x, d.y); }
        ctx.fillStyle = fill;
        ctx.fillText(d.s, d.x, d.y);
    } else if (d.t === 'group') {
        for (const part of d.parts) paint(ctx, part, P);
    }
    ctx.restore();
}

export async function recordCanvas(canvas, plan, draw, o) {
    const opt = o || {};
    const mime = opt.mime || videoMime();
    if (!mime) throw new Error('this browser cannot record video');
    const stream = canvas.captureStream(plan.fps);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((res, rej) => { rec.onstop = res; rec.onerror = (e) => rej(e.error || new Error('recording failed')); });
    rec.start(250);
    const t0 = performance.now();
    await new Promise((resolve) => {
        const tick = () => {
            const f = Math.floor(((performance.now() - t0) / 1000) * plan.fps);
            if (f >= plan.frames) { resolve(); return; }
            draw(f);
            if (opt.onProgress) opt.onProgress(f / plan.frames);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    if (opt.last) opt.last(); else draw(plan.frames - 1);
    await new Promise((r) => setTimeout(r, 120));
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    return { blob: new Blob(chunks, { type: mime.split(';')[0] }), mime, seconds: plan.frames / plan.fps };
}

export async function replayStage(card, scene, o) {
    const scale = o.scale || 2;
    /*! Better Vest (c) 2026 Astral. All rights reserved. bv-7ce71bfd */ const base = o.bg ? bareCard(card) : card.cloneNode(true);
    const svg = base.querySelector('.rp-svg');
    if (svg) svg.innerHTML = '';
    const baseCanvas = await cardToCanvas(base, { cssUrl: o.cssUrl, width: o.width, height: o.height, scale });
    const chart = card.querySelector('.rp-chart');
    const cr = chart.getBoundingClientRect(), kr = card.getBoundingClientRect();
    const k = kr.width / o.width;
    const ox = (cr.left - kr.left) / k, oy = (cr.top - kr.top) / k;
    if (document.fonts && document.fonts.load) { try { await document.fonts.load('700 11px Inter'); await document.fonts.load('400 10px Inter'); } catch (e) {} }
    const P = palette(card);
    const canvas = document.createElement('canvas');
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;
    const ctx = canvas.getContext('2d');
    const radius = o.bg ? cardGeom(card).radius * scale : 0;
    const under = (f) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (o.bg) {
            const b = o.bg.still || o.bg.at(f);
            if (b) { ctx.save(); clipCard(ctx, canvas.width, canvas.height, radius); ctx.drawImage(b, 0, 0, canvas.width, canvas.height); ctx.restore(); }
        }
        ctx.drawImage(baseCanvas, 0, 0);
        ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    };
    const draw = (step, f) => {
        under(f);
        for (const it of videoItems(scene, step)) paint(ctx, it.d, P);
    };
    const fc = frameCtx(scene);
    const tape = o.tape || null;
    const drawAt = (p, f) => {
        under(f);
        for (const x of frameItems(scene, p, tape, fc)) { if (x.frac != null) paintForming(ctx, x.d, P, x.frac); else paint(ctx, x.d, P); }
    };
    return { canvas, draw, drawAt };
}

export const frameCtx = (scene) => { const tagItem = scene.items.find(isLastTag); return { tagItem, tick: tagItem ? sceneTick(scene) : 0 }; };
export function frameItems(scene, p, tape, fc) {
    const { tagItem, tick } = fc || frameCtx(scene);
    const out = [];
    const cur = Math.floor(p), frac = p - cur;
    const live = tagItem && p < scene.n;
    const q = tape && frac > 0 && scene.type !== 'ha' ? tape.form(cur, frac) : null;
    const now = tape && frac > 0 ? tape.at(cur, frac) : null;
    let close = null;
    for (const it of scene.items) {
        if (live && it === tagItem) continue;
        if (it.step < cur) { out.push({ d: it.d }); if (live && it.step === cur - 1) close = closeOf(it.d, 1) || close; }
        else if (it.step === cur && frac > 0) {
            /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-56c0b43e */ const kind = q ? barKind(it.d) : '';
            if (kind) { out.push({ d: tapeShape(it.d, kind, q, scene) }); if (live) close = { y: scene.geom.yOf(q.c), up: q.c >= q.o }; }
            else if (now != null && it.at != null) { if (it.at <= now) out.push({ d: it.d }); }
            else { out.push({ d: it.d, frac }); if (live) close = closeOf(it.d, frac) || close; }
        }
    }
    if (live && close) out.push({ d: liveTag(tagItem.d, close, scene, tick) });
    return out;
}

const isLastTag = (it) => it && it.d && it.d.t === 'group' && it.d.parts.length === 2 && it.d.parts[1].t === 'text' && hasC(it.d.parts[1], 'lp');
export function closeOf(d, f) {
    const { parts, clipX } = formingParts(d, f);
    const body = parts.find((q) => q.t === 'rect' && (hasC(q, 'cu') || hasC(q, 'cd')));
    if (body) { const up = hasC(body, 'cu'); return { y: up ? body.y : body.y + body.h, up }; }
    const ln = parts.find((q) => q.t === 'path' && hasC(q, 'ln'));
    const m = ln && /^M\s*([-\d.]+)[ ,]+([-\d.]+)\s*L\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(ln.d || '');
    if (!m) return null;
    const k = clipX == null ? 1 : Math.max(0, Math.min(1, f));
    const y0 = Number(m[2]), y1 = Number(m[4]);
    return { y: y0 + (y1 - y0) * k, up: y1 <= y0 };
}
export function priceAtY(scene, y) {
    const G = scene.geom, box = scene.box;
    return G.lo + (1 - (y - box.y) / box.h) * (G.hi - G.lo);
}
export function sceneTick(scene) {
    /*! Property of Astral (@ax4p). Better Vest 9.3.3. No copying without written permission. bv-7b5beeeb */ const ps = [];
    for (const it of scene.items) {
        if (it.step < 0 || !it.d || it.d.t !== 'group') continue;
        for (const q of it.d.parts) {
            if (q.t === 'rect' && (hasC(q, 'cu') || hasC(q, 'cd'))) ps.push(priceAtY(scene, q.y), priceAtY(scene, q.y + q.h));
            else if (q.t === 'line' && (hasC(q, 'wu') || hasC(q, 'wd'))) ps.push(priceAtY(scene, q.y1), priceAtY(scene, q.y2));
        }
        if (ps.length > 400) break;
    }
    if (!ps.length) return 0.01;
    for (const t of [10, 5, 1, 0.5, 0.25, 0.1, 0.05, 0.01]) if (ps.every((v) => Math.abs(v / t - Math.round(v / t)) < 1e-3)) return t;
    return 0.01;
}
export function liveTag(d, close, scene, tick) {
    const [r, t] = d.parts;
    const dy = close.y - (r.y + r.h / 2);
    const t0 = tick > 0 ? tick : 0.01;
    const px = Math.round(priceAtY(scene, close.y) / t0) * t0;
    const s = px.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return { t: 'group', parts: [Object.assign({}, r, { y: r.y + dy, c: close.up ? 'cu' : 'cd' }), Object.assign({}, t, { y: t.y + dy, s })] };
}

const hasC = (q, c) => (' ' + q.c + ' ').includes(' ' + c + ' ');
export function formingParts(d, f) {
    const k = Math.max(0, Math.min(1, f));
    const parts = d.t === 'group' ? d.parts : [d];
    const body = parts.find((q) => q.t === 'rect' && (hasC(q, 'cu') || hasC(q, 'cd')));
    const up = body ? hasC(body, 'cu') : true;
    const oy = body ? (up ? body.y + body.h : body.y) : null;
    let clipX = null;
    const out = [];
    for (const q of parts) {
        if (q.t === 'rect' && body && q === body) {
            const h = Math.max(1, q.h * k);
            out.push(Object.assign({}, q, { h, y: up ? q.y + q.h - h : q.y }));
        } else if (q.t === 'line' && oy != null && (hasC(q, 'wu') || hasC(q, 'wd'))) {
            out.push(Object.assign({}, q, { y1: oy + (q.y1 - oy) * k, y2: oy + (q.y2 - oy) * k }));
        } else if (q.t === 'rect' && (hasC(q, 'vu') || hasC(q, 'vd'))) {
            const h = q.h * k;
            if (h > 0) out.push(Object.assign({}, q, { h, y: q.y + q.h - h }));
        } else if (q.t === 'path' && (hasC(q, 'ln') || hasC(q, 'ar'))) {
            const m = /^M\s*([-\d.]+)[ ,]+[-\d.]+\s*L\s*([-\d.]+)/.exec(q.d || '');
            if (m) clipX = Number(m[1]) + (Number(m[2]) - Number(m[1])) * k;
            out.push(q);
        } else if (q.t === 'path' && (hasC(q, 'ou') || hasC(q, 'od'))) {
            if (k >= 0.5) out.push(q);
        } else out.push(q);
    }
    return { parts: out, clipX };
/*! Copyright Astral 2026. From Better Vest 9.3.3 (nostats), ref bv-6a68f1a6. Not licensed for reuse. */ }
export function barKind(d) {
    if (!d) return '';
    if (d.t === 'path') return hasC(d, 'ou') || hasC(d, 'od') ? 'ohlc' : '';
    if (d.t !== 'group') return '';
    if (d.parts.some((q) => q.t === 'path' && hasC(q, 'ln'))) return 'line';
    const body = d.parts.some((q) => q.t === 'rect' && (hasC(q, 'cu') || hasC(q, 'cd')));
    return body && d.parts.some((q) => q.t === 'line' && (hasC(q, 'wu') || hasC(q, 'wd'))) ? 'candle' : '';
}
export function tapeShape(d, kind, q, scene) {
    const Y = scene.geom.yOf, up = q.c >= q.o;
    if (kind === 'ohlc') {
        const m = /^M\s*([-\d.]+)[ ,]+[-\d.]+\s*V\s*[-\d.]+\s*M\s*([-\d.]+)/.exec(d.d || '');
        if (!m) return d;
        const x = Number(m[1]), t = x - Number(m[2]);
        return { t: 'path', c: up ? 'ou' : 'od', d: `M${x} ${Y(q.h)}V${Y(q.l)}M${x - t} ${Y(q.o)}H${x}M${x} ${Y(q.c)}H${x + t}` };
    }
    if (kind === 'line') {
        return { t: 'group', parts: d.parts.map((p) => {
            const m = p.t === 'path' ? /^M\s*([-\d.]+)[ ,]+([-\d.]+)\s*L\s*([-\d.]+)[ ,]+[-\d.]+(.*)$/.exec(p.d || '') : null;
            return m ? Object.assign({}, p, { d: `M${m[1]} ${m[2]}L${m[3]} ${Y(q.c)}${m[4]}` }) : p;
        }) };
    }
    const body = d.parts.find((p) => p.t === 'rect' && (hasC(p, 'cu') || hasC(p, 'cd')));
    if (!body) return d;
    const x = body.x + body.w / 2;
    const top = Y(Math.max(q.o, q.c)), bh = Math.max(1, Y(Math.min(q.o, q.c)) - top);
    const hollow = scene.type === 'hollow' && up;
    const b = { t: 'rect', c: (up ? 'cu' : 'cd') + (hollow ? ' ch' : scene.border ? ' cb' : ''), x: body.x, y: top, w: body.w, h: bh };
    if (hollow) return { t: 'group', parts: [{ t: 'line', c: 'wu', x1: x, x2: x, y1: Y(q.h), y2: top }, { t: 'line', c: 'wu', x1: x, x2: x, y1: top + bh, y2: Y(q.l) }, b] };
    return { t: 'group', parts: [{ t: 'line', c: up ? 'wu' : 'wd', x1: x, x2: x, y1: Y(q.h), y2: Y(q.l) }, b] };
}
function paintForming(ctx, d, P, f) {
    const { parts, clipX } = formingParts(d, f);
    ctx.save();
    if (clipX != null) { ctx.beginPath(); ctx.rect(-1e5, -1e5, clipX + 1e5, 2e5); ctx.clip(); }
    for (const q of parts) paint(ctx, q, P);
    ctx.restore();
}

export async function recordReplay(card, scene, o) {
    const mime = o.mime || videoMime();
    if (!mime) throw new Error('this browser cannot record video');
    const { canvas, draw } = await replayStage(card, scene, o);
    const plan = videoPlan(scene.n, { fps: o.fps });
    draw(-1, 0);
    const res = await recordCanvas(canvas, plan, (f) => draw(plan.stepAt(f), f), { mime, onProgress: o.onProgress, last: () => draw(scene.n - 1, plan.frames - 1) });
    return Object.assign(res, { seconds: plan.total });
}

export async function cardStage(card, o) { /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-02b2ba94 */
    const scale = o.scale || 2;
    const over = await cardToCanvas(bareCard(card), { cssUrl: o.cssUrl, width: o.width, height: o.height, scale });
    const canvas = document.createElement('canvas');
    canvas.width = over.width;
    canvas.height = over.height;
    const ctx = canvas.getContext('2d');
    const radius = cardGeom(card).radius * scale;
    const draw = (f) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const b = o.bg.at(f);
        if (b) { ctx.save(); clipCard(ctx, canvas.width, canvas.height, radius); ctx.drawImage(b, 0, 0, canvas.width, canvas.height); ctx.restore(); }
        ctx.drawImage(over, 0, 0);
    };
    return { canvas, draw };
}
export async function recordCard(card, o) {
    const { canvas, draw } = await cardStage(card, o);
    draw(0);
    return recordCanvas(canvas, o.plan, draw, { mime: o.mime, onProgress: o.onProgress });
}
