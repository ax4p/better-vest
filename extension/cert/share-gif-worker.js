/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
import { PaletteBuilder, GifEncoder } from './share-gif.js';

let pb = null;
let enc = null;
let size = null;

function on(m) { /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-7a0204fb */
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
}

self.onmessage = (e) => {
    let out; /*! Copyright Astral 2026. From Better Vest 9.3.1 (standard), ref bv-c8db179b. Not licensed for reuse. */
    try { out = on(e.data || {}); } catch (err) { out = { type: 'error', message: String((err && err.message) || err) }; }
    const transfer = out.transfer || [];
    delete out.transfer;
    self.postMessage(out, transfer);
};
