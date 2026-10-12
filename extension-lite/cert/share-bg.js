// Better Vest P&L card, your own background picture (9.0). The picture is kept in this extension's own IndexedDB (`bv-share`, one record),
// on this computer only: it is never uploaded or sent anywhere. The card shows it as a blob: URL (cert/share-look.js lookParts); the PNG, the
// video and the GIF draw it on a canvas under the card, which is rasterised once without its background (share-card.css .bgv, bareCard), so
// the picture never goes through the SVG the PNG is drawn from (cert/raster.js) and all three draw it the same way (drawBg).
// Any size (the owner: "allow unlimited size for upload"): the browser keeps the file on disk; a moving picture's frame times are read from
// the file itself (cert/share-gif.js gifInfo), never by decoding it, and its frames are decoded one at a time only for a video or a GIF.

import { bgFileWhy, bgOpts, BG_VIDEO_MAX_MS } from './share-look.js';
import { gifInfo, webpInfo } from './share-gif.js';

const DB_NAME = 'bv-share';
const STORE = 'bg';
const KEY = 'image';
const MAX_FRAMES = 600;          // a GIF's frames read for its timing: past 10 s of them the video never looks
const FRAME_BYTES = 300e6;       // the video's background frames in memory: at most about this, smaller frames past it

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
        req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
        req.onerror = () => reject(req.error || new Error('bv-share: open failed'));
        req.onblocked = () => reject(new Error('bv-share: blocked by another page'));
    });
}
async function inStore(mode, fn) {
    const db = await openDb();
    try {
        return await new Promise((resolve, reject) => {
            const t = db.transaction(STORE, mode);
            const r = fn(t.objectStore(STORE));
            t.oncomplete = () => resolve(r ? r.result : undefined);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error || new Error('bv-share: aborted'));
        });
    } finally { db.close(); }
}

// Keeps the picked file (checked again here: a picture type, not empty). Resolves the stored record. A browser that has no room left for it
// says so in plain words (this extension asks for no unlimited storage: the browser's own share of the disk is the limit).
export async function bgSave(file) {
    const why = bgFileWhy(file);
    if (why) throw new Error(why);
    const rec = { blob: file, type: String(file.type).toLowerCase(), name: String(file.name || 'picture').replace(/[\u0000-\u001f<>]/g, '').slice(0, 80), size: file.size, at: Date.now() };
    try { await inStore('readwrite', (st) => st.put(rec, KEY)); } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)))) {
            throw new Error('no room left for it on this computer (' + mb(file.size) + '). Free some disk space or pick a smaller one');
        }
        throw e;
    }
    return rec;
}
const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
// The stored record, or null (none, or one that no longer passes the checks)
export async function bgLoad() {
    const rec = await inStore('readonly', (st) => st.get(KEY));
    if (!rec || !(rec.blob instanceof Blob) || bgFileWhy({ type: rec.type, size: rec.blob.size })) return null;
    return rec;
}
export const bgClear = () => inStore('readwrite', (st) => st.delete(KEY));

// A moving picture's frame times, read from the file itself (no decoding, so a big GIF costs almost nothing): its start, read in growing
// slices (from `first` bytes) until 10 s of frames, or its end, or `cap` bytes (the frames found in them then: a video or a GIF uses only
// the start of a picture). null: not a file this can read (the browser's decoder is asked instead).
export async function bgTimes(blob, type, first, cap) {
    const read = type === 'image/gif' ? gifInfo : webpInfo;
    const most = cap > 0 ? cap : TIMES_CAP;
    for (let n = first > 0 ? first : 4 << 20; ; n *= 4) {
        const end = Math.min(n, most, blob.size);
        const info = read(new Uint8Array(await blob.slice(0, end).arrayBuffer()), { maxMs: BG_VIDEO_MAX_MS, maxFrames: MAX_FRAMES });
        if (!info) return null;
        if (info.done || end >= blob.size || end >= most) return info;
    }
}
const TIMES_CAP = 256 << 20;
// A picture whose frames are too big for this computer to decode one by one for a video or a GIF: about a quarter of its memory for three
// frames at a time (Chrome tells a page at most 8 GB)
export function bgTooHeavy(img) {
    const gb = typeof navigator !== 'undefined' && navigator.deviceMemory > 0 ? navigator.deviceMemory : 4;
    return img.w * img.h * 4 * 3 > (gb * 1e9) / 4;
}
const HEAVY = 'Your picture is too big for this computer to play frame by frame. A smaller one (fewer pixels) works.';

// The picture ready for the card: { src: a blob: URL (a GIF moves on the page), first: its first frame (ImageBitmap), w, h, animated,
// durations: ms per frame (only for a moving picture, up to the 10 s the video can use), name, size, type, blob }. bgRelease frees it.
// o.times === false: no frame times (the pop-up makes only a PNG, from the first frame).
export async function bgPrepare(rec, o) {
    const blob = rec.blob;
    let first;
    try { first = await createImageBitmap(blob); } catch (e) { throw new Error('this computer could not draw it (' + mb(blob.size) + '). It may be broken, or too big: try a smaller one'); }
    let animated = false;
    let durations = [];
    if ((rec.type === 'image/gif' || rec.type === 'image/webp') && !(o && o.times === false)) {
        let info = null;
        try { info = await bgTimes(blob, rec.type); } catch (e) { info = null; }
        if (info) durations = info.durations;
        else if (typeof ImageDecoder === 'function') {
            // a file the reader above does not know: the browser's decoder, one frame at a time, for its times
            let dec = null;
            try {
                dec = new ImageDecoder({ data: blob.stream(), type: rec.type });
                await dec.tracks.ready;
                const tr = dec.tracks.selectedTrack;
                if (tr && tr.animated) {
                    let sum = 0;
                    for (let i = 0; i < MAX_FRAMES && sum < BG_VIDEO_MAX_MS; i++) {
                        let r;
                        try { r = await dec.decode({ frameIndex: i }); } catch (e) { break; }
                        const ms = (r.image.duration || 0) / 1000;
                        r.image.close();
                        durations.push(ms);
                        sum += ms > 10 ? ms : 100;
                    }
                }
            } catch (e) { durations = []; }
            try { if (dec) dec.close(); } catch (e) {}
        }
        animated = durations.length > 1;
        if (!animated) durations = [];
    }
    return { blob, src: URL.createObjectURL(blob), first, w: first.width, h: first.height, animated, durations, name: rec.name, size: rec.size, type: rec.type };
}
export function bgRelease(img) {
    if (!img) return;
    try { URL.revokeObjectURL(img.src); } catch (e) {}
    try { if (img.first) img.first.close(); } catch (e) {}
}

// The background as the PNG and the video draw it, the way the card's CSS shows it (share-card.css .bgi, .bgd; share-look.js lookParts): the
// picture covering the card (fill) or whole inside it (fit, the card's own colour around it), drawn larger than the card by twice the blur so
// its blurred edges stay outside, blurred, then dimmed toward the card's colour. src: an ImageBitmap or a VideoFrame of sw x sh pixels;
// W x H: the canvas; scale: canvas pixels per card pixel.
export function drawBg(ctx, src, sw, sh, W, H, scale, bg, base) {
    const o = bgOpts(bg);
    ctx.save();
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const pad = o.blur * 2 * scale;
    const bw = W + pad * 2, bh = H + pad * 2;
    const k = o.fit === 'fit' ? Math.min(bw / sw, bh / sh) : Math.max(bw / sw, bh / sh);
    const dw = sw * k, dh = sh * k;
    if (o.blur) ctx.filter = `blur(${o.blur * scale}px)`;
    ctx.drawImage(src, -pad + (bw - dw) / 2, -pad + (bh - dh) / 2, dw, dh);
    ctx.filter = 'none';
    ctx.globalAlpha = o.dim / 100;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

// the card's corner radius and its own background colour, as its CSS resolved them (the card must be on the page)
export function cardGeom(card) {
    const cs = getComputedStyle(card);
    return { radius: parseFloat(cs.borderTopLeftRadius) || 0, base: (cs.getPropertyValue('--k-bg') || '').trim() || '#0a0a0a' };
}
// the card without its background, for drawing over the picture. Its background layer is taken out, not only hidden (.bgv .bgx): the
// rasteriser inlines every <img> it finds, and your picture (any size) must never go into that SVG.
export function bareCard(card) {
    const c = card.cloneNode(true);
    c.classList.add('bgv');
    c.querySelectorAll(':scope > .bgx').forEach((x) => x.remove());
    return c;
}
export function clipCard(ctx, W, H, r) {
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, r);
    ctx.clip();
}

// The still background (the PNG, and the video of a card whose picture does not move): one canvas of W x H
export function bgStill(img, W, H, scale, bg, base) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    drawBg(cv.getContext('2d'), img.first, img.w, img.h, W, H, scale, bg, base);
    return cv;
}

// A moving background's frames for the video and the GIF (plan: share-look.js bgFramePlan, or { used, at } from the GIF's own plan), each
// drawn once, blurred and dimmed, at the output's size (smaller when they would take more than about 300 MB; drawn back up). The file is
// read as a stream, one frame at a time. { at(i): the frame for output frame i, close() }. o.cancelled() stops it (it throws).
export async function bgFrames(img, plan, W, H, scale, bg, base, onProgress, o) {
    if (bgTooHeavy(img)) throw new Error(HEAVY);
    const stop = o && o.cancelled;
    const dec = new ImageDecoder({ data: img.blob.stream(), type: img.type });
    await dec.tracks.ready;
    const k = Math.min(1, Math.sqrt(FRAME_BYTES / (W * H * 4 * Math.max(1, plan.used.length))));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const cv = new OffscreenCanvas(w, h);
    const ctx = cv.getContext('2d');
    const map = new Map();
    try {
        for (const [n, i] of plan.used.entries()) {
            if (stop && stop()) throw new Error('cancelled');
            const r = await dec.decode({ frameIndex: i });
            ctx.clearRect(0, 0, w, h);
            drawBg(ctx, r.image, r.image.displayWidth, r.image.displayHeight, w, h, scale * k, bg, base);
            r.image.close();
            map.set(i, await createImageBitmap(cv));
            if (onProgress) onProgress((n + 1) / plan.used.length);
        }
    } catch (e) {
        map.forEach((b) => { try { b.close(); } catch (x) {} });
        throw e;
    } finally { try { dec.close(); } catch (e) {} }
    return { at: (f) => map.get(plan.at(f)), close: () => map.forEach((b) => { try { b.close(); } catch (e) {} }) };
}
