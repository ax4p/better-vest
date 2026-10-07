// Better Vest share poster: the card, as one HTML string styled only by cert/share-card.css. The same design as docs/pnl-cards/poster.html
// (the owner's pick, 2026-10-06): the P&L first, Vest's logo and name as the firm's watermark, the accounts as a list (copy trading: the
// whole group, each account a row), dark or light, four styles, four formats. The only credit is "Made with Better Vest by Astral".

import { cardRows, maskName, dayLong, money, cleanColor } from './share-model.js';
import { replayModel, replayGeom, hhmm, tzShort, replayPick, replayTf, heikinAshi, tfLabel } from './share-replay.js';
import { sessionOf, SESSIONS, todayTrades, snapGroups, mktName } from './share-summary.js';

// Vest's wordmark (its mark and name, from Vest's own page), as on Vest's own position share card
export const VEST_SVG = '<svg class="vestmark" viewBox="0 0 60 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Vest"><path d="M32.02 2.45H30.73C30.67 2.45 30.63 2.48 30.61 2.53L28.03 9.79L25.45 2.53C25.43 2.48 25.38 2.45 25.33 2.45H24.05C23.96 2.45 23.9 2.53 23.93 2.62L27.25 11.74H28.82L32.14 2.62C32.17 2.53 32.11 2.45 32.02 2.45H32.02Z" fill="currentColor"/><path d="M40.24 2.83C39.58 2.4 38.79 2.19 37.85 2.19C36.91 2.19 36.16 2.39 35.49 2.79C34.82 3.2 34.3 3.77 33.92 4.52C33.55 5.26 33.36 6.14 33.36 7.15C33.36 8.17 33.55 8.97 33.93 9.7C34.31 10.42 34.84 10.99 35.52 11.39C36.21 11.8 37 12 37.92 12C38.83 12 39.64 11.78 40.36 11.32C41.09 10.87 41.83 10.04 42.12 8.98L40.49 8.98C40.23 9.47 39.89 9.86 39.45 10.12C39 10.4 38.46 10.55 37.85 10.55C36.93 10.55 36.23 10.24 35.74 9.64C35.31 9.12 35.07 8.41 35.01 7.52H42.15C42.2 6.42 42.06 5.47 41.73 4.67C41.39 3.88 40.9 3.26 40.24 2.83ZM35.04 6.29C35.13 5.54 35.36 4.93 35.74 4.48C36.23 3.87 36.95 3.56 37.9 3.56C38.79 3.56 39.45 3.85 39.9 4.41C40.26 4.86 40.48 5.49 40.56 6.29H35.04Z" fill="currentColor"/><path d="M46.43 3.87C46.8 3.64 47.29 3.53 47.9 3.56C48.54 3.57 49.06 3.72 49.46 4.01C49.87 4.3 50.11 4.69 50.18 5.19H51.79C51.74 4.5 51.49 3.88 51.15 3.47C50.8 3.06 50.35 2.75 49.8 2.52C49.24 2.3 48.61 2.19 47.9 2.19C47.19 2.19 46.56 2.3 46.02 2.52C45.48 2.75 45.07 3.06 44.77 3.47C44.47 3.88 44.32 4.36 44.32 4.91C44.32 5.35 44.42 5.72 44.62 6.03C44.82 6.34 45.16 6.62 45.63 6.85C46.1 7.09 46.75 7.31 47.57 7.53C48.33 7.73 48.9 7.91 49.27 8.05C49.65 8.19 49.9 8.35 50.02 8.51C50.14 8.67 50.2 8.89 50.2 9.15C50.2 9.6 50.02 9.96 49.66 10.23C49.29 10.49 48.79 10.62 48.16 10.62C47.48 10.62 46.92 10.48 46.47 10.18C46.01 9.88 45.72 9.48 45.6 8.98H43.99C44.12 10.03 44.62 10.78 45.33 11.26C46.04 11.75 46.95 11.99 48.06 11.99C49.17 11.99 50.13 11.73 50.8 11.22C51.46 10.71 51.79 10 51.79 9.11C51.79 8.63 51.69 8.22 51.49 7.89C51.28 7.56 50.95 7.27 50.47 7.03C50 6.78 49.35 6.56 48.53 6.35C47.8 6.17 47.24 6.01 46.86 5.86C46.48 5.72 46.22 5.57 46.07 5.41C45.93 5.25 45.86 5.05 45.86 4.83C45.86 4.43 46.05 4.11 46.43 3.87Z" fill="currentColor"/><path d="M56.77 3.71H59.58V2.45H56.77V0.13C56.77 0.02 56.64 -0.04 56.56 0.03L55.28 1.05C55.25 1.08 55.23 1.11 55.23 1.15V2.45H53.34V3.71H55.23V9.23C55.23 11.52 56.89 11.74 57.99 11.74H59.58V10.42H57.97C57.41 10.42 56.77 10.19 56.77 9.14V3.71Z" fill="currentColor"/><path d="M4.49 0.09L0.05 3.64C-0.02 3.69 -0.02 3.79 0.05 3.84L9.39 11.3C9.44 11.33 9.5 11.33 9.55 11.3L18.89 3.84C18.96 3.79 18.96 3.69 18.89 3.64L14.45 0.09C14.37 0.02 14.24 0.08 14.24 0.19V11.61C14.24 11.68 14.19 11.74 14.12 11.74H4.82C4.75 11.74 4.7 11.68 4.7 11.61V0.19C4.7 0.08 4.57 0.02 4.49 0.09Z" fill="currentColor"/></svg>';

// CSS size of each format; the PNG is twice that (1080 x 1350, 1080 x 1080, 1920 x 1080, 1080 x 1920)
export const CARD_SIZES = { feed: [540, 675], square: [540, 540], wide: [960, 540], story: [540, 960] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const big = (v) => { const m = money(v); const i = m.lastIndexOf('.'); return `${m.slice(0, i)}<small>${m.slice(i)}</small>`; };
const pct = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + '%';
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
// points (8.2): "+53.75 pt", "−1,203 pt"; the big number keeps its decimals small, like the cents
export function fmtPts(v, unit = true) {
    const a = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return (v < 0 ? '−' : '+') + a + (unit ? ' pt' : '');
}
// the sum of some trades' points, or null when one is unknown (the card then keeps the amount)
function ptsSum(list) {
    let s = 0;
    for (const v of list) { if (!Number.isFinite(v)) return null; s += v; }
    return Math.round(s * 100) / 100;
}
const bigPts = (v) => { const m = fmtPts(v, false); const i = m.indexOf('.'); return i < 0 ? `${m}<small> pt</small>` : `${m.slice(0, i)}<small>${m.slice(i)} pt</small>`; };

// snap: a cleaned snapshot; p: the choices { mode, picked, style, theme, format, hero, list: { on, green, mask }, show: {...}, handle };
// maxRows: how many account rows the panel may hold (the page finds the most that fit). Returns { html, n } (n: the accounts on the card).
// M (8.2, optional): the Summary model (share-summary.js summaryModel) whose rows the card lists; without it the card is 8.1.5's (cardRows).
const MKT_NAMES = { NQ: 'Nasdaq 100', ES: 'S&P 500', BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XAU: 'Gold', MNQ: 'Micro Nasdaq' };
const MKT_COLORS = ['#2463EB', '#7C3AED', '#D97706', '#0D9488', '#DB2777', '#0891B2', '#65A30D'];
const mktColor = (k) => MKT_COLORS[[...String(k)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % MKT_COLORS.length];
const PERIOD_CHIP = { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month' };
const etHm = (ms) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)); } catch (e) { return ''; } };
export function cardHtml(snap, p, maxRows, M) {
    const R = M || cardRows(snap, { mode: p.mode, picked: p.picked, greenOnly: !!(p.list && p.list.green) });
    const kind = (M && M.kind) || 'accounts';
    const f = CARD_SIZES[p.format] ? p.format : 'feed';
    const rows = R.rows, n = R.n, total = R.total;
    const listed = !!(p.list && p.list.on) && (n > 1 || (kind !== 'accounts' && n > 0));
    const copy = p.mode === 'copy';
    const heroPx = listed ? { feed: 60, square: 54, wide: 74, story: 72 }[f] : { feed: 76, square: 70, wide: 92, story: 84 }[f];
    const vestW = { feed: 92, square: 88, wide: 100, story: 106 }[f];
    const show = p.show || {};
    const mk = (r) => esc(p.list && p.list.mask ? maskName(r.name) : r.name);
    const what = copy ? 'copy traded account' : 'account';
    const range = M && M.range;
    const nAcc = M ? new Set((M.trades || []).map((t) => t.accountId)).size : 0;
    const plural = (k, w) => `<b>${k}</b> ${w}${k === 1 ? '' : 's'}`;
    let acctLine = '';
    if (show.accounts && n) {
        if (kind === 'markets') acctLine = `Across ${plural(n, 'market')} on ${plural(nAcc, 'account')}`;
        else if (kind === 'groups') acctLine = `Across ${plural(n, 'copy group')}`;
        else if (kind === 'trades') acctLine = `${plural(n, 'trade')} on ${plural(nAcc, 'account')}`;
        else if (kind === 'sessions') acctLine = `${plural(M.trades.length, 'trade')} in ${plural(n, 'session')}`;
        else acctLine = copy || n > 1 ? `Across <b>${n}</b> ${what}${n === 1 ? '' : 's'}` : mk(rows[0]);
    }
    // points (8.2): only when everything on the card is one market (else the amount stays, and the rows give each market's points)
    const pts = p.hero === 'pts' && M ? M.ptsTotal : null;
    const ptsOn = p.hero === 'pts' && !!M;
    const heroTxt = pts != null ? bigPts(pts) : p.hero === 'pct' && R.ret != null ? pct(R.ret) : big(total);
    // $ and % (8.2): the return beside the amount, smaller
    const heroPct = p.hero === 'both' && R.ret != null ? `<span class="hpct">${pct(R.ret)}</span>` : '';
    // several markets: the amount stays big, and the line under it gives each market's own points
    const byMkt = ptsOn && M.ptsMixed ? (M.ptsByMarket || []) : [];
    const mixTxt = byMkt.slice(0, 3).map((x) => `<span class="${x.pts != null ? cls(x.pts) : ''}">${esc(x.market)} ${x.pts != null ? fmtPts(x.pts) : '–'}</span>`).join(' · ') + (byMkt.length > 3 ? ` · +${byMkt.length - 3} more` : '');
    const secTxt = ptsOn ? (pts != null ? (show.pct ? money(total) : '') : byMkt.length ? mixTxt : n ? 'No points for some trades' : '')
        : show.pct && R.ret != null && p.hero !== 'both' ? (p.hero === 'pct' ? money(total) : pct(R.ret)) : '';
    const cols = !!show.trades && kind !== 'trades';
    let panel = '';
    if (listed) {
        const max = n <= maxRows ? n : Math.max(1, maxRows - 1);
        const green = p.list.green;
        const title = kind === 'markets' ? (green ? 'Green markets' : 'All markets') : kind === 'groups' ? (green ? 'Green copy groups' : 'Copy groups')
            : kind === 'trades' ? (green ? 'Green trades' : 'Trades') : kind === 'sessions' ? 'Sessions'
            : copy ? (green ? 'Green copy traded accounts' : 'All copy traded accounts') : (green ? 'Green accounts' : 'Accounts');
        let chip = '';
        if (kind === 'accounts') chip = show.market && snap.market ? `<span class="mkt"><span>${esc(snap.market.slice(0, 3))}</span>${esc(snap.market)}</span>` : '';
        else if (range) chip = `<span class="pchip">${esc(PERIOD_CHIP[range.kind] || range.label)}</span>`;
        const headL = { markets: 'MARKET', groups: 'GROUP', trades: 'TRADE · ET', sessions: 'SESSION · ET' }[kind] || 'ACCOUNT';
        const headR = ptsOn ? 'POINTS' : range ? esc(range.head) : 'DAY P&amp;L';
        const th = cols ? `<div class="th"><span>${headL}</span><span class="thr"><span class="tn">TRADES</span><span>${headR}</span></span></div>`
            : `<div class="th"><span>${headL}</span><span>${headR}</span></div>`;
        const name = (r) => {
            if (kind === 'markets') return `<span class="mk" style="background:${mktColor(r.name)}">${esc(r.name.slice(0, 3))}</span>${esc(MKT_NAMES[r.name] || r.name)}`;
            if (kind === 'groups') return `${esc(r.name)}${r.sub ? `<span class="gs">${esc(p.list && p.list.mask ? maskName(r.sub) : r.sub)}${r.accounts > 1 ? ' +' + (r.accounts - 1) : ''}</span>` : ''}`;
            if (kind === 'trades') return `<span class="tm">${esc(etHm(r.when))}</span>${esc(r.name)}${r.acct ? `<span class="gs">${esc(p.list && p.list.mask ? maskName(r.acct) : r.acct)}</span>` : ''}`;
            if (kind === 'sessions') return `${esc(r.name)}<span class="gs">${r.n} trade${r.n === 1 ? '' : 's'}</span>`;
            return `${mk(r)}${r.leader ? '<span class="lead">LEAD</span>' : ''}`;
        };
        const one = (r) => (!ptsOn ? `<b class="${cls(r.pnl)}">${money(r.pnl, false)}</b>` : r.pts != null ? `<b class="${cls(r.pts)}">${fmtPts(r.pts)}</b>` : `<b class="mx">${r.ptsMixed ? 'mixed' : '–'}</b>`);
        const val = (r) => cols ? `<span class="thr"><span class="tn">${r.n == null ? '–' : r.n}</span>${one(r)}</span>` : one(r);
        const more = { markets: 'market', groups: 'copy group', trades: 'trade', sessions: 'session' }[kind] || 'account';
        panel = `<div class="panel"><div class="ph"><b>${title}</b>${chip}</div>${th}`
            + `<div class="rows">${rows.slice(0, max).map((r) => `<div class="r"><span class="nm">${name(r)}</span>${val(r)}</div>`).join('')}</div>`
            + (n > max ? `<div class="more">+${n - max} more ${more}${n - max === 1 ? '' : 's'}</div>` : '') + '</div>';
    }
    // the extras (8.2): one line of the trades' numbers, each item a choice in Show
    let extras = '';
    if (M && (show.winrate || show.best || show.fees || show.worst || (show.trades && kind === 'trades')) && M.stats.count) {
        const st = M.stats, bits = [];
        if (show.trades) bits.push(`<b>${st.count}</b> trade${st.count === 1 ? '' : 's'}`);
        if (show.winrate && st.winRate != null) bits.push(`<b>${Math.round(st.winRate * 100)}%</b> won`);
        if (show.best && st.best != null) bits.push(`best <b class="${cls(st.best)}">${money(st.best)}</b>`);
        if (show.worst && st.worst != null) bits.push(`biggest loss <b class="${cls(st.worst)}">${money(st.worst)}</b>`);
        if (show.fees) bits.push(`fees <b>${money(st.fees, false)}</b>`);
        if (bits.length) extras = `<div class="xs">${bits.join(' · ')}</div>`;
    }
    const badge = copy ? '<span class="badge"><i></i>Copy trading</span>' : '';
    // numbers that are not a real account's (the copy trader's demo, a showcase) say so on the card itself
    const sample = snap.demo ? '<span class="badge sample">Sample</span>' : '';
    const dayTxt = range && range.label ? range.label : dayLong(snap.day);
    const date = show.date && snap.day ? `<span class="date">${esc(dayTxt)}</span>` : '';
    const name = show.handle && String(p.handle || '').trim() ? `<div class="handle">${esc(String(p.handle).trim().slice(0, 32))}</div>` : '<div></div>';
    const credit = show.credit ? '<div class="credit">Made with Better Vest by Astral</div>' : '';
    const foot = name !== '<div></div>' || credit ? `<div class="ft">${name}${credit}</div>` : '';
    const lbl0 = copy || kind === 'groups' ? 'Total profit' : range ? esc(range.heroLbl) : 'Day P&amp;L';
    const lbl = pts != null ? (copy || kind === 'groups' ? 'Total points' : lbl0.replace('P&amp;L', 'points')) + (M.ptsMarket ? ' · ' + esc(M.ptsMarket) : '') : lbl0;
    const heroVal = pts != null ? pts : total;
    const hero = `<div class="hero"><div class="lbl">${lbl}</div>`
        + `<div class="amt ${p.style === 'vest' || p.style === 'oled' ? cls(heroVal) : ''}" style="font-size:${heroPx}px">${n ? heroTxt + heroPct : '—'}</div>`
        + (secTxt ? `<div class="sec ${ptsOn && pts == null ? (byMkt.length ? 'pm' : '') : cls(total)}">${secTxt}</div>` : '') + (acctLine ? `<div class="sub">${acctLine}</div>` : '') + '<div class="rule"></div></div>';
    const split = listed && f === 'wide';
    const style = ['vest', 'silver', 'oled', 'neon'].includes(p.style) ? p.style : 'vest';
    const html = `<div class="card ${f} s-${style}${p.theme === 'light' ? ' light' : ''}${heroVal < 0 ? ' red' : ''}"><div class="bgx"></div><div class="in">`
        + `<div class="hd"><span class="vest" style="width:${vestW}px">${VEST_SVG}</span><div class="chips">${sample}${badge}${date}</div></div>`
        + `<div class="body${listed ? ' listed' : ''}${split ? ' split' : ''}">${hero}${panel}</div>${extras}${foot}</div></div>`;
    return { html, n, unknown: R.unknown };
}

// ---------------------------------------------------------------- Replay (design 05): the day's trades on Vest's own candles

// the chart's size on each format (CSS px; the PNG is twice that), as tall as the card allows. Your name in the footer takes a line off
// it, and so does the % line in the hero on the upright formats (on 16:9 it sits beside the amount). Fixed numbers, so what the tests
// measure is what the card draws.
export const REPLAY_CHART = { feed: [472, 426], square: [472, 296], wide: [880, 326], story: [464, 664] };
export function replayChartSize(format, o) {
    const f = REPLAY_CHART[format] ? format : 'feed';
    const [w, h] = REPLAY_CHART[f];
    return [w, h - (o && o.handle ? 20 : 0) - (o && o.sec && f !== 'wide' ? 30 : 0)];
}
const AXIS_W = 64, TIME_H = 22, TOP = 8;

// ---- the Replay's chart options (8.2 round 2, the owner: "customization of chart to maybe match user candle colors, custom time frame") ----
// Every default is 8.1.5's chart, to the character (tests/share/golden.test.mjs).
export const CHART_DEFAULTS = { colors: 'vest', up: '', down: '', type: 'candles', tf: 0, grid: true, price: true, time: true, zones: true, lines: true, marks: 'arrows', volume: false };
export const CHART_TYPES = ['candles', 'hollow', 'bars', 'line', 'area', 'ha'];
export const CHART_MARKS = ['arrows', 'dots', 'off'];
// the colour presets: [up, down]; Mono follows the card's own text colours, so it reads on dark and light
export const CHART_PRESETS = { classic: ['#26a69a', '#ef5350'], mono: ['var(--k-text)', 'var(--k-dim)'], neon: ['#00f15b', '#ff2e63'], bo: ['#2962ff', '#ff9800'] };
// the options made safe (they come from this computer's own storage)
export function chartOpts(c) {
    const o = Object.assign({}, CHART_DEFAULTS);
    if (!c || typeof c !== 'object') return o;
    if (['vest', 'classic', 'mono', 'neon', 'bo', 'mine', 'custom'].includes(c.colors)) o.colors = c.colors;
    o.up = cleanColor(c.up); o.down = cleanColor(c.down);
    if (CHART_TYPES.includes(c.type)) o.type = c.type;
    const tf = Math.round(Number(c.tf));
    o.tf = tf >= 1 && tf <= 1440 ? tf : 0;
    for (const k of ['grid', 'price', 'time', 'zones', 'lines', 'volume']) if (typeof c[k] === 'boolean') o[k] = c[k];
    if (CHART_MARKS.includes(c.marks)) o.marks = c.marks;
    return o;
}
// The candle colours as the card's own style variables ('' for Vest's, 8.1.5's): bodies --k-cu / --k-cd, wicks --k-wu / --k-wd, borders
// --k-bu / --k-bd. "Match my chart" takes the chart's own (the snapshot's chartColors); a border unlike the body draws one (cb).
export function chartColors(ch, snap) {
    let c = null;
    if (ch.colors === 'mine' && snap && snap.chartColors) c = snap.chartColors;
    else if (ch.colors === 'custom' && ch.up && ch.down) c = { up: ch.up, down: ch.down };
    else if (CHART_PRESETS[ch.colors]) c = { up: CHART_PRESETS[ch.colors][0], down: CHART_PRESETS[ch.colors][1] };
    if (!c) return { vars: '', border: false };
    const f = { up: c.up, down: c.down, wickUp: c.wickUp || c.up, wickDown: c.wickDown || c.down, borderUp: c.borderUp || c.up, borderDown: c.borderDown || c.down };
    const vars = `--k-cu:${f.up};--k-cd:${f.down};--k-wu:${f.wickUp};--k-wd:${f.wickDown};--k-bu:${f.borderUp};--k-bd:${f.borderDown}`;
    return { vars, border: f.borderUp !== f.up || f.borderDown !== f.down };
}
const f2 = (v) => v.toFixed(1);
const priceTxt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// a trade's P&L on the chart, exact to the cent (rounding $19.50 up to $20 would not be what Vest booked)
const tag = (v) => money(v);
function niceStep(range, lines) {
    const raw = range / lines;
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= raw) return m * e;
    return 10 * e;
}

// The chart as a list of shapes (8.2): each one carries its SVG markup (the 8.1.5 markup, to the character, for the default options), what a
// canvas needs to draw it (share-video.js), and the step it appears at in the video: the candle it belongs to (-1: from the start).
// o = { labels: 'usd' | 'pts' | 'r' | 'off', prices, pnl, sessions, best }; all off / 'usd' draws 8.1.5's chart.
// Entries are arrows whose tip is the fill price, exits are rings, the zone between them and the trade's P&L on top.
export function replayScene(M, w, h, o) {
    const opt = o || {};
    // 8.2 round 2: the chart's own options (chartOpts); without them 8.1.5's chart
    const ch = opt.chart ? chartOpts(opt.chart) : CHART_DEFAULTS;
    const axisW = ch.price ? AXIS_W : 0, timeH = ch.time ? TIME_H : 6;
    const PANE = opt.pnl ? Math.max(46, Math.round(h * 0.17)) : 0;
    const box = { x: 0, y: TOP, w: w - axisW, h: h - TOP - timeH - (PANE ? PANE + 8 : 0) };
    // volume under the candles, when Vest's candles carry it
    const VOL = ch.volume && M.bars.every((b) => b.length > 5) ? Math.max(24, Math.round(box.h * 0.16)) : 0;
    if (VOL) box.h -= VOL + 4;
    const fillPx = [];
    for (const t of M.trades) for (const f of t.fills) fillPx.push(f.px);
    // Heikin Ashi draws its own candles (and frames the chart on them); the trades stay at their real prices
    const drawn = ch.type === 'ha' ? heikinAshi(M.bars) : M.bars;
    const G = replayGeom(drawn, box, fillPx);
    const grid = [], bands = [], candles = [], zones = [], marks = [], tags = [], pane = [], last = [];
    const it = (list, svg, step, d) => list.push({ svg, step, d });
    // price grid and axis
    const step = niceStep(G.hi - G.lo, 5);
    const lastY = G.yOf(M.bars[M.bars.length - 1][4]);
    for (let p = Math.ceil(G.lo / step) * step; p < G.hi; p += step) {
        const y = G.yOf(p);
        if (y < box.y + 6 || y > box.y + box.h - 4) continue;
        if (ch.grid) it(grid, `<line class="gl" x1="0" x2="${f2(box.w)}" y1="${f2(y)}" y2="${f2(y)}"/>`, -1, { t: 'line', c: 'gl', x1: 0, x2: box.w, y1: y, y2: y });
        // the last price's tag covers the axis there, as on TradingView: the label under it is left out
        if (ch.price && Math.abs(y - lastY) >= 15) { const txt = priceTxt(p).replace(/\.00$/, ''); it(grid, `<text class="ax" x="${f2(box.w + 8)}" y="${f2(y + 3.5)}">${txt}</text>`, -1, { t: 'text', c: 'ax', x: box.w + 8, y: y + 3.5, s: txt }); }
    }
    // time axis: round times of the chart's own clock, about five of them
    const resMin = G.resS / 60;
    const spanMin = resMin * G.n;
    const every = [5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440].find((m) => m >= resMin && spanMin / m <= 6) || 1440;
    let lastX = -Infinity;
    M.bars.forEach((b, i) => {
        const t = hhmm(b[0] * 1000, M.tz);
        const mins = +t.slice(0, 2) * 60 + +t.slice(3, 5);
        if (!t || mins % every) return;
        const x = G.xOfIdx(i) - G.slot / 2;
        if (x - lastX < 56 || x < 16 || x > box.w - 16) return;
        lastX = x;
        if (ch.grid && ch.time) it(grid, `<line class="gl" x1="${f2(x)}" x2="${f2(x)}" y1="${f2(box.y)}" y2="${f2(box.y + box.h)}"/><text class="ax" x="${f2(x)}" y="${f2(h - 6)}" text-anchor="middle">${t}</text>`, -1,
            { t: 'group', parts: [{ t: 'line', c: 'gl', x1: x, x2: x, y1: box.y, y2: box.y + box.h }, { t: 'text', c: 'ax', x, y: h - 6, s: t, a: 'middle' }] });
        else if (ch.grid) it(grid, `<line class="gl" x1="${f2(x)}" x2="${f2(x)}" y1="${f2(box.y)}" y2="${f2(box.y + box.h)}"/>`, -1, { t: 'line', c: 'gl', x1: x, x2: x, y1: box.y, y2: box.y + box.h });
        else if (ch.time) it(grid, `<text class="ax" x="${f2(x)}" y="${f2(h - 6)}" text-anchor="middle">${t}</text>`, -1, { t: 'text', c: 'ax', x, y: h - 6, s: t, a: 'middle' });
    });
    // sessions (New York time): a faint band behind every other session, its name at the top
    if (opt.sessions) {
        let run = null;
        const runs = [];
        M.bars.forEach((b, i) => { const s = sessionOf(b[0] * 1000); if (!run || run.s !== s) { run = { s, a: i, b: i }; runs.push(run); } else run.b = i; });
        runs.forEach((r, k) => {
            const x1 = G.xOfIdx(r.a) - G.slot / 2, x2 = G.xOfIdx(r.b) + G.slot / 2;
            const name = ((SESSIONS.find((s) => s.id === r.s) || {}).name || '').toUpperCase();
            if (k % 2 === 0) it(bands, `<rect class="ss" x="${f2(x1)}" y="${f2(box.y)}" width="${f2(x2 - x1)}" height="${f2(box.h)}"/>`, -1, { t: 'rect', c: 'ss', x: x1, y: box.y, w: x2 - x1, h: box.h });
            if (x2 - x1 >= 46) it(bands, `<text class="sl" x="${f2(x1 + 5)}" y="${f2(box.y + 11)}">${esc(name)}</text>`, -1, { t: 'text', c: 'sl', x: x1 + 5, y: box.y + 11, s: name });
        });
    }
    // candles (8.2 round 2: or hollow candles, bars, a line, an area, Heikin Ashi)
    const bw = Math.max(1, G.slot * 0.62);
    const border = !!opt.border && (ch.type === 'candles' || ch.type === 'ha');
    if (ch.type === 'line' || ch.type === 'area') {
        // one piece per candle, from the close before (so the video draws it candle by candle)
        const bottom = box.y + box.h;
        drawn.forEach((b, i) => {
            const x = G.xOfIdx(i), y = G.yOf(b[4]);
            const px = i ? G.xOfIdx(i - 1) : x, py = i ? G.yOf(drawn[i - 1][4]) : y;
            const parts = [];
            let svg = '';
            if (ch.type === 'area' && i) {
                const d = `M${f2(px)} ${f2(py)}L${f2(x)} ${f2(y)}V${f2(bottom)}H${f2(px)}Z`;
                svg += `<path class="ar" d="${d}"/>`; parts.push({ t: 'path', c: 'ar', d });
            }
            const d = `M${f2(px)} ${f2(py)}L${f2(x)} ${f2(y)}`;
            svg += `<path class="ln" d="${d}"/>`; parts.push({ t: 'path', c: 'ln', d });
            it(candles, svg, i, { t: 'group', parts });
        });
    } else drawn.forEach((b, i) => {
        const up = b[4] >= b[1];
        const x = G.xOfIdx(i);
        const top = G.yOf(Math.max(b[1], b[4])), bot = G.yOf(Math.min(b[1], b[4]));
        const wy1 = G.yOf(b[2]), wy2 = G.yOf(b[3]);
        if (ch.type === 'bars') {
            // open to the left, close to the right, as TradingView's bars
            const t = Math.max(1.5, bw / 2), oy = G.yOf(b[1]), cy = G.yOf(b[4]);
            const d = `M${f2(x)} ${f2(wy1)}V${f2(wy2)}M${f2(x - t)} ${f2(oy)}H${f2(x)}M${f2(x)} ${f2(cy)}H${f2(x + t)}`;
            it(candles, `<path class="${up ? 'ou' : 'od'}" d="${d}"/>`, i, { t: 'path', c: up ? 'ou' : 'od', d });
            return;
        }
        // hollow: a rising candle is an outline (TradingView's hollow candles, by open and close)
        const hollow = ch.type === 'hollow' && up;
        const bc = (up ? 'cu' : 'cd') + (hollow ? ' ch' : border ? ' cb' : '');
        const body = { t: 'rect', c: bc, x: x - bw / 2, y: top, w: bw, h: Math.max(1, bot - top) };
        const bodySvg = `<rect class="${bc}" x="${f2(x - bw / 2)}" y="${f2(top)}" width="${f2(bw)}" height="${f2(Math.max(1, bot - top))}"/>`;
        if (hollow) {
            // the wick stops at the outline, so the candle reads as empty
            const w1 = { t: 'line', c: 'wu', x1: x, x2: x, y1: wy1, y2: top }, w2 = { t: 'line', c: 'wu', x1: x, x2: x, y1: top + Math.max(1, bot - top), y2: wy2 };
            const ln = (q) => `<line class="wu" x1="${f2(q.x1)}" x2="${f2(q.x2)}" y1="${f2(q.y1)}" y2="${f2(q.y2)}"/>`;
            it(candles, ln(w1) + ln(w2) + bodySvg, i, { t: 'group', parts: [w1, w2, body] });
            return;
        }
        it(candles, `<line class="${up ? 'wu' : 'wd'}" x1="${f2(x)}" x2="${f2(x)}" y1="${f2(wy1)}" y2="${f2(wy2)}"/>` + bodySvg, i,
            { t: 'group', parts: [{ t: 'line', c: up ? 'wu' : 'wd', x1: x, x2: x, y1: wy1, y2: wy2 }, body] });
    });
    // volume: a bar per candle under them, the tallest VOL high
    if (VOL) {
        const vy = box.y + box.h + 4 + VOL;
        const maxV = Math.max(...M.bars.map((b) => b[5])) || 1;
        M.bars.forEach((b, i) => {
            const vh = Math.max(b[5] > 0 ? 1 : 0, (b[5] / maxV) * VOL);
            if (!vh) return;
            const x = G.xOfIdx(i), c = b[4] >= b[1] ? 'vu' : 'vd';
            it(candles, `<rect class="${c}" x="${f2(x - bw / 2)}" y="${f2(vy - vh)}" width="${f2(bw)}" height="${f2(vh)}"/>`, i, { t: 'rect', c, x: x - bw / 2, y: vy - vh, w: bw, h: vh });
        });
    }
    // the trades: zones and lines under the markers, the P&L tags on top
    const lastBar = M.bars[M.bars.length - 1];
    const placed = [];
    const room = (x, y) => !placed.some((q) => Math.abs(q[0] - x) < 66 && Math.abs(q[1] - y) < 15);
    const closed = M.trades.filter((t) => !t.open);
    const best = opt.best && closed.length > 1 ? closed.reduce((a, b) => (b.net > a.net ? b : a)) : null;
    const stepOf = (ms) => Math.max(0, G.idxOf(ms));
    const labelOf = (t) => {
        const mode = opt.labels || 'usd';
        if (mode === 'off') return '';
        if (mode === 'pts') return t.pts == null ? '' : (t.pts < 0 ? '−' : '+') + Math.abs(t.pts).toFixed(2) + ' pt';
        if (mode === 'r') return t.r == null ? '' : (t.r < 0 ? '−' : '+') + Math.abs(t.r).toFixed(1) + 'R';
        return tag(t.net);
    };
    for (const t of M.trades) {
        const win = t.open ? null : t.net >= 0;
        const ins = t.fills.filter((f) => f.entry), outs = t.fills.filter((f) => !f.entry);
        const x1 = G.xOf(t.fills[0].t), y1 = G.yOf(ins.length ? ins[0].px : t.fills[0].px);
        const x2 = t.open ? box.w : G.xOf(t.fills[t.fills.length - 1].t);
        const yEnd = t.open ? y1 : G.yOf(outs.length ? outs[outs.length - 1].px : t.exitPx);
        const zA = G.yOf(t.entryPx != null ? t.entryPx : ins[0].px), zB = t.open ? G.yOf(lastBar[4]) : G.yOf(t.exitPx != null ? t.exitPx : outs[outs.length - 1].px);
        const sIn = stepOf(t.fills[0].t), sOut = t.open ? sIn : stepOf(t.fills[t.fills.length - 1].t);
        const zc = t.open ? 'zo' : win ? 'zw' : 'zl';
        const zx = Math.min(x1, x2), zy = Math.min(zA, zB), zw = Math.max(1, Math.abs(x2 - x1)), zh = Math.max(1, Math.abs(zB - zA));
        const isBest = best === t;
        if (ch.zones || isBest) it(zones, `<rect class="${zc}${isBest ? ' zb' : ''}" x="${f2(zx)}" y="${f2(zy)}" width="${f2(zw)}" height="${f2(zh)}"/>`, sOut, { t: 'rect', c: zc + (isBest ? ' zb' : ''), x: zx, y: zy, w: zw, h: zh });
        const lc = t.open ? 'co' : win ? 'cw' : 'cl';
        if (ch.lines) it(zones, `<line class="${lc}" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(yEnd)}"/>`, sOut, { t: 'line', c: lc, x1, y1, x2, y2: yEnd });
        for (const f of ch.marks === 'off' ? [] : t.fills) {
            const x = G.xOf(f.t), y = G.yOf(f.px);
            const s = stepOf(f.t);
            if (!f.entry) { it(marks, `<circle class="ex" cx="${f2(x)}" cy="${f2(y)}" r="4"/>`, s, { t: 'circle', c: 'ex', x, y, r: 4 }); continue; }
            const buy = t.side === 'long';
            // dots (8.2 round 2): a filled dot at the fill, green for a buy, red for a sell
            if (ch.marks === 'dots') { const c = buy ? 'db' : 'ds'; it(marks, `<circle class="${c}" cx="${f2(x)}" cy="${f2(y)}" r="4.5"/>`, s, { t: 'circle', c, x, y, r: 4.5 }); continue; }
            // a buy points up from below the price, a sell down from above: the tip is the fill price
            const d = `M${f2(x)} ${f2(y)}l-5 ${buy ? 9 : -9}h10z`;
            it(marks, `<path class="${buy ? 'ab' : 'as'}" d="${d}"/>`, s, { t: 'path', c: buy ? 'ab' : 'as', d });
        }
        if (opt.prices) {
            const fIn = t.fills[0], fOut = t.open ? null : t.fills[t.fills.length - 1];
            for (const f of [fIn, fOut]) {
                if (!f) continue;
                const x = G.xOf(f.t) + 8, y = G.yOf(f.px) + (f.entry ? (t.side === 'long' ? 12 : -6) : 3.5);
                const s = priceTxt(f.px);
                it(marks, `<text class="px" x="${f2(x)}" y="${f2(y)}">${s}</text>`, stepOf(f.t), { t: 'text', c: 'px', x, y, s });
            }
        }
        if (t.open) {
            if (room(box.w - 30, y1 - 10)) { placed.push([box.w - 30, y1 - 10]); it(tags, `<text class="pl po" x="${f2(box.w - 6)}" y="${f2(y1 - 8)}" text-anchor="end">OPEN</text>`, sIn, { t: 'text', c: 'pl po', x: box.w - 6, y: y1 - 8, s: 'OPEN', a: 'end' }); }
            continue;
        }
        const label = labelOf(t);
        let at = null;
        if (label) {
            const tx = Math.max(34, Math.min(box.w - 34, x2));
            for (const dy of win ? [-12, -26, 20] : [22, 36, -12]) {
                const ty = yEnd + dy;
                if (ty < box.y + 10 || ty > box.y + box.h - 2 || !room(tx, ty)) continue;
                placed.push([tx, ty]);
                at = [tx, ty];
                it(tags, `<text class="pl ${win ? 'pw' : 'pd'}" x="${f2(tx)}" y="${f2(ty)}" text-anchor="middle">${label}</text>`, sOut, { t: 'text', c: 'pl ' + (win ? 'pw' : 'pd'), x: tx, y: ty, s: label, a: 'middle' });
                break;
            }
        }
        if (isBest) {
            // just above the trade's own label (or the top of its zone when it has none)
            const bx = at ? at[0] : Math.max(18, Math.min(box.w - 18, (x1 + x2) / 2)), by = Math.max(box.y + 9, at ? at[1] - 12 : zy - 5);
            placed.push([bx, by]);
            it(tags, `<text class="pl pb" x="${f2(bx)}" y="${f2(by)}" text-anchor="middle">BEST</text>`, sOut, { t: 'text', c: 'pl pb', x: bx, y: by, s: 'BEST', a: 'middle' });
        }
    }
    // the running P&L under the candles: a step line of the realized total, each trade's step at its exit
    if (PANE) {
        const y0 = box.y + box.h + 8, y1 = y0 + PANE;
        const seq = closed.slice().sort((a, b) => a.closeT - b.closeT);
        let run = 0, lo = 0, hi = 0;
        const pts = seq.map((t) => { run += t.net; lo = Math.min(lo, run); hi = Math.max(hi, run); return { t, v: run }; });
        const span = (hi - lo) || 1;
        const Y = (v) => y1 - 6 - ((v - lo) / span) * (PANE - 16);
        const zy = Y(0);
        it(pane, `<line class="pz" x1="0" x2="${f2(box.w)}" y1="${f2(zy)}" y2="${f2(zy)}"/>`, -1, { t: 'line', c: 'pz', x1: 0, x2: box.w, y1: zy, y2: zy });
        it(pane, `<text class="pt" x="4" y="${f2(y0 + 10)}">P&amp;L</text>`, -1, { t: 'text', c: 'pt', x: 4, y: y0 + 10, s: 'P&L' });
        let px = 0, py = zy;
        for (const p of pts) {
            const x = G.xOf(p.t.closeT), y = Y(p.v);
            const d = `M${f2(px)} ${f2(py)}H${f2(x)}V${f2(y)}`;
            it(pane, `<path class="pn ${p.v >= 0 ? 'pnu' : 'pnd'}" d="${d}"/>`, stepOf(p.t.closeT), { t: 'path', c: 'pn ' + (p.v >= 0 ? 'pnu' : 'pnd'), d });
            px = x; py = y;
        }
        if (pts.length) {
            const fin = pts[pts.length - 1].v;
            const s0 = stepOf(pts[pts.length - 1].t.closeT);
            it(pane, `<path class="pn ${fin >= 0 ? 'pnu' : 'pnd'}" d="M${f2(px)} ${f2(py)}H${f2(box.w)}"/>`, s0, { t: 'path', c: 'pn ' + (fin >= 0 ? 'pnu' : 'pnd'), d: `M${f2(px)} ${f2(py)}H${f2(box.w)}` });
            const s = money(fin);
            // without the price axis the total sits at the right end of its own line
            if (ch.price) it(pane, `<text class="pt ${fin >= 0 ? 'pw' : 'pd'}" x="${f2(box.w + 8)}" y="${f2(py + 3.5)}">${s}</text>`, s0, { t: 'text', c: 'pt ' + (fin >= 0 ? 'pw' : 'pd'), x: box.w + 8, y: py + 3.5, s });
            else it(pane, `<text class="pt ${fin >= 0 ? 'pw' : 'pd'}" x="${f2(box.w - 4)}" y="${f2(py - 5)}" text-anchor="end">${s}</text>`, s0, { t: 'text', c: 'pt ' + (fin >= 0 ? 'pw' : 'pd'), x: box.w - 4, y: py - 5, s, a: 'end' });
        }
    }
    // the last price on the axis, like the chart's own (the real one, also on Heikin Ashi)
    const ly = G.yOf(lastBar[4]);
    const lc = lastBar[4] >= lastBar[1] ? 'cu' : 'cd';
    const lt = priceTxt(lastBar[4]);
    if (ch.price) it(last, `<rect class="${lc}" x="${f2(box.w + 2)}" y="${f2(ly - 9)}" width="${AXIS_W - 2}" height="18" rx="3"/><text class="lp" x="${f2(box.w + 7)}" y="${f2(ly + 3.5)}">${lt}</text>`, M.bars.length - 1,
        { t: 'group', parts: [{ t: 'rect', c: lc, x: box.w + 2, y: ly - 9, w: AXIS_W - 2, h: 18, rx: 3 }, { t: 'text', c: 'lp', x: box.w + 7, y: ly + 3.5, s: lt }] });
    // 8.1.5's order: grid and axes, candles, zones and lines, then the markers, the tags and the last price (new layers slot in between)
    const items = grid.concat(bands, candles, zones, pane, marks, tags, last);
    return { items, geom: G, box, n: M.bars.length, w, h };
}

// The chart as SVG (the card and the PNG): every shape of the scene. Returns { svg, geom, box, scene } so the tests can check where each fill landed.
export function replaySvg(M, w, h, o) {
    const sc = replayScene(M, w, h, o);
    return { svg: `<svg class="rp-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${sc.items.map((x) => x.svg).join('')}</svg>`, geom: sc.geom, box: sc.box, scene: sc };
}

// The Replay card. Returns { html, n, err }: n is the trades closed today on the chart (0: nothing to save), err why there is no chart.
export function replayHtml(snap, p) {
    const R0 = snap && snap.replay;
    // 8.2: another market of the day (p.rpMarket), when the dock sent its candles
    const R = R0 && !R0.err ? replayPick(R0, p.rpMarket) : R0;
    // 8.2 round 2: the chart's options; the timeframe redraws the same session from the finest candles held
    const ch = p.chart ? chartOpts(p.chart) : null;
    const RT = ch && ch.tf && R && !R.err ? replayTf(R, ch.tf) : R;
    const M = RT && !RT.err ? replayModel(RT, p.rsel) : null;
    if (!M) return { html: '', n: 0, err: (R && R.err) || 'none' };
    const f = REPLAY_CHART[p.format] ? p.format : 'feed';
    const show = p.show || {};
    const acc = (snap.accounts || []).find((a) => a.id === R.accountId);
    const accName = acc ? (p.list && p.list.mask ? maskName(acc.name) : acc.name) : '';
    const style = ['vest', 'silver', 'oled', 'neon'].includes(p.style) ? p.style : 'vest';
    const pct = acc && acc.size > 0 ? (M.net / acc.size) * 100 : null;
    const heroPx = { feed: 60, square: 52, wide: 54, story: 66 }[f];
    const vestW = { feed: 92, square: 88, wide: 100, story: 106 }[f];
    const mkt = M.market || snap.market || '';
    const tf = tfLabel(M.res);
    const sample = snap.demo || M.sample ? '<span class="badge sample">Sample</span>' : '';
    const chip = show.market && mkt ? `<span class="badge rp-mkt">${esc(mkt)} · ${tf}</span>` : `<span class="badge rp-mkt">${tf}</span>`;
    // dated by the session it draws: today, or the latest day this account traded the market
    const day = M.day || snap.day;
    const date = show.date && day ? `<span class="date">${esc(dayLong(day))}</span>` : '';
    const counts = M.n + ' trade' + (M.n === 1 ? '' : 's') + ' · ' + M.wins + ' won' + (M.open ? ' · ' + M.open + ' open' : '');
    // 8.2: a copy group's Replay: the chart account's trades marked once, the hero the whole group's P&L on this market in this time
    const G = replayGroup(snap, R, M, p.rpAcc, mkt);
    const net = G ? G.net : M.net;
    const gPct = G && G.size > 0 ? (G.net / G.size) * 100 : null;
    const shownPct = G ? gPct : pct;
    // points (8.2): the closed trades' points (one market, so they add up); a trade without points keeps the amount
    const pts = p.hero === 'pts' ? (G ? G.pts : ptsSum(M.trades.filter((t) => !t.open).map((t) => t.pts))) : null;
    const heroVal = pts != null ? pts : net;
    // the card counts only what it shows: a few of the session's trades say so
    const lbl0 = G ? `Group P&amp;L on ${esc(mkt || 'this market')}` : M.partial ? `P&amp;L · ${M.n + M.open} of ${M.all} trades` : M.others || R !== R0 ? `Day P&amp;L on ${esc(mkt || 'this market')}` : 'Day P&amp;L';
    const lbl = pts != null ? lbl0.replace(/^P&amp;L/, 'Points').replace('P&amp;L', 'points') : lbl0;
    const secTxt = pts != null ? (show.pct ? money(net) : '') : show.pct && shownPct != null ? (shownPct < 0 ? '−' : '+') + Math.abs(shownPct).toFixed(2) + '%' : '';
    const amtCls = style === 'vest' || style === 'oled' ? cls(heroVal) : '';
    const who = G ? `<b>Group ${esc(G.id)}</b> · ${G.accounts} account${G.accounts === 1 ? '' : 's'} · ` : show.accounts && accName ? `<b>${esc(accName)}</b> · ` : '';
    const hero = `<div class="rp-hero"><div><div class="lbl">${lbl}</div><div class="amt ${amtCls}" style="font-size:${heroPx}px">${M.n || (G && G.n) ? (pts != null ? bigPts(pts) : big(net)) : '—'}</div></div>`
        + `<div class="rp-meta">${secTxt ? `<div class="sec ${cls(net)}">${secTxt}</div>` : ''}<div class="sub">${who}${counts}</div></div></div>`;
    const name = show.handle && String(p.handle || '').trim() ? `<div class="handle">${esc(String(p.handle).trim().slice(0, 32))}</div>` : '';
    const [cw, chh] = replayChartSize(f, { handle: !!name, sec: !!secTxt });
    const credit = show.credit ? '<div class="credit">Made with Better Vest by Astral</div>' : '';
    const ms = M.bars[M.bars.length - 1][0] * 1000;
    const keys = !ch || ch.marks === 'arrows' ? '<span class="ia">▲▼</span> entry <span class="ie">○</span> exit · ' : ch.marks === 'dots' ? '<span class="ia">●</span> entry <span class="ie">○</span> exit · ' : '';
    const legend = `<div class="rp-legend">${keys}${esc(tzShort(M.tz, ms))}${M.fees > 0 ? ' · after ' + money(M.fees, false) + ' fees' : ''}</div>`;
    const colors = ch ? chartColors(ch, snap) : { vars: '', border: false };
    const { svg, scene } = replaySvg(M, cw, chh, ch ? Object.assign({}, p.rp, { chart: ch, border: colors.border }) : p.rp);
    const html = `<div class="card ${f} rp s-${style}${p.theme === 'light' ? ' light' : ''}${heroVal < 0 ? ' red' : ''}"${colors.vars ? ` style="${colors.vars}"` : ''}><div class="bgx"></div><div class="in">`
        + `<div class="hd"><span class="vest" style="width:${vestW}px">${VEST_SVG}</span><div class="chips">${sample}${chip}${date}</div></div>`
        + hero + `<div class="rp-chart" style="width:${cw}px;height:${chh}px">${svg}</div>`
        + `<div class="ft"><div class="rp-left">${name}${legend}</div>${credit}</div></div></div>`;
    return { html, n: M.n + M.open, err: '', scene, M, group: G, chart: ch };
}

// The copy group's total for the Replay: the chart account's trades (the model's) plus the group's other accounts' trades of today on the
// same market, closed inside the time shown. null when no group is chosen, the group is unknown, or the session is not today's.
export function replayGroup(snap, R, M, gid, mkt) {
    if (!gid || !snap || !R || !M || (R.day && snap.day && R.day !== snap.day)) return null;
    const g = snapGroups(snap).find((x) => x.id === gid);
    if (!g) return null;
    const ids = new Set([g.leaderId].concat(g.followerIds).filter(Boolean));
    const canon = (m) => (m === 'MNQ' ? 'NQ' : String(m || ''));
    const resMs = (Number(M.res) || 1) * 60000;
    const lo = M.bars[0][0] * 1000, hi = M.bars[M.bars.length - 1][0] * 1000 + resMs;
    const others = todayTrades(snap).filter((t) => ids.has(t.accountId) && t.accountId !== R.accountId && canon(mktName(t.symbol)) === canon(mkt) && t.closeTs >= lo && t.closeTs < hi);
    const mine = ids.has(R.accountId);
    const net = Math.round(((mine ? M.net : 0) + others.reduce((s, t) => s + t.net, 0)) * 100) / 100;
    const accts = new Set(others.map((t) => t.accountId));
    if (mine) accts.add(R.accountId);
    let size = 0;
    for (const id of accts) { const a = (snap.accounts || []).find((x) => x.id === id); if (a && a.size > 0) size += a.size; else { size = 0; break; } }
    // points (8.2): one market, so the group's points add up; null when any trade has none
    const pts = ptsSum((mine ? M.trades.filter((t) => !t.open).map((t) => t.pts) : []).concat(others.map((t) => t.points)));
    return { id: g.id, net, n: (mine ? M.n : 0) + others.length, accounts: accts.size, size, pts };
}
