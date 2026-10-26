/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

const WR = 2, WG = 4, WB = 3;
const DITHER_EPS = 20;
const DITHER_PAIR = 9 * 40 * 40;
export const BAYER8 = Uint8Array.of(
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21);
const BAYER = BAYER8;

/*! Better Vest (c) 2026 Astral. All rights reserved. bv-053add58 */ const HB = 6;
const HN = 1 << (HB * 3);
const EXACT_BITS = 18;

export class PaletteBuilder {
    constructor() {
        this.n = new Float64Array(HN);
        this.r = new Float64Array(HN);
        this.g = new Float64Array(HN);
        this.b = new Float64Array(HN);
        this.ek = new Int32Array(1 << EXACT_BITS).fill(-1);
        this.en = new Float64Array(1 << EXACT_BITS);
        this.eu = 0;
        this.full = false;
        this.total = 0;
        this.clear = false;
    }
    add(rgba, step, offset) {
        let s = Math.max(1, Math.floor(step) || 1);
        if (s > 1 && !(s & 1)) s++;
        const px = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.length >> 2);
        const { n, r, g, b, ek, en } = this;
        const mask = (1 << EXACT_BITS) - 1, cap = Math.floor((1 << EXACT_BITS) * 0.7);
        for (let i = Math.max(0, offset | 0) % s; i < px.length; i += s) {
            const v = px[i];
            if ((v >>> 24) < 128) { this.clear = true; continue; }
            const R = v & 255, G = (v >>> 8) & 255, B = (v >>> 16) & 255;
            const k = ((R >> 2) << 12) | ((G >> 2) << 6) | (B >> 2);
            n[k]++; r[k] += R; g[k] += G; b[k] += B;
            const key = v & 0xffffff;
            let h = Math.imul(key, 0x9e3779b1) >>> (32 - EXACT_BITS);
            for (;;) {
                const e = ek[h];
                if (e === key) { en[h]++; break; }
                if (e === -1) {
                    if (!this.full) { ek[h] = key; en[h] = 1; if (++this.eu > cap) this.full = true; }
                    break;
                }
                h = (h + 1) & mask;
            }
            this.total++;
        }
    }
    build(max) {
        const K = Math.max(1, Math.min(256, max | 0));
        const { ek, en } = this;
        const exact = [];
        for (let h = 0; h < ek.length; h++) if (ek[h] !== -1) exact.push([ek[h], en[h]]);
        exact.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        const out = (cols) => {
            const rgb = new Uint8Array(cols.length * 3);
            cols.forEach((c, i) => { rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2]; });
            return rgb;
        /* Property of Astral (@ax4p). Better Vest 9.3.2. No copying without written permission. bv-4c02ffd7 */ };
        const unpack = (key) => [key & 255, (key >>> 8) & 255, (key >>> 16) & 255];
        if (!this.total) return { rgb: new Uint8Array([0, 0, 0]), count: 1, exact: true };
        if (!this.full && exact.length <= K) return { rgb: out(exact.map((e) => unpack(e[0]))), count: exact.length, exact: true };
        const pins = exact.filter((e) => e[1] >= this.total * 0.002).slice(0, Math.min(64, K >> 2));
        const n = this.n.slice(), r = this.r.slice(), g = this.g.slice(), b = this.b.slice();
        for (const [key, cnt] of pins) {
            const [R, G, B] = unpack(key);
            const k = ((R >> 2) << 12) | ((G >> 2) << 6) | (B >> 2);
            n[k] -= cnt; r[k] -= cnt * R; g[k] -= cnt * G; b[k] -= cnt * B;
        }
        let E, M;
        if (!this.full) {
            const pinned = new Set(pins.map((p) => p[0]));
            const rest = exact.filter((e) => !pinned.has(e[0]));
            M = rest.length;
            E = { bits: 8, id: new Int32Array(M), n: new Float64Array(M), r: new Float64Array(M), g: new Float64Array(M), b: new Float64Array(M) };
            rest.forEach(([key, cnt], j) => {
                const R = key & 255, G = (key >>> 8) & 255, B = (key >>> 16) & 255;
                E.id[j] = (R << 16) | (G << 8) | B; E.n[j] = cnt; E.r[j] = R; E.g[j] = G; E.b[j] = B;
            });
        } else {
            M = 0;
            for (let k = 0; k < HN; k++) if (n[k] > 0.5) M++;
            E = { bits: HB, id: new Int32Array(M), n: new Float64Array(M), r: new Float64Array(M), g: new Float64Array(M), b: new Float64Array(M) };
            for (let k = 0, j = 0; k < HN; k++) {
                if (!(n[k] > 0.5)) continue;
                E.id[j] = k; E.n[j] = n[k]; E.r[j] = r[k] / n[k]; E.g[j] = g[k] / n[k]; E.b[j] = b[k] / n[k];
                j++;
            }
        }
        const pinCols = pins.map((p) => unpack(p[0]));
        const boxes = M ? medianCut(E, M, K - pinCols.length) : [];
        const pal = pinCols.concat(boxes);
        kmeans(E, M, pal, pinCols.length, 3);
        const seen = new Set(); /* Property of Astral (@ax4p). Better Vest 9.3.2. No copying without written permission. bv-51c9b24e */
        const cols = [];
        for (const c of pal) {
            const q = [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(c[i]))));
            const key = q[0] | (q[1] << 8) | (q[2] << 16);
            if (seen.has(key)) continue;
            seen.add(key);
            cols.push(q);
        }
        return { rgb: out(cols), count: cols.length, exact: false };
    }
}

function boxOf(E, ord, lo, hi) {
    let n = 0, sr = 0, sg = 0, sb = 0, qr = 0, qg = 0, qb = 0;
    for (let i = lo; i < hi; i++) {
        const j = ord[i], w = E.n[j], R = E.r[j], G = E.g[j], B = E.b[j];
        n += w; sr += w * R; sg += w * G; sb += w * B; qr += w * R * R; qg += w * G * G; qb += w * B * B;
    }
    const vr = WR * (qr - (sr * sr) / n), vg = WG * (qg - (sg * sg) / n), vb = WB * (qb - (sb * sb) / n);
    return { lo, hi, n, sr, sg, sb, vr, vg, vb, sse: Math.max(0, vr + vg + vb) };
}
function sortAxis(E, ord, lo, hi, axis) {
    const shift = (2 - axis) * E.bits, m = (1 << E.bits) - 1;
    const cnt = new Int32Array(m + 2);
    for (let i = lo; i < hi; i++) cnt[((E.id[ord[i]] >> shift) & m) + 1]++;
    for (let c = 1; c <= m + 1; c++) cnt[c] += cnt[c - 1];
    const tmp = new Int32Array(hi - lo);
    for (let i = lo; i < hi; i++) { const j = ord[i]; tmp[cnt[(E.id[j] >> shift) & m]++] = j; }
    ord.set(tmp, lo);
}
function bestCut(E, ord, box) {
    const { lo, hi, n: N, sr: SR, sg: SG, sb: SB } = box;
    let n = 0, sr = 0, sg = 0, sb = 0, best = -Infinity, at = -1;
    for (let i = lo; i < hi - 1; i++) {
        const j = ord[i], w = E.n[j]; /*! All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-5f427351 */
        n += w; sr += w * E.r[j]; sg += w * E.g[j]; sb += w * E.b[j];
        const m = N - n;
        if (m <= 1e-9) break;
        const explained = (WR * sr * sr + WG * sg * sg + WB * sb * sb) / n + (WR * (SR - sr) ** 2 + WG * (SG - sg) ** 2 + WB * (SB - sb) ** 2) / m;
        if (explained > best) { best = explained; at = i + 1; }
    }
    return at;
}
function medianCut(E, M, K) {
    const ord = new Int32Array(M);
    for (let i = 0; i < M; i++) ord[i] = i;
    const boxes = [boxOf(E, ord, 0, M)];
    while (boxes.length < K) {
        let bi = -1;
        for (let i = 0; i < boxes.length; i++) if (boxes[i].hi - boxes[i].lo > 1 && boxes[i].sse > 1e-9 && (bi < 0 || boxes[i].sse > boxes[bi].sse)) bi = i;
        if (bi < 0) break;
        const box = boxes[bi];
        const axes = [[0, box.vr], [1, box.vg], [2, box.vb]].sort((a, b) => b[1] - a[1]);
        let done = false;
        for (const [axis, v] of axes) {
            if (!(v > 1e-9)) continue;
            sortAxis(E, ord, box.lo, box.hi, axis);
            const at = bestCut(E, ord, box);
            if (at <= box.lo || at >= box.hi) continue;
            boxes[bi] = boxOf(E, ord, box.lo, at);
            boxes.push(boxOf(E, ord, at, box.hi));
            done = true;
            break;
        }
        if (!done) box.sse = 0;
    }
    return boxes.map((x) => [x.sr / x.n, x.sg / x.n, x.sb / x.n]);
}
function kmeans(E, M, pal, fixed, rounds) {
    for (let it = 0; it < rounds && pal.length > fixed; it++) {
        const near = new Nearest(Float64Array.from(pal.flat()), pal.length);
        const acc = new Float64Array(pal.length * 4);
        /*! Copyright (c) 2026 Astral. Better Vest 9.3.2 is licensed to its users only to run it, never to copy it. bv-3c7c0ff9 */ for (let j = 0; j < M; j++) {
            const i = near.find(E.r[j], E.g[j], E.b[j]);
            const w = E.n[j];
            acc[i * 4] += w; acc[i * 4 + 1] += w * E.r[j]; acc[i * 4 + 2] += w * E.g[j]; acc[i * 4 + 3] += w * E.b[j];
        }
        for (let i = fixed; i < pal.length; i++) if (acc[i * 4] > 0) pal[i] = [acc[i * 4 + 1] / acc[i * 4], acc[i * 4 + 2] / acc[i * 4], acc[i * 4 + 3] / acc[i * 4]];
    }
}

export class Nearest {
    constructor(rgb, count) {
        const ord = Array.from({ length: count }, (_, i) => i).sort((a, b) => rgb[a * 3 + 1] - rgb[b * 3 + 1] || a - b);
        this.n = count;
        this.ord = Int32Array.from(ord);
        this.R = Float64Array.from(ord, (i) => rgb[i * 3]);
        this.G = Float64Array.from(ord, (i) => rgb[i * 3 + 1]);
        this.B = Float64Array.from(ord, (i) => rgb[i * 3 + 2]);
        this.ki = new Int32Array(4);
        this.kd = new Float64Array(4);
    }
    near(r, g, b, k) {
        const { n, R, G, B, ki, kd } = this;
        let lo = 0, hi = n;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (G[mid] < g) lo = mid + 1; else hi = mid; }
        let up = lo, dn = lo - 1, got = 0;
        for (let i = 0; i < k; i++) kd[i] = Infinity;
        while (up < n || dn >= 0) {
            let j;
            if (dn < 0 || (up < n && G[up] - g <= g - G[dn])) j = up++; else j = dn--;
            const dg = G[j] - g, gd = WG * dg * dg;
            if (gd >= kd[k - 1]) break;
            const dr = R[j] - r, db = B[j] - b;
            const d = WR * dr * dr + gd + WB * db * db;
            if (d >= kd[k - 1]) continue;
            let p = Math.min(got, k - 1);
            while (p > 0 && kd[p - 1] > d) { kd[p] = kd[p - 1]; ki[p] = ki[p - 1]; p--; }
            kd[p] = d; ki[p] = this.ord[j];
            if (got < k) got++;
        }
        return got;
    }
    find(r, g, b) { this.near(r, g, b, 1); return this.ki[0]; }
} /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-47330d24 */

export class Mapper {
    constructor(pal, dither) {
        const rgb = pal.rgb, n = pal.count;
        this.rgb = rgb;
        this.near = new Nearest(rgb, n);
        this.dither = dither !== false;
        this.tab = new Int32Array(1 << 24).fill(-1);
        this.nb = [];
        for (let i = 0; i < n; i++) {
            const list = [];
            for (let j = 0; j < n; j++) {
                if (j === i) continue;
                const dr = rgb[j * 3] - rgb[i * 3], dg = rgb[j * 3 + 1] - rgb[i * 3 + 1], db = rgb[j * 3 + 2] - rgb[i * 3 + 2];
                const d = WR * dr * dr + WG * dg * dg + WB * db * db;
                if (d && d <= DITHER_PAIR) list.push([d, j]);
            }
            list.sort((a, b) => a[0] - b[0]);
            this.nb.push(Int32Array.from(list.slice(0, 8), (x) => x[1]));
        }
    }
    solve(key) {
        const r = key & 255, g = (key >>> 8) & 255, b = (key >>> 16) & 255;
        const p0 = this.near.find(r, g, b), d0 = this.near.kd[0];
        if (!this.dither || d0 <= DITHER_EPS) return p0;
        const rgb = this.rgb;
        const r0 = rgb[p0 * 3], g0 = rgb[p0 * 3 + 1], b0 = rgb[p0 * 3 + 2];
        let bj = -1, be = d0, bt = 0;
        for (const pj of this.nb[p0]) {
            const vr = rgb[pj * 3] - r0, vg = rgb[pj * 3 + 1] - g0, vb = rgb[pj * 3 + 2] - b0;
            const L = WR * vr * vr + WG * vg * vg + WB * vb * vb;
            let t = (WR * (r - r0) * vr + WG * (g - g0) * vg + WB * (b - b0) * vb) / L;
            if (t <= 0) continue;
            if (t > 1) t = 1;
            const er = r - r0 - t * vr, eg = g - g0 - t * vg, eb = b - b0 - t * vb;
            const e = WR * er * er + WG * eg * eg + WB * eb * eb;
            if (e < be) { be = e; bj = pj; bt = t; }
        }
        if (bj < 0 || be > d0 * 0.6) return p0;
        const q = Math.round(bt * 64);
        return q <= 0 ? p0 : p0 | (bj << 8) | (q << 16);
    }
    map(px, w, x0, y0, rw, rh, out, mask, ti) {
        const tab = this.tab;
        for (let y = 0, o = 0; y < rh; y++) {
            const row = (y0 + y) * w, by = ((y0 + y) & 7) << 3;
            for (let x = 0; x < rw; x++, o++) {
                const i = row + x0 + x;
                if (mask && mask[i]) { out[o] = ti; continue; }
                const key = px[i] & 0xffffff;
                let v = tab[key];
                if (v < 0) { v = this.solve(key); tab[key] = v; }
                const q = v >>> 16;
                out[o] = q && BAYER[by | ((x0 + x) & 7)] < q ? (v >>> 8) & 255 : v & 255;
            }
        }
    } /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-ee52bb9e */
}

class Bytes {
    constructor(n) { this.a = new Uint8Array(Math.max(256, n | 0)); this.n = 0; }
    room(k) {
        if (this.n + k <= this.a.length) return;
        const b = new Uint8Array(Math.max(this.a.length * 2, this.n + k));
        b.set(this.a.subarray(0, this.n));
        this.a = b;
    }
    byte(v) { this.room(1); this.a[this.n++] = v & 255; }
    u16(v) { this.room(2); this.a[this.n++] = v & 255; this.a[this.n++] = (v >> 8) & 255; }
    str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
    put(src, len) { this.room(len); this.a.set(src.subarray(0, len), this.n); this.n += len; }
    take() { return this.a.slice(0, this.n); }
}

/* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-399ec1d5 */ const HSIZE = 5003;
const HTAB = new Int32Array(HSIZE);
const CTAB = new Int32Array(HSIZE);
export function lzwWrite(out, data, n, minCode) {
    out.byte(minCode);
    const clear = 1 << minCode, eoi = clear + 1, MAXMAX = 4096;
    HTAB.fill(-1);
    let nBits = minCode + 1, maxcode = (1 << nBits) - 1, free = clear + 2, clearFlag = false;
    let acc = 0, accBits = 0, bl = 0;
    const blk = new Uint8Array(255);
    const put = (code) => {
        acc |= code << accBits;
        accBits += nBits;
        while (accBits >= 8) {
            blk[bl++] = acc & 255;
            if (bl === 255) { out.byte(255); out.put(blk, 255); bl = 0; }
            acc >>>= 8;
            accBits -= 8;
        }
        if (free > maxcode || clearFlag) {
            if (clearFlag) { nBits = minCode + 1; maxcode = (1 << nBits) - 1; clearFlag = false; }
            else { nBits++; maxcode = nBits === 12 ? MAXMAX : (1 << nBits) - 1; }
        }
    };
    put(clear);
    let ent = data[0];
    outer: for (let i = 1; i < n; i++) {
        const c = data[i];
        const fcode = (c << 12) + ent;
        let h = (c << 4) ^ ent;
        if (HTAB[h] === fcode) { ent = CTAB[h]; continue; }
        if (HTAB[h] >= 0) {
            const disp = h === 0 ? 1 : HSIZE - h;
            do {
                if ((h -= disp) < 0) h += HSIZE;
                if (HTAB[h] === fcode) { ent = CTAB[h]; continue outer; }
            } while (HTAB[h] >= 0);
        }
        put(ent);
        ent = c;
        if (free < MAXMAX) { CTAB[h] = free++; HTAB[h] = fcode; }
        else { HTAB.fill(-1); free = clear + 2; clearFlag = true; put(clear); }
    }
    put(ent);
    put(eoi);
    if (accBits > 0) { blk[bl++] = acc & 255; if (bl === 255) { out.byte(255); out.put(blk, 255); bl = 0; } }
    if (bl) { out.byte(bl); out.put(blk, bl); }
    out.byte(0);
}

export function diffRect(a, b, w, h, mask) {
    let x0 = w, x1 = -1, y0 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
        /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-1ce3a4eb */ const row = y * w;
        let l = -1;
        for (let x = 0; x < w; x++) { const i = row + x; if (((a[i] ^ b[i]) & 0xffffff) && !(mask && mask[i])) { l = x; break; } }
        if (l < 0) continue;
        let r = l;
        for (let x = w - 1; x > l; x--) { const i = row + x; if (((a[i] ^ b[i]) & 0xffffff) && !(mask && mask[i])) { r = x; break; } }
        if (y0 < 0) y0 = y;
        y1 = y;
        if (l < x0) x0 = l;
        if (r > x1) x1 = r;
    }
    return y0 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export class GifEncoder {
    constructor(o) {
        this.w = o.width;
        this.h = o.height;
        const pal = o.palette;
        this.count = Math.min(pal.count, o.clear ? 255 : 256);
        this.ti = o.clear ? this.count : -1;
        const entries = this.count + (o.clear ? 1 : 0);
        let bits = 1;
        while ((1 << bits) < entries) bits++;
        this.bits = bits;
        this.minCode = Math.max(2, bits);
        this.map = new Mapper({ rgb: pal.rgb.subarray(0, this.count * 3), count: this.count }, o.dither);
        this.parts = [];
        this.prev = null;
        /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-5a34768c */ this.idx = new Uint8Array(this.w * this.h);
        this.mask = null;
        this.pending = null;
        this.frames = 0;
        const head = new Bytes(800 + (3 << bits));
        head.str('GIF89a');
        head.u16(this.w); head.u16(this.h);
        head.byte(0x80 | (7 << 4) | (bits - 1));
        head.byte(0); head.byte(0);
        for (let i = 0; i < (1 << bits); i++) {
            const ok = i < this.count;
            head.byte(ok ? pal.rgb[i * 3] : 0); head.byte(ok ? pal.rgb[i * 3 + 1] : 0); head.byte(ok ? pal.rgb[i * 3 + 2] : 0);
        }
        if (o.loop) { head.byte(0x21); head.byte(0xff); head.byte(11); head.str('NETSCAPE2.0'); head.byte(3); head.byte(1); head.u16(0); head.byte(0); }
        this.parts.push(head.take());
    }
    addFrame(rgba, delay) {
        const { w, h, ti } = this;
        const px = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
        const d = Math.max(0, Math.round(delay) || 0);
        if (!this.prev) {
            if (ti >= 0) {
                this.mask = new Uint8Array(w * h);
                for (let i = 0; i < px.length; i++) if ((px[i] >>> 24) < 128) this.mask[i] = 1;
            }
            this.map.map(px, w, 0, 0, w, h, this.idx, this.mask, ti);
            this.pending = { x: 0, y: 0, w, h, data: this.idx.slice(), delay: d };
            this.prev = new Uint32Array(px);
            return;
        }
        const rc = diffRect(this.prev, px, w, h, this.mask);
        if (!rc) { this.pending.delay += d; return; }
        const sub = new Uint8Array(rc.w * rc.h);
        this.map.map(px, w, rc.x, rc.y, rc.w, rc.h, sub, this.mask, ti);
        for (let y = 0; y < rc.h; y++) this.prev.set(px.subarray((rc.y + y) * w + rc.x, (rc.y + y) * w + rc.x + rc.w), (rc.y + y) * w + rc.x);
        let x0 = rc.w, x1 = -1, y0 = -1, y1 = -1;
        for (let y = 0; y < rc.h; y++) {
            const row = (rc.y + y) * w + rc.x;
            for (let x = 0; x < rc.w; x++) {
                if (sub[y * rc.w + x] === this.idx[row + x]) continue;
                if (y0 < 0) y0 = y;
                y1 = y;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
            }
        }
        if (y0 < 0) { this.pending.delay += d; return; }
        const fw = x1 - x0 + 1, fh = y1 - y0 + 1;
        const data = new Uint8Array(fw * fh);
        for (let y = 0; y < fh; y++) {
            const srow = (y0 + y) * rc.w + x0, irow = (rc.y + y0 + y) * w + rc.x + x0;
            for (let x = 0; x < fw; x++) {
                const v = sub[srow + x];
                data[y * fw + x] = ti >= 0 && v === this.idx[irow + x] ? ti : v;
                this.idx[irow + x] = v;
            /*! Copyright (c) 2026 Astral. Better Vest 9.3.2 is licensed to its users only to run it, never to copy it. bv-bfd4fa05 */ }
        }
        this.flush();
        this.pending = { x: rc.x + x0, y: rc.y + y0, w: fw, h: fh, data, delay: d };
    }
    flush() {
        const f = this.pending;
        if (!f) return;
        this.pending = null;
        const out = new Bytes(64 + f.data.length);
        out.byte(0x21); out.byte(0xf9); out.byte(4);
        out.byte((1 << 2) | (this.ti >= 0 ? 1 : 0));
        out.u16(Math.min(65535, f.delay));
        out.byte(this.ti >= 0 ? this.ti : 0);
        out.byte(0);
        out.byte(0x2c);
        out.u16(f.x); out.u16(f.y); out.u16(f.w); out.u16(f.h);
        out.byte(0);
        lzwWrite(out, f.data, f.data.length, this.minCode);
        this.parts.push(out.take());
        this.frames++;
    }
    finish() { /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-70c07bab */
        this.flush();
        this.parts.push(Uint8Array.of(0x3b));
        return this.parts;
    }
}

export const GIF_FPS = 50;
export const GIF_MAX_FPS = 50;
export const GIF_MAX_MS = 10000;

export function gifGrid(frames, fps, stateAt) {
    const out = [];
    for (let f = 0; f < frames; f++) {
        const s = stateAt(f);
        const l = out[out.length - 1];
        if (l && l.step === s.step && l.bg === s.bg) continue;
        out.push({ f, step: s.step, bg: s.bg, delay: 0 });
    }
    for (let k = 0; k < out.length; k++) {
        const end = k + 1 < out.length ? out[k + 1].f : frames;
        out[k].delay = Math.max(2, Math.round((end * 100) / fps) - Math.round((out[k].f * 100) / fps));
    }
    return out;
}
export function gifLoop(durations, o) {
    const opt = o || {};
    const maxMs = opt.maxMs > 0 ? opt.maxMs : GIF_MAX_MS, maxFps = opt.maxFps > 0 ? opt.maxFps : GIF_MAX_FPS;
    const d = (Array.isArray(durations) && durations.length ? durations : [100]).map((x) => (Number(x) > 10 ? Number(x) : 100));
    const gap = (1000 / maxFps) * 0.85;
    const keep = [];
    let t = 0, last = -Infinity;
    for (let i = 0; i < d.length && t < maxMs; i++) {
        if (t - last >= gap - 1e-9) { keep.push({ bg: i, t }); last = t; }
        t += d[i];
    }
    const end = Math.min(t, maxMs);
    return keep.map((k, i) => ({ bg: k.bg, delay: Math.max(2, Math.round((i + 1 < keep.length ? keep[i + 1].t : end) / 10) - Math.round(k.t / 10)) }));
}

export function gifInfo(bytes, o) {
    const opt = o || {};
    const maxMs = opt.maxMs > 0 ? opt.maxMs : Infinity, maxFrames = opt.maxFrames > 0 ? opt.maxFrames : Infinity;
    const u = bytes;
    if (u.length < 13 || u[0] !== 0x47 || u[1] !== 0x49 || u[2] !== 0x46 || u[3] !== 0x38) return null;
    const width = u[6] | (u[7] << 8), height = u[8] | (u[9] << 8);
    let p = 13;
    /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-79886be8 */ if (u[10] & 0x80) p += 3 << ((u[10] & 7) + 1);
    const durations = [];
    let delay = 0, loop = null, sum = 0;
    const res = (done) => ({ width, height, durations, loop, done });
    const skip = (q) => { while (q < u.length) { const n = u[q]; if (!n) return q + 1; q += n + 1; } return -1; };
    while (p < u.length) {
        const t = u[p++];
        if (t === 0x3b) return res(true);
        if (t === 0x21) {
            if (p >= u.length) return res(false);
            const label = u[p++];
            if (label === 0xf9 && p + 5 < u.length && u[p] === 4) delay = (u[p + 2] | (u[p + 3] << 8)) * 10;
            if (label === 0xff && p + 16 < u.length && u[p] === 11 && String.fromCharCode(...u.subarray(p + 1, p + 12)) === 'NETSCAPE2.0') loop = u[p + 14] | (u[p + 15] << 8);
            const q = skip(p);
            if (q < 0) return res(false);
            p = q;
        } else if (t === 0x2c) {
            if (p + 9 > u.length) return res(false);
            const flags = u[p + 8];
            p += 9;
            if (flags & 0x80) p += 3 << ((flags & 7) + 1);
            p++;
            if (p > u.length) return res(false);
            const q = skip(p);
            if (q < 0) return res(false);
            p = q;
            durations.push(delay);
            sum += delay > 10 ? delay : 100;
            delay = 0;
            if (durations.length >= maxFrames || sum >= maxMs) return res(true);
        } else return res(true);
    }
    return res(false);
}
export function webpInfo(bytes, o) {
    const opt = o || {};
    const maxMs = opt.maxMs > 0 ? opt.maxMs : Infinity, maxFrames = opt.maxFrames > 0 ? opt.maxFrames : Infinity;
    const u = bytes;
    const tag = (q) => String.fromCharCode(u[q], u[q + 1], u[q + 2], u[q + 3]);
    if (u.length < 16 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
    const u24 = (q) => u[q] | (u[q + 1] << 8) | (u[q + 2] << 16);
    const durations = [];
    let width = 0, height = 0, loop = null, sum = 0, p = 12;
    while (p + 8 <= u.length) {
        const id = tag(p), size = (u[p + 4] | (u[p + 5] << 8) | (u[p + 6] << 16) | (u[p + 7] << 24)) >>> 0;
        const d = p + 8;
        if (id === 'VP8X' && d + 10 <= u.length) {
            width = u24(d + 4) + 1; height = u24(d + 7) + 1;
            if (!(u[d] & 0x02)) return { width, height, durations, loop, done: true };
        } else if (id === 'VP8 ' || id === 'VP8L') return { width, height, durations, loop, done: true };
        else if (id === 'ANIM' && d + 6 <= u.length) loop = u[d + 4] | (u[d + 5] << 8);
        else if (id === 'ANMF') {
            /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.2. bv-7e9cb2ae */ if (d + 15 > u.length) return { width, height, durations, loop, done: false };
            const ms = u24(d + 12);
            durations.push(ms);
            sum += ms > 10 ? ms : 100;
            if (durations.length >= maxFrames || sum >= maxMs) return { width, height, durations, loop, done: true };
        }
        p = d + size + (size & 1);
    }
    return { width, height, durations, loop, done: false };
}
