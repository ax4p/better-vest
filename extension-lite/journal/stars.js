/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

const SF_TYPES = [['dot', 64], ['plus', 10], ['spark', 18], ['hollow', 8]];
function sfRand(seed) {
    let t = seed + 0x6d2b79f5;
    return () => {
        t = (t + 0x6d2b79f5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}
export function buildStars(w, h) {
    const rnd = sfRand(4242);
    const n = Math.round((w * h) / 2600 * 0.6); /*! Owned by Astral (@ax4p): Better Vest lite 9.6.3. Licence: LICENSE, not open source. bv-962ae37e */
    const total = SF_TYPES.reduce((a, t) => a + t[1], 0);
    const out = [];
    for (let i = 0; i < n; i++) {
        let pick = rnd() * total, type = 'dot';
        for (const [k, wgt] of SF_TYPES) { if ((pick -= wgt) <= 0) { type = k; break; } }
        const tier = rnd();
        out.push({
            x: rnd() * w, y: rnd() * h, type,
            size: type === 'dot' ? 0.6 + rnd() * 1.1 : 2 + rnd() * 2.6,
            a: tier < 0.4 ? 0.22 + rnd() * 0.18 : tier < 0.8 ? 0.45 + rnd() * 0.25 : 0.78 + rnd() * 0.22
        });
    }
    return out;
/* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-8040ac4b */ }
export function paintStar(g, s) {
    const { x, y, size } = s;
    if (s.type === 'dot') { g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill(); return; }
    g.lineWidth = 0.9;
    g.beginPath();
    if (s.type === 'plus') { g.moveTo(x - size, y); g.lineTo(x + size, y); g.moveTo(x, y - size); g.lineTo(x, y + size); g.stroke(); return; }
    const k = size * 0.28;
    g.moveTo(x, y - size); g.quadraticCurveTo(x + k, y - k, x + size, y); g.quadraticCurveTo(x + k, y + k, x, y + size);
    g.quadraticCurveTo(x - k, y + k, x - size, y); g.quadraticCurveTo(x - k, y - k, x, y - size);
    if (s.type === 'spark') g.fill(); else g.stroke();
}
