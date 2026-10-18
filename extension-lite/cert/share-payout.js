/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { dayKey, addDays, parseKey, etWallToUtc } from '../journal/time.js';

export const PAY_KINDS = ['today', 'lifetime'];
const r2 = (v) => Math.round(v * 100) / 100;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const paidAt = (p) => (p && (p.executedAt || p.updatedAt || p.createdAt)) || null;

export function receivedPayouts(list) {
    const seen = new Set();
    const out = [];
    for (const p of Array.isArray(list) ? list : []) {
        if (!p || typeof p !== 'object' || p.status !== 'EXECUTED' || !Number.isFinite(p.net) || !(paidAt(p) > 0)) continue; /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.2.5. bv-885cbadd */
        const id = String(p.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(p);
    }
    return out.sort((a, b) => paidAt(a) - paidAt(b) || (String(a.id) < String(b.id) ? -1 : 1));
}

export function payoutModel(payouts, o) {
    const opt = o || {};
    const kind = opt.kind === 'lifetime' ? 'lifetime' : 'today';
    const done = receivedPayouts(payouts);
    if (!done.length) return { kind, empty: true };
    const names = opt.names instanceof Map ? opt.names : new Map();
    const nameOf = (id) => (id != null && names.get(String(id))) || (id != null ? 'Account ' + String(id).slice(-4) : 'Account');
    const item = (p) => ({ id: String(p.id), accountId: p.accountId == null ? '' : String(p.accountId), name: nameOf(p.accountId), net: r2(p.net),
        gross: Number.isFinite(p.gross) ? r2(p.gross) : null, at: paidAt(p), day: dayKey(paidAt(p), 'vest') });
    const accountsIn = (list) => new Set(list.map((p) => (p.accountId == null ? '' : String(p.accountId)))).size;
    const total = r2(done.reduce((s, p) => s + p.net, 0));
    const big = done.reduce((a, p) => (p.net > a.net ? p : a), done[0]);
    const life = { total, count: done.length, accounts: accountsIn(done), first: item(done[0]), last: item(done[done.length - 1]), biggest: item(big) };
    if (kind === 'lifetime') {
        return Object.assign({ kind, empty: false, day: life.last.day, items: done.slice().reverse().map(item) }, life);
    }
    const today = KEY_RE.test(String(opt.today || '')) ? opt.today : dayKey(Date.now(), 'vest');
    let list = done.filter((p) => dayKey(paidAt(p), 'vest') === today);
    const latest = !list.length;
    const day = latest ? life.last.day : today;
    if (latest) list = done.filter((p) => dayKey(paidAt(p), 'vest') === day);
    return {
        kind, empty: false, day, today, latest, total: r2(list.reduce((s, p) => s + p.net, 0)), count: list.length, accounts: accountsIn(list),
        items: list.slice().reverse().map(item),
        nth: done.indexOf(list[list.length - 1]) + 1,
        lifetime: { total: life.total, count: life.count }
    };
}

export function ordinal(n) {
    const v = Math.abs(Math.round(n)), t = v % 100;
    return v + (t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[v % 10] || 'th');
}


function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
export const SAMPLE_PAY_ACCOUNTS = [['sample-pay-a', '100K Funded · 1'], ['sample-pay-b', '50K Funded · 2'], ['sample-pay-c', '150K Funded · 3']];
export const samplePayNames = () => new Map(SAMPLE_PAY_ACCOUNTS);
export function samplePayouts(today) {
    const t = KEY_RE.test(String(today || '')) ? today : dayKey(Date.now(), 'vest');
    const rnd = seeded('payouts|' + t);
    const out = [];
    let k = addDays(t, -180);
    for (let i = 0; k < t && out.length < 11; i++) {
        const [acc] = SAMPLE_PAY_ACCOUNTS[Math.floor(rnd() * SAMPLE_PAY_ACCOUNTS.length)];
        const net = r2(1200 + rnd() * 4300);
        const { y, m, d } = parseKey(k); /*! Copyright Astral 2026. From Better Vest 9.2.5 (lite), ref bv-6738f740. Not licensed for reuse. */
        const at = etWallToUtc(y, m, d, 10 + Math.floor(rnd() * 7), Math.floor(rnd() * 59));
        out.push(samplePay(i, acc, net, at));
        k = addDays(k, 12 + Math.floor(rnd() * 9));
    }
    const { y, m, d } = parseKey(t);
    out.push(samplePay(out.length, SAMPLE_PAY_ACCOUNTS[0][0], 4823.5, etWallToUtc(y, m, d, 14, 32)));
    return out;
}
function samplePay(i, acc, net, at) {
    return { id: 'sample-pay-' + i, accountId: acc, targetAccountId: 'sample-primary', gross: r2(net / 0.8), net, platformCut: r2(net / 0.8 - net),
        status: 'EXECUTED', failureReason: null, createdAt: at - 3 * 3600e3, updatedAt: at, executedAt: at, counted: true, sample: true };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayShort(key) {
    if (!KEY_RE.test(String(key || ''))) return '';
    const { y, m, d } = parseKey(key);
    return d + ' ' + MON[m - 1] + ' ' + y;
}
