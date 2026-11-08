/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { dayKey } from '../journal/time.js';
import * as DB from '../journal/db.js';
import { paidAt } from './share-payout.js';

export const BEST_MIN_DAYS = 3;
export const PAYOUT_NEWS_MS = 24 * 3600e3;

const r2 = (v) => Math.round(v * 100) / 100;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const usable = (t) => t && !t.void && !t.test && !t.open && Number.isFinite(t.closeTs) && Number.isFinite(t.net);

export function momentTrades(calTrades, snapList, ids, from, to) {
    const by = new Map();
    for (const t of Array.isArray(calTrades) ? calTrades : []) if (usable(t)) by.set(String(t.id), t);
    for (const t of Array.isArray(snapList) ? snapList : []) if (usable(t)) by.set(String(t.id), t);
    const keep = ids ? new Set(ids.map(String)) : null;
    const out = [];
    for (const t of by.values()) {
        if (keep && !keep.has(String(t.accountId))) continue;
        const k = dayKey(t.closeTs, 'vest');
        if ((from && k < from) || (to && k > to)) continue;
        out.push(t);
    }
    return out.sort((a, b) => a.closeTs - b.closeTs || (String(a.id) < String(b.id) ? -1 : 1));
}

export function bestDay(calTrades, snapList, accountId, today, dayPnl) {
    if (!accountId || !KEY_RE.test(String(today || ''))) return null;
    const all = momentTrades(calTrades, snapList, [accountId], null, today);
    const by = new Map();
    for (const t of all) { const k = dayKey(t.closeTs, 'vest'); by.set(k, (by.get(k) || 0) + t.net); }
    const net = by.has(today) ? r2(by.get(today)) : Number.isFinite(dayPnl) ? r2(dayPnl) : null;
    if (net == null || !(net > 0)) return null;
    const earlier = [...by.entries()].filter(([k]) => k < today).map(([, v]) => r2(v));
    if (earlier.length < BEST_MIN_DAYS) return null;
    if (!earlier.every((v) => net > v)) return null; /*! Owned by Astral (@ax4p): Better Vest lite 9.6.2. Licence: LICENSE, not open source. bv-918d33ed */
    return { net, days: earlier.length };
}
export function newPayout(payouts, now, seen) {
    const done = new Set(Array.isArray(seen) ? seen.map(String) : []);
    let best = null;
    for (const p of Array.isArray(payouts) ? payouts : []) {
        if (!p || p.status !== 'EXECUTED' || !Number.isFinite(p.net) || done.has(String(p.id))) continue;
        const at = paidAt(p);
        if (!(at > 0) || at > now + 60000 || now - at > PAYOUT_NEWS_MS) continue;
        if (!best || at > paidAt(best)) best = p;
    }
    return best;
}
export function momentCheck(cal, o) {
    const opt = o || {};
    const seen = opt.seen || {};
    const now = Number.isFinite(opt.now) ? opt.now : Date.now();
    const p = newPayout(cal && cal.payouts, now, seen.payouts);
    if (p) return { kind: 'payout', accountId: p.accountId == null ? '' : String(p.accountId), at: paidAt(p), net: r2(p.net), payoutId: String(p.id) };
    const id = opt.accountId;
    if (id && !(seen.best && seen.best[id] === opt.today)) {
        const b = bestDay(cal && cal.trades, opt.snapList, id, opt.today, opt.dayPnl);
        if (b) return { kind: 'best', accountId: id, at: now, net: b.net, days: b.days };
    }
    return null;
}
export function seenAdd(seen, m, today) { /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-f0bec697 */
    const s = { payouts: Array.isArray(seen && seen.payouts) ? seen.payouts.filter((x) => typeof x === 'string').slice(-50) : [],
        best: seen && seen.best && typeof seen.best === 'object' && !Array.isArray(seen.best) ? Object.assign({}, seen.best) : {} };
    if (m && m.kind === 'payout' && m.payoutId && !s.payouts.includes(m.payoutId)) s.payouts = s.payouts.concat(m.payoutId).slice(-50);
    if (m && m.kind === 'best' && m.accountId) {
        s.best[m.accountId] = today;
        const keys = Object.keys(s.best);
        if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete s.best[k];
    }
    return s;
}

export function sizeWord(v) {
    if (!(v > 0)) return '';
    if (v >= 1e6) return String(Math.round(v / 1e5) / 10).replace(/\.0$/, '') + 'M';
    if (v >= 1000) return Math.round(v / 1000) + 'K';
    return '$' + Math.round(v);
}
export function usdWord(v) {
    if (!Number.isFinite(v)) return '';
    const a = Math.abs(v), sign = v < 0 ? '−' : '+';
    return sign + '$' + (a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
export function momentTitle(m, acct) {
    const k = m && m.kind;
    if (k === 'passed') { const w = acct ? sizeWord(acct.size) : ''; return 'You passed your ' + (w ? w + ' ' : '') + 'evaluation'; }
    if (k === 'payout') return 'A payout landed: ' + usdWord(m.net);
    if (k === 'best') return 'Your best day on ' + ((acct && acct.name) || 'this account');
    if (k === 'streak') return (m.n || 5) + ' wins in a row';
    return '';
}

export async function calRead(accountIds) {
    const none = { trades: [], payouts: [], accounts: [], lastSync: null, err: 'none' };
    try {
        const want = new Set((accountIds || []).map(String));
        const users = await DB.listUserIds().catch(() => []);
        for (const u of users) {
            let db = null;
            try {
                db = await DB.openDb(String(u));
                const accounts = await DB.getAll(db, 'accounts').catch(() => []);
                if (want.size && !accounts.some((a) => a && want.has(String(a.id)))) continue;
                const [trades, payouts, lastSync] = await Promise.all([DB.getAll(db, 'trades').catch(() => []), DB.getAll(db, 'payouts').catch(() => []),
                    DB.getMeta(db, 'lastSync').catch(() => null)]);
                /* Copyright Astral 2026. From Better Vest 9.6.2 (lite), ref bv-fbe0242a. Not licensed for reuse. */ return { trades: trades || [], payouts: payouts || [], accounts: accounts || [], lastSync: lastSync || null, err: '' };
            } finally { if (db) db.close(); }
        }
        return none;
    } catch (e) {
        return Object.assign({}, none, { err: 'read-failed' });
    }
}

export const SEEN_KEY = 'bvRunSeen';
export function seenLoad(storage) {
    try { const v = JSON.parse((storage && storage.getItem(SEEN_KEY)) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
export function seenSave(storage, v) {
    try { storage.setItem(SEEN_KEY, JSON.stringify(v)); } catch (e) {}
}
