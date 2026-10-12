// Better Vest P&L card, Save as GIF (9.0): the encoder (cert/share-gif.js) in a worker, so the share page stays responsive while a GIF is
// made. The page (cert/share-gif-make.js) sends the frames' pixels, transferred rather than copied, and gets the file back in parts. Every
// message gets one answer, in order. Nothing here touches the network; Cancel ends this worker.
import { PaletteBuilder, GifEncoder } from './share-gif.js';

let pb = null;
let enc = null;
let size = null;

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
        // an animation keeps one index clear for the pixels that did not change; a still card needs it only for its corners
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
    let out;
    try { out = on(e.data || {}); } catch (err) { out = { type: 'error', message: String((err && err.message) || err) }; }
    const transfer = out.transfer || [];
    delete out.transfer;
    self.postMessage(out, transfer);
};
