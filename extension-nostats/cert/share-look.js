// Better Vest P&L card, the look (9.0): the card's own background and an accent colour. The owner: "more customization to the level where even
// the background is customizeable to be a user picked image or gif". Background: the style's own (Vest, Silver, OLED, Neon: as before), a solid
// colour, a two-colour gradient with an angle, or your own image or GIF (fill or fit, dimmed and blurred so the numbers stay readable).
// Pure: no DOM, no chrome. The choices come from this computer's own storage (cert/share-prefs.js) and are made safe here; the picture itself
// lives in this extension's IndexedDB (cert/share-bg.js) and reaches the card as a blob: URL that never leaves the page.

export const BG_KINDS = ['style', 'solid', 'gradient', 'image'];
export const BG_FITS = ['fill', 'fit'];
export const BG_DEFAULTS = { kind: 'style', color: '#0f172a', c1: '#0b1020', c2: '#1d4ed8', angle: 135, fit: 'fill', dim: 35, blur: 0 };
export const BG_DIM_MAX = 85;          // %: past this the picture is gone
export const BG_BLUR_MAX = 24;         // px at the card's own size (the PNG is twice that)
export const BG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// a moving background's video: one loop of the picture, at most 10 s; a loop shorter than 2 s plays again until it is that long
export const BG_VIDEO_MAX_MS = 10000;
export const BG_VIDEO_MIN_MS = 2000;
export const BG_VIDEO_FPS = 30;

// '#rrggbb' (lower case) from '#rgb' or '#rrggbb', what a colour picker gives; anything else is ''
export function hexColor(v) {
    const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (/^#[0-9a-f]{6}$/.test(t)) return t;
    if (/^#[0-9a-f]{3}$/.test(t)) return '#' + t[1] + t[1] + t[2] + t[2] + t[3] + t[3];
    return '';
}
const clampInt = (v, lo, hi, d) => {
    if (v === null || v === '' || typeof v === 'boolean') return d;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d;
};

// The background choices made safe: a known kind and fit, colours as '#rrggbb', the angle 0-360, dim 0-85 %, blur 0-24 px
export function bgOpts(raw) {
    const o = Object.assign({}, BG_DEFAULTS);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return o;
    if (BG_KINDS.includes(raw.kind)) o.kind = raw.kind;
    for (const k of ['color', 'c1', 'c2']) { const c = hexColor(raw[k]); if (c) o[k] = c; }
    o.angle = clampInt(raw.angle, 0, 360, BG_DEFAULTS.angle);
    if (BG_FITS.includes(raw.fit)) o.fit = raw.fit;
    o.dim = clampInt(raw.dim, 0, BG_DIM_MAX, BG_DEFAULTS.dim);
    o.blur = clampInt(raw.blur, 0, BG_BLUR_MAX, BG_DEFAULTS.blur);
    return o;
}
// the accent: '' is the style's own green
export const accentOpt = (v) => hexColor(v);

// Why a picked file cannot be the background ('' when it can): one of the four picture types, not empty. Any size (the owner: "allow
// unlimited size for upload"): the browser keeps it on disk, and a picture too big for this computer to draw says so when it is drawn.
export function bgFileWhy(f) {
    if (!f || typeof f !== 'object') return 'No file was picked.';
    const type = String(f.type || '').toLowerCase();
    if (!BG_TYPES.includes(type)) return 'Pick a PNG, JPEG, WebP or GIF picture.';
    const size = Number(f.size);
    if (!(size > 0)) return 'That file is empty.';
    return '';
}

// A picture source the card may carry: a blob: URL this extension made, or an inlined picture. Anything else is ''.
export function bgSrcOk(u) {
    if (typeof u !== 'string') return '';
    if (/^blob:chrome-extension:\/\/[a-p]{32}\/[0-9a-f-]{36}$/.test(u)) return u;
    if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u)) return u;
    return '';
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

// What the look adds to a card: classes, style variables and the background layer. p: the page's choices ({ bg, accent }); img: the picked
// picture ({ src }) or null while none is loaded (the style's own background then); red: the card shows a loss (its red glow stays, the
// accent only lights a green card). With the defaults nothing changes: the card is 8.2's to the character (tests/share/golden.test.mjs).
export function lookParts(p, img, red) {
    const bg = bgOpts(p && p.bg);
    const acc = accentOpt(p && p.accent);
    let cls = '', style = '', layer = '<div class="bgx"></div>', own = '';
    if (acc && !red) { cls += ' acc'; style += `--k-glow:${rgbOf(acc)};--k-neon:${acc};`; }
    if (bg.kind === 'solid') own = `<div class="bgx bgo" style="background:${bg.color}"></div>`;
    else if (bg.kind === 'gradient') own = `<div class="bgx bgo" style="background:linear-gradient(${bg.angle}deg, ${bg.c1}, ${bg.c2})"></div>`;
    else if (bg.kind === 'image') {
        const src = img ? bgSrcOk(img.src) : '';
        if (src) {
            // a blurred picture fades at its edges: it is drawn a little larger than the card, so the edges stay outside
            const pad = bg.blur * 2;
            const st = bg.blur ? ` style="left:-${pad}px;top:-${pad}px;width:calc(100% + ${pad * 2}px);height:calc(100% + ${pad * 2}px);filter:blur(${bg.blur}px)"` : '';
            own = `<div class="bgx bgo bgim"><img class="bgi${bg.fit === 'fit' ? ' bgf' : ''}" src="${src}" alt=""${st}><i class="bgd" style="opacity:${(bg.dim / 100).toFixed(2)}"></i></div>`;
        }
    }
    if (own) { cls += ' own'; layer = own; }
    return { cls, style, layer, bg, accent: acc, image: bg.kind === 'image' && layer === own };
}

// The video of a moving background (9.0): which of the picture's frames each video frame shows. durations: each frame's time in ms (a GIF's
// 0 or 10 ms frames play at 100 ms, as browsers play them). o = { fps, frames (a fixed length: the Replay's), maxMs, minMs }.
// Returns { fps, frames, seconds, loopMs, at(i) -> the picture's frame for video frame i, used: the frames it needs, in order }.
export function bgFramePlan(durations, o) {
    const opt = o || {};
    const fps = opt.fps > 0 ? opt.fps : BG_VIDEO_FPS;
    const d = (Array.isArray(durations) && durations.length ? durations : [100]).map((x) => (Number(x) > 10 ? Number(x) : 100));
    const loopMs = d.reduce((s, x) => s + x, 0);
    let frames;
    if (opt.frames > 0) frames = Math.round(opt.frames);
    else {
        const max = opt.maxMs > 0 ? opt.maxMs : BG_VIDEO_MAX_MS, min = opt.minMs > 0 ? opt.minMs : BG_VIDEO_MIN_MS;
        // one loop; a short one again and again until it lasts min (whole loops, so the video loops cleanly), never past max
        let ms = loopMs;
        if (ms < min) ms = Math.ceil(min / loopMs) * loopMs;
        ms = Math.min(ms, max);
        frames = Math.max(1, Math.round((ms / 1000) * fps));
    }
    const starts = [];
    let acc = 0;
    for (const x of d) { starts.push(acc); acc += x; }
    const at = (i) => {
        const t = ((i / fps) * 1000) % loopMs;
        let lo = 0, hi = d.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= t + 1e-6) lo = mid; else hi = mid - 1; }
        return lo;
    };
    const used = [];
    const seen = new Set();
    for (let i = 0; i < frames; i++) { const k = at(i); if (!seen.has(k)) { seen.add(k); used.push(k); } }
    return { fps, frames, seconds: frames / fps, loopMs, at, used };
}
