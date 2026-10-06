// Better Vest share poster: the snapshot the trade page sends (the dock's P&L button) and the rows a poster shows. Pure: no DOM, no chrome.
// The service worker cleans every snapshot with cleanSnap before it stores it; the share page (cert/share.html) builds the card from cardRows.

import { cleanReplay } from './share-replay.js';

export const SHARE_MAX_ACCOUNTS = 60;
export const SHARE_MAX_BYTES = 256 * 1024;   // bridge.js drops a bigger snapshot

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, max) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const idOk = (v) => typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v);

// A snapshot from the page, made safe: known fields only, bounded strings and lists, numbers or null. null when it is not a snapshot.
// { v: 1, at, day: 'YYYY-MM-DD', market, copying, leaderId, followerIds: [], activeId, demo,
//   accounts: [{ id, name, kind, size, pnl }] }   pnl: today's P&L in USD (null: unknown); size: the account's starting size (null: unknown)
export function cleanSnap(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    if (!Array.isArray(s.accounts)) return null;
    const accounts = [];
    const seen = new Set();
    for (const a of s.accounts.slice(0, SHARE_MAX_ACCOUNTS)) {
        if (!a || typeof a !== 'object' || !idOk(a.id) || seen.has(a.id)) continue;
        seen.add(a.id);
        const size = num(a.size);
        accounts.push({ id: a.id, name: str(a.name, 48) || a.id.slice(0, 8), kind: str(a.kind, 16), size: size != null && size > 0 ? size : null, pnl: num(a.pnl) });
    }
    if (!accounts.length) return null;
    const ids = new Set(accounts.map((a) => a.id));
    const day = typeof s.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.day) ? s.day : '';
    const leaderId = idOk(s.leaderId) && ids.has(s.leaderId) ? s.leaderId : '';
    const followerIds = Array.isArray(s.followerIds) ? [...new Set(s.followerIds.filter((x) => idOk(x) && ids.has(x) && x !== leaderId))].slice(0, SHARE_MAX_ACCOUNTS) : [];
    return {
        v: 1, at: num(s.at) || 0, day, market: /^[A-Z0-9]{1,12}$/.test(String(s.market || '')) ? String(s.market) : '',
        copying: s.copying === true && !!leaderId && followerIds.length > 0, leaderId, followerIds,
        activeId: idOk(s.activeId) && ids.has(s.activeId) ? s.activeId : '', demo: s.demo === true, accounts,
        // Replay: one account's trades of today on Vest's candles (cert/share-replay.js); null when the page sent none
        replay: cleanReplay(s.replay)
    };
}

// "Eval 50K · 2" -> "EVAL***": the first 4 letters or digits, the rest hidden (enough to tell your accounts apart, nothing to look up)
export function maskName(name) {
    const s = String(name == null ? '' : name).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
    return (s || 'ACCT') + '***';
}

// The copy group of a snapshot: the leader first, then the followers that are on (only accounts the snapshot holds)
export function copyGroup(snap) {
    if (!snap || !snap.leaderId) return [];
    return [snap.leaderId].concat(snap.followerIds || []);
}

// What the card shows. opts = { mode: 'copy' | 'accounts', picked: [ids], greenOnly }
// rows: the picked accounts whose P&L is known (the leader first in copy mode, then the biggest P&L first); with greenOnly only the
// accounts in profit. The total, the size and the return are over exactly those rows, so the card's numbers always agree with its list.
export function cardRows(snap, opts) {
    const o = opts || {};
    if (!snap || !Array.isArray(snap.accounts)) return { rows: [], total: 0, cap: 0, ret: 0, n: 0, unknown: 0 };
    const by = new Map(snap.accounts.map((a) => [a.id, a]));
    const picked = Array.isArray(o.picked) ? o.picked : [];
    let unknown = 0;
    let rows = [];
    for (const id of picked) {
        const a = by.get(id);
        if (!a) continue;
        if (a.pnl == null) { unknown++; continue; }
        rows.push({ id, name: a.name, size: a.size, pnl: a.pnl, leader: o.mode === 'copy' && id === snap.leaderId });
    }
    if (o.greenOnly) rows = rows.filter((r) => r.pnl > 0);
    rows.sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || b.pnl - a.pnl);
    const total = Math.round(rows.reduce((t, r) => t + r.pnl, 0) * 100) / 100;
    const cap = rows.reduce((t, r) => t + (r.size || 0), 0);
    const sized = rows.every((r) => r.size > 0);
    return { rows, total, cap: sized ? cap : 0, ret: sized && cap > 0 ? (total / cap) * 100 : null, n: rows.length, unknown };
}

// 'YYYY-MM-DD' -> 'Tuesday, 6 October 2026' (the trading day, written out; empty for no day)
export function dayLong(day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!m) return '';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^(\w+) /, '$1, ');
}

export function money(v, sign = true) {
    const a = Math.abs(v);
    return (v < 0 ? '−' : sign ? '+' : '') + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
