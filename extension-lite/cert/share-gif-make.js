// Better Vest P&L card, Save as GIF (9.0): the share page's side. The frames are drawn with the video's own stages (cert/share-video.js:
// the same card, chart shapes and picture frames) or, for a card that does not move, with the PNG's own canvas (cert/share-render.js
// cardCanvas: the same pixels). Their pixels go to the encoder's worker (cert/share-gif-worker.js, cert/share-gif.js), transferred, two
// frames in flight at most, so memory stays flat however long the GIF is. Everything stays on this computer.

import { GIF_FPS, gifGrid, gifLoop } from './share-gif.js';
import { bgFramePlan } from './share-look.js';
import { replayStage, cardStage } from './share-video.js';
import { cardCanvas, CARD_CSS } from './share-render.js';
import { bgFrames, bgStill, cardGeom } from './share-bg.js';

// Full: the PNG's size (twice the card, 1080 wide for 4:5); Half: the card's own size, about a quarter of the file
export const GIF_SIZES = { full: 2, half: 1 };
const SAMPLE_FRAMES = 24;          // frames the palette is made from, spread over the GIF
const SAMPLE_PIXELS = 6e6;         // pixels read for it at most (every n-th pixel past that)

// The Replay as a GIF (round 2, the owner: smoother, and not like the video): its own plan at 50 fps. A moment of the empty chart, the
// day's bars one after another with the newest one forming (share-video.js formingParts), then the whole day held before the loop starts
// again. pAt(f): how many bars of the day have come at frame f (0..n; the fraction is the forming bar, to 1/1000).
export const GIF_REPLAY = { intro: 0.4, hold: 2.5 };
export function gifReplayPlan(n, fps) {
    const r = GIF_REPLAY;
    // round 2b (the owner: still "feels like 30 fps"): the bars came 3 frames each, so the motion stepped. A steady sweep, each bar about
    // 6 frames (0.12 s) while the day fits in 10 s; a longer day goes faster but its bars are narrower, so the sweep still moves a few
    // pixels a frame
    const reveal = Math.min(10, Math.max(4, n * 0.12));
    const total = r.intro + reveal + r.hold;
    const frames = Math.round(total * fps);
    const pAt = (f) => {
        const t = f / fps;
        if (t <= r.intro) return 0;
        return Math.min(n, Math.round(((t - r.intro) / reveal) * n * 1000) / 1000);
    };
    return { fps, frames, intro: r.intro, reveal, hold: r.hold, total, pAt };
}

// 9.0 (the owner: "the replay is tooo fast ... so it can play at different speeds"): the Replay at a speed. 'fit' plays the whole range in
// about 10 s (gifReplayPlan, as before); a number plays that many seconds of the market each second, one step per market second (the
// recorded seconds are the finest there are: frames in between would show the same picture, so they merge into one). A GIF lasts
// GIF_MAX_S at most: when the whole range is longer at that speed, the trades' own window plays (wins: [{ a, b, kind }], from bars come a
// to b, the bars before it already drawn; gifTradeWindows gives the trades' window, then the last trade's); when even the last is too long, the
// speed is not offered (ok false, `need`: the seconds it would take). window: false, or the kind of window played ('trades', 'last').
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
// The windows a speed may play when the whole card is too long: the trades' own window, then the last trade's (the one a pop-up after a
// big close is about); one when they are the same, none without trades. [{ a, b, kind }]
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
// The trades' own window on the card, in bars come (the plan's p: a fraction is a bar part way): from a minute before the first fill to
// half a minute after the last, so a real-time GIF starts and ends inside a bar, as a live chart would. bars [[t s, ...]...]; trades as
// share-replay.js gives them ({ fills: [{ t ms }] }). null without fills.
export const GIF_WIN = { lead: 60, tail: 30 };
export function gifTradeWindow(bars, resS, trades) {
    const ts = [];
    for (const t of trades || []) for (const f of (t && t.fills) || []) if (f && f.t > 0) ts.push(f.t / 1000);
    if (!ts.length || !bars || !bars.length) return null;
    const pOf = (s) => {
        if (s < bars[0][0]) return 0;
        let a = 0, b = bars.length - 1;
        while (a < b) { const m = (a + b + 1) >> 1; if (bars[m][0] <= s) a = m; else b = m - 1; }
        return a + Math.max(0, Math.min(1, (s - bars[a][0]) / resS));
    };
    return { a: pOf(Math.min(...ts) - GIF_WIN.lead), b: pOf(Math.max(...ts) + GIF_WIN.tail) };
}

// What each GIF frame shows. The Replay: mode 'replay' plays the day (gifReplayPlan, or rp: a plan of gifSpeedPlan's, 9.0; your moving
// picture under it); mode 'still' is the whole chart, as the PNG (with your moving picture moving under it). Your moving picture alone plays
// at its own pace, one loop; anything else is one frame. [{ step (the Replay: bars come, 0..n), bg, delay (1/100 s) }]
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
// n frames, at most `max` of them spread from the first to the last
export function sampleFrames(n, max) {
    if (n <= max) return Array.from({ length: n }, (_, i) => i);
    return Array.from({ length: max }, (_, i) => Math.round((i * (n - 1)) / (max - 1)));
}

// Makes the GIF. o = { kind, mode (the Replay: 'replay' or 'still'), card (the card element on the page), scene (the Replay's), plan (9.0: the
// Replay's speed, gifSpeedPlan), tape (9.0: the seconds inside its bars, share-video.js replayStage), width, height
// (the card's own size), size ('full' or 'half'), img (your picture, or null when the card does not show one), bg (the background choices), dither, onProgress(0..1, what),
// cancelled() }. Resolves { blob, w, h, frames (in the file), ms (one loop), colors, took (ms) }. Cancelled: throws { cancelled: true }.
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
        // the stage: what draws GIF frame k
        let canvas, draw;
        let at = 0;
        if (!animated) {
            canvas = await cardCanvas(o.card, { width: o.width, height: o.height, scale, img: o.img, bg: o.bg });
            draw = () => {};
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

        // 1. the palette, from frames spread over the whole GIF (all of a still card's pixels)
        const pick = sampleFrames(plan.length, SAMPLE_FRAMES);
        const step = Math.max(1, Math.ceil((pick.length * W * H) / SAMPLE_PIXELS));
        const span1 = animated ? 0.15 : 0.3;
        for (const [i, k] of pick.entries()) {
            halt();
            const px = pixels(k);
            await call({ type: 'sample', buf: px.buffer, step, offset: i }, [px.buffer]);
            tell(at + ((i + 1) / pick.length) * span1, 'colours');
        }
        halt();
        const pal = await call({ type: 'palette', animated, dither: o.dither !== false });
        const from = at + span1;

        // 2. every frame, two in flight
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
