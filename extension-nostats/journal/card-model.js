/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import * as T from './time.js';
import * as stats from './stats.js';
import { spendIn, spendNet } from './spend.js';
import { accountName } from './model.js';
import { stepDomain } from './charts.js';

export const CARD_FORMATS = ['wide', 'story', 'square'];
export const CARD_SIZES = { wide: [960, 540], story: [540, 960], square: [540, 540] };
export const FORMAT_LABEL = { wide: '16:9', story: '9:16', square: '1:1' };
export const CARD_SECONDS = 8;

const PHASES = { funded: ['funded', 'instant'], eval: ['eval'], primary: ['primary'] };
const SCOPE_WORD = { all: 'All accounts', funded: 'Funded accounts', eval: 'Evaluation accounts', primary: 'Primary account' };
const PHASE_WORD = { eval: 'Evaluation', funded: 'Funded', instant: 'Instant', primary: 'Primary' };
const ok = (v) => v != null && Number.isFinite(v);
const sgnOf = (v) => (v > 0 ? 'p' : v < 0 ? 'n' : '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function inScope(a, state) {
    const ph = PHASES[state.scope];
    if (ph && !ph.includes(a.phase)) return false;
    if (state.accounts && !state.accounts.includes(a.id)) return false;
    return true;
}

export function accountLabel(state, accounts, hide) {
    const a = state.accounts;
    if (a == null) return SCOPE_WORD[state.scope] || SCOPE_WORD.all;
    if (!a.length) return 'No accounts';
    if (a.length > 1) return plural(a.length, 'account');
    const acc = (accounts || []).find((x) => x.id === a[0]);
    if (!acc) return '1 account';
    if (!hide) return accountName(acc);
    return acc.kind === 'primary' ? 'Primary' : (acc.vestLabel || PHASE_WORD[acc.phase] || 'Account');
}

export function cleanHandle(s) {
    const v = String(s || '').trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, 32);
    return v ? (v.startsWith('@') ? v : '@' + v) : ''; /*! Copyright Astral 2026. From Better Vest 9.6.2 (nostats), ref bv-6243a2cc. Not licensed for reuse. */
}

export const cardUnit = (state, hide) => (state.unit === 'usd' && hide ? 'pct' : state.unit);

export function moneyText(v, hide, { ctx = 'table', base, sign = true } = {}) {
    if (!ok(v)) return '—';
    if (hide) return base > 0 ? T.fmtPct(v / base, { sign }) : null;
    return T.fmtUsd(v, { ctx, sign });
}
export function unitText(v, unit, hide, { ctx = 'cell', base, sign = true } = {}) {
    if (!ok(v)) return '—';
    if (unit === 'pct') return T.fmtPct(v, { sign });
    if (unit === 'pts') return T.fmtPts(v, { dp: 1, unit: false, sign });
    if (unit === 'r') return T.fmtR(v, { sign });
    const s = moneyText(v, hide, { ctx, base, sign });
    return s == null ? '—' : s;
}
export function heroOf(v, unit, hide, base) {
    if (!ok(v)) return { text: '—', sgn: '' };
    if (unit === 'usd' && !hide) return { parts: T.heroParts(v), sgn: sgnOf(v) };
    if (unit === 'pts') return { text: T.fmtPts(v, { dp: 1, unit: true }), sgn: sgnOf(v) }; /* @license Better Vest 9.6.2. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-74307fbd */
    return { text: unitText(v, unit, hide, { ctx: 'table', base }), sgn: sgnOf(v) };
}
const rate = (x) => (x == null ? '—' : Math.round(x * 100) + '%');

function cellMeta(day, line, hide, risk) {
    if (line === 'pts') return day.symbols.size <= 1 && day.pointsN ? T.fmtPts(day.points, { dp: 1 }) : '—';
    if (line === 'r') return day.rN ? T.fmtR(day.rSum) : '—';
    if (line === 'risk') return risk == null ? '—' : T.fmtPts(risk, { dp: 1, sign: false });
    if (line === 'fees') { const s = moneyText(-day.fees, hide, { ctx: 'cell', base: day.capitalBase }); return s == null ? '—' : s; }
    const dec = day.wins + day.losses;
    return `${day.n} · ${dec ? Math.round(day.wins / dec * 100) + '%' : '—'}`;
}
function dayRisk(day, tradesById) {
    if (!day || day.symbols.size !== 1 || !day.riskN) return null;
    const r = day.tradeIds.map((id) => tradesById.get(id)).filter((t) => t && t.riskPts != null).map((t) => t.riskPts).sort((a, b) => a - b);
    if (!r.length) return null;
    const mid = (r.length - 1) / 2;
    return (r[Math.floor(mid)] + r[Math.ceil(mid)]) / 2;
}
function isSliver(day, key, mode, tradesById) {
    if (mode !== 'vest' || T.dowOfKey(key) !== 0) return false;
    for (const id of day.tradeIds) { const t = tradesById.get(id); const hh = T.etParts(t.closeTs).h; if (hh < 18 || hh >= 20) return false; }
    return true;
}

export function passedDays(accounts, state) {
    const out = new Map();
    for (const a of accounts || []) {
        if (a.kind === 'primary' || a.status !== 3 || !inScope(a, state)) continue;
        const end = a.finalizedAt || a.blockedAt;
        if (!end) continue;
        const k = T.dayKey(end, state.mode);
        out.set(k, (out.get(k) || 0) + 1);
    }
    return out;
}

export function monthCard(src) {
    const st = src.state, D = src.D, hide = !!src.hide;
    const month = src.month || st.month;
    const [y, m] = month.split('-').map(Number);
    const u = cardUnit(st, hide);
    const basis = st.basis;
    const rawWeeks = T.monthGrid(y, m);
    const mDays = new Map(), keysInMonth = [];
    for (const w of rawWeeks) for (const d of w.days) if (d.inMonth) { keysInMonth.push(d.key); const day = D.days.get(d.key); if (day) mDays.set(d.key, day); }
    let sat = false, sun = false;
    for (const w of rawWeeks) for (const d of w.days) if ((d.dow === 6 || d.dow === 0) && D.days.has(d.key)) { if (d.dow === 6) sat = true; else sun = true; }
    const cols = [1, 2, 3, 4, 5]; if (sat) cols.push(6); if (sun) cols.push(0);
    const list = [];
    for (const day of mDays.values()) for (const id of day.tradeIds) list.push(D.tradesById.get(id));
    const k = stats.kpis(list, D.kpiOpts({ days: mDays }));
    const monthEnd = keysInMonth[keysInMonth.length - 1];
    const entries = [], usdEntries = [];
    for (const [key, day] of D.days) if (key <= monthEnd) { entries.push({ key, value: stats.cellValue(day, u, basis) }); usdEntries.push({ key, value: stats.cellValue(day, 'usd', basis) }); }
    const scale = stats.scaleFromDays(entries, { asOf: monthEnd });
    /* Property of Astral (@ax4p). Better Vest 9.6.2. No copying without written permission. bv-b3e4cb88 */ const usdScale = u === 'usd' ? scale : stats.scaleFromDays(usdEntries, { asOf: monthEnd });
    let bestKey = null, bestV = 0;
    for (const [key, day] of mDays) { const v = basis === 'gross' ? day.gross : day.net; if (v > bestV) { bestV = v; bestKey = key; } }
    const passed = passedDays(src.accounts, st);
    const today = src.today || '9999-12-31';

    const cellOf = (d) => {
        const key = d.key, day = D.days.get(key), pay = D.payDays.get(key);
        const c = { key, label: d.inMonth ? String(+key.slice(8)) : T.fmtDate(key, 'dm'), labelShort: String(+key.slice(8)), inMonth: d.inMonth, future: key > today, empty: !day,
            text: '', meta: '', lvl: 0, sgn: '', flat: false, evalOnly: false, best: false, passed: d.inMonth && passed.has(key),
            pay: pay && pay.n ? pay.n : 0, payPending: !!(pay && !pay.n && pay.pending), v: null };
        if (!day) return c;
        const v = stats.cellValue(day, u, basis), usdV = stats.cellValue(day, 'usd', basis);
        let lvl = v != null ? stats.level(v, u === 'usd' ? usdScale : scale) : stats.level(usdV, usdScale);
        if (usdV === 0 && v === 0) lvl = 0;
        c.lvl = Math.abs(lvl);
        c.sgn = lvl > 0 ? 'p' : lvl < 0 ? 'n' : '';
        c.flat = !lvl;
        c.v = v;
        c.text = v == null ? '—' : unitText(v, u, hide, { ctx: 'cell', base: day.capitalBase });
        c.metaShort = cellMeta(day, st.line, hide, dayRisk(day, D.tradesById));
        c.meta = (isSliver(day, key, st.mode, D.tradesById) ? 'Sun 18–20 ET · ' : '') + c.metaShort;
        c.evalOnly = !!day.byPhase.eval.n && !(day.byPhase.funded.n + day.byPhase.instant.n + day.byPhase.primary.n);
        c.best = key === bestKey && c.lvl === 5;
        c.n = day.n; c.wins = day.wins; c.losses = day.losses;
        return c;
    };
    const weeks = rawWeeks.map((w) => {
        const vis = w.days.filter((d) => cols.includes(d.dow));
        const inDays = w.days.map((d) => D.days.get(d.key)).filter(Boolean);
        const sum = stats.sumDays(inDays);
        const us = stats.unitSum(inDays, u, basis);
        const sumV = basis === 'gross' ? sum.gross : sum.net;
        let text, meta, metaShort = '', sgn = '';
        if (!sum.days) { text = '—'; meta = 'no trades'; }
        else {
            text = u === 'usd' ? unitText(sumV, 'usd', hide) : unitText(us.v, u, hide);
            const wr = sum.winRate == null ? '—' : Math.round(sum.winRate * 100) + '%';
            meta = `${sum.days}d · ${sum.n}t · ${wr}`;
            metaShort = `${sum.n}t · ${wr}`;
            sgn = sgnOf(u === 'usd' ? sumV : us.v);
        }
        return { label: w.label, days: vis.map(cellOf), text, meta, metaShort, sgn, zero: !sum.days };
    });

    const sum = stats.unitSum([...mDays.values()], u, basis);
    const hero = sum.v == null ? { text: mDays.size ? '—' : (u === 'usd' ? '$0' : '0'), sgn: '' } : heroOf(sum.v, u, hide);
    let payNet = 0, payN = 0, payPending = 0, payPendingN = 0;
    for (const key of keysInMonth) {
        const p = D.payDays.get(key);
        if (p) { payNet += p.net; payN += p.n; payPending += p.pending; payPendingN += p.items.filter((x) => x.status === 'PROCESSING').length; }
    }
    let ledger = null;
    const sp = D.spent;
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.6.2. bv-07f7f83a */ if (sp && sp.shows === 'show' && !hide) {
        const spM = spendIn(sp.days, keysInMonth);
        const netM = spendNet(payNet, spM.c), netA = spendNet(sp.paidAll, sp.all.c);
        const usd = (v, sign) => T.fmtUsd(v, { sign });
        ledger = { head: T.fmtMonth(month, { short: true }), rows: [
            ['Spent', usd(spM.c / 100, false), usd(sp.all.c / 100, false), '', ''],
            ['Paid out', usd(payNet, false), usd(sp.paidAll, false), 'gold', 'gold'],
            ['Net', usd(netM, true), usd(netA, true), sgnOf(netM), sgnOf(netA)]] };
    }
    let bd = null, wd = null;
    for (const [key, day] of mDays) {
        const v = stats.cellValue(day, u, basis);
        if (v == null) continue;
        if (!bd || v > bd.v) bd = { key, v };
        if (!wd || v < wd.v) wd = { key, v };
    }
    const dayOf = (x) => (x ? { text: u === 'pts' ? T.fmtPts(x.v, { dp: 1 }) : unitText(x.v, u, hide, { ctx: 'table', base: mDays.get(x.key).capitalBase }), date: T.fmtDate(x.key, 'dm'), sgn: sgnOf(x.v) } : null);
    const wl = k.winRate.parts; /* @license Better Vest 9.6.2. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-327be501 */
    return {
        kind: 'month', key: month, title: T.fmtMonth(month), unit: u, hide, basis: basis === 'gross' ? 'Gross' : 'Net',
        account: accountLabel(st, src.accounts, hide), handle: cleanHandle(src.handle),
        cols, weeks, hero, n: k.net.n, days: mDays.size,
        winRate: rate(k.winRate.value), wins: wl.wins, losses: wl.losses,
        order: weeks.flatMap((w) => w.days).filter((c) => !c.empty).sort((a, b) => (a.key < b.key ? -1 : 1)).map((c) => c.key),
        heroValue: sum.v, heroUnit: u,
        payouts: payN || payPending ? { n: payN, text: hide ? null : T.fmtUsd(payNet, { sign: false }), pending: payPending ? (hide ? 'processing' : T.fmtUsd(payPending, { sign: false }) + ' pending') : '',
            pendingAmt: payPending && !hide ? T.fmtUsd(payPending, { sign: false }) : null, pendingN: payPendingN } : null,
        ledger, bestDay: dayOf(bd), worstDay: dayOf(wd),
        passed: [...passed.keys()].filter((key) => key.startsWith(month)).length,
        empty: !mDays.size
    };
}


export function dayEvents(key, D, state, accounts, hide) {
    const out = [];
    const pay = D.payDays.get(key);
    for (const p of pay ? pay.items : []) {
        if (p.status !== 'EXECUTED' && p.status !== 'PROCESSING') continue;
        const verb = p.status === 'EXECUTED' ? 'Payout executed' : 'Payout requested · processing';
        const amt = T.fmtUsd(p.net, { sign: false });
        out.push({ kind: 'payout', text: hide ? verb : `${verb} · ${amt} net`, short: p.status === 'EXECUTED' ? (hide ? 'Paid out' : 'Paid out ' + amt) : 'Payout processing', sub: '' });
    }
    for (const a of accounts || []) {
        if (a.kind === 'primary' || !inScope(a, state)) continue;
        const sub = (accountName(a).split(' · ')[1] || '').trim();
        if (a.createdAt && T.dayKey(a.createdAt, state.mode) === key) out.push({ kind: 'start', text: `Started ${a.phase === 'eval' ? 'evaluation' : a.phase === 'instant' ? 'instant account' : 'funded account'}`, short: 'Started', sub });
        const end = a.finalizedAt || a.blockedAt;
        if (end && T.dayKey(end, state.mode) === key) {
            const text = a.status === 3 ? 'Passed evaluation' : a.status === 6 ? 'Claimed' : a.status === 7 ? 'Blocked'
                : a.status === 4 || a.status === 5 ? 'Closed · ' + String(a.statusName || '').replace(/^Failed:?\s*/, '').replace(/[()]/g, '') : 'Closed';
            out.push({ kind: a.status === 3 ? 'passed' : 'end', text, short: a.status === 3 ? 'Passed' : text.split(' · ')[0], sub });
        }
    }
    return out;
}

export function dayCard(src) {
    const st = src.state, D = src.D, hide = !!src.hide, key = src.key;
    const day = D.days.get(key);
    const gross = st.basis === 'gross';
    const list = day ? day.tradeIds.map((id) => D.tradesById.get(id)).sort((a, b) => a.closeTs - b.closeTs || (a.id < b.id ? -1 : 1)) : [];
    const opts = D.kpiOpts({ days: day ? new Map([[key, day]]) : new Map() });
    const k = list.length ? stats.kpis(list, opts) : null;
    const base = day ? day.capitalBase : 0;
    const netV = day ? (gross ? day.gross : day.net) : 0;
    let hero;
    if (!hide) hero = heroOf(netV, 'usd', false);
    else if (base > 0) hero = heroOf(netV / base, 'pct', true);
    else if (day && day.rN) hero = heroOf(day.rSum, 'r', true);
    else if (day && day.pointsN && day.symbols.size <= 1) hero = heroOf(day.points, 'pts', true);
    else hero = { text: '—', sgn: '' };
    const money = (v, sign = true) => moneyText(v, hide, { base, sign });
    const trades = list.map((t) => {
        const v = gross ? t.gross : t.net;
        return {
            ts: t.closeTs, time: T.fmtTimeET(t.closeTs), side: t.side === 'long' ? 'L' : 'S', long: t.side === 'long', /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-176b5f3c */
            size: String(t.qty), sym: String(t.display || t.symbol || '').replace('-PERP', ''),
            pts: t.points == null ? '—' : T.fmtPts(t.points, { dp: 2, unit: false }), ptsSgn: sgnOf(t.points),
            net: hide ? null : T.fmtUsd(v), netSgn: sgnOf(v),
            r: t.rMult == null ? '—' : T.fmtR(t.rMult), rSgn: sgnOf(t.rMult),
            cls: stats.classify(t, opts.rule, opts.symbolsMap, st.basis), v
        };
    });
    const pts = stats.equityCurve(list, st.basis).map((p) => ({ ts: p.ts, cum: p.cum, net: p.net }));
    const w = T.dayWindow(key, st.mode);
    const [yy, mm, dd] = key.split('-').map(Number);
    let curve = null;
    if (pts.length) {
        const dom = stepDomain(pts, w.start, w.end);
        const yText = (v) => { const s = money(v); return s == null ? '' : s; };
        curve = { points: pts, t0: dom.t0, t1: dom.t1, lo: dom.lo, hi: dom.hi, start: w.start, end: w.end,
            rth: { start: T.etWallToUtc(yy, mm, dd, 9, 30), end: T.etWallToUtc(yy, mm, dd, 16, 0) },
            resetLabel: { vest: '20:00 ET', cme: '18:00 ET', et: '00:00 ET', local: 'midnight' }[st.mode] || '20:00 ET',
            peak: dom.peak > 0 ? yText(dom.peak) : '', trough: dom.trough < 0 ? yText(dom.trough) : '',
            axis: [T.fmtTimeET(dom.t0, { seconds: false }), dom.t1 - dom.t0 > 3 * 36e5 ? T.fmtTimeET(Math.round((dom.t0 + dom.t1) / 2 / 36e5) * 36e5, { seconds: false }) : '', T.fmtTimeET(dom.t1, { seconds: false })] };
    }
    const wins = day ? day.wins : 0, losses = day ? day.losses : 0;
    const pfV = k ? k.profitFactor.value : null, rrV = k ? k.plannedRR.value : null, arV = k ? k.avgR.value : null;
    const best = day ? money(day.best) : null, worst = day ? money(day.worst) : null;
    return {
        kind: 'day', key, title: T.fmtDate(key, 'long'), mode: T.DAY_MODES[st.mode] ? T.DAY_MODES[st.mode].label : '', hide, basis: gross ? 'Gross' : 'Net',
        account: accountLabel(st, src.accounts, hide), handle: cleanHandle(src.handle),
        hero, heroValue: hide ? null : netV, n: list.length, accounts: day ? day.accounts.size : 0,
        wins, losses, scratch: day ? day.scratch : 0, winRate: k ? rate(k.winRate.value) : '—',
        best, worst, bestSgn: day ? sgnOf(day.best) : '', worstSgn: day ? sgnOf(day.worst) : '',
        pf: pfV == null ? '—' : T.fmtNum(pfV), pfSub: pfV == null && list.length < 5 ? 'needs 5+ trades' : '',
        rr: rrV == null ? '—' : T.fmtR(rrV, { sign: false }), rrSub: arV == null ? 'no realized R' : `avg ${T.fmtR(arV)}`,
        trades, curve, events: dayEvents(key, D, st, src.accounts, hide), empty: !list.length
    };
}

export function cardFileBase(card, format) {
    return 'better-vest-calendar-' + card.key + (format === 'story' ? '-story' : format === 'square' ? '-square' : '');
}

export function cardWords(card) {
    const out = [card.title, card.account, card.handle, card.basis, card.mode];
    const h = card.hero || {};
    if (h.parts) out.push(h.parts.sign + h.parts.cur + h.parts.int + h.parts.cents); else out.push(h.text);
    if (card.kind === 'month') {
        out.push(card.winRate);
        for (const w of card.weeks) { out.push(w.label, w.text, w.meta); for (const c of w.days) out.push(c.label, c.text, c.meta); }
        if (card.payouts) out.push(card.payouts.text, card.payouts.pending);
        for (const d of [card.bestDay, card.worstDay]) if (d) out.push(d.text, d.date);
        if (card.ledger) for (const r of card.ledger.rows) out.push(...r.slice(0, 3)); /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-6dbab754 */
    } else {
        out.push(card.winRate, card.best, card.worst, card.pf, card.pfSub, card.rr, card.rrSub);
        for (const t of card.trades) out.push(t.time, t.side, t.size, t.sym, t.pts, t.net, t.r);
        if (card.curve) out.push(card.curve.peak, card.curve.trough, ...card.curve.axis);
        for (const e of card.events) out.push(e.text, e.sub);
    }
    return out.filter((s) => s != null && s !== '').map(String);
}

