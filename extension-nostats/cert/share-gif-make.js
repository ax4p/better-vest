/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { GIF_FPS, gifGrid, gifLoop } from './share-gif.js';
import { bgFramePlan } from './share-look.js';
import { replayStage, cardStage } from './share-video.js';
import { cardCanvas, CARD_CSS } from './share-render.js';
import { bgFrames, bgStill, cardGeom } from './share-bg.js';

export const GIF_SIZES = { full: 2, half: 1 };
const SAMPLE_FRAMES = 24;
const SAMPLE_PIXELS = 6e6;

export const GIF_REPLAY = { intro: 0.4, hold: 2.5 };
export function gifReplayPlan(n, fps) {
    const r = GIF_REPLAY;
    const reveal = Math.min(10, Math.max(4, n * 0.12));
    const total = r.intro + reveal + r.hold;
    const frames = Math.round(total * fps);
    const pAt = (f) => { /* Copyright Astral 2026. From Better Vest 9.2.5 (nostats), ref bv-befe86ed. Not licensed for reuse. */
        const t = f / fps;
        if (t <= r.intro) return 0;
        return Math.min(n, Math.round(((t - r.intro) / reveal) * n * 1000) / 1000);
    };
    return { fps, frames, intro: r.intro, reveal, hold: r.hold, total, pAt };
}

export const GIF_SPEEDS = ['fit', '10', '30', '60'];
export const GIF_MAX_S = 30;
export function gifSpeedPlan(n, resS, speed, fps, wins) {
    const k = Number(speed);
    if (!(k > 0) || !(resS > 0)) return Object.assign(gifReplayPlan(n, fps), { speed: 'fit', a: 0, b: n, window: false, ok: true });
    const r = GIF_REPLAY;
    const room = GIF_MAX_S - r.intro - r.hold;
    const len = (a, b) => ((b - a) * resS) / k;
    const ws = (Array.isArray(wins) ? wins : wins ? [Object.assign({ kind: 'trades' }, wins)] : []).filter((w) => w && w.b > w.a && w.a >= 0 && w.b <= n);
    let a = 0, b = n, window = false;
    if (len(0, n) > room) {
        const w = ws.find((x) => len(x.a, x.b) <= room);
        if (!w) {
            const z = ws[ws.length - 1];
            return { speed: String(k), ok: false, need: r.intro + len(z ? z.a : 0, z ? z.b : n) + r.hold, a: z ? z.a : 0, b: z ? z.b : n, window: z ? z.kind || 'trades' : false };
        }
        a = w.a; b = w.b; window = w.kind || 'trades';
    }
    const reveal = len(a, b), secs = (b - a) * resS;
    const total = r.intro + reveal + r.hold;
    const frames = Math.round(total * fps);
    const pAt = (f) => {
        const t = f / fps;
        if (t <= r.intro) return a;
        return a + Math.min(secs, Math.floor((t - r.intro) * k + 1e-9)) / resS;
    };
    return { fps, frames, intro: r.intro, reveal, hold: r.hold, total, pAt, speed: String(k), a, b, window, ok: true };
}
export function gifTradeWindows(bars, resS, trades) {
    const out = [];
    const all = gifTradeWindow(bars, resS, trades);
    if (all) out.push(Object.assign({ kind: 'trades' }, all));
    const list = (trades || []).filter((t) => t && t.fills && t.fills.length);
    const end = (t) => Math.max(...t.fills.map((f) => f.t));
    const lastT = list.length > 1 ? list.reduce((x, y) => (end(y) > end(x) ? y : x)) : null;
    const last = lastT ? gifTradeWindow(bars, resS, [lastT]) : null;
    if (last && !(all && Math.abs(last.a - all.a) < 1e-9 && Math.abs(last.b - all.b) < 1e-9)) out.push(Object.assign({ kind: 'last' }, last));
    return out;
}
export const GIF_WIN = { lead: 60, tail: 30 };
export function gifTradeWindow(bars, resS, trades) {
    const ts = [];
    /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-04e506ba */ for (const t of trades || []) for (const f of (t && t.fills) || []) if (f && f.t > 0) ts.push(f.t / 1000);
    if (!ts.length || !bars || !bars.length) return null;
    const pOf = (s) => {
        if (s < bars[0][0]) return 0;
        let a = 0, b = bars.length - 1;
        while (a < b) { const m = (a + b + 1) >> 1; if (bars[m][0] <= s) a = m; else b = m - 1; }
        return a + Math.max(0, Math.min(1, (s - bars[a][0]) / resS));
    };
    return { a: pOf(Math.min(...ts) - GIF_WIN.lead), b: pOf(Math.max(...ts) + GIF_WIN.tail) };
}

export function gifFrames(kind, scene, img, mode, plan) {
    const moving = !!(img && img.animated && img.durations && img.durations.length > 1);
    if (kind === 'replay' && scene && mode !== 'still') {
        const rp = plan && plan.ok !== false && plan.pAt ? plan : gifReplayPlan(scene.n, GIF_FPS);
        const bp = moving ? bgFramePlan(img.durations, { fps: GIF_FPS, frames: rp.frames }) : null;
        return gifGrid(rp.frames, GIF_FPS, (f) => ({ step: rp.pAt(f), bg: bp ? bp.at(f) : null }));
    }
    if (moving) return gifLoop(img.durations).map((x) => ({ step: null, bg: x.bg, delay: x.delay }));
    return [{ step: null, bg: null, delay: 0 }];
}
export function sampleFrames(n, max) {
    if (n <= max) return Array.from({ length: n }, (_, i) => i);
    return Array.from({ length: max }, (_, i) => Math.round((i * (n - 1)) / (max - 1)));
}

export async function makeGif(o) {
    const t0 = performance.now();
    const scale = GIF_SIZES[o.size] || 2;
    const W = Math.round(o.width * scale), H = Math.round(o.height * scale);
    const plan = gifFrames(o.kind, o.scene, o.img, o.mode, o.plan);
    const replay = o.kind === 'replay' && o.mode !== 'still';
    const animated = plan.length > 1;
    const stop = () => !!(o.cancelled && o.cancelled());
    const halt = () => { if (stop()) { const e = new Error('cancelled'); e.cancelled = true; throw e; } };
    const tell = (f, what) => { if (o.onProgress) o.onProgress(Math.max(0, Math.min(1, f)), what); };
    let frames = null, worker = null;
    try {
        let canvas, draw;
        let at = 0;
        if (!animated) {
            canvas = await cardCanvas(o.card, { width: o.width, height: o.height, scale, img: o.img, bg: o.bg });
            draw = () => {}; /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-0ce9c744 */
        } else {
            const g = cardGeom(o.card);
            let bg = null;
            if (o.img && o.img.animated) {
                const used = [];
                const seen = new Set();
                for (const p of plan) if (!seen.has(p.bg)) { seen.add(p.bg); used.push(p.bg); }
                at = 0.15;
                frames = await bgFrames(o.img, { used, at: (k) => plan[k].bg }, W, H, scale, o.bg, g.base, (f) => tell(f * at, 'picture'), { cancelled: stop });
                bg = { at: frames.at };
            } else if (o.img) bg = { still: bgStill(o.img, W, H, scale, o.bg, g.base) };
            const so = { cssUrl: CARD_CSS, width: o.width, height: o.height, scale, bg };
            if (replay) { const st = await replayStage(o.card, o.scene, Object.assign({ tape: o.tape || null }, so)); canvas = st.canvas; draw = (k) => st.drawAt(plan[k].step, k); }
            else { const st = await cardStage(o.card, so); canvas = st.canvas; draw = (k) => st.draw(k); }
        }
        halt();
        const ctx = canvas.getContext('2d');
        const pixels = (k) => { draw(k); return ctx.getImageData(0, 0, W, H).data; };

        worker = new Worker(new URL('./share-gif-worker.js', import.meta.url), { type: 'module' });
        const waits = [];
        let broken = null;
        worker.onmessage = (e) => {
            const w = waits.shift();
            if (!w) return;
            if (e.data && e.data.type === 'error') w.reject(new Error(e.data.message)); else w.resolve(e.data);
        };
        worker.onerror = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            broken = new Error((e && e.message) || 'the GIF encoder stopped');
            while (waits.length) waits.shift().reject(broken);
        };
        const call = (msg, transfer) => new Promise((resolve, reject) => {
            if (broken) { reject(broken); return; }
            waits.push({ resolve, reject });
            worker.postMessage(msg, transfer || []);
        });
        await call({ type: 'begin', w: W, h: H });

        const pick = sampleFrames(plan.length, SAMPLE_FRAMES);
        const step = Math.max(1, Math.ceil((pick.length * W * H) / SAMPLE_PIXELS));
        const span1 = animated ? 0.15 : 0.3;
        for (const [i, k] of pick.entries()) {
            halt();
            const px = pixels(k); /* @license Better Vest 9.2.5. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-55c3e403 */
            await call({ type: 'sample', buf: px.buffer, step, offset: i }, [px.buffer]);
            tell(at + ((i + 1) / pick.length) * span1, 'colours');
        }
        halt();
        const pal = await call({ type: 'palette', animated, dither: o.dither !== false });
        const from = at + span1;

        const inflight = [];
        for (let k = 0; k < plan.length; k++) {
            halt();
            const px = pixels(k);
            inflight.push(call({ type: 'frame', buf: px.buffer, delay: plan[k].delay }, [px.buffer]));
            if (inflight.length >= 2) await inflight.shift();
            tell(from + ((k + 1) / plan.length) * (0.98 - from), 'frames');
        }
        await Promise.all(inflight);
        halt();
        const done = await call({ type: 'end' });
        tell(1, 'done');
        return { blob: new Blob(done.parts, { type: 'image/gif' }), w: W, h: H, frames: done.frames, ms: plan.reduce((s, x) => s + x.delay, 0) * 10,
            colors: pal.colors, took: Math.round(performance.now() - t0), size: o.size };
    } catch (e) {
        if (stop() || (e && e.message === 'cancelled')) { const c = new Error('cancelled'); c.cancelled = true; throw c; }
        throw e;
    } finally {
        if (worker) worker.terminate();
        if (frames) frames.close();
    }
}
