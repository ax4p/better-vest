// Better Vest Calendar - the Trades tab: one virtualized table of every closed trade the shell filters let through.
// Row height 28 with a sticky header and pooled rows, so thousands of rows scroll smoothly. Sort by any column,
// quick filters (W / L / scratch, Long / Short), click a row for fills, initial stop / target and flags, CSV export.
// The CSV carries full-precision values; with Hide $ on you are asked first, because the file would hold dollar amounts.

import { vgrid, shortName, sideCls } from './shared.js';

// Intl.NumberFormat construction is slow, so prices and distances share cached formatters (rows are built while scrolling).
const nfCache = new Map();
function fmtFixed(v, dp) {
    if (v == null || !Number.isFinite(v)) return '—';
    let nf = nfCache.get(dp);
    if (!nf) nfCache.set(dp, nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
    return nf.format(v);
}

const ROW_H = 28;
const DETAIL_H = 138;
const TEMPLATE = '128px minmax(128px, 1.1fr) 70px 40px 54px 160px 62px 90px 64px 58px 62px 62px 98px minmax(104px, 1fr)';

export function mount(root, ctx) {
    const { h, ui, time: T, stats, fmt, model } = ctx;
    const S = () => ctx.state;
    let sort = { key: 'close', dir: -1 };
    const quick = { cls: new Set(), side: new Set() };
    let grid = null;
    let rows = [];
    let sig = '';
    let lastD = null;
    let C = null;
    const classCache = new Map();

    const titleEl = h('div', { class: 'vh2-t' });
    const quickEl = h('div', { class: 'tr-quick' });
    const statEl = h('div', { class: 'tr-stat' });
    const head = h('div', { class: 'vh2' }, titleEl, h('div', { class: 'grow' }), quickEl);
    const gridHost = h('div', { class: 'tr-grid' });
    root.appendChild(h('div', { class: 'vw' }, head, statEl, gridHost));

    // ---------- columns ----------

    const exitShort = { 'Take Profit': 'Take profit', 'Stop Loss': 'Stop loss', 'Self-requested': 'Manual', 'Corporate Action': 'Corp. action', 'Auto Deleverage': 'Auto-deleverage' };

    function columns() {
        const gross = S().basis === 'gross';
        return [
            { key: 'close', label: 'Closed (ET)', cls: 'l', sortable: true },
            { key: 'acc', label: 'Account', cls: 'l', sortable: true },
            { key: 'sym', label: 'Symbol', cls: 'l', sortable: true },
            { key: 'side', label: 'Side', cls: 'l', sortable: true },
            { key: 'qty', label: 'Qty', sortable: true },
            { key: 'px', label: 'Entry → exit', sortable: true },
            { key: 'pts', label: 'Pts', sortable: true, title: 'Points: long exit − entry, short entry − exit' },
            { key: 'net', label: gross ? 'Gross' : 'Net', sortable: true },
            { key: 'fee', label: 'Fee', sortable: true },
            { key: 'risk', label: 'Risk', sortable: true, title: 'Initial stop distance in points; – when no stop was set within 5 s of entry' },
            { key: 'r', label: 'R', sortable: true },
            { key: 'hold', label: 'Hold', sortable: true },
            { key: 'exit', label: 'Exit', cls: 'l', sortable: true },
            { key: 'tags', label: 'Tags', cls: 'l', sortable: true }
        ];
    }

    const priceDp = (t) => { const s = C.D.symbolsMap.get(t.symbol); return s && s.priceDecimals != null ? s.priceDecimals : 2; };
    const val = (t) => (S().basis === 'gross' ? t.gross : t.net);
    const baseOf = (t) => { const a = C.D.accountsById.get(t.accountId); return a && a.initialCapital > 0 ? a.initialCapital : 0; };
    const money = (v, base, o) => fmt.usd(v, { ctx: 'table', base, ...o });
    const tagsOf = (t) => {
        const out = [];
        for (const n of [C.D.notesByKey.get('trade:' + t.id), C.D.notesByKey.get('day:' + T.dayKey(t.closeTs, S().mode))]) for (const g of (n && n.tags) || []) if (!out.some((x) => x.toLowerCase() === g.toLowerCase())) out.push(g);
        return out;
    };
    const cls = (t) => {
        let c = classCache.get(t.id);
        if (!c) { c = stats.classify(t, C.D.kpiOpts().rule, C.D.symbolsMap, S().basis); classCache.set(t.id, c); }
        return c;
    };
    const qtyText = (q) => (q == null ? '—' : String(+q.toFixed(4)));

    function cellsOf(t) {
        const a = C.D.accountsById.get(t.accountId);
        const dp = priceDp(t);
        const v = val(t);
        const tg = tagsOf(t);
        return [
            h('span', null, T.fmtDate(T.etDateKey(t.closeTs), 'dm'), ' ', h('span', { class: 'mut' }, T.fmtTimeET(t.closeTs))),
            h('span', { class: 'ellip', title: a ? model.accountName(a) : t.accountId }, shortName(a, model.accountName)),
            (t.display || t.symbol).replace('-PERP', ''),
            h('span', { class: 'side ' + t.side }, t.side === 'long' ? 'L' : 'S'),
            qtyText(t.qty),
            h('span', { class: 'mut' }, `${fmtFixed(t.entryPx, dp)} → ${fmtFixed(t.exitPx, dp)}`),
            h('span', { class: sideCls(t.points) }, t.points == null ? '—' : T.fmtPts(t.points, { dp: 2, unit: false })),
            h('span', { class: 'strong ' + sideCls(v) }, money(v, baseOf(t))),
            h('span', { class: 'mut' }, money(-t.fee, baseOf(t))),
            h('span', { class: 'mut' }, fmtFixed(t.riskPts, 1)),
            h('span', { class: sideCls(t.rMult) }, t.rMult == null ? '—' : T.fmtR(t.rMult)),
            h('span', { class: 'mut' }, T.fmtDur(t.heldMs)),
            h('span', { class: 'ellip mut', title: model.exitLabel(t.exit) }, exitShort[model.exitLabel(t.exit)] || model.exitLabel(t.exit)),
            tg.length ? h('span', { class: 'tcell' }, tg.slice(0, 2).map((g) => h('span', { class: 'tag-chip' }, g)), tg.length > 2 ? h('span', { class: 'mut' }, '+' + (tg.length - 2)) : null) : ''
        ];
    }

    const stampET = (ts) => (ts == null ? '—' : `${T.fmtDate(T.etDateKey(ts), 'dm')} ${T.fmtTimeET(ts)} ET`);

    function detail(t) {
        const a = C.D.accountsById.get(t.accountId);
        const f = t.fills || {};
        const dp = priceDp(t);
        const g = (k, v) => h('div', null, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
        const px = (v) => fmtFixed(v, dp);
        const base = baseOf(t);
        const slText = t.initialSL != null ? `${px(t.initialSL)} · ${T.fmtPts(t.riskPts, { dp: 2, sign: false })} away` : ({ late: 'set after entry, ignored', 'wrong-side': 'wrong side, ignored', none: 'none at entry' }[t.slFlag] || 'none at entry');
        const tpText = t.initialTP != null ? `${px(t.initialTP)} · ${T.fmtPts(t.rewardPts, { dp: 2, sign: false })} away` : ({ late: 'set after entry, ignored', 'wrong-side': 'wrong side, ignored', none: 'none at entry' }[t.tpFlag] || 'none at entry');
        const warns = [];
        if (t.flags && t.flags.feeMatch === false) warns.push('Fee differs from the sum of its fills.');
        if (t.flags && t.flags.pnlMatch === false) warns.push('P&L differs from (exit − entry) × size.');
        return h('div', { class: 'det-in tr-det' },
            h('div', { class: 'det-grid' },
                g('Opened', stampET(t.openTs)), g('Closed', stampET(t.closeTs)),
                g('Entry (avg)', px(t.entryPx)), g('Exit (avg)', px(t.exitPx)),
                g('Size', `${qtyText(t.qty)}${f.peakQty && f.peakQty !== t.qty ? ' (peak ' + qtyText(f.peakQty) + ')' : ''}${t.leverage ? ' · ' + t.leverage + 'x' : ''}`),
                g('Fills', f.n ? `${f.entries} in · ${f.exits} out${f.scaleIns ? ' · ' + f.scaleIns + ' scale-in' : ''}${f.scaleOuts ? ' · ' + f.scaleOuts + ' scale-out' : ''}` : '—'),
                g('Initial stop', slText), g('Initial target', tpText),
                g('Planned RR', t.plannedRR != null ? T.fmtR(t.plannedRR, { sign: false }) : '—'), g('Realized R', t.rMult != null ? T.fmtR(t.rMult) : '—'),
                g('Gross', money(t.gross, base)), g('Fee', money(-t.fee, base)), g('Funding', money(t.funding, base)), g('Net', money(t.net, base)),
                g('Exit reason', model.exitLabel(t.exit)), g('Account', h('span', { class: 'ellip', title: a ? model.accountName(a) : t.accountId }, a ? model.accountName(a) : t.accountId))),
            warns.length ? h('div', { class: 'flags' }, warns.map((w) => h('span', { class: 'warnline' }, w))) : null);
    }

    // ---------- data ----------

    const sortVal = {
        close: (t) => t.closeTs, acc: (t) => shortName(C.D.accountsById.get(t.accountId), model.accountName).toLowerCase(), sym: (t) => (t.display || t.symbol).toLowerCase(),
        side: (t) => t.side, qty: (t) => t.qty, px: (t) => t.entryPx, pts: (t) => t.points, net: (t) => val(t), fee: (t) => t.fee, risk: (t) => t.riskPts, r: (t) => t.rMult,
        hold: (t) => t.heldMs, exit: (t) => model.exitLabel(t.exit).toLowerCase(), tags: (t) => tagsOf(t).length
    };

    function build() {
        let list = C.D.filtered;
        if (quick.cls.size) list = list.filter((t) => quick.cls.has(cls(t)));
        if (quick.side.size) list = list.filter((t) => quick.side.has(t.side));
        const fn = sortVal[sort.key];
        const keyed = list.map((t) => [fn(t), t]);
        const dir = sort.dir;
        keyed.sort((a, b) => {
            const x = a[0], y = b[0];
            const nx = x == null || Number.isNaN(x), ny = y == null || Number.isNaN(y);
            if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;   // empty values always last
            const c = x < y ? -1 : x > y ? 1 : 0;
            return c ? c * dir : (a[1].id < b[1].id ? -1 : 1);
        });
        return keyed.map((k) => k[1]);
    }

    // ---------- quick filters, header, stats ----------

    function renderQuick() {
        ui.clear(quickEl);
        const tog = (set, k) => { if (set.has(k)) set.delete(k); else set.add(k); refresh(); };
        const chip = (label, set, k, title) => ui.chip(label, { on: set.has(k), onClick: () => tog(set, k), title });
        quickEl.append(
            h('div', { class: 'chips', role: 'group', 'aria-label': 'Result' }, chip('Winners', quick.cls, 'win', 'Net above zero, scratch excluded'), chip('Losers', quick.cls, 'loss'), chip('Scratch', quick.cls, 'scratch', 'Inside the scratch rule')),
            h('span', { class: 'tr-sep' }),
            h('div', { class: 'chips', role: 'group', 'aria-label': 'Side' }, chip('Long', quick.side, 'long'), chip('Short', quick.side, 'short')),
            h('span', { class: 'tr-sep' }),
            h('button', { class: 'btn', type: 'button', title: 'Export the rows shown as CSV (Shift+E)', onclick: exportCsv }, 'Export CSV', ui.kbd('⇧E')));
    }

    function renderStat() {
        ui.clear(statEl);
        const total = C.D.filtered.length;
        let net = 0, w = 0, l = 0, s = 0, base = 0;
        const seen = new Set();
        for (const t of rows) {
            net += val(t);
            const c = cls(t);
            if (c === 'win') w++; else if (c === 'loss') l++; else s++;
            if (!seen.has(t.accountId)) { seen.add(t.accountId); base += baseOf(t); }
        }
        const filtered = rows.length !== total;
        ui.append(statEl, [
            h('span', null, h('b', null, fmt.count(rows.length)), ` of ${fmt.count(total)} trades`, filtered ? h('span', { class: 'mut' }, ' (quick filters on)') : null),
            h('span', { class: 'dotsep' }, 'Σ ', h('b', { class: sideCls(net) }, money(net, base))),
            h('span', { class: 'dotsep mut' }, `${w}W · ${l}L · ${s} scratch`),
            h('span', { class: 'dotsep mut' }, 'sorted by ' + (columns().find((c) => c.key === sort.key) || {}).label + (sort.dir > 0 ? ' ↑' : ' ↓')),
            S().hide ? h('span', { class: 'dotsep mut' }, 'Hide $: amounts show as % of each account') : null]);
    }

    function renderTitle() {
        ui.clear(titleEl);
        titleEl.append(h('h1', null, 'Trades'), h('div', { class: 'sub' }, 'Every closed trade in scope · click a row for fills, stops and flags'));
    }

    // ---------- grid ----------

    function buildGrid() {
        if (grid) grid.destroy();
        ui.clear(gridHost);
        grid = vgrid({
            template: TEMPLATE, minWidth: 1200, rowH: ROW_H, headH: 32, detail, detailH: DETAIL_H, rowKey: (t) => t.id, label: 'Trades',
            head: columns(), renderRow: (t) => cellsOf(t),
            rowCls: (t) => (val(t) > 0 ? 'rw-up' : val(t) < 0 ? 'rw-dn' : ''),
            onSort: (key) => { sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === 'close' || key === 'net' || key === 'pts' || key === 'r' || key === 'hold' || key === 'qty' || key === 'fee' || key === 'risk' ? -1 : 1 }; refresh(); },
            empty: ctx.data.trades.length ? 'No trades match these filters.' : 'No trades yet. Closed positions appear here once they sync.'
        });
        gridHost.appendChild(grid.el);
    }

    function refresh() {
        rows = build();
        renderQuick();
        renderStat();
        if (grid) { grid.setSort(sort.key, sort.dir); grid.setRows(rows); grid.scrollToTop(); }
    }

    // ---------- CSV ----------

    // A value that starts with = + - @ would run as a formula in a spreadsheet: prefix text with an apostrophe.
    const csvCell = (v) => {
        if (v == null) return '';
        let s = typeof v === 'number' ? String(v) : String(v);
        if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    function exportCsv() {
        if (!rows.length) { ui.toast('No trades to export', { tone: 'warn' }); return; }
        if (S().hide) {
            ui.sheet((body, api) => {
                body.appendChild(h('p', { class: 'cf-p' }, 'Hide $ is on. A CSV is a plain file: dollar amounts and account ids would be written in full.'));
                body.appendChild(h('div', { class: 'cf-actions' },
                    h('button', { class: 'btn primary', type: 'button', onclick: () => { api.close(); writeCsv(true); } }, 'Export with $ amounts'),
                    h('button', { class: 'btn', type: 'button', onclick: () => { api.close(); writeCsv(false); } }, 'Export without $ columns'),
                    h('button', { class: 'btn ghost', type: 'button', onclick: api.close }, 'Cancel')));
            }, { title: 'Export while Hide $ is on?', width: 460 });
            return;
        }
        writeCsv(true);
    }

    function writeCsv(withMoney) {
        const cols = ['close_time_et', 'close_time_utc', 'open_time_et', 'vest_day', 'account', 'account_id', 'symbol', 'display', 'side', 'qty', 'entry_price', 'exit_price', 'points',
            ...(withMoney ? ['gross', 'fee', 'funding', 'net', 'risk_usd'] : []), 'risk_pts', 'planned_rr', 'r_multiple', 'held_seconds', 'exit_reason', 'tags', 'trade_id'];
        const lines = [cols.join(',')];
        const etStamp = (ts) => (ts == null ? '' : T.etDateKey(ts) + ' ' + T.fmtTimeET(ts));
        for (const t of rows) {
            const a = C.D.accountsById.get(t.accountId);
            const r = [etStamp(t.closeTs), t.closeTs == null ? '' : new Date(t.closeTs).toISOString(), etStamp(t.openTs), T.dayKey(t.closeTs, S().mode), a ? model.accountName(a) : '', t.accountId, t.symbol, t.display, t.side, t.qty, t.entryPx, t.exitPx, t.points];
            if (withMoney) r.push(t.gross, t.fee, t.funding, t.net, t.riskUsd);
            r.push(t.riskPts, t.plannedRR, t.rMult, t.heldMs != null ? t.heldMs / 1000 : null, model.exitLabel(t.exit), tagsOf(t).join('; '), t.id);
            lines.push(r.map(csvCell).join(','));
        }
        const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
        const stamp = T.etDateKey(ctx.now()).replace(/-/g, '');
        const link = h('a', { href: URL.createObjectURL(blob), download: `better-vest-trades-${stamp}.csv` });
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        ui.toast(`Exported ${rows.length.toLocaleString('en-US')} trades${withMoney ? '' : ' without dollar columns'}`);
    }

    // ---------- lifecycle ----------

    function update() {
        const st = S();
        const D = ctx.derived();
        const key = [st.hide, st.basis, st.mode].join('|');
        if (D === lastD && key === sig) return;
        const dataChanged = D !== lastD;
        lastD = D; sig = key;
        C = { D };
        if (dataChanged) classCache.clear();
        renderTitle();
        buildGrid();
        refresh();
    }

    function onKey(e) {
        if (e.key === 'E' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) { exportCsv(); return true; }
        return false;
    }
    update();
    return {
        update, onKey,
        unmount() { if (grid) grid.destroy(); ui.clear(root); }
    };
}
