// Better Vest share poster: the card, as one HTML string styled only by cert/share-card.css. The same design as docs/pnl-cards/poster.html
// (the owner's pick, 2026-10-06): the P&L first, Vest's logo and name as the firm's watermark, the accounts as a list (copy trading: the
// whole group, each account a row), dark or light, four styles, four formats. The only credit is "Made with Better Vest by Astral".

import { cardRows, maskName, dayLong, money } from './share-model.js';
import { replayModel, replayGeom, hhmm, tzShort } from './share-replay.js';

// Vest's wordmark (its mark and name, from Vest's own page), as on Vest's own position share card
export const VEST_SVG = '<svg class="vestmark" viewBox="0 0 60 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Vest"><path d="M32.02 2.45H30.73C30.67 2.45 30.63 2.48 30.61 2.53L28.03 9.79L25.45 2.53C25.43 2.48 25.38 2.45 25.33 2.45H24.05C23.96 2.45 23.9 2.53 23.93 2.62L27.25 11.74H28.82L32.14 2.62C32.17 2.53 32.11 2.45 32.02 2.45H32.02Z" fill="currentColor"/><path d="M40.24 2.83C39.58 2.4 38.79 2.19 37.85 2.19C36.91 2.19 36.16 2.39 35.49 2.79C34.82 3.2 34.3 3.77 33.92 4.52C33.55 5.26 33.36 6.14 33.36 7.15C33.36 8.17 33.55 8.97 33.93 9.7C34.31 10.42 34.84 10.99 35.52 11.39C36.21 11.8 37 12 37.92 12C38.83 12 39.64 11.78 40.36 11.32C41.09 10.87 41.83 10.04 42.12 8.98L40.49 8.98C40.23 9.47 39.89 9.86 39.45 10.12C39 10.4 38.46 10.55 37.85 10.55C36.93 10.55 36.23 10.24 35.74 9.64C35.31 9.12 35.07 8.41 35.01 7.52H42.15C42.2 6.42 42.06 5.47 41.73 4.67C41.39 3.88 40.9 3.26 40.24 2.83ZM35.04 6.29C35.13 5.54 35.36 4.93 35.74 4.48C36.23 3.87 36.95 3.56 37.9 3.56C38.79 3.56 39.45 3.85 39.9 4.41C40.26 4.86 40.48 5.49 40.56 6.29H35.04Z" fill="currentColor"/><path d="M46.43 3.87C46.8 3.64 47.29 3.53 47.9 3.56C48.54 3.57 49.06 3.72 49.46 4.01C49.87 4.3 50.11 4.69 50.18 5.19H51.79C51.74 4.5 51.49 3.88 51.15 3.47C50.8 3.06 50.35 2.75 49.8 2.52C49.24 2.3 48.61 2.19 47.9 2.19C47.19 2.19 46.56 2.3 46.02 2.52C45.48 2.75 45.07 3.06 44.77 3.47C44.47 3.88 44.32 4.36 44.32 4.91C44.32 5.35 44.42 5.72 44.62 6.03C44.82 6.34 45.16 6.62 45.63 6.85C46.1 7.09 46.75 7.31 47.57 7.53C48.33 7.73 48.9 7.91 49.27 8.05C49.65 8.19 49.9 8.35 50.02 8.51C50.14 8.67 50.2 8.89 50.2 9.15C50.2 9.6 50.02 9.96 49.66 10.23C49.29 10.49 48.79 10.62 48.16 10.62C47.48 10.62 46.92 10.48 46.47 10.18C46.01 9.88 45.72 9.48 45.6 8.98H43.99C44.12 10.03 44.62 10.78 45.33 11.26C46.04 11.75 46.95 11.99 48.06 11.99C49.17 11.99 50.13 11.73 50.8 11.22C51.46 10.71 51.79 10 51.79 9.11C51.79 8.63 51.69 8.22 51.49 7.89C51.28 7.56 50.95 7.27 50.47 7.03C50 6.78 49.35 6.56 48.53 6.35C47.8 6.17 47.24 6.01 46.86 5.86C46.48 5.72 46.22 5.57 46.07 5.41C45.93 5.25 45.86 5.05 45.86 4.83C45.86 4.43 46.05 4.11 46.43 3.87Z" fill="currentColor"/><path d="M56.77 3.71H59.58V2.45H56.77V0.13C56.77 0.02 56.64 -0.04 56.56 0.03L55.28 1.05C55.25 1.08 55.23 1.11 55.23 1.15V2.45H53.34V3.71H55.23V9.23C55.23 11.52 56.89 11.74 57.99 11.74H59.58V10.42H57.97C57.41 10.42 56.77 10.19 56.77 9.14V3.71Z" fill="currentColor"/><path d="M4.49 0.09L0.05 3.64C-0.02 3.69 -0.02 3.79 0.05 3.84L9.39 11.3C9.44 11.33 9.5 11.33 9.55 11.3L18.89 3.84C18.96 3.79 18.96 3.69 18.89 3.64L14.45 0.09C14.37 0.02 14.24 0.08 14.24 0.19V11.61C14.24 11.68 14.19 11.74 14.12 11.74H4.82C4.75 11.74 4.7 11.68 4.7 11.61V0.19C4.7 0.08 4.57 0.02 4.49 0.09Z" fill="currentColor"/></svg>';

// CSS size of each format; the PNG is twice that (1080 x 1350, 1080 x 1080, 1920 x 1080, 1080 x 1920)
export const CARD_SIZES = { feed: [540, 675], square: [540, 540], wide: [960, 540], story: [540, 960] };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const big = (v) => { const m = money(v); const i = m.lastIndexOf('.'); return `${m.slice(0, i)}<small>${m.slice(i)}</small>`; };
const pct = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2) + '%';
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');

// snap: a cleaned snapshot; p: the choices { mode, picked, style, theme, format, hero, list: { on, green, mask }, show: {...}, handle };
// maxRows: how many account rows the panel may hold (the page finds the most that fit). Returns { html, n } (n: the accounts on the card).
export function cardHtml(snap, p, maxRows) {
    const R = cardRows(snap, { mode: p.mode, picked: p.picked, greenOnly: !!(p.list && p.list.green) });
    const f = CARD_SIZES[p.format] ? p.format : 'feed';
    const rows = R.rows, n = R.n, total = R.total;
    const listed = !!(p.list && p.list.on) && n > 1;
    const copy = p.mode === 'copy';
    const heroPx = listed ? { feed: 60, square: 54, wide: 74, story: 72 }[f] : { feed: 76, square: 70, wide: 92, story: 84 }[f];
    const vestW = { feed: 92, square: 88, wide: 100, story: 106 }[f];
    const show = p.show || {};
    const mk = (r) => esc(p.list && p.list.mask ? maskName(r.name) : r.name);
    const what = copy ? 'copy traded account' : 'account';
    const acctLine = show.accounts && n ? (copy || n > 1 ? `Across <b>${n}</b> ${what}${n === 1 ? '' : 's'}` : mk(rows[0])) : '';
    const heroTxt = p.hero === 'pct' && R.ret != null ? pct(R.ret) : big(total);
    const secTxt = show.pct && R.ret != null ? (p.hero === 'pct' ? money(total) : pct(R.ret)) : '';
    let panel = '';
    if (listed) {
        const max = n <= maxRows ? n : Math.max(1, maxRows - 1);
        const title = copy ? (p.list.green ? 'Green copy traded accounts' : 'All copy traded accounts') : (p.list.green ? 'Green accounts' : 'Accounts');
        const market = show.market && snap.market ? `<span class="mkt"><span>${esc(snap.market.slice(0, 3))}</span>${esc(snap.market)}</span>` : '';
        panel = `<div class="panel"><div class="ph"><b>${title}</b>${market}</div><div class="th"><span>ACCOUNT</span><span>DAY P&amp;L</span></div>`
            + `<div class="rows">${rows.slice(0, max).map((r) => `<div class="r"><span class="nm">${mk(r)}${r.leader ? '<span class="lead">LEAD</span>' : ''}</span><b class="${cls(r.pnl)}">${money(r.pnl, false)}</b></div>`).join('')}</div>`
            + (n > max ? `<div class="more">+${n - max} more account${n - max === 1 ? '' : 's'}</div>` : '') + '</div>';
    }
    const badge = copy ? '<span class="badge"><i></i>Copy trading</span>' : '';
    // numbers that are not a real account's (the copy trader's demo, a showcase) say so on the card itself
    const sample = snap.demo ? '<span class="badge sample">Sample</span>' : '';
    const date = show.date && snap.day ? `<span class="date">${esc(dayLong(snap.day))}</span>` : '';
    const name = show.handle && String(p.handle || '').trim() ? `<div class="handle">${esc(String(p.handle).trim().slice(0, 32))}</div>` : '<div></div>';
    const credit = show.credit ? '<div class="credit">Made with Better Vest by Astral</div>' : '';
    const foot = name !== '<div></div>' || credit ? `<div class="ft">${name}${credit}</div>` : '';
    const hero = `<div class="hero"><div class="lbl">${copy ? 'Total profit' : 'Day P&amp;L'}</div>`
        + `<div class="amt ${p.style === 'vest' || p.style === 'oled' ? cls(total) : ''}" style="font-size:${heroPx}px">${n ? heroTxt : '—'}</div>`
        + (secTxt ? `<div class="sec ${cls(total)}">${secTxt}</div>` : '') + (acctLine ? `<div class="sub">${acctLine}</div>` : '') + '<div class="rule"></div></div>';
    const split = listed && f === 'wide';
    const style = ['vest', 'silver', 'oled', 'neon'].includes(p.style) ? p.style : 'vest';
    const html = `<div class="card ${f} s-${style}${p.theme === 'light' ? ' light' : ''}${total < 0 ? ' red' : ''}"><div class="bgx"></div><div class="in">`
        + `<div class="hd"><span class="vest" style="width:${vestW}px">${VEST_SVG}</span><div class="chips">${sample}${badge}${date}</div></div>`
        + `<div class="body${listed ? ' listed' : ''}${split ? ' split' : ''}">${hero}${panel}</div>${foot}</div></div>`;
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

// The chart as SVG: the candles, the price and time axes, and every trade (entries as arrows whose tip is the fill price, exits as rings,
// the zone between them, the trade's P&L). Returns { svg, geom } so the tests can check where each fill landed.
export function replaySvg(M, w, h) {
    const box = { x: 0, y: TOP, w: w - AXIS_W, h: h - TOP - TIME_H };
    const fillPx = [];
    for (const t of M.trades) for (const f of t.fills) fillPx.push(f.px);
    const G = replayGeom(M.bars, box, fillPx);
    let s = '';
    // price grid and axis
    const step = niceStep(G.hi - G.lo, 5);
    const lastY = G.yOf(M.bars[M.bars.length - 1][4]);
    for (let p = Math.ceil(G.lo / step) * step; p < G.hi; p += step) {
        const y = G.yOf(p);
        if (y < box.y + 6 || y > box.y + box.h - 4) continue;
        s += `<line class="gl" x1="0" x2="${f2(box.w)}" y1="${f2(y)}" y2="${f2(y)}"/>`;
        // the last price's tag covers the axis there, as on TradingView: the label under it is left out
        if (Math.abs(y - lastY) >= 15) s += `<text class="ax" x="${f2(box.w + 8)}" y="${f2(y + 3.5)}">${priceTxt(p).replace(/\.00$/, '')}</text>`;
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
        s += `<line class="gl" x1="${f2(x)}" x2="${f2(x)}" y1="${f2(box.y)}" y2="${f2(box.y + box.h)}"/><text class="ax" x="${f2(x)}" y="${f2(h - 6)}" text-anchor="middle">${t}</text>`;
    });
    // candles
    const bw = Math.max(1, G.slot * 0.62);
    M.bars.forEach((b, i) => {
        const up = b[4] >= b[1];
        const x = G.xOfIdx(i);
        const top = G.yOf(Math.max(b[1], b[4])), bot = G.yOf(Math.min(b[1], b[4]));
        s += `<line class="${up ? 'wu' : 'wd'}" x1="${f2(x)}" x2="${f2(x)}" y1="${f2(G.yOf(b[2]))}" y2="${f2(G.yOf(b[3]))}"/>`;
        s += `<rect class="${up ? 'cu' : 'cd'}" x="${f2(x - bw / 2)}" y="${f2(top)}" width="${f2(bw)}" height="${f2(Math.max(1, bot - top))}"/>`;
    });
    // the trades: zones and lines under the markers, the P&L tags on top
    const last = M.bars[M.bars.length - 1];
    let marks = '', tags = '';
    const placed = [];
    const room = (x, y) => !placed.some((q) => Math.abs(q[0] - x) < 66 && Math.abs(q[1] - y) < 15);
    for (const t of M.trades) {
        const win = t.open ? null : t.net >= 0;
        const ins = t.fills.filter((f) => f.entry), outs = t.fills.filter((f) => !f.entry);
        const x1 = G.xOf(t.fills[0].t), y1 = G.yOf(ins.length ? ins[0].px : t.fills[0].px);
        const x2 = t.open ? box.w : G.xOf(t.fills[t.fills.length - 1].t);
        const yEnd = t.open ? y1 : G.yOf(outs.length ? outs[outs.length - 1].px : t.exitPx);
        const zA = G.yOf(t.entryPx != null ? t.entryPx : ins[0].px), zB = t.open ? G.yOf(last[4]) : G.yOf(t.exitPx != null ? t.exitPx : outs[outs.length - 1].px);
        s += `<rect class="${t.open ? 'zo' : win ? 'zw' : 'zl'}" x="${f2(Math.min(x1, x2))}" y="${f2(Math.min(zA, zB))}" width="${f2(Math.max(1, Math.abs(x2 - x1)))}" height="${f2(Math.max(1, Math.abs(zB - zA)))}"/>`;
        s += `<line class="${t.open ? 'co' : win ? 'cw' : 'cl'}" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(yEnd)}"/>`;
        for (const f of t.fills) {
            const x = G.xOf(f.t), y = G.yOf(f.px);
            if (!f.entry) { marks += `<circle class="ex" cx="${f2(x)}" cy="${f2(y)}" r="4"/>`; continue; }
            // a buy points up from below the price, a sell down from above: the tip is the fill price
            const buy = t.side === 'long';
            marks += `<path class="${buy ? 'ab' : 'as'}" d="M${f2(x)} ${f2(y)}l-5 ${buy ? 9 : -9}h10z"/>`;
        }
        if (t.open) {
            if (room(box.w - 30, y1 - 10)) { placed.push([box.w - 30, y1 - 10]); tags += `<text class="pl po" x="${f2(box.w - 6)}" y="${f2(y1 - 8)}" text-anchor="end">OPEN</text>`; }
            continue;
        }
        const tx = Math.max(34, Math.min(box.w - 34, x2));
        for (const dy of win ? [-12, -26, 20] : [22, 36, -12]) {
            const ty = yEnd + dy;
            if (ty < box.y + 10 || ty > box.y + box.h - 2 || !room(tx, ty)) continue;
            placed.push([tx, ty]);
            tags += `<text class="pl ${win ? 'pw' : 'pd'}" x="${f2(tx)}" y="${f2(ty)}" text-anchor="middle">${tag(t.net)}</text>`;
            break;
        }
    }
    // the last price on the axis, like the chart's own
    const ly = G.yOf(last[4]);
    s += marks + tags + `<rect class="${last[4] >= last[1] ? 'cu' : 'cd'}" x="${f2(box.w + 2)}" y="${f2(ly - 9)}" width="${AXIS_W - 2}" height="18" rx="3"/><text class="lp" x="${f2(box.w + 7)}" y="${f2(ly + 3.5)}">${priceTxt(last[4])}</text>`;
    return { svg: `<svg class="rp-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`, geom: G, box };
}

// The Replay card. Returns { html, n, err }: n is the trades closed today on the chart (0: nothing to save), err why there is no chart.
export function replayHtml(snap, p) {
    const R = snap && snap.replay;
    const M = R && !R.err ? replayModel(R, p.rsel) : null;
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
    const tf = M.res === '60' ? '1h' : M.res + 'm';
    const sample = snap.demo || M.sample ? '<span class="badge sample">Sample</span>' : '';
    const chip = show.market && mkt ? `<span class="badge rp-mkt">${esc(mkt)} · ${tf}</span>` : `<span class="badge rp-mkt">${tf}</span>`;
    // dated by the session it draws: today, or the latest day this account traded the market
    const day = M.day || snap.day;
    const date = show.date && day ? `<span class="date">${esc(dayLong(day))}</span>` : '';
    const counts = M.n + ' trade' + (M.n === 1 ? '' : 's') + ' · ' + M.wins + ' won' + (M.open ? ' · ' + M.open + ' open' : '');
    // the card counts only what it shows: a few of the session's trades say so
    const lbl = M.partial ? `P&amp;L · ${M.n + M.open} of ${M.all} trades` : M.others ? `Day P&amp;L on ${esc(mkt || 'this market')}` : 'Day P&amp;L';
    const secTxt = show.pct && pct != null ? (pct < 0 ? '−' : '+') + Math.abs(pct).toFixed(2) + '%' : '';
    const amtCls = style === 'vest' || style === 'oled' ? cls(M.net) : '';
    const hero = `<div class="rp-hero"><div><div class="lbl">${lbl}</div><div class="amt ${amtCls}" style="font-size:${heroPx}px">${M.n ? big(M.net) : '—'}</div></div>`
        + `<div class="rp-meta">${secTxt ? `<div class="sec ${cls(M.net)}">${secTxt}</div>` : ''}<div class="sub">${show.accounts && accName ? `<b>${esc(accName)}</b> · ` : ''}${counts}</div></div></div>`;
    const name = show.handle && String(p.handle || '').trim() ? `<div class="handle">${esc(String(p.handle).trim().slice(0, 32))}</div>` : '';
    const [cw, ch] = replayChartSize(f, { handle: !!name, sec: !!secTxt });
    const credit = show.credit ? '<div class="credit">Made with Better Vest by Astral</div>' : '';
    const ms = M.bars[M.bars.length - 1][0] * 1000;
    const legend = `<div class="rp-legend"><span class="ia">▲▼</span> entry <span class="ie">○</span> exit · ${esc(tzShort(M.tz, ms))}${M.fees > 0 ? ' · after ' + money(M.fees, false) + ' fees' : ''}</div>`;
    const { svg } = replaySvg(M, cw, ch);
    const html = `<div class="card ${f} rp s-${style}${p.theme === 'light' ? ' light' : ''}${M.net < 0 ? ' red' : ''}"><div class="bgx"></div><div class="in">`
        + `<div class="hd"><span class="vest" style="width:${vestW}px">${VEST_SVG}</span><div class="chips">${sample}${chip}${date}</div></div>`
        + hero + `<div class="rp-chart" style="width:${cw}px;height:${ch}px">${svg}</div>`
        + `<div class="ft"><div class="rp-left">${name}${legend}</div>${credit}</div></div></div>`;
    return { html, n: M.n + M.open, err: '' };
}
