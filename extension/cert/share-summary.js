// Better Vest P&L card, Summary (8.2): what the card's rows are about (accounts, markets, copy groups, trades, sessions), over which days
// (today, yesterday, this week, this month, a day you pick), on which markets, before or after fees. Pure: no DOM, no chrome.
// Today's trades come from the dock's snapshot (src/copy/35-share.js: today's /v3/positions rows, parsed here with the Calendar's own
// normalizePosition); other days from the Calendar's synced trades (the same records). With every option at its default the card is
// 8.1.5's: the accounts with Vest's own live day P&L (cardRows).

import { normalizePosition } from '../journal/model.js';
import { dayKey, addDays, parseKey, etParts, dayWindow } from '../journal/time.js';
import { cardRows, copyGroup, dayLong } from './share-model.js';

export const ROWS = ['accounts', 'markets', 'groups', 'trades', 'sessions'];
export const PERIODS = ['today', 'yesterday', 'week', 'month', 'day'];
// New York time, by the trade's open: three sessions that cover the whole Vest day (it starts at 20:00 ET, when Vest resets)
export const SESSIONS = [{ id: 'asia', name: 'Asia' }, { id: 'london', name: 'London' }, { id: 'ny', name: 'New York' }];

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (v) => Math.round(v * 100) / 100;

// Asia 20:00-03:00, London 03:00-09:30, New York 09:30-20:00 (New York wall clock, so DST never shifts them)
export function sessionOf(ts) {
    if (ts == null || !Number.isFinite(ts)) return null;
    const p = etParts(ts);
    const m = p.h * 60 + p.mi;
    if (m >= 20 * 60 || m < 3 * 60) return 'asia';
    if (m < 9 * 60 + 30) return 'london';
    return 'ny';
}

// "NDX-USD-PERP" -> "NQ", "BTC-PERP" -> "BTC": the name a trader says
export function mktName(sym) {
    const s = String(sym || '').toUpperCase();
    const base = s.replace(/-USD-PERP$|-PERP$|-USD$/, '');
    return ({ NDX: 'NQ', SPX: 'ES' })[base] || base || '?';
}

const dow = (key) => { const { y, m, d } = parseKey(key); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const short = (key) => { const { m, d } = parseKey(key); return d + ' ' + MON[m - 1].slice(0, 3); };

// The Vest days a period covers, from `today` (a Vest day key). pick: the day for 'day' (never after today).
export function periodRange(kind, today, pick) {
    const t = KEY_RE.test(String(today || '')) ? today : null;
    if (!t) return { kind: 'today', from: null, to: null, label: '', heroLbl: 'Day P&L', head: 'DAY P&L', single: true };
    if (kind === 'yesterday') { const y = addDays(t, -1); return { kind, from: y, to: y, label: dayLong(y), heroLbl: 'Day P&L', head: 'DAY P&L', single: true }; }
    if (kind === 'week') {
        const from = addDays(t, -((dow(t) + 6) % 7));
        const { y: y1, m: m1 } = parseKey(from), { y, m } = parseKey(t);
        const label = from === t ? dayLong(t) : (m1 === m && y1 === y ? parseKey(from).d + ' – ' + parseKey(t).d + ' ' + MON[m - 1] + ' ' + y : short(from) + ' – ' + short(t) + ' ' + y);
        return { kind, from, to: t, label, heroLbl: 'Week P&L', head: 'WEEK P&L', single: from === t };
    }
    if (kind === 'month') {
        const { y, m } = parseKey(t);
        return { kind, from: t.slice(0, 8) + '01', to: t, label: MON[m - 1] + ' ' + y, heroLbl: 'Month P&L', head: 'MONTH P&L', single: t.endsWith('-01') };
    }
    if (kind === 'day' && KEY_RE.test(String(pick || '')) && pick <= t) return { kind, from: pick, to: pick, label: dayLong(pick), heroLbl: 'Day P&L', head: 'DAY P&L', single: true };
    return { kind: 'today', from: t, to: t, label: dayLong(t), heroLbl: 'Day P&L', head: 'DAY P&L', single: true };
}

// A Calendar-shaped trade from one of today's rows (or a record the Calendar stored): only closed, real trades count on the Summary.
function usable(t) {
    return t && !t.void && !t.test && !t.open && Number.isFinite(t.closeTs) && Number.isFinite(t.net);
}

// Today's trades of the snapshot, parsed with the Calendar's parser. The demo gets sample trades that add up to each account's day.
export function todayTrades(snap) {
    if (!snap) return [];
    if (snap.demo) return sampleDayRows(snap);
    const out = [];
    for (const row of Array.isArray(snap.trades) ? snap.trades : []) {
        let t = null;
        try { t = normalizePosition(row, null); } catch (e) { t = null; }
        if (usable(t)) out.push(Object.assign(t, { live: true }));
    }
    return out;
}

// The trades of a period: today's from the snapshot, other days from the Calendar (one id counted once; the snapshot wins for today).
// Today's Calendar records count only when the snapshot has no trades read (the dock could not read them).
export function periodTrades(range, today, todayList, calendar, snapHasTrades) {
    if (!range || !range.from) return [];
    const seen = new Set();
    const out = [];
    const inside = (k) => k && k >= range.from && k <= range.to;
    if (inside(today)) for (const t of todayList || []) { if (!seen.has(t.id) && dayKey(t.closeTs, 'vest') === today) { seen.add(t.id); out.push(t); } }
    for (const t of calendar || []) {
        if (!usable(t) || seen.has(t.id)) continue;
        const k = dayKey(t.closeTs, 'vest');
        if (!inside(k) || (k === today && snapHasTrades)) continue;
        seen.add(t.id);
        out.push(t);
    }
    return out.sort((a, b) => a.closeTs - b.closeTs);
}

const pnlOf = (t, afterFees) => r2(afterFees === false ? t.net + (t.fee || 0) : t.net);

// ---------- points (8.2, the owner: "what if user wants it to be in points") ----------
// A trade's points are its price move times its direction, its size left out: the Calendar's own `points` (the exit against the entry, both
// averaged over every fill). Points add up only inside one market (MNQ is NQ): NQ points and BTC points are never one number. A list of trades
// on one market gives { pts }; on several, { pts: null, mixed: true }; with no trades, or a trade whose points are unknown, { pts: null }.
const ptsMkt = (t) => { const m = mktName(t.symbol); return m === 'MNQ' ? 'NQ' : m; };
export function pointsOf(list) {
    const ts = Array.isArray(list) ? list : [];
    if (!ts.length) return { pts: null, mixed: false, market: '' };
    const mk = new Set(ts.map(ptsMkt));
    if (mk.size > 1) return { pts: null, mixed: true, market: '' };
    let sum = 0;
    for (const t of ts) { if (!Number.isFinite(t.points)) return { pts: null, mixed: false, market: [...mk][0], unknown: true }; sum += t.points; }
    return { pts: r2(sum), mixed: false, market: [...mk][0] };
}
// each row's points from the trades it stands for, and the card's: only when every row shown is one and the same market
// Each row's points, and the card's: over every trade in the rows, counted once. Several markets give no total but each market's own
// (ptsByMarket, in the order traded), so the hero can say what each market did.
function withPoints(M, tradesOf) {
    const seen = new Set(), all = [];
    for (const r of M.rows) {
        const ts = tradesOf(r) || [];
        const q = pointsOf(ts);
        r.pts = q.pts; r.ptsMixed = q.mixed;
        for (const t of ts) if (!seen.has(t)) { seen.add(t); all.push(t); }
    }
    const q = pointsOf(all);
    M.ptsTotal = q.pts; M.ptsMixed = q.mixed; M.ptsMarket = q.mixed ? '' : q.market || '';
    M.ptsByMarket = [];
    if (q.mixed) {
        const by = new Map();
        for (const t of all) { const k = ptsMkt(t); if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
        for (const [market, ts] of by) M.ptsByMarket.push({ market, pts: pointsOf(ts).pts });
    }
    return M;
}

// The trades' numbers for the stats line: count, wins, win rate, best, worst, fees
export function tradeStats(trades, afterFees) {
    const n = trades.length;
    let wins = 0, best = null, worst = null, fees = 0;
    for (const t of trades) {
        const v = pnlOf(t, afterFees);
        if (v > 0) wins++;
        if (best == null || v > best) best = v;
        if (worst == null || v < worst) worst = v;
        fees += t.fee || 0;
    }
    return { count: n, wins, losses: trades.filter((t) => pnlOf(t, afterFees) < 0).length, winRate: n ? wins / n : null, best, worst, fees: r2(fees) };
}

// Every copy group the snapshot knows: its own list (8.2 groups), else the copier's one leader and its followers.
export function snapGroups(snap) {
    if (!snap) return [];
    const ids = new Set((snap.accounts || []).map((a) => a.id));
    const list = Array.isArray(snap.groups) && snap.groups.length ? snap.groups : (snap.leaderId ? [{ id: 'A', leaderId: snap.leaderId, followerIds: snap.followerIds || [] }] : []);
    return list.map((g) => ({ id: g.id, leaderId: ids.has(g.leaderId) ? g.leaderId : '', followerIds: (g.followerIds || []).filter((x) => ids.has(x)) }))
        .filter((g) => g.leaderId || g.followerIds.length);
}

// What the Summary card shows. o = { rows, mode, picked, greenOnly, period: { kind, pick }, markets: null | [names], afterFees }
// data = { today: [trades] (todayTrades), calendar: [trades] | null }. Returns the rows ({ id, name, pnl, leader, n, kind }), the total, the
// account size and the return over exactly those rows, and the trades they come from (for the stats line).
export function summaryModel(snap, o, data) {
    const opt = o || {};
    const rowsKind = ROWS.includes(opt.rows) ? opt.rows : 'accounts';
    const today = snap && snap.day;
    const range = periodRange(opt.period && opt.period.kind, today, opt.period && opt.period.pick);
    const live = range.kind === 'today';
    const afterFees = opt.afterFees !== false;
    const markets = Array.isArray(opt.markets) && opt.markets.length ? new Set(opt.markets) : null;
    const picked = new Set(Array.isArray(opt.picked) ? opt.picked : []);
    const byAcc = new Map(((snap && snap.accounts) || []).map((a) => [a.id, a]));
    const snapHasTrades = !!(snap && (snap.demo || (Array.isArray(snap.trades) && snap.trades.length)));
    const allTrades = periodTrades(range, today, data && data.today, data && data.calendar, snapHasTrades);
    const allMarkets = [...new Set(allTrades.filter((t) => picked.has(t.accountId)).map((t) => mktName(t.symbol)))].sort();
    const trades = allTrades.filter((t) => picked.has(t.accountId) && (!markets || markets.has(mktName(t.symbol))));
    const base = { kind: rowsKind, range, live, trades, markets: allMarkets, stats: tradeStats(trades, afterFees), afterFees };

    // the 8.1.5 card: Vest's live day P&L per account (with After fees off, today's fees of each account added back)
    if (rowsKind === 'accounts' && live && !markets) {
        const R = cardRows(snap, { mode: opt.mode, picked: opt.picked, greenOnly: false });
        if (!afterFees) {
            const fee = new Map();
            for (const t of trades) fee.set(t.accountId, (fee.get(t.accountId) || 0) + (t.fee || 0));
            R.rows = R.rows.map((r) => Object.assign({}, r, { pnl: r2(r.pnl + (fee.get(r.id) || 0)) }));
            R.rows.sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || b.pnl - a.pnl);
        }
        return withPoints(finish(Object.assign(base, { rows: R.rows, unknown: R.unknown }), opt.greenOnly), (r) => trades.filter((t) => t.accountId === r.id));
    }
    if (rowsKind === 'accounts') {
        // realized: the trades of each picked account (an account with none shows $0.00 on a past day, like the Calendar)
        const rows = [];
        for (const id of picked) {
            const a = byAcc.get(id);
            if (!a) continue;
            const mine = trades.filter((t) => t.accountId === id);
            rows.push({ id, name: a.name, size: a.size, pnl: r2(mine.reduce((s, t) => s + pnlOf(t, afterFees), 0)), n: mine.length, leader: opt.mode === 'copy' && snap.leaderId === id });
        }
        rows.sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || b.pnl - a.pnl);
        return withPoints(finish(Object.assign(base, { rows, unknown: 0 }), opt.greenOnly), (r) => trades.filter((t) => t.accountId === r.id));
    }
    if (rowsKind === 'markets') {
        const m = new Map();
        for (const t of trades) {
            const k = mktName(t.symbol);
            const r = m.get(k) || { id: k, name: k, pnl: 0, n: 0, market: k };
            r.pnl += pnlOf(t, afterFees); r.n++;
            m.set(k, r);
        }
        const rows = [...m.values()].map((r) => Object.assign(r, { pnl: r2(r.pnl) })).sort((a, b) => b.pnl - a.pnl);
        return withPoints(finish(Object.assign(base, { rows, unknown: 0, sizeIds: [...new Set(trades.map((t) => t.accountId))] }), opt.greenOnly, byAcc), (r) => trades.filter((t) => mktName(t.symbol) === r.id));
    }
    if (rowsKind === 'groups') {
        const rows = [];
        for (const g of snapGroups(snap)) {
            const ids = [g.leaderId].concat(g.followerIds).filter(Boolean);
            let pnl = 0, n = 0, unknown = 0, size = 0, sized = true;
            if (live && !markets) {
                for (const id of ids) {
                    const a = byAcc.get(id);
                    if (!a || a.pnl == null) { unknown++; continue; }
                    let fee = 0;
                    if (!afterFees) for (const t of allTrades) if (t.accountId === id) fee += t.fee || 0;
                    pnl += a.pnl + fee;
                    n += allTrades.filter((t) => t.accountId === id).length;
                    if (a.size > 0) size += a.size; else sized = false;
                }
            } else {
                for (const t of allTrades) if (ids.includes(t.accountId) && (!markets || markets.has(mktName(t.symbol)))) { pnl += pnlOf(t, afterFees); n++; }
                for (const id of ids) { const a = byAcc.get(id); if (a && a.size > 0) size += a.size; else sized = false; }
            }
            const lead = byAcc.get(g.leaderId);
            rows.push({ id: 'group-' + g.id, name: 'Group ' + g.id, sub: lead ? lead.name : '', pnl: r2(pnl), n, accounts: ids.length, size: sized ? size : null, unknown, ids });
        }
        rows.sort((a, b) => b.pnl - a.pnl);
        return withPoints(finish(Object.assign(base, { rows, unknown: 0 }), opt.greenOnly), (r) => allTrades.filter((t) => r.ids.includes(t.accountId) && (!markets || markets.has(mktName(t.symbol)))));
    }
    if (rowsKind === 'trades') {
        const many = new Set(trades.map((t) => t.accountId)).size > 1;
        const rows = trades.map((t) => ({ id: t.id, accountId: t.accountId, name: (t.side === 'long' ? 'Long ' : 'Short ') + mktName(t.symbol), when: t.openTs, acct: many ? (byAcc.get(t.accountId) || {}).name || '' : '', pnl: pnlOf(t, afterFees), n: 1, t }));
        return withPoints(finish(Object.assign(base, { rows, unknown: 0, sizeIds: [...new Set(trades.map((t) => t.accountId))] }), opt.greenOnly, byAcc), (r) => [r.t]);
    }
    // sessions
    const by = new Map(SESSIONS.map((s) => [s.id, { id: s.id, name: s.name, pnl: 0, n: 0 }]));
    for (const t of trades) { const s = by.get(sessionOf(t.openTs != null ? t.openTs : t.closeTs)); if (s) { s.pnl += pnlOf(t, afterFees); s.n++; } }
    const rows = [...by.values()].filter((s) => s.n).map((s) => Object.assign(s, { pnl: r2(s.pnl) }));
    return withPoints(finish(Object.assign(base, { rows, unknown: 0, sizeIds: [...new Set(trades.map((t) => t.accountId))] }), opt.greenOnly, byAcc), (r) => trades.filter((t) => sessionOf(t.openTs != null ? t.openTs : t.closeTs) === r.id));
}

// the total, the size and the return over exactly the rows shown (as cardRows: the card's numbers always agree with its list)
function finish(M, greenOnly, byAcc) {
    if (greenOnly) M.rows = M.rows.filter((r) => r.pnl > 0);
    M.total = r2(M.rows.reduce((t, r) => t + r.pnl, 0));
    M.n = M.rows.length;
    let cap = 0, sized = M.rows.length > 0;
    if (M.sizeIds && byAcc) {
        // rows that are not accounts: the size of the accounts their trades come from
        for (const id of M.sizeIds) { const a = byAcc.get(id); if (a && a.size > 0) cap += a.size; else sized = false; }
        if (!M.sizeIds.length) sized = false;
    } else {
        for (const r of M.rows) { if (r.size > 0) cap += r.size; else sized = false; }
    }
    M.cap = sized ? cap : 0;
    M.ret = sized && cap > 0 ? (M.total / cap) * 100 : null;
    return M;
}

// ---------- sample trades (the copier demo and showcases; the card says Sample) ----------

const SAMPLE_MKTS = [['NDX-USD-PERP', 31500, 0.25], ['SPX-USD-PERP', 6720, 0.25], ['BTC-PERP', 112400, 1], ['SOL-PERP', 212, 0.01]];
function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
// One account's sample trades of one Vest day, adding up to `pnl` exactly (the last trade takes the rest). Deterministic.
export function sampleTradesFor(accountId, key, pnl, size) {
    if (!KEY_RE.test(String(key || '')) || !Number.isFinite(pnl)) return [];
    const rnd = seeded(accountId + '|' + key);
    // the Vest day: 20:00 ET the evening before to 20:00 ET (the Calendar's own window); trades from 21:00 to about 18:00 ET
    const dayStart = dayWindow(key, 'vest').start;
    const n = 2 + Math.floor(rnd() * 3);
    const out = [];
    let left = pnl;
    for (let i = 0; i < n; i++) {
        const [sym, px, tick] = SAMPLE_MKTS[Math.floor(rnd() * (i === 0 ? 1 : SAMPLE_MKTS.length))];
        const share = i === n - 1 ? left : Math.round((pnl / n) * (0.4 + rnd() * 1.2) * 100) / 100;
        left = Math.round((left - share) * 100) / 100;
        const net = i === n - 1 ? Math.round(share * 100) / 100 : share;
        const fee = Math.round(Math.max(0.5, Math.abs(net) * 0.012) * 100) / 100;
        const side = rnd() < 0.55 ? 'long' : 'short';
        const qty = Math.max(1, Math.round((size || 50000) / 25000));
        const pts = (net + fee) / qty;
        const entry = Math.round((px * (1 + (rnd() - 0.5) * 0.004)) / tick) * tick;
        const exit = Math.round((side === 'long' ? entry + pts : entry - pts) / tick) * tick;
        const openTs = dayStart + 3600e3 + Math.floor(((i + rnd() * 0.8) / n) * 21 * 3600e3);
        const closeTs = openTs + Math.floor((4 + rnd() * 40) * 60000);
        const stop = side === 'long' ? entry - Math.max(tick * 8, px * 0.0006) : entry + Math.max(tick * 8, px * 0.0006);
        out.push({ id: 'sample-' + accountId + '-' + key + '-' + i, accountId, symbol: sym, side, open: false, openTs, closeTs, qty,
            entryPx: entry, exitPx: exit, net, gross: Math.round((net + fee) * 100) / 100, fee, funding: 0, points: side === 'long' ? exit - entry : entry - exit,
            initialSL: stop, rMult: Math.abs(entry - stop) > 0 ? (side === 'long' ? exit - entry : entry - exit) / Math.abs(entry - stop) : null, sample: true });
    }
    return out;
}
// Today's sample trades: each demo account's day P&L split over a few trades
export function sampleDayRows(snap) {
    const out = [];
    for (const a of (snap && snap.accounts) || []) if (a.pnl != null && Math.abs(a.pnl) >= 0.01) out.push(...sampleTradesFor(a.id, snap.day, a.pnl, a.size));
    return out;
}
// Sample history for the demo's other periods: `days` Vest days before today, a made-up day P&L per account
export function sampleHistory(snap, days = 40) {
    const out = [];
    if (!snap || !KEY_RE.test(String(snap.day || ''))) return out;
    for (let i = 1; i <= days; i++) {
        const key = addDays(snap.day, -i);
        const wd = dow(key);
        if (wd === 0 || wd === 6) continue;
        for (const a of snap.accounts || []) {
            const rnd = seeded('h|' + a.id + '|' + key);
            const scale = (a.size || 50000) / 50000;
            const pnl = Math.round(((rnd() - 0.38) * 900 * scale) * 100) / 100;
            out.push(...sampleTradesFor(a.id, key, pnl, a.size));
        }
    }
    return out;
}

export { copyGroup };
