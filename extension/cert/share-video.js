// Better Vest P&L card, Save as video (8.2): the Replay card's day plays out. The card without its chart is drawn once (cert/raster.js, the
// PNG's own pipeline), then every frame the chart's shapes that have come so far (share-card.js replayScene: the same shapes, positions and
// colours as the PNG) are painted over it on a canvas, and the canvas is recorded in the page (MediaRecorder): MP4 where Chrome can, WebM
// otherwise. Nothing is uploaded; the file is saved like the PNG.

import { cardToCanvas } from './raster.js';
import { videoPlan, videoItems } from './share-replay.js';

const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export function videoMime() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    return MIMES.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
}
export const videoExt = (mime) => (/mp4/.test(mime) ? 'mp4' : 'webm');

// the card's own colours, as its CSS resolved them (dark or light, the style's)
function palette(card) {
    const cs = getComputedStyle(card);
    const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    const cu = v('--k-cu', '#00d68f'), cd = v('--k-cd', '#ff3b5c');
    // 8.2 round 2: wicks and borders of the chart's own colours (Match my chart), else the bodies'
    return { grid: v('--k-grid', 'rgba(255,255,255,.05)'), dim: v('--k-dim', '#737373'), mut: v('--k-mut', '#a3a3a3'), text: v('--k-text', '#fafafa'), bg: v('--k-bg', '#0a0a0a'),
        up: v('--k-up', '#22c55e'), down: v('--k-down', '#ff3b5c'), cu, cd, wu: v('--k-wu', cu), wd: v('--k-wd', cd), bu: v('--k-bu', cu), bd: v('--k-bd', cd) };
}
// how each shape class paints (share-card.css says the same for the SVG)
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
        ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
    } else if (d.t === 'rect') {
        // a hollow candle is its outline; a border unlike the body is drawn round it (share-card.css .ch, .cb)
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
        // an entry dot (8.2 round 2) is filled with its side's colour; an exit is a ring
        if (has('db') || has('ds')) { ctx.fillStyle = has('db') ? P.up : P.down; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = P.bg; ctx.stroke(); }
        else { ctx.fillStyle = P.bg; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = P.text; ctx.stroke(); }
    } else if (d.t === 'text') {
        let size = 10, weight = 400, fill = P.dim, halo = 0;
        if (has('ax')) { size = 10; fill = P.dim; }
        else if (has('pl')) { size = has('pb') ? 9 : 11; weight = 700; halo = 4; fill = has('pw') ? P.up : has('pd') ? P.down : has('pb') ? P.text : P.mut; }
        else if (has('lp')) { size = 10; weight = 700; fill = '#000'; }
        else if (has('px')) { size = 9.5; weight = 600; halo = 3; fill = P.mut; }
        else if (has('sl')) { size = 9; weight = 700; fill = P.dim; }
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

// Records the Replay card. card: the card element on the page; scene: replayScene's result; o = { cssUrl, width, height, scale, mime,
// onProgress(0..1) }. Resolves { blob, mime, seconds }.
export async function recordReplay(card, scene, o) {
    const mime = o.mime || videoMime();
    if (!mime) throw new Error('this browser cannot record video');
    const scale = o.scale || 2;
    // the card with an empty chart: everything but the shapes, drawn once
    const base = card.cloneNode(true);
    const svg = base.querySelector('.rp-svg');
    if (svg) svg.innerHTML = '';
    const baseCanvas = await cardToCanvas(base, { cssUrl: o.cssUrl, width: o.width, height: o.height, scale });
    const chart = card.querySelector('.rp-chart');
    const cr = chart.getBoundingClientRect(), kr = card.getBoundingClientRect();
    const k = kr.width / o.width; // the preview may be scaled on the page
    const ox = (cr.left - kr.left) / k, oy = (cr.top - kr.top) / k;
    if (document.fonts && document.fonts.load) { try { await document.fonts.load('700 11px Inter'); await document.fonts.load('400 10px Inter'); } catch (e) {} }
    const P = palette(card);
    const plan = videoPlan(scene.n, { fps: o.fps });
    const canvas = document.createElement('canvas');
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;
    const ctx = canvas.getContext('2d');
    const draw = (step) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(baseCanvas, 0, 0);
        ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
        for (const it of videoItems(scene, step)) paint(ctx, it.d, P);
    };
    draw(-1);
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
            draw(plan.stepAt(f));
            if (o.onProgress) o.onProgress(f / plan.frames);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    draw(scene.n - 1);
    await new Promise((r) => setTimeout(r, 120));
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    return { blob: new Blob(chunks, { type: mime.split(';')[0] }), mime, seconds: plan.total };
}
