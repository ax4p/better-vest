// Better Vest Calendar - the Payouts tab: hero tiles, monthly net bars with a cumulative line, milestone ladder, payout table.
// Only EXECUTED payouts count toward every total (money received). PROCESSING is pending (hatched), REFUNDED / FAILED are
// struck through and excluded. Money goes through ctx.fmt so Hide $ turns it into % of account size (or bullets).

import { vgrid, chartBox, popBase, dl, foot, tipRegistry, shortName, lsGet, lsSet } from './shared.js';
import { svg, scale } from '../charts.js';

const LS_STATUS = 'bv-journal-pay-status';
const STATUS_FILTERS = [
    { k: 'all', label: 'All' }, { k: 'EXECUTED', label: 'Executed' }, { k: 'PROCESSING', label: 'Processing' }, { k: 'other', label: 'Refunded / failed' }
];
const f1 = (n) => (Math.round(n * 10) / 10).toString();

export function mount(root, ctx) {
    const { h, ui, time: T, stats, fmt, model } = ctx;
    const S = () => ctx.state;
    let statusFilter = lsGet(LS_STATUS) || 'all';
    if (!STATUS_FILTERS.some((s) => s.k === statusFilter)) statusFilter = 'all';
    let sig = '';
    let grid = null;
    let chart = null;
    const tips = tipRegistry();

    const head = h('div', { class: 'vh2' });
    const ribbon = h('div', { class: 'pr-ribbon rbw', role: 'list', 'aria-label': 'Payout totals' });
    const mid = h('div', { class: 'pr-mid' });
    const tablePanel = h('section', { class: 'pn pr-table' });
    const note = h('div');
    const wrap = h('div', { class: 'vw' }, head, note, ribbon, mid, tablePanel);
    root.appendChild(wrap);
    const hover = ui.hoverCard(wrap, '[data-vtip]', (target, el) => tips.build(target.dataset.vtip, el), { delay: 140 });

    const money = (v, base, o) => fmt.usd(v, { ctx: 'table', base, ...o });

    // ---------- model ----------

    function model_() {
        const st = S();
        const D = ctx.derived();
        const all = D.payouts;
        const ps = stats.payoutStats(all);
        const done = all.filter((p) => p.status === 'EXECUTED');
        const seen = new Map();
        for (const p of done) if (!seen.has(p.accountId)) { const a = D.accountsById.get(p.accountId); seen.set(p.accountId, a && a.initialCapital > 0 ? a.initialCapital : 0); }
        let base = 0, bn = 0;
        for (const c of seen.values()) if (c > 0) { base += c; bn++; }
        // months, filled so empty months show as gaps
        const byMonth = new Map();
        for (const p of done) {
            const k = T.payoutDayKey(p, st.payBasis);
            if (!k) continue;
            const ym = T.monthKey(k);
            const m = byMonth.get(ym) || { ym, net: 0, gross: 0, n: 0 };
            m.net += p.net; m.gross += p.gross; m.n++;
            byMonth.set(ym, m);
        }
        const months = [];
        const keys = [...byMonth.keys()].sort();
        if (keys.length) {
            for (let ym = keys[0]; ym <= keys[keys.length - 1]; ym = T.shiftMonth(ym, 1)) months.push(byMonth.get(ym) || { ym, net: 0, gross: 0, n: 0 });
        }
        let cum = 0;
        for (const m of months) { cum += m.net; m.cum = cum; }
        const counts = { EXECUTED: 0, PROCESSING: 0, REFUNDED: 0, FAILED: 0 };
        for (const p of all) counts[p.status] = (counts[p.status] || 0) + 1;
        const largest = done.reduce((b, p) => (!b || p.net > b.net ? p : b), null);
        return { D, all, ps, done, base, avgBase: bn ? base / bn : 0, months, counts, largest, accounts: bn };
    }
    let M = null;

    const scopeText = () => {
        const st = S();
        const bits = [st.accounts ? (st.accounts.length === 1 ? '1 account' : st.accounts.length + ' accounts') : ({ all: 'All accounts', funded: 'Funded accounts', eval: 'Evaluation accounts', primary: 'Primary account' })[st.scope]];
        return bits.join(' · ');
    };
    const stamp = (ts) => {
        if (!ts) return '—';
        const key = T.etDateKey(ts);
        return `${T.fmtDate(key, 'dm')} ${key.slice(0, 4)} · ${T.fmtTimeET(ts, { seconds: false })}`;
    };

    // ---------- header ----------

    function renderHead() {
        ui.clear(head);
        const st = S();
        head.append(
            h('div', { class: 'vh2-t' }, h('h1', null, 'Payouts'), h('div', { class: 'sub' }, scopeText() + ' · ' + (st.payBasis === 'executed' ? 'dated by execution (ET)' : 'dated by request (ET)'))),
            h('div', { class: 'grow' }),
            ui.chip(st.payBasis === 'executed' ? 'By executed date' : 'By requested date', { onClick: () => ctx.set({ payBasis: st.payBasis === 'executed' ? 'requested' : 'executed' }), title: 'Which date a payout sits on in the monthly chart' }));
    }

    // ---------- tiles ----------

    function heroNet() {
        const st = S();
        const v = M.ps.lifetimeNet;
        const el = h('div', { class: 'big' });
        if (st.hide) { el.textContent = M.base > 0 ? fmt.pct(v / M.base, { sign: false }) : fmt.bullets; return el; }
        const hp = T.heroParts(v);
        el.append(h('span', { class: 'cur' }, '$'), h('span', null, hp.int), h('span', { class: 'ce' }, hp.cents));
        return el;
    }

    function tile(key, label, value, sub, { cls = '', main = false, tip } = {}) {
        const v = h('div', { class: 'v ' + cls });
        if (value instanceof Node) v.appendChild(value); else v.textContent = value;
        const id = tip ? tips.add(tip) : null;
        return h('div', { class: 'tile' + (main ? ' pmain' : ''), role: 'listitem', tabindex: 0, 'data-vtip': id },
            h('div', { class: 'lab' }, h('span', { class: 'lab' }, label)), v, h('div', { class: 's' }, sub || ' '));
    }

    function tileTip(title, formula, rows, n, extra) {
        return (el) => {
            popBase(el, title, `n = ${n} · ${scopeText()}`);
            el.appendChild(h('div', { class: 'formula' }, formula));
            dl(el, rows);
            foot(el, extra, 'Only EXECUTED payouts count. Refunded and failed ones are excluded; processing is pending.');
            return true;
        };
    }

    function renderRibbon() {
        ui.clear(ribbon);
        tips.reset();
        const { ps, counts, base, avgBase } = M;
        const none = !ps.count;
        const shareRate = ps.lifetimeGross > 0 ? ps.vestShare / ps.lifetimeGross : null;
        const largest = M.largest;
        ribbon.append(
            tile('net', 'Net to you', heroNet(), none ? 'no executed payouts yet' : `${ps.count} executed payout${ps.count === 1 ? '' : 's'}`, {
                main: true, cls: 'gold', tip: tileTip('Net to you', 'Net = Σ trader amount of EXECUTED payouts', [['Gross requested', money(ps.lifetimeGross, base, { sign: false })], ['Vest share', money(-ps.vestShare, base)], ['Net to you', money(ps.lifetimeNet, base, { sign: false })]], ps.count, S().hide ? 'Hide $ shows % of the combined size of the paying accounts.' : null)
            }),
            tile('gross', 'Gross', none ? '—' : money(ps.lifetimeGross, base, { sign: false }), 'requested amount', { cls: 'gold', tip: tileTip('Gross requested', 'Gross = Σ requested amount of EXECUTED payouts (before the Vest share)', [['Gross', money(ps.lifetimeGross, base, { sign: false })]], ps.count) }),
            tile('share', 'Vest share', none ? '—' : money(ps.vestShare, base, { sign: false }), shareRate == null ? '' : `${+(shareRate * 100).toFixed(1)}% of gross`, { tip: tileTip('Vest share', 'Share = Σ platform amount of EXECUTED payouts', [['Share', money(ps.vestShare, base, { sign: false })], ['Share of gross', shareRate == null ? '—' : +(shareRate * 100).toFixed(1) + '%']], ps.count) }),
            tile('pending', 'Pending', ps.pendingCount ? money(ps.pending, base, { sign: false }) : '—', ps.pendingCount ? `${ps.pendingCount} processing` : 'none processing', { tip: tileTip('Pending', 'Pending = Σ requested amount of PROCESSING payouts (not yet received)', [['Processing', String(ps.pendingCount)], ['Gross', money(ps.pending, base, { sign: false })]], ps.pendingCount) }),
            tile('count', 'Payouts', String(ps.count), `${counts.REFUNDED || 0} refunded · ${counts.FAILED || 0} failed`, { tip: tileTip('Payout count', 'Count = EXECUTED payouts in scope', [['Executed', String(counts.EXECUTED)], ['Processing', String(counts.PROCESSING)], ['Refunded', String(counts.REFUNDED)], ['Failed', String(counts.FAILED)]], ps.count) }),
            tile('avg', 'Average', none ? '—' : money(ps.avg, avgBase, { sign: false }), 'net per payout', { cls: 'gold', tip: tileTip('Average payout', 'Average = net to you ÷ executed payouts', [['Net', money(ps.lifetimeNet, base, { sign: false })], ['Payouts', String(ps.count)]], ps.count) }),
            tile('largest', 'Largest', none ? '—' : money(ps.largest, avgBase, { sign: false }), largest ? stampShort(largest) : '', { cls: 'gold', tip: tileTip('Largest payout', 'Largest = the biggest single net amount', [['Net', money(ps.largest, avgBase, { sign: false })], ['Date', largest ? stampShort(largest) : null]], ps.count) }));
    }

    function stampShort(p) {
        const k = T.payoutDayKey(p, 'executed');
        return k ? `${T.fmtDate(k, 'dm')} ${k.slice(0, 4)}` : '';
    }

    // ---------- monthly chart ----------

    function monthChart() {
        const st = S();
        const { months, base } = M;
        const hide = st.hide;
        return chartBox({
            height: 214,
            draw(host, W, H) {
                const Mg = { l: hide ? 12 : 48, r: hide ? 12 : 56, t: 18, b: 26 };
                const n = months.length;
                const maxBar = Math.max(1, ...months.map((m) => m.net));
                const maxCum = Math.max(1, months.length ? months[months.length - 1].cum : 1);
                const yB = scale(0, maxBar * 1.08, H - Mg.b, Mg.t);
                const yC = scale(0, maxCum * 1.08, H - Mg.b, Mg.t);
                const slot = (W - Mg.l - Mg.r) / Math.max(1, n);
                const bw = Math.max(6, Math.min(54, slot * 0.58));
                const root = svg('svg', { class: 'bchart', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Monthly net payouts and cumulative total' });
                const defs = svg('defs', null, svg('linearGradient', { id: 'pgrad', x1: 0, y1: 0, x2: 0, y2: 1 },
                    svg('stop', { offset: '0', 'stop-color': 'var(--j-gold)', 'stop-opacity': '.9' }), svg('stop', { offset: '1', 'stop-color': 'var(--j-gold)', 'stop-opacity': '.35' })));
                root.appendChild(defs);
                // grid + axis labels: bars on the left, the cumulative total on the right
                const gy = [0, 0.5, 1];
                for (const g of gy) {
                    const yy = yB(maxBar * g);
                    root.appendChild(svg('line', { class: g === 0 ? 'ch-zero' : 'ch-grid', x1: Mg.l, x2: W - Mg.r, y1: f1(yy), y2: f1(yy) }));
                    if (!hide && g > 0) {
                        root.appendChild(svg('text', { class: 'ch-axis', x: Mg.l - 6, y: f1(yy + 3.5), 'text-anchor': 'end' }, fmt.usd(maxBar * g, { ctx: 'cell', sign: false })));
                        root.appendChild(svg('text', { class: 'ch-axis ch-gold', x: W - Mg.r + 6, y: f1(yC(maxCum * g) + 3.5) }, fmt.usd(maxCum * g, { ctx: 'cell', sign: false })));
                    }
                }
                const bars = [];
                months.forEach((m, i) => {
                    const cx = Mg.l + slot * i + slot / 2;
                    const hgt = Math.max(m.net ? 2 : 0, yB(0) - yB(m.net));
                    if (m.net) bars.push(svg('rect', { class: 'pb', x: f1(cx - bw / 2), y: f1(yB(0) - hgt), width: f1(bw), height: f1(hgt), rx: Math.min(4, bw / 2) }));
                    const every = Math.max(1, Math.ceil(n / Math.floor((W - Mg.l - Mg.r) / 54)));
                    if (i % every === 0) root.appendChild(svg('text', { class: 'ch-axis', x: f1(cx), y: H - 7, 'text-anchor': 'middle' }, T.fmtMonth(m.ym, { short: true })));
                });
                bars.forEach((b) => root.appendChild(b));
                // cumulative line
                const pts = months.map((m, i) => [Mg.l + slot * i + slot / 2, yC(m.cum)]);
                if (pts.length > 1) {
                    const d = 'M' + pts.map((p) => f1(p[0]) + ' ' + f1(p[1])).join('L');
                    root.appendChild(svg('path', { class: 'cum glow', d }));
                    root.appendChild(svg('path', { class: 'cum', d }));
                }
                for (const p of pts) root.appendChild(svg('circle', { class: 'cum-dot', cx: f1(p[0]), cy: f1(p[1]), r: 3 }));
                const guide = svg('line', { class: 'ch-guide', y1: Mg.t - 4, y2: H - Mg.b, visibility: 'hidden' });
                root.appendChild(guide);
                host.appendChild(root);
                const tip = h('div', { class: 'curve-tip' });
                host.appendChild(tip);
                const move = (e) => {
                    const r = root.getBoundingClientRect();
                    const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - Mg.l) / slot)));
                    const m = months[i];
                    if (!m) return;
                    const cx = Mg.l + slot * i + slot / 2;
                    guide.setAttribute('x1', f1(cx)); guide.setAttribute('x2', f1(cx)); guide.setAttribute('visibility', 'visible');
                    const bb = (v) => fmt.usd(v, { ctx: 'table', base, sign: false });
                    tip.textContent = `${T.fmtMonth(m.ym)} · ${m.n ? bb(m.net) : 'no payouts'}${m.n ? ` · ${m.n} payout${m.n > 1 ? 's' : ''}` : ''} · total ${bb(m.cum)}`;
                    tip.classList.add('on');
                    const tw = tip.offsetWidth;
                    tip.style.left = Math.round(Math.min(W - tw - 4, Math.max(4, cx - tw / 2))) + 'px';
                };
                host.onpointermove = move;
                host.onpointerleave = () => { guide.setAttribute('visibility', 'hidden'); tip.classList.remove('on'); };
            }
        });
    }

    // ---------- milestones ----------

    function ladder() {
        const st = S();
        const { ps, base } = M;
        const net = ps.lifetimeNet;
        const nextIdx = ps.milestones.findIndex((m) => !m.reachedAt);
        const box = h('div', { class: 'ladder' });
        ps.milestones.forEach((m, i) => {
            const reached = !!m.reachedAt;
            const isNext = i === nextIdx;
            const frac = isNext ? Math.max(0, Math.min(1, (net - 0) / m.amount)) : reached ? 1 : 0;
            const amount = st.hide ? fmt.bullets : '$' + (m.amount >= 1000 ? m.amount / 1000 + 'K' : m.amount);
            const row = h('div', { class: 'rung' + (reached ? ' hit' : '') + (isNext ? ' next' : '') },
                h('i', { class: 'rg-dot' }, reached ? ui.sparkle(12) : null),
                h('div', { class: 'rg-b' },
                    h('div', { class: 'rg-t' }, h('b', null, amount), reached ? h('span', { class: 'mut' }, T.fmtDate(T.etDateKey(m.reachedAt), 'dm') + ' ' + T.etDateKey(m.reachedAt).slice(0, 4)) : isNext && !st.hide ? h('span', { class: 'mut' }, `${fmt.usd(m.amount - net, { ctx: 'table', sign: false })} to go`) : h('span', { class: 'mut' }, isNext ? 'next' : '')),
                    isNext ? h('div', { class: 'rg-bar', role: 'progressbar', 'aria-valuenow': st.hide ? null : Math.round(frac * 100), 'aria-label': 'Progress to the next milestone' }, h('i', { style: { width: (frac * 100).toFixed(1) + '%' } })) : null));
            box.appendChild(row);
        });
        return box;
    }

    function renderMid() {
        ui.clear(mid);
        if (chart) { chart.destroy(); chart = null; }
        const st = S();
        const { months } = M;
        const chartPanel = h('section', { class: 'pn' },
            h('div', { class: 'pn-h' }, h('b', null, 'Paid out per month'), h('span', { class: 'sub' }, 'net · bars, with the running total as a line'),
                h('div', { class: 'grow' }),
                h('span', { class: 'lg' }, h('i', { class: 'lg-b' }), 'Monthly net'), h('span', { class: 'lg' }, h('i', { class: 'lg-l' }), 'Total')));
        if (months.length) { chart = monthChart(); chartPanel.appendChild(chart); }
        else chartPanel.appendChild(h('div', { class: 'dshim' }, 'No executed payouts in this scope yet.'));
        const ladderPanel = h('section', { class: 'pn' }, h('div', { class: 'pn-h' }, h('b', null, 'Milestones'), h('span', { class: 'sub' }, st.hide ? 'lifetime net · amounts hidden' : 'lifetime net paid out')), ladder());
        mid.append(chartPanel, ladderPanel);
    }

    // ---------- table ----------

    function rowsFor() {
        let list = M.all;
        if (statusFilter === 'EXECUTED' || statusFilter === 'PROCESSING') list = list.filter((p) => p.status === statusFilter);
        else if (statusFilter === 'other') list = list.filter((p) => p.status !== 'EXECUTED' && p.status !== 'PROCESSING');
        return list.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || (a.id < b.id ? -1 : 1));
    }

    function tableCols() {
        return [
            { key: 'req', label: 'Requested', cls: 'l' }, { key: 'exe', label: 'Executed', cls: 'l' }, { key: 'acc', label: 'Account', cls: 'l' },
            { key: 'gross', label: 'Gross' }, { key: 'net', label: 'Net' }, { key: 'share', label: 'Share', title: 'Vest share of the gross amount' },
            { key: 'took', label: 'Took', title: 'Request to execution' }, { key: 'status', label: 'Status', cls: 'l' }
        ];
    }

    function renderTable() {
        ui.clear(tablePanel);
        if (grid) { grid.destroy(); grid = null; }
        const st = S();
        const rows = rowsFor();
        const seg = ui.seg({ options: STATUS_FILTERS.map((s) => ({ k: s.k, label: s.label })), value: statusFilter, label: 'Status filter', onChange: (k) => { statusFilter = k; lsSet(LS_STATUS, k); renderTable(); } });
        tablePanel.appendChild(h('div', { class: 'pn-h' }, h('b', null, 'Payouts'), h('span', { class: 'sub' }, `${rows.length} shown · newest first`), h('div', { class: 'grow' }), seg));
        const D = M.D;
        const virtual = rows.length > 200;
        grid = vgrid({
            template: '172px 172px minmax(190px, 1.4fr) 112px 112px 60px 78px 112px 92px', minWidth: 1090, rowH: 38, headH: 32, virtual, label: 'Payouts',
            head: tableCols(),
            rowCls: (p) => 'st-' + p.status.toLowerCase(),
            renderRow(p) {
                const a = D.accountsById.get(p.accountId);
                const base = a && a.initialCapital > 0 ? a.initialCapital : 0;
                const full = a ? model.accountName(a) : (p.accountId || '');
                const share = p.gross > 0 ? p.platformCut / p.gross : null;
                const tookMs = p.executedAt && p.createdAt ? p.executedAt - p.createdAt : null;
                const status = h('span', { class: 'pst ' + p.status.toLowerCase(), title: p.failureReason || undefined }, p.status === 'EXECUTED' ? 'Executed' : p.status === 'PROCESSING' ? 'Processing' : p.status === 'REFUNDED' ? 'Refunded' : p.status === 'FAILED' ? 'Failed' : p.status);
                const counted = p.status === 'EXECUTED';
                return [
                    stamp(p.createdAt),
                    counted && p.executedAt ? stamp(p.executedAt) : h('span', { class: 'mut' }, '—'),
                    h('span', { class: 'ellip', title: full }, shortName(a, model.accountName)),
                    h('span', { class: 'amt' }, money(p.gross, base, { sign: false })),
                    h('span', { class: 'amt ' + (counted ? 'gold' : '') }, money(p.net, base, { sign: false })),
                    share == null ? '—' : +(share * 100).toFixed(1) + '%',
                    h('span', { class: 'mut' }, tookMs != null ? T.fmtDur(tookMs) : '—'),
                    status
                ];
            },
            empty: statusFilter === 'all' ? 'No payouts yet. Executed payouts appear here once you claim profit on a funded account.' : 'No payouts with this status.'
        });
        grid.setRows(rows);
        grid.setHeight(virtual ? Math.min(560, grid.totalHeight() + 2) : null);
        tablePanel.appendChild(grid.el);
        const c = M.counts;
        tablePanel.appendChild(h('div', { class: 'pr-foot' },
            h('span', null, `Totals count the ${c.EXECUTED} executed payout${c.EXECUTED === 1 ? '' : 's'} only.`),
            c.REFUNDED || c.FAILED ? h('span', null, `${c.REFUNDED} refunded${c.FAILED ? ' · ' + c.FAILED + ' failed' : ''} (struck through, excluded).`) : null,
            c.PROCESSING ? h('span', null, `${c.PROCESSING} processing (hatched, pending).`) : null,
            st.hide ? h('span', null, 'Hide $: amounts show as % of the account size.') : null));
    }

    // ---------- update ----------

    function update() {
        const st = S();
        const D = ctx.derived();
        const key = [st.hide, st.payBasis, statusFilter].join('|');
        if (D === lastD && key === sig) return;
        lastD = D; sig = key;
        M = model_();
        renderHead();
        ui.clear(note);
        if (!M.all.length && ctx.data.trades.length) note.appendChild(h('div', { class: 'empty-note' }, h('b', null, 'No payouts in this scope.'), ' Executed payouts appear here once you claim profit on a funded account.'));
        renderRibbon();
        renderMid();
        renderTable();
        hover.hide();
    }
    let lastD = null;
    update();
    return {
        update,
        unmount() { hover.hide(); if (grid) grid.destroy(); if (chart) chart.destroy(); ui.clear(root); }
    };
}
