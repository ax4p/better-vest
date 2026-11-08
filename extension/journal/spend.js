/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { dayKey } from './time.js';

export const SPEND_PREFIX = 'bvSpend:';
export const SPEND_ASK = 'bvSpendAsk';
const HOWS = new Set(['plan', 'like', 'none']);
const PHASES = { funded: ['funded', 'instant'], eval: ['eval'], primary: ['primary'] };

export function cleanSpend(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    if (x.on !== true) return { on: false, stop: x.stop === true, buys: [], live: [] };
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
    const buys = [], seen = new Set();
    for (const b of Array.isArray(x.buys) ? x.buys.slice(0, 2000) : []) {
        if (!b || typeof b !== 'object') continue;
        const id = str(b.id, 120), c = num(b.c), at = num(b.at), l = num(b.l);
        if (!id || seen.has(id) || !(c >= 0)) continue;
        seen.add(id); /* Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-12a9f103 */
        buys.push({ id, at: at > 0 ? at : 0, c: Math.round(c), l: l >= 0 ? l : 0, how: HOWS.has(b.how) ? b.how : 'plan', k: str(b.k, 24), n: str(b.n, 40) });
    }
    const live = [];
    for (const b of Array.isArray(x.live) ? x.live.slice(0, 50) : []) {
        if (!b || typeof b !== 'object') continue;
        const at = num(b.at), c = num(b.c), q = Math.round(num(b.q));
        if (!(at > 0) || !(c >= 0)) continue;
        live.push({ at, c: Math.round(c), q: q >= 1 && q <= 50 ? q : 1 });
    }
    return { on: true, stop: false, buys, live };
}

export function spendScope(rec, o = {}) {
    if (!rec || !rec.on) return { buys: [], live: [] };
    const phases = PHASES[o.scope] || null;
    const pick = Array.isArray(o.accounts) ? new Set(o.accounts) : null;
    if (!phases && !pick) return { buys: rec.buys.slice(), live: rec.live.slice() };
    const chains = new Map();
    for (const a of o.list || []) {
        if (!a || a.kind === 'primary') continue;
        const key = String(a.chainId || a.id);
        if (!chains.has(key)) chains.set(key, []);
        chains.get(key).push(a);
    }
    const buys = rec.buys.filter((b) => {
        const mine = chains.get(b.id) || [];
        if (pick && !pick.has(b.id) && !mine.some((a) => pick.has(a.id))) return false;
        if (phases) {
            const ph = mine.length ? mine.map((a) => a.phase) : [b.k === 'instant_funded' ? 'instant' : 'eval'];
            if (!ph.some((p) => phases.includes(p))) return false;
        }
        return true;
    });
    return { buys, live: [] };
}

export function spendDays(scoped, mode = 'vest') {
    const m = new Map();
    const add = (it) => {
        const key = dayKey(it.at, mode);
        if (!key) return;
        let d = m.get(key);
        if (!d) m.set(key, d = { c: 0, n: 0, items: [] });
        d.c += it.c;
        d.n += it.q;
        /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-0d13b4cb */ d.items.push(it);
    };
    for (const b of scoped.buys) if (b.at > 0) add(Object.assign({}, b, { q: 1 }));
    for (const b of scoped.live) add({ id: '', at: b.at, c: b.c, l: 0, how: 'live', k: '', n: '', q: b.q });
    for (const d of m.values()) d.items.sort((a, b) => a.at - b.at);
    return m;
}

export function spendAll(scoped) {
    let c = 0, n = 0, later = 0;
    for (const b of scoped.buys) { c += b.c; n++; if (!(b.at > 0)) later++; }
    for (const b of scoped.live) { c += b.c; n += b.q; }
    return { c, n, later };
}

export function spendIn(days, keys) {
    let c = 0, n = 0;
    for (const k of keys) { const d = days.get(k); if (d) { c += d.c; n += d.n; } }
    return { c, n };
}

export const spendNet = (paid, spentCents) => Math.round((paid || 0) * 100 - (spentCents || 0)) / 100;

export function spendShows(rec) {
    if (!rec || rec.stop) return '';
    return rec.on ? 'show' : 'offer';
}
