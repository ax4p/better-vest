// Better Vest P&L card: the look you chose, remembered on this computer (the share page's own storage, `bvSharePrefs`). Shared by the share
// page (cert/share.html) and the card that pops up on Vest's page after a big close (cert/pop.html), so both draw the same card. Pure apart
// from the storage object it is handed; everything read back is made safe here.

import { ROWS } from './share-summary.js';
import { chartOpts, CHART_DEFAULTS } from './share-card.js';
import { copyGroup } from './share-model.js';
import { bgOpts, accentOpt, BG_DEFAULTS } from './share-look.js';
import { PAY_KINDS } from './share-payout.js';

export const PREFS_KEY = 'bvSharePrefs';
export const KINDS = ['summary', 'replay', 'payout'];

// every option's default is 8.1.5's card (the owner: "don't touch the design")
export const DEFAULT_PREFS = { kind: 'summary', style: 'vest', theme: 'dark', format: 'feed', hero: 'usd', handle: '',
    list: { on: true, green: false, mask: true }, show: { date: true, accounts: true, pct: false, market: true, handle: true, credit: true,
        trades: false, winrate: false, best: false, worst: false, fees: false,
        // 9.0, the Payout card: the lifetime total under today's, the biggest and the first under the lifetime's
        paytotal: true, paybest: true },
    // 8.2
    rows: 'accounts', period: 'today', afterFees: true,
    rp: { labels: 'usd', prices: false, pnl: false, sessions: false, best: false },
    // 8.2 round 2: the Replay's chart (share-card.js chartOpts); the defaults are 8.1.5's chart
    chart: Object.assign({}, CHART_DEFAULTS),
    // 9.0: the Payout card's day (today or lifetime), the card's own background and its accent (share-look.js)
    pay: 'today', bg: Object.assign({}, BG_DEFAULTS), accent: '' };

// what was stored, merged over the defaults and made safe
export function cleanPrefs(p) {
    const o = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    const merged = Object.assign({}, DEFAULT_PREFS, o);
    for (const k of ['list', 'show', 'rp']) merged[k] = Object.assign({}, DEFAULT_PREFS[k], o[k] && typeof o[k] === 'object' ? o[k] : {});
    if (!ROWS.includes(merged.rows)) merged.rows = 'accounts';
    if (!['today', 'yesterday', 'week', 'month'].includes(merged.period)) merged.period = 'today';
    // 8.2's removed Payouts kind (and anything unknown) comes back as the Summary; 9.0's Payout card is a kind of its own
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
}
// the choices kept (a picked day belongs to one session: Period comes back as Today next time)
export function prefsToSave(P) {
    const { kind, style, theme, format, hero, handle, list, show, rows, afterFees, rp, chart, pay, bg, accent } = P;
    const period = P.period === 'day' ? 'today' : P.period;
    return { kind, style, theme, format, hero, handle, list, show, rows, period, afterFees, rp, chart, pay, bg, accent };
}
export function savePrefs(storage, P) {
    try { storage.setItem(PREFS_KEY, JSON.stringify(prefsToSave(P))); } catch (e) {}
}

// Who is on the card for a new snapshot: the copy group while the copier copies, else one account (`prefer` when its P&L is known, else
// the account you trade on, else the first known)
export function snapPicks(snap, prefer) {
    const group = copyGroup(snap);
    if (snap.copying && group.length > 1) return { mode: 'copy', picked: group };
    const known = snap.accounts.filter((a) => a.pnl != null);
    const first = (prefer && known.find((a) => a.id === prefer)) || snap.accounts.find((a) => a.id === snap.activeId && a.pnl != null) || known[0];
    return { mode: 'accounts', picked: first ? [first.id] : [] };
}

// What the card that pops up after a big close needs read from Vest besides today's P&L (src/copy/35-share.js reads only that): the Replay's
// trades and candles when your card is the Replay, today's trades when it is a Summary of markets, trades, sessions or groups. A Payout card
// is the share page's own: the pop-up shows the Summary.
export function popNeed(p) {
    const kind = p && p.kind === 'replay' ? 'replay' : 'summary';
    return { replay: kind === 'replay', trades: kind === 'summary' && !!p && p.rows !== 'accounts' && ROWS.includes(p.rows) };
}
