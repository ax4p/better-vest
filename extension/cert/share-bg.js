/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { bgFileWhy, bgOpts, BG_VIDEO_MAX_MS } from './share-look.js';
import { gifInfo, webpInfo } from './share-gif.js';

const DB_NAME = 'bv-share';
const STORE = 'bg';
const KEY = 'image';
const MAX_FRAMES = 600;
const FRAME_BYTES = 300e6;

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
    /* Property of Astral (@ax4p). Better Vest 9.3.2. No copying without written permission. bv-4d0cf59f */ try {
        return await new Promise((resolve, reject) => {
            const t = db.transaction(STORE, mode);
            const r = fn(t.objectStore(STORE));
            t.oncomplete = () => resolve(r ? r.result : undefined);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error || new Error('bv-share: aborted'));
        });
    } finally { db.close(); }
}

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
export async function bgLoad() {
    const rec = await inStore('readonly', (st) => st.get(KEY));
    if (!rec || !(rec.blob instanceof Blob) || bgFileWhy({ type: rec.type, size: rec.blob.size })) return null;
    return rec;
}
export const bgClear = () => inStore('readwrite', (st) => st.delete(KEY));

export async function bgTimes(blob, type, first, cap) {
    const read = type === 'image/gif' ? gifInfo : webpInfo;
    const most = cap > 0 ? cap : TIMES_CAP;
    for (let n = first > 0 ? first : 4 << 20; ; n *= 4) {
        const end = Math.min(n, most, blob.size);
        const info = read(new Uint8Array(await blob.slice(0, end).arrayBuffer()), { maxMs: BG_VIDEO_MAX_MS, maxFrames: MAX_FRAMES });
        if (!info) return null;
        if (info.done || end >= blob.size || end >= most) return info; /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-1a78dbb0 */
    }
}
const TIMES_CAP = 256 << 20;
export function bgTooHeavy(img) {
    const gb = typeof navigator !== 'undefined' && navigator.deviceMemory > 0 ? navigator.deviceMemory : 4;
    return img.w * img.h * 4 * 3 > (gb * 1e9) / 4;
}
const HEAVY = 'Your picture is too big for this computer to play frame by frame. A smaller one (fewer pixels) works.';

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

/* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-128fdd39 */ export function drawBg(ctx, src, sw, sh, W, H, scale, bg, base) {
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

export function cardGeom(card) {
    const cs = getComputedStyle(card);
    return { radius: parseFloat(cs.borderTopLeftRadius) || 0, base: (cs.getPropertyValue('--k-bg') || '').trim() || '#0a0a0a' };
}
export function bareCard(card) {
    const c = card.cloneNode(true);
    c.classList.add('bgv');
    c.querySelectorAll(':scope > .bgx').forEach((x) => x.remove());
    return c;
}
export function clipCard(ctx, W, H, r) {
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, r);
    ctx.clip(); /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.2. bv-6fc24aa6 */
}

export function bgStill(img, W, H, scale, bg, base) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    drawBg(cv.getContext('2d'), img.first, img.w, img.h, W, H, scale, bg, base);
    return cv;
}

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
