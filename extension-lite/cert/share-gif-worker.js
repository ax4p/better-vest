/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
import { PaletteBuilder, GifEncoder } from './share-gif.js';

let pb = null;
let enc = null;
let size = null; /*! Copyright (c) 2026 Astral. Better Vest 9.2.5 is licensed to its users only to run it, never to copy it. bv-e1e982e2 */

function on(m) {
    if (m.type === 'begin') {
        size = { w: m.w, h: m.h };
        pb = new PaletteBuilder();
        enc = null;
        return { type: 'ok' };
    }
    if (m.type === 'sample') {
        pb.add(new Uint8ClampedArray(m.buf), m.step, m.offset);
        return { type: 'ok' };
    }
    if (m.type === 'palette') {
        const clear = pb.clear || !!m.animated;
        const pal = pb.build(clear ? 255 : 256);
        pb = null;
        enc = new GifEncoder({ width: size.w, height: size.h, palette: pal, clear, loop: !!m.animated, dither: m.dither !== false });
        return { type: 'palette', colors: pal.count, exact: pal.exact };
    }
    if (m.type === 'frame') {
        enc.addFrame(new Uint8ClampedArray(m.buf), m.delay);
        return { type: 'ok' };
    }
    if (m.type === 'end') {
        const parts = enc.finish();
        const frames = enc.frames;
        enc = null;
        return { type: 'done', parts, frames, transfer: parts.map((p) => p.buffer) };
    }
    throw new Error('unknown message ' + m.type);
} /* Copyright Astral 2026. From Better Vest 9.2.5 (lite), ref bv-abf70f0c. Not licensed for reuse. */

self.onmessage = (e) => {
    let out;
    try { out = on(e.data || {}); } catch (err) { out = { type: 'error', message: String((err && err.message) || err) }; }
    const transfer = out.transfer || [];
    delete out.transfer;
    self.postMessage(out, transfer);
};
