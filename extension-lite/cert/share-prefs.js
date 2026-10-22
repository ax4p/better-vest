/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { ROWS } from './share-summary.js';
import { chartOpts, CHART_DEFAULTS } from './share-card.js';
import { copyGroup } from './share-model.js';
import { bgOpts, accentOpt, BG_DEFAULTS } from './share-look.js';
import { PAY_KINDS } from './share-payout.js';

export const PREFS_KEY = 'bvSharePrefs';
export const KINDS = ['summary', 'replay', 'payout'];

export const DEFAULT_PREFS = { kind: 'summary', style: 'vest', theme: 'dark', format: 'feed', hero: 'usd', handle: '',
    list: { on: true, green: false, mask: true }, show: { date: true, accounts: true, pct: false, market: true, handle: true, credit: true,
        trades: false, winrate: false, best: false, worst: false, fees: false,
        paytotal: true, paybest: true },
    rows: 'accounts', period: 'today', afterFees: true,
    rp: { labels: 'usd', prices: false, pnl: false, sessions: false, best: false },
    chart: Object.assign({}, CHART_DEFAULTS),
    pay: 'today', bg: Object.assign({}, BG_DEFAULTS), accent: '' };

export function cleanPrefs(p) {
    const o = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    const merged = Object.assign({}, DEFAULT_PREFS, o); /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-d51871dd */
    for (const k of ['list', 'show', 'rp']) merged[k] = Object.assign({}, DEFAULT_PREFS[k], o[k] && typeof o[k] === 'object' ? o[k] : {});
    if (!ROWS.includes(merged.rows)) merged.rows = 'accounts';
    if (!['today', 'yesterday', 'week', 'month'].includes(merged.period)) merged.period = 'today';
    if (!KINDS.includes(merged.kind)) merged.kind = 'summary';
    if (!['usd', 'pct', 'both', 'pts'].includes(merged.hero)) merged.hero = 'usd';
    if (!['vest', 'silver', 'oled', 'neon'].includes(merged.style)) merged.style = 'vest';
    if (!['dark', 'light'].includes(merged.theme)) merged.theme = 'dark';
    if (!['feed', 'square', 'wide', 'story'].includes(merged.format)) merged.format = 'feed';
    merged.handle = typeof merged.handle === 'string' ? merged.handle.slice(0, 32) : '';
    merged.chart = chartOpts(o.chart);
    if (!PAY_KINDS.includes(merged.pay)) merged.pay = 'today';
    merged.bg = bgOpts(o.bg);
    merged.accent = accentOpt(o.accent);
    return merged;
}
export function loadPrefs(storage) {
    let p = null;
    try { p = JSON.parse((storage && storage.getItem(PREFS_KEY)) || 'null'); } catch (e) {}
    return cleanPrefs(p);
/*! Owned by Astral (@ax4p): Better Vest lite 9.2.6. Licence: LICENSE, not open source. bv-aa13cab2 */ }
export function prefsToSave(P) {
    const { kind, style, theme, format, hero, handle, list, show, rows, afterFees, rp, chart, pay, bg, accent } = P;
    const period = P.period === 'day' ? 'today' : P.period;
    return { kind, style, theme, format, hero, handle, list, show, rows, period, afterFees, rp, chart, pay, bg, accent };
}
export function savePrefs(storage, P) {
    try { storage.setItem(PREFS_KEY, JSON.stringify(prefsToSave(P))); } catch (e) {}
}

export function snapPicks(snap, prefer) {
    const group = copyGroup(snap);
    if (snap.copying && group.length > 1) return { mode: 'copy', picked: group };
    const known = snap.accounts.filter((a) => a.pnl != null);
    const first = (prefer && known.find((a) => a.id === prefer)) || snap.accounts.find((a) => a.id === snap.activeId && a.pnl != null) || known[0];
    return { mode: 'accounts', picked: first ? [first.id] : [] };
}

export function popNeed(p) {
    const kind = p && p.kind === 'replay' ? 'replay' : 'summary';
    return { replay: kind === 'replay', trades: kind === 'summary' && !!p && p.rows !== 'accounts' && ROWS.includes(p.rows) };
}
