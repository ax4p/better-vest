// Better Vest Calendar - the Calendar tab: month header + hero, KPI ribbon, grid, legend, selection bar.
// mount(root, ctx) -> {update(ctx), unmount(), onKey(e)}. All numbers come from ctx.derived() (stats.js) and every
// money value goes through ctx.fmt so Hide $ cannot leak. Hover cards explain each number (formula, inputs, n, scope).

import { sparkline } from '../charts.js';

const LS_MORE = 'bv-journal-more';
const LINES = [['nwr', 'Trades · win rate'], ['pts', 'Points'], ['r', 'R'], ['risk', 'Avg risk'], ['fees', 'Fees']];

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

export function mount(root, ctx) {
    const { h, ui, time: T, stats, fmt } = ctx;
    const { icon } = ui;
    let M = null;               // model of the month on screen (hover cards read it)
    let more = lsGet(LS_MORE) === '1';
    let prevSig = new Map();    // dayKey -> signature, to settle cells changed by a sync
    let prevMonth = null, prevHero = null;
    let drag = null;
    let ro = null;

    // ---------- skeleton ----------
    const titleEl = h('h1', { 'aria-live': 'polite' });
    const lensSeg = ui.seg({ options: [{ k: 'pnl', label: 'P&L' }, { k: 'pay', label: 'Payouts' }], value: 'pnl', cls: 'lens', label: 'Lens', onChange: (k) => ctx.set({ lens: k }) });
    const navEl = h('div', { class: 'mh-nav' },
        h('button', { class: 'icon-btn', type: 'button', title: 'Previous month ([)', 'aria-label': 'Previous month', onclick: () => ctx.shiftMonth(-1) }, icon('chevL', 16)),
        titleEl,
        h('button', { class: 'icon-btn', type: 'button', title: 'Next month (])', 'aria-label': 'Next month', onclick: () => ctx.shiftMonth(1) }, icon('chevR', 16)),
        h('button', { class: 'btn', type: 'button', title: 'Jump to today (T)', onclick: () => ctx.goToday() }, 'Today'),
        h('div', { class: 'grow' }), lensSeg);
    const heroEl = h('div', { class: 'hero' });
    const curveEl = h('div', { class: 'mcurve', 'aria-hidden': 'true' });
    const paidEl = h('div', { class: 'paid' });
    const headEl = h('section', { class: 'mh' }, navEl, h('div', { class: 'mh-main' }, heroEl, curveEl, paidEl));
    const ribbonEl = h('div', { class: 'ribbon', role: 'list', 'aria-label': 'Key metrics' });
    const moreEl = h('div', { class: 'ribbon more', role: 'list', 'aria-label': 'More metrics' });
    const noteEl = h('div');
    const calEl = h('div', { class: 'cal', role: 'group' });
    const legendEl = h('div', { class: 'legend' });
    const selEl = h('div');
    root.append(headEl, noteEl, h('div', { class: 'rbw' }, ribbonEl, moreEl), calEl, legendEl, selEl);

    const tips = ui.hoverCard(root, '[data-tip]', (target, el) => buildTip(target.dataset.tip, el));
    const onRootLeave = () => hotCell(null);
    root.addEventListener('pointerleave', onRootLeave);

    ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { sizeClass(); }) : null;
    ro && ro.observe(calEl);

    // ---------- formatting helpers ----------
    const S = () => ctx.state;
    const sg = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'nil');
    const usd = (v, o) => fmt.usd(v, o);
    const money = (v, o) => fmt.usd(v, { ctx: 'table', ...o });
    // full 2-decimal money, with a whole-dollar twin that narrow tiles switch to (CSS container query)
    const dual = (v, o) => (S().hide || v == null ? money(v, o) : h('span', null, h('span', { class: 'f' }, money(v, o)), h('span', { class: 's2' }, fmt.usd(v, { ctx: 'cell', ...o }))));

    function unitSum(days, unit, basis) {
        let v = 0, n = 0;
        const syms = new Set();
        for (const d of days) {
            if (!d || !d.n) continue;
            for (const s of d.symbols) syms.add(s);
            const x = stats.cellValue(d, unit, basis);
            if (x != null) { v += x; n++; }
        }
        if (unit === 'pts' && syms.size > 1) return { v: null, n: 0 };
        return { v: n ? v : null, n };
    }

    // The unit actually shown for money: with Hide $ on, dollars turn into % of capital.
    function effUnit() { return S().unit === 'usd' && S().hide ? 'pct' : S().unit; }

    function cellValueFor(day) {
        const st = S();
        const u = effUnit();
        return stats.cellValue(day, u, st.basis);
    }

    // ---------- tooltips ----------

    const pctOf = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
    const nfmt = (v, dp = 2) => (v == null ? '—' : T.fmtNum(v, dp));
    const side = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');

    function scopeText() {
        const st = S();
        const parts = [];
        parts.push(st.accounts ? (st.accounts.length === 1 ? '1 account' : st.accounts.length + ' accounts') : ({ all: 'All accounts', funded: 'Funded accounts', eval: 'Evaluation accounts', primary: 'Primary account' })[st.scope]);
        if (st.symbols.length) parts.push(st.symbols.join(', '));
        parts.push(st.basis === 'gross' ? 'Gross basis' : 'Net basis');
        parts.push(T.DAY_MODES[st.mode].label);
        return parts.join(' · ');
    }

    function popBase(el, title, sub, { low = false } = {}) {
        el.appendChild(h('h4', null, title, low ? h('span', { class: 'tag' }, 'low sample') : null));
        if (sub) el.appendChild(h('div', { class: 'sub' }, sub));
    }
    function dl(el, rows) {
        const d = h('dl');
        for (const [k, v, cls] of rows) { if (v == null) continue; d.appendChild(h('dt', null, k)); d.appendChild(h('dd', { class: cls || '' }, v)); }
        el.appendChild(d);
    }
    function foot(el, ...lines) { el.appendChild(h('div', { class: 'foot' }, lines.filter(Boolean).map((l) => h('span', null, l)))); }

    function buildTip(spec, el) {
        if (!M) return false;
        const [kind, arg] = spec.split(':');
        if (kind === 'cell') return dayTip(arg, el);
        if (kind === 'wk') return weekTip(+arg, el);
        if (kind === 'kpi') return kpiTip(arg, el);
        if (kind === 'hero') return heroTip(el);
        return false;
    }

    function heroTip(el) {
        const k = M.k;
        if (S().lens === 'pay') {
            popBase(el, 'Paid out in ' + T.fmtMonth(S().month), `${M.payN} executed payout${M.payN === 1 ? '' : 's'}`);
            el.appendChild(h('div', { class: 'formula' }, 'Paid out = Σ net amount of EXECUTED payouts dated this month (ET calendar date). Processing payouts are pending; refunded and failed ones are excluded.'));
            dl(el, [['Net to you', money(M.payNet)], ['Gross requested', money(M.payGross)], ['Vest share', money(M.payGross - M.payNet)], ['Pending (processing)', M.payPending ? money(M.payPending) : null]]);
            foot(el, 'Payouts follow the account scope, not the symbol filters.');
            return true;
        }
        const label = S().basis === 'gross' ? 'Gross' : 'Net';
        popBase(el, label + ' P&L · ' + T.fmtMonth(S().month), `${k.net.n} trades · ${M.mDays.size} trading day${M.mDays.size === 1 ? '' : 's'}`, { low: k.net.n < 30 && k.net.n > 0 });
        const u = effUnit();
        el.appendChild(h('div', { class: 'formula' }, u === 'pct' ? 'Σ of each day’s return: day P&L ÷ capital of the accounts that traded that day.' : u === 'pts' ? 'Σ points moved (long: exit − entry, short: entry − exit), one symbol.' : u === 'r' ? 'Σ R = Σ (points ÷ initial risk) over trades with a stop set within 2 min of entry.' : (S().basis === 'gross' ? k.gross.formula : k.net.formula)));
        dl(el, [['Gross', money(k.net.parts.gross)], ['Fees', money(-k.net.parts.fees)], ['Funding', money(k.net.parts.funding)], ['Net', money(k.net.value), side(k.net.value)]]);
        foot(el, 'Open positions and payouts are not included.', scopeText());
        return true;
    }

    function kpiTip(key, el) {
        const k = M.k;
        const low = (n) => n > 0 && n < 30;
        const R = {
            net: () => { const m = S().basis === 'gross' ? k.gross : k.net; return [S().basis === 'gross' ? 'Gross P&L' : 'Net P&L', m.n, m.formula, [['Gross', money(k.net.parts.gross)], ['Fees', money(-k.net.parts.fees)], ['Funding', money(k.net.parts.funding)], ['Net', money(k.net.value), side(k.net.value)]], 'Open positions and payouts are not included.']; },
            winRate: () => [`Win rate`, k.winRate.n, k.winRate.formula, [['Wins', String(k.winRate.parts.wins)], ['Losses', String(k.winRate.parts.losses)], ['Scratch (excluded)', String(k.winRate.parts.scratch)], ['Win rate incl. scratch', pctOf(k.winRateAll.value)]], 'Scratch rule: ' + (k.rule.value.kind === 'tick' ? '|points| ≤ one tick' : k.rule.value.kind === 'usd' ? `|P&L| ≤ $${k.rule.value.usd}` : 'off') + ` · ${k.scratchCount.value} excluded`],
            profitFactor: () => ['Profit factor', k.profitFactor.n, k.profitFactor.formula, [['Σ wins', money(k.profitFactor.parts.grossProfit)], ['Σ |losses|', money(k.profitFactor.parts.grossLoss)], ['Payoff (avg win ÷ avg loss)', nfmt(k.payoff.value)]], k.profitFactor.value == null ? 'Needs at least 5 trades and one losing trade.' : null],
            avgRisk: () => {
                const rows = Object.entries(k.avgRisk.bySymbol).map(([sym, r]) => {
                    const name = (M.symbolsMap.get(sym) || {}).display || sym;
                    return [name, r.avgRiskPts == null ? '—' : `${T.fmtPts(r.avgRiskPts, { dp: 1, sign: false })} · ${fmt.usd(r.avgRiskUsd, { ctx: 'table', sign: false })}`];
                });
                rows.push(['Stop known at entry', `${k.avgRisk.known ?? 0} / ${k.net.n}`]);
                return ['Average risk', k.net.n, k.avgRisk.formula, rows, k.avgRisk.symbol ? null : 'Risk is per symbol: pick one in the Symbol filter to see a single number.'];
            },
            rr: () => ['Planned RR and realized R', k.plannedRR.n, k.plannedRR.formula + '. ' + k.avgR.formula + '.', [['Planned RR (median)', k.plannedRR.value == null ? '—' : T.fmtR(k.plannedRR.value, { sign: false }) + ` (n ${k.plannedRR.n})`], ['Planned RR (mean)', k.plannedRR.parts.mean == null ? '—' : T.fmtR(k.plannedRR.parts.mean, { sign: false })], ['Avg realized R', k.avgR.value == null ? '—' : T.fmtR(k.avgR.value) + ` (n ${k.avgR.n})`, side(k.avgR.value)], ['Median realized R', k.avgR.parts.median == null ? '—' : T.fmtR(k.avgR.parts.median)], ['R coverage', pctOf(k.rCoverage.value)]], 'Only trades whose stop was set within 2 min of entry (and is 2+ ticks, under 10% away) have a known risk.'],
            maxDrawdown: () => {
                const dd = k.maxDrawdown;
                const rows = [['Depth', money(dd.value), 'dn']];
                if (dd.peakTs) rows.push(['Peak', T.fmtDate(T.dayKey(dd.peakTs, S().mode), 'dm') + ' ' + T.fmtTimeET(dd.peakTs, { seconds: false })]);
                else if (dd.value < 0) rows.push(['Peak', 'start of the period']);
                if (dd.troughTs) rows.push(['Trough', T.fmtDate(T.dayKey(dd.troughTs, S().mode), 'dm') + ' ' + T.fmtTimeET(dd.troughTs, { seconds: false })]);
                if (dd.pct != null) rows.push(['% of starting balance', T.fmtPct(dd.pct)]);
                return ['Max drawdown', dd.n, dd.formula, rows, dd.pct == null ? 'Percent shows when one capital account is selected.' : null];
            },
            expectancy: () => ['Expectancy', k.expectancy.n, k.expectancy.formula, [['Σ P&L', money(k.expectancy.parts.total)], ['Trades', String(k.expectancy.n)]]],
            avgWL: () => ['Average win / loss', k.avgWin.n + k.avgLoss.n, 'Avg win = Σ wins ÷ wins. Avg loss = Σ losses ÷ losses.', [['Avg win', money(k.avgWin.value), 'up'], ['Avg loss', money(k.avgLoss.value), 'dn'], ['Payoff', nfmt(k.payoff.value)], ['Largest win', money(k.largestWin.value), 'up'], ['Largest loss', money(k.largestLoss.value), 'dn']]],
            bestWorst: () => ['Best / worst day', k.bestDay.n, 'Daily P&L by Vest day.', [['Best', money(k.bestDay.value) + (k.bestDay.parts.key ? ' · ' + T.fmtDate(k.bestDay.parts.key, 'dm') : ''), 'up'], ['Worst', money(k.worstDay.value) + (k.worstDay.parts.key ? ' · ' + T.fmtDate(k.worstDay.parts.key, 'dm') : ''), 'dn'], ['Avg day', money(k.avgDay.value)], ['Best-day share of green', pctOf(k.bestDayShare.value)]]],
            dayWR: () => ['Day win rate', k.dayWinRate.n, k.dayWinRate.formula, [['Green days', String(k.greenDays.value)], ['Red days', String(k.redDays.value)], ['Flat days', String(k.flatDays.value)]]],
            streak: () => ['Streaks', k.streakTrades.n, k.streakTrades.formula, [['Best run (trades)', 'W' + k.streakTrades.value.maxWin], ['Worst run (trades)', 'L' + k.streakTrades.value.maxLoss], ['Current', k.streakTrades.value.current > 0 ? 'W' + k.streakTrades.value.current : k.streakTrades.value.current < 0 ? 'L' + -k.streakTrades.value.current : '—'], ['Best / worst day run', `W${k.streakDays.value.maxWin} / L${k.streakDays.value.maxLoss}`]]],
            avgHold: () => ['Average hold', k.avgHold.n, k.avgHold.formula, [['Long', `${k.long.value.n} trades · ${pctOf(k.long.value.winRate)} WR`], ['Short', `${k.short.value.n} trades · ${pctOf(k.short.value.winRate)} WR`]]],
            feeDrag: () => ['Fee drag', k.feeDrag.n, k.feeDrag.formula, [['Fees', money(k.feeDrag.parts.fees)], ['Winning gross', money(k.feeDrag.parts.positiveGross)]]]
        };
        const spec = R[key] && R[key]();
        if (!spec) return false;
        const [title, n, formula, rows, note] = spec;
        popBase(el, title, `n = ${n} · ${T.fmtMonth(S().month)}`, { low: low(n) });
        el.appendChild(h('div', { class: 'formula' }, formula));
        dl(el, rows);
        foot(el, note, scopeText());
        return true;
    }

    function dayKpis(key) {
        const d = M.D.days.get(key);
        const list = d ? d.tradeIds.map((id) => M.D.tradesById.get(id)) : [];
        return { d, list, k: list.length ? stats.kpis(list, M.D.kpiOpts({ days: new Map([[key, d]]) })) : null };
    }

    function dayTip(key, el) {
        const { d, list, k } = dayKpis(key);
        const pay = M.D.payDays.get(key);
        popBase(el, T.fmtDate(key, 'long'), d ? `${d.n} trade${d.n === 1 ? '' : 's'}` : 'No trades closed');
        if (d && k) {
            const v = S().basis === 'gross' ? d.gross : d.net;
            el.appendChild(h('div', { style: 'font-size:20px;font-weight:600;margin:6px 0 2px;font-variant-numeric:tabular-nums', class: side(v) }, money(v, { base: d.capitalBase })));
            dl(el, [['Gross', money(d.gross)], ['Fees', money(-d.fees)], ['Funding', money(d.funding)],
                ['Wins / losses', `${d.wins}W ${d.losses}L${d.scratch ? ' ' + d.scratch + 'S' : ''}`], ['Win rate', pctOf(k.winRate.value)], ['Profit factor', k.profitFactor.value == null ? '—' : nfmt(k.profitFactor.value)],
                ['Best / worst', `${money(d.best)} / ${money(d.worst)}`], ['Avg risk', dayRisk(d) != null ? T.fmtPts(dayRisk(d), { dp: 1, sign: false }) : (d.riskN && d.symbols.size > 1 ? 'mixed symbols' : null)], ['Accounts', String(d.accounts.size)]]);
            const f = d.byPhase.funded.n + d.byPhase.instant.n, e = d.byPhase.eval.n;
            if (f && e) foot(el, `Funded ${money(d.byPhase.funded.net + d.byPhase.instant.net)}`, `Evaluation ${money(d.byPhase.eval.net)}`);
            if (d.carried) foot(el, `${d.carried} position${d.carried > 1 ? 's' : ''} opened before the 20:00 ET reset (counted on the close day)`);
            const bars = list.map((t) => t.net);
            if (bars.length > 1) {
                const mx = Math.max(...bars.map(Math.abs)) || 1;
                el.appendChild(h('div', { class: 'mini-bars' }, bars.map((b) => h('i', { class: b >= 0 ? 'up' : 'dn', style: `height:${Math.max(4, Math.round(Math.abs(b) / mx * 34))}px` }))));
            }
        } else {
            el.appendChild(h('div', { class: 'sub', style: 'margin-top:6px' }, 'Nothing closed in this Vest day.'));
        }
        if (pay && pay.items.length) {
            const done = pay.items.filter((p) => p.status === 'EXECUTED');
            el.appendChild(h('div', { class: 'foot gold' }, h('span', { class: 'gold' }, `${pay.items.length} payout${pay.items.length > 1 ? 's' : ''}: ${done.length ? money(pay.net) + ' net executed' : pay.pending ? money(pay.pending) + ' processing' : pay.items[0].status.toLowerCase()}`)));
        }
        const n = M.D.notesByKey.get('day:' + key);
        if (n && n.text) el.appendChild(h('div', { class: 'foot' }, h('span', null, '“' + (n.text.length > 90 ? n.text.slice(0, 90) + '…' : n.text) + '”')));
        return true;
    }

    function weekTip(i, el) {
        const w = M.weeks[i];
        if (!w) return false;
        // a week is a week: its days in the neighbouring month count too, so the total never changes with the month on screen
        const ds = w.days.map((d) => M.D.days.get(d.key)).filter(Boolean);
        popBase(el, `${w.label} · ${T.fmtDate(w.first.key, 'dm')} – ${T.fmtDate(w.last.key, 'dm')}`, w.sum.days ? `${w.sum.days} trading day${w.sum.days > 1 ? 's' : ''} · ${w.sum.n} trades` : 'No trades this week');
        if (!w.sum.days) return true;
        const list = ds.flatMap((d) => d.tradeIds.map((id) => M.D.tradesById.get(id)));
        const k = stats.kpis(list, M.D.kpiOpts({ days: new Map(ds.map((d) => [d.key, d])) }));
        const vals = w.days.filter((d) => d.visible).map((d) => { const dd = M.D.days.get(d.key); return dd ? (S().basis === 'gross' ? dd.gross : dd.net) : null; });
        const mx = Math.max(1, ...vals.map((v) => Math.abs(v || 0)));
        el.appendChild(h('div', { class: 'mini-bars' }, vals.map((v) => (v == null ? h('i', { class: 'nil' }) : h('i', { class: v >= 0 ? 'up' : 'dn', style: `height:${Math.max(4, Math.round(Math.abs(v) / mx * 34))}px` })))));
        dl(el, [['Net', money(k.net.value), side(k.net.value)], ['Gross', money(k.net.parts.gross)], ['Fees', money(-k.net.parts.fees)], ['Win rate', `${pctOf(k.winRate.value)} (${k.winRate.parts.wins}W ${k.winRate.parts.losses}L)`], ['Profit factor', k.profitFactor.value == null ? '—' : nfmt(k.profitFactor.value)], ['Best day', money(k.bestDay.value), 'up'], ['Worst day', money(k.worstDay.value), 'dn']]);
        const out = w.days.filter((d) => !d.inMonth && M.D.days.has(d.key)).length;
        foot(el, out ? `Includes ${out} day${out > 1 ? 's' : ''} in the neighbouring month.` : null, 'Click to select the week.');
        return true;
    }

    // ---------- build the month ----------

    function monthModel() {
        const st = S();
        const D = ctx.derived();
        const [y, m] = st.month.split('-').map(Number);
        const rawWeeks = T.monthGrid(y, m);
        const today = ctx.todayKey();
        const mDays = new Map();
        const keysInMonth = [];
        for (const w of rawWeeks) for (const d of w.days) if (d.inMonth) { keysInMonth.push(d.key); const day = D.days.get(d.key); if (day) mDays.set(d.key, day); }
        // weekend columns only when the month has activity there (payout dates count in the Payouts lens)
        // weekend columns appear when any displayed day there has activity (also the neighbouring month's,
        // because week totals count every day of the week)
        let sat = false, sun = false;
        for (const w of rawWeeks) for (const d of w.days) {
            if (d.dow !== 6 && d.dow !== 0) continue;
            const act = D.days.has(d.key) || (st.lens === 'pay' && D.payDays.has(d.key));
            if (act) { if (d.dow === 6) sat = true; else sun = true; }
        }
        const cols = [1, 2, 3, 4, 5]; if (sat) cols.push(6); if (sun) cols.push(0);
        const list = [];
        for (const day of mDays.values()) for (const id of day.tradeIds) list.push(D.tradesById.get(id));
        const k = stats.kpis(list, D.kpiOpts({ days: mDays }));
        // payouts in the month
        let payNet = 0, payGross = 0, payN = 0, payPending = 0;
        for (const key of keysInMonth) { const p = D.payDays.get(key); if (p) { payNet += p.net; payGross += p.gross; payN += p.n; payPending += p.pending; } }
        // intensity scale: trailing 365 days ending at the month's last day, in the units on screen
        const unit = effUnit();
        const monthEnd = keysInMonth[keysInMonth.length - 1];
        const entries = [];
        for (const [key, day] of D.days) if (key <= monthEnd) entries.push({ key, value: stats.cellValue(day, unit, st.basis) });
        let scale = stats.scaleFromDays(entries, { asOf: monthEnd });
        const usdEntries = unit === 'usd' ? null : [...D.days].filter(([key]) => key <= monthEnd).map(([key, day]) => ({ key, value: stats.cellValue(day, 'usd', st.basis) }));
        const usdScale = usdEntries ? stats.scaleFromDays(usdEntries, { asOf: monthEnd }) : scale;
        const payEntries = [];
        for (const [key, p] of D.payDays) if (p.n && key <= monthEnd) payEntries.push({ key, value: p.net });
        const payScale = stats.scaleFromDays(payEntries, { asOf: monthEnd, windowDays: 3650 });
        // best day of the month (sparkle)
        let bestKey = null, bestV = 0;
        for (const [key, day] of mDays) { const v = st.basis === 'gross' ? day.gross : day.net; if (v > bestV) { bestV = v; bestKey = key; } }
        const weeks = rawWeeks.map((w) => {
            const vis = w.days.map((d) => ({ ...d, visible: cols.includes(d.dow) }));
            const inDays = vis.map((d) => D.days.get(d.key)).filter(Boolean);
            const sum = stats.sumDays(inDays);
            let payW = 0, payWn = 0;
            for (const d of vis) { const p = D.payDays.get(d.key); if (p) { payW += p.net; payWn += p.n; } }
            return { ...w, days: vis, first: vis[0], last: vis[vis.length - 1], sum, unit: unitSum(inDays, unit, st.basis), payW, payWn, cur: vis.some((d) => d.key === today) };
        });
        return { D, st, y, m, weeks, cols, mDays, k, list, payNet, payGross, payN, payPending, unit, scale, usdScale, payScale, today, bestKey, keysInMonth, symbolsMap: D.symbolsMap, monthEnd };
    }

    function split(M2) {
        let f = 0, e = 0, fn = 0, en = 0;
        const b = S().basis === 'gross' ? 'gross' : 'net';
        for (const d of M2.mDays.values()) { f += d.byPhase.funded[b] + d.byPhase.instant[b]; fn += d.byPhase.funded.n + d.byPhase.instant.n; e += d.byPhase.eval[b]; en += d.byPhase.eval.n; }
        return { f, e, fn, en };
    }

    function renderHero() {
        const st = S();
        ui.clear(heroEl); ui.clear(paidEl);
        const pay = st.lens === 'pay';
        const u = effUnit();
        let num;
        if (pay) {
            const txt = st.hide ? fmt.bullets : T.heroParts(M.payNet);
            num = h('div', { class: 'hero-num gold', 'data-tip': 'hero', tabindex: 0, 'aria-label': 'Paid out this month' });
            if (st.hide) num.textContent = txt;
            else num.append(h('span', { class: 'cur' }, '$'), h('span', { class: 'int' }, txt.int), h('span', { class: 'ce' }, txt.cents));
        } else {
            const sum = unitSum([...M.mDays.values()], u, st.basis);
            const v = sum.v;
            num = h('div', { class: 'hero-num ' + (v == null ? 'nil' : sg(v)), 'data-tip': 'hero', tabindex: 0, 'aria-label': 'Month result' });
            if (v == null) num.textContent = M.mDays.size ? '—' : (u === 'usd' ? '$0' : '0');
            else if (u === 'usd') {
                const hp = T.heroParts(v);
                num.append(h('span', { class: 'sg' }, hp.sign), h('span', { class: 'cur' }, '$'), h('span', { class: 'int' }, hp.int), h('span', { class: 'ce' }, hp.cents));
                if (ctx.syncPulse && prevHero != null && Math.abs(prevHero - v) >= 0.01) {
                    const iEl = num.querySelector('.int'), cEl = num.querySelector('.ce');
                    const from = prevHero;
                    const t0 = performance.now();
                    if (!ui.reducedMotion()) {
                        const step = (now) => {
                            const kk = Math.min(1, (now - t0) / 360), e = 1 - Math.pow(1 - kk, 3);
                            const p = T.heroParts(from + (v - from) * e);
                            iEl.textContent = p.int; cEl.textContent = p.cents;
                            if (kk < 1 && iEl.isConnected) requestAnimationFrame(step);
                        };
                        requestAnimationFrame(step);
                    }
                }
                prevHero = v;
            } else {
                const txt = fmt.unitValue(v, u, { sign: true });
                const m = /^([+−]?)(.*)$/.exec(txt);
                num.append(h('span', { class: 'sg' }, m[1]), m[2]);
            }
        }
        const sp = split(M);
        const sub = h('div', { class: 'hero-sub' });
        if (pay) {
            sub.append(h('span', null, `${M.payN} payout${M.payN === 1 ? '' : 's'} executed`));
            if (M.payPending > 0) sub.append(h('span', { class: 'dotsep' }, 'Pending ', h('b', null, money(M.payPending))));
        } else {
            let any = false;
            if (sp.fn && sp.en && !st.hide) {
                any = true;
                sub.append(h('span', null, 'Funded ', h('b', { class: side(sp.f) }, money(sp.f))), h('span', { class: 'dotsep' }, 'Evaluation ', h('b', { class: side(sp.e) }, money(sp.e))));
            } else if (sp.fn && sp.en) {
                any = true;
                sub.append(h('span', null, 'Funded and Evaluation combined'));
            }
            sub.append(h('span', { class: any ? 'dotsep mut' : 'mut' }, `${M.k.net.n} trade${M.k.net.n === 1 ? '' : 's'} · ${M.mDays.size} day${M.mDays.size === 1 ? '' : 's'}`));
        }
        heroEl.append(num, sub);
        // right block
        if (pay) {
            paidEl.classList.add('alt');
            paidEl.append(h('div', { class: 'lab' }, 'Trading P&L'), h('div', { class: 'val ' + side(M.k.net.value) }, usd(M.k.net.value, { ctx: 'table' })), h('div', { class: 'sm' }, `${M.k.net.n} trades`));
        } else {
            paidEl.classList.remove('alt');
            if (M.payN || M.payPending) {
                paidEl.append(h('div', { class: 'lab' }, 'Paid out'),
                    h('div', { class: 'val' }, ui.sparkle(13), M.payN ? money(M.payNet, { sign: false }) : money(M.payPending, { sign: false })),
                    h('div', { class: 'sm' }, M.payN ? `${M.payN} payout${M.payN > 1 ? 's' : ''}${M.payPending ? ' · ' + money(M.payPending, { sign: false }) + ' pending' : ''}` : 'processing'));
            }
        }
    }

    function renderCurve() {
        ui.clear(curveEl);
        const st = S();
        if (st.lens === 'pay') { curveEl.style.visibility = 'hidden'; return; }
        curveEl.style.visibility = '';
        const keys = M.keysInMonth.filter((k) => M.mDays.has(k));
        if (keys.length < 2) return;
        let cum = 0;
        const vals = keys.map((k) => { const d = M.mDays.get(k); cum += st.basis === 'gross' ? d.gross : d.net; return cum; });
        const markers = [];
        keys.forEach((k, i) => { const p = M.D.payDays.get(k); if (p && p.n) markers.push({ i, cls: 'gold', r: 3.4 }); });
        const w = curveEl.clientWidth || 380;
        const svg = sparkline({ values: vals, w, h: 64, pad: 6, markers });
        const cap = h('div', { class: 'sub', style: 'position:absolute;left:0;top:-14px;font-size:10.5px;opacity:0;transition:opacity .1s;white-space:nowrap;font-variant-numeric:tabular-nums' });
        curveEl.append(svg, cap);
        curveEl.onpointermove = (e) => {
            const r = svg.getBoundingClientRect();
            const i = Math.max(0, Math.min(keys.length - 1, Math.round(((e.clientX - r.left - 6) / (r.width - 12)) * (keys.length - 1))));
            hotCell(keys[i]);
            cap.style.opacity = 1;
            cap.textContent = `${T.fmtDate(keys[i], 'dm')} · month ${money(vals[i], { sign: true })}`;
        };
        curveEl.onpointerleave = () => { hotCell(null); cap.style.opacity = 0; };
    }

    function hotCell(key) {
        for (const c of calEl.querySelectorAll('.cell.hot')) c.classList.remove('hot');
        if (key) { const c = calEl.querySelector(`.cell[data-k="${key}"]`); if (c) c.classList.add('hot'); }
    }

    function tile(key, label, value, subText, { low = false, small = false, cls = '' } = {}) {
        const v = h('div', { class: 'v ' + (small ? 'sm ' : '') + cls });
        if (value instanceof Node) v.appendChild(value); else v.textContent = value;
        return h('div', { class: 'tile', role: 'listitem', tabindex: 0, 'data-tip': 'kpi:' + key },
            h('div', { class: 'lab' }, h('span', { class: 'lab' }, label), low ? h('span', { class: 'low' }, 'LOW N') : null), v, h('div', { class: 's' }, subText || ' '));
    }

    function renderRibbon() {
        const k = M.k, st = S();
        ui.clear(ribbonEl); ui.clear(moreEl);
        const n = k.net.n;
        const netSum = unitSum([...M.mDays.values()], effUnit(), st.basis);
        const netTxt = effUnit() === 'usd' ? dual(st.basis === 'gross' ? k.gross.value : k.net.value) : fmt.unitValue(netSum.v, effUnit(), { sign: true });
        const netVal = st.basis === 'gross' ? k.gross.value : k.net.value;
        const wl = k.winRate.parts;
        const risk = k.avgRisk;
        let riskNode, riskSub;
        if (risk.value != null) {
            riskNode = h('span', null, T.fmtPts(risk.value, { dp: 1, unit: false, sign: false }), h('small', null, 'pts'));
            const sym = ((M.symbolsMap.get(risk.symbol) || {}).display || risk.symbol || '').replace('-PERP', '');
            riskSub = `${sym ? sym + ' · ' : ''}${fmt.usd(risk.usd, { ctx: 'table', sign: false })} · ${risk.known}/${risk.symbol && risk.bySymbol[risk.symbol] ? risk.bySymbol[risk.symbol].n : n} with SL`;
        } else {
            const ents = Object.entries(risk.bySymbol).filter(([, r]) => r.avgRiskPts != null).sort((a, b) => b[1].n - a[1].n);
            if (ents.length > 1) {
                riskNode = h('span', { style: 'font-size:15px;font-weight:500' }, ents.slice(0, 2).map(([s, r], i) => h('span', null, i ? ' · ' : '', h('span', { class: 'mut', style: 'font-weight:500' }, ((M.symbolsMap.get(s) || {}).display || s).replace('-PERP', '') + ' '), T.fmtPts(r.avgRiskPts, { dp: 1, unit: false, sign: false }))));
                riskSub = ents.length > 2 ? `pts · +${ents.length - 2} more · pick a symbol` : 'pts · pick a symbol';
            } else { riskNode = '—'; riskSub = n ? 'no stops recorded' : ''; }
        }
        const pRR = k.plannedRR.value, aR = k.avgR.value;
        const dd = k.maxDrawdown;
        ribbonEl.append(
            tile('net', st.basis === 'gross' ? 'Gross' : 'Net', netTxt, `${n} trade${n === 1 ? '' : 's'} · ${M.mDays.size}d`, { cls: effUnit() === 'usd' ? side(netVal) : side(netSum.v) }),
            tile('winRate', 'Win rate', k.winRate.value == null ? '—' : pctOf(k.winRate.value), n ? `${wl.wins}W · ${wl.losses}L · ${wl.scratch}S` : '', { low: n > 0 && n < 30 }),
            tile('profitFactor', 'Profit factor', k.profitFactor.value == null ? '—' : nfmt(k.profitFactor.value), k.payoff.value == null ? (n && n < 5 ? 'needs 5+ trades' : '') : `payoff ${nfmt(k.payoff.value)}`, { low: n >= 5 && n < 30 }),
            tile('avgRisk', 'Avg risk', riskNode, riskSub),
            tile('rr', 'RR', pRR == null ? '—' : T.fmtR(pRR, { sign: false }), aR == null ? (n ? 'no realized R' : '') : `realized ${T.fmtR(aR)} avg`),
            tile('maxDrawdown', 'Max drawdown', n ? dual(dd.value) : '—', dd.pct != null ? T.fmtPct(dd.pct) + ' of start' : (dd.value < 0 && dd.troughTs ? `${dd.peakTs ? T.fmtDate(T.dayKey(dd.peakTs, st.mode), 'dm') : 'start'} → ${T.fmtDate(T.dayKey(dd.troughTs, st.mode), 'dm')}` : (n ? 'no drawdown' : '')), { cls: dd.value < 0 ? 'dn' : '' }),
            h('button', {
                class: 'tile tile-more' + (more ? ' on' : ''), type: 'button', 'aria-expanded': String(more), title: more ? 'Fewer metrics' : 'More metrics',
                onclick: () => { more = !more; lsSet(LS_MORE, more ? '1' : '0'); renderRibbon(); }
            }, h('span', null, 'More'), icon('chevD', 14)));
        if (!more) { moreEl.style.display = 'none'; return; }
        moreEl.style.display = '';
        const sw = k.streakTrades.value;
        moreEl.append(
            tile('expectancy', 'Expectancy', dual(k.expectancy.value), 'per trade', { cls: side(k.expectancy.value), small: false }),
            tile('avgWL', 'Avg win / loss', h('span', null, h('span', { class: 'up' }, fmt.usd(k.avgWin.value, { ctx: 'cell', sign: false })), h('span', { class: 'mut' }, ' / '), h('span', { class: 'dn' }, fmt.usd(Math.abs(k.avgLoss.value), { ctx: 'cell', sign: false }))), k.payoff.value ? `payoff ${nfmt(k.payoff.value)}` : '', { small: true }),
            tile('bestWorst', 'Best / worst day', h('span', null, h('span', { class: 'up' }, fmt.usd(k.bestDay.value, { ctx: 'cell', sign: false })), h('span', { class: 'mut' }, ' / '), h('span', { class: 'dn' }, fmt.usd(Math.abs(k.worstDay.value), { ctx: 'cell', sign: false }))), k.bestDay.parts.key ? `${T.fmtDate(k.bestDay.parts.key, 'dm')} · ${T.fmtDate(k.worstDay.parts.key, 'dm')}` : '', { small: true }),
            tile('dayWR', 'Day win rate', k.dayWinRate.value == null ? '—' : pctOf(k.dayWinRate.value), `${k.greenDays.value}G · ${k.redDays.value}R · ${k.flatDays.value}F`),
            tile('streak', 'Streak', n ? `W${sw.maxWin} · L${sw.maxLoss}` : '—', n ? `current ${sw.current > 0 ? 'W' + sw.current : sw.current < 0 ? 'L' + -sw.current : '—'}` : ''),
            tile('avgHold', 'Avg hold', k.avgHold.value == null ? '—' : T.fmtDur(k.avgHold.value), `${k.long.value.n}L · ${k.short.value.n}S`),
            tile('feeDrag', 'Fee drag', k.feeDrag.value == null ? '—' : T.fmtPct(k.feeDrag.value, { sign: false }), 'of winning gross'));
    }

    // A day's typical risk: the median stop distance, only when the day traded one symbol (points don't mix).
    function dayRisk(day) {
        if (!day || day.symbols.size !== 1 || !day.riskN) return null;
        const r = day.tradeIds.map((id) => M.D.tradesById.get(id)).filter((t) => t && t.riskPts != null).map((t) => t.riskPts).sort((a, b) => a - b);
        if (!r.length) return null;
        const mid = (r.length - 1) / 2;
        return (r[Math.floor(mid)] + r[Math.ceil(mid)]) / 2;
    }

    function cellMeta(day, d) {
        const line = S().line;
        if (line === 'pts') return day.symbols.size <= 1 && day.pointsN ? T.fmtPts(day.points, { dp: 1 }) : '—';
        if (line === 'r') return day.rN ? T.fmtR(day.rSum) : '—';
        if (line === 'risk') { const r = dayRisk(day); return r == null ? '—' : T.fmtPts(r, { dp: 1, sign: false }); }
        if (line === 'fees') return fmt.usd(-day.fees, { ctx: 'cell', base: day.capitalBase });
        const dec = day.wins + day.losses;
        return `${day.n} · ${dec ? Math.round(day.wins / dec * 100) + '%' : '—'}`;
    }

    function isSliver(day, key) {
        if (S().mode !== 'vest' || T.dowOfKey(key) !== 0) return false;
        for (const id of day.tradeIds) { const t = M.D.tradesById.get(id); const hh = T.etParts(t.closeTs).h; if (hh < 18 || hh >= 20) return false; }
        return true;
    }

    function cellEl(d, ci, ri) {
        const st = S();
        const D = M.D;
        const key = d.key;
        const day = D.days.get(key);
        const pay = D.payDays.get(key);
        const future = key > M.today;
        const pl = st.lens === 'pay';
        const dayNum = +key.slice(8);
        const dateTxt = d.inMonth ? String(dayNum) : T.fmtDate(key, 'dm');
        const cls = ['cell'];
        const attrs = { type: 'button', 'data-k': key, 'data-tip': 'cell:' + key, tabindex: -1 };
        let netTxt = '', metaTxt = '';
        let lvl = 0, sgn = null;
        if (!d.inMonth) cls.push('out');
        if (future) { cls.push('future'); attrs['aria-disabled'] = 'true'; } 
        if (key === M.today) cls.push('today');
        if (st.day === key) cls.push('sel');
        if (st.sel && key >= st.sel[0] && key <= st.sel[1]) cls.push('rng');
        const marks = h('div', { class: 'c-marks' });
        if (day) {
            const u = effUnit();
            const v = cellValueFor(day);
            const usdV = stats.cellValue(day, 'usd', st.basis);
            const flat = usdV === 0;
            if (v != null) {
                const l = stats.level(v, u === 'usd' ? M.usdScale : M.scale);
                lvl = l;
            } else lvl = stats.level(usdV, M.usdScale);
            sgn = usdV > 0 ? 'p' : usdV < 0 ? 'n' : null;
            if (v != null && v !== 0) sgn = v > 0 ? 'p' : 'n';
            if (flat && v === 0) { cls.push('flat'); lvl = 0; }
            if (lvl) { attrs['data-l'] = Math.abs(lvl); attrs['data-s'] = lvl > 0 ? 'p' : 'n'; }
            else if (!flat) cls.push('flat');
            netTxt = v == null ? '—' : fmt.unitValue(v, u, { ctx: 'cell', base: day.capitalBase });
            metaTxt = cellMeta(day, d);
            const fe = day.byPhase.funded.n + day.byPhase.instant.n + day.byPhase.primary.n;
            if (day.byPhase.eval.n && !fe) cls.push('eval');
            if (isSliver(day, key)) cls.push('sliver');
            if (day.carried) marks.appendChild(h('span', { class: 'mk carry', title: 'Position carried past 20:00 ET' }, '»'));
        } else {
            cls.push('empty');
        }
        if (pl) {
            if (pay && pay.n) {
                cls.push('payv');
                netTxt = fmt.usd(pay.net, { ctx: 'cell', sign: false });
                metaTxt = pay.n > 1 ? `${pay.n} payouts` : 'payout';
            } else if (pay && pay.pending) { netTxt = ''; metaTxt = 'processing'; cls.push('payv'); } else { netTxt = ''; metaTxt = ''; }
            if (day) cls.push('faint');
        }
        const n = D.notesByKey.get('day:' + key);
        if (n && (n.text || (n.tags && n.tags.length))) marks.appendChild(h('span', { class: 'mk note' + (n.mood === 1 ? ' m1' : n.mood === -1 ? ' m-1' : ''), title: 'Note' }, h('i')));
        if (pay && pay.items.length && pay.n) marks.appendChild(h('span', { class: 'mk star', title: 'Payout' }, ui.sparkle(11), pay.n > 1 ? String(pay.n) : null));
        else if (pay && pay.pending) marks.appendChild(h('span', { class: 'mk star', style: 'opacity:.55', title: 'Payout processing' }, ui.sparkle(11)));
        if (key === M.bestKey && Math.abs(lvl) === 5 && !pl) marks.appendChild(h('span', { class: 'mk best', title: 'Best day of the month' }, ui.sparkle(11)));
        attrs.class = cls.join(' ');
        const aria = `${T.fmtDate(key, 'long')}. ${day ? (st.hide ? 'Result hidden' : 'Net ' + T.fmtUsd(day.net) ) + `. ${day.n} trades.` : 'No trades.'}${pay && pay.n ? ' Payout.' : ''}${future ? ' In the future.' : ''}`;
        attrs['aria-label'] = aria;
        const el = h('button', attrs,
            h('div', { class: 'c-top' }, h('span', { class: 'c-d' }, dateTxt), marks),
            h('div', { class: 'c-net' }, netTxt),
            h('div', { class: 'c-meta' }, metaTxt));
        el.style.setProperty('--dl', Math.min(220, 14 * (ci + ri)) + 'ms');
        return el;
    }

    function weekEl(w, i) {
        const st = S();
        const pl = st.lens === 'pay';
        const sumV = st.basis === 'gross' ? w.sum.gross : w.sum.net;
        const u = effUnit();
        let txt, meta;
        const cls = ['wk'];
        if (pl && w.payWn) { cls.push('payv'); txt = fmt.usd(w.payW, { ctx: 'cell', sign: false }); meta = `${w.payWn} payout${w.payWn > 1 ? 's' : ''}`; }
        else if (pl) { txt = '—'; cls.push('zero'); meta = ''; }
        else if (!w.sum.days) { txt = '—'; cls.push('zero'); meta = 'no trades'; }
        else {
            txt = u === 'usd' ? fmt.usd(sumV, { ctx: 'cell' }) : fmt.unitValue(w.unit.v, u, { ctx: 'cell' });
            meta = `${w.sum.days}d · ${w.sum.n}t · ${w.sum.winRate == null ? '—' : Math.round(w.sum.winRate * 100) + '%'}`;
        }
        if (w.cur) cls.push('cur');
        const net = h('div', { class: 'wn ' + (pl ? '' : side(u === 'usd' ? sumV : w.unit.v)) }, txt);
        return h('div', { class: cls.join(' '), 'data-tip': 'wk:' + i, tabindex: 0, onclick: () => selectWeek(w), role: 'group', 'aria-label': `${w.label} summary` },
            h('div', { class: 'wl' }, h('span', null, w.label)), net, h('div', { class: 'wm' }, meta));
    }

    function selectWeek(w) {
        const keys = w.days.filter((d) => M.D.days.has(d.key)).map((d) => d.key);
        if (keys.length) ctx.set({ sel: [keys[0], keys[keys.length - 1]], day: null });
    }

    function renderGrid(animate) {
        const st = S();
        const active = document.activeElement && calEl.contains(document.activeElement) ? document.activeElement.dataset.k : null;
        ui.clear(calEl);
        calEl.style.setProperty('--cols', M.cols.length);
        calEl.style.setProperty('--rows', M.weeks.length);
        calEl.dataset.rows = M.weeks.length;
        calEl.setAttribute('aria-label', 'Calendar ' + T.fmtMonth(st.month));
        const names = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
        for (const c of M.cols) calEl.appendChild(h('div', { class: 'wd', 'aria-hidden': 'true' }, names[c]));
        calEl.appendChild(h('div', { class: 'wd wkh', 'aria-hidden': 'true' }, 'Week'));
        // focus target (roving tabindex)
        const navKeys = [];
        let focusKey = null;
        M.weeks.forEach((w, ri) => {
            let ci = 0;
            for (const d of w.days) {
                if (!d.visible) continue;
                const el = cellEl(d, ci++, ri);
                navKeys.push(d.key);
                calEl.appendChild(el);
            }
            calEl.appendChild(weekEl(w, ri));
        });
        const inGrid = (k) => navKeys.includes(k) && k <= M.today;
        focusKey = st.day && inGrid(st.day) ? st.day : inGrid(M.today) && M.today.startsWith(st.month) ? M.today : (navKeys.find((k) => M.mDays.has(k)) || navKeys.find((k) => k <= M.today) || navKeys[0]);
        const fe = calEl.querySelector(`.cell[data-k="${focusKey}"]`);
        if (fe) fe.tabIndex = 0;
        M.navKeys = navKeys;
        if (active) { const a = calEl.querySelector(`.cell[data-k="${active}"]`); if (a) a.focus({ preventScroll: true }); }
        if (animate && !ui.reducedMotion()) { calEl.classList.add('enter'); setTimeout(() => calEl.classList.remove('enter'), 520); }
        // cells touched by a sync settle with a short ring
        if (ctx.syncPulse && prevSig.size) {
            for (const el of calEl.querySelectorAll('.cell[data-k]')) {
                const d = M.D.days.get(el.dataset.k);
                const sig = d ? d.n + '|' + d.net.toFixed(2) : '';
                if ((prevSig.get(el.dataset.k) || '') !== sig) el.classList.add('settle');
            }
        }
        prevSig = new Map();
        for (const [k, d] of M.D.days) prevSig.set(k, d.n + '|' + d.net.toFixed(2));
        sizeClass();
    }

    function sizeClass() {
        const first = calEl.querySelector('.cell');
        if (!first) return;
        const w = first.getBoundingClientRect().width;
        calEl.dataset.w = w >= 150 ? 'l' : w >= 112 ? 'm' : 's';
    }

    function renderLegend() {
        const st = S();
        ui.clear(legendEl);
        const scale = h('div', { class: 'scale' }, h('span', null, 'Loss'));
        for (let l = 5; l >= 1; l--) scale.appendChild(h('i', { 'data-s': 'n', 'data-l': l }));
        scale.appendChild(h('span', { style: 'margin:0 6px' }, '·'));
        for (let l = 1; l <= 5; l++) scale.appendChild(h('i', { 'data-s': 'p', 'data-l': l }));
        scale.appendChild(h('span', null, 'Profit'));
        const sel = h('select', { 'aria-label': 'Second line of each day', onchange: (e) => ctx.set({ line: e.target.value }) }, LINES.map(([k, l]) => h('option', { value: k, selected: k === st.line }, l)));
        const mk = (g, t) => h('span', { class: 'mkr' }, g, t);
        legendEl.append(scale,
            mk(h('span', { class: 'mk', style: 'color:var(--j-gold)' }, ui.sparkle(11)), 'payout'),
            mk(h('span', { class: 'mk' }, h('i', { style: 'display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ax-accent)' })), 'note'),
            mk(h('span', { class: 'mk' }, '»'), 'carried past 20:00'),
            mk(h('span', { class: 'mk', style: 'width:16px;height:12px;border:1px dashed color-mix(in srgb,var(--j-sim) 60%,transparent);border-radius:4px' }), 'evaluation only'),
            h('div', { class: 'right' },
                st.lens === 'pay' ? ui.chip(st.payBasis === 'executed' ? 'By executed date' : 'By requested date', { onClick: () => ctx.set({ payBasis: st.payBasis === 'executed' ? 'requested' : 'executed' }), title: 'Which date a payout sits on' }) : null,
                h('span', null, 'Cells'), sel));
    }

    function renderSel() {
        const st = S();
        ui.clear(selEl);
        if (!st.sel) return;
        const [a, b] = st.sel;
        const days = [...M.D.days.values()].filter((d) => d.key >= a && d.key <= b);
        const list = days.flatMap((d) => d.tradeIds.map((id) => M.D.tradesById.get(id)));
        const k = list.length ? stats.kpis(list, M.D.kpiOpts({ days: new Map(days.map((d) => [d.key, d])) })) : null;
        const v = k ? (st.basis === 'gross' ? k.gross.value : k.net.value) : 0;
        const sum = unitSum(days, effUnit(), st.basis);
        const range = a === b ? T.fmtDate(a, 'dm') : `${T.fmtDate(a, 'dm')} – ${T.fmtDate(b, 'dm')}`;
        selEl.appendChild(h('div', { class: 'selbar', role: 'status' },
            h('span', { class: 'mut' }, 'Selection'), h('b', null, range),
            h('span', { class: 'sum ' + side(v) }, effUnit() === 'usd' ? money(v) : fmt.unitValue(sum.v, effUnit())),
            h('span', null, h('b', null, String(days.length)), ' day', days.length === 1 ? '' : 's'),
            h('span', null, h('b', null, String(list.length)), ' trades'),
            h('span', null, 'WR ', h('b', null, k && k.winRate.value != null ? pctOf(k.winRate.value) : '—')),
            h('span', null, 'PF ', h('b', null, k && k.profitFactor.value != null ? nfmt(k.profitFactor.value) : '—')),
            h('div', { class: 'grow' }),
            h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.set({ sel: null }) }, 'Clear', ui.kbd('Esc'))));
    }

    function renderNotice() {
        ui.clear(noteEl);
        const st = S();
        const D = M.D;
        if (!D.filtered.length && ctx.data.trades.length) {
            noteEl.appendChild(h('div', { class: 'empty-note' }, h('b', null, 'No trades match these filters.'), ' ', h('button', { class: 'link', type: 'button', onclick: () => ctx.set({ scope: 'all', accounts: null, symbols: [], sides: [], exits: [], tags: [] }) }, 'Clear filters')));
        } else if (!M.mDays.size && D.days.size) {
            const keys = [...D.days.keys()].sort();
            const before = keys.filter((k) => k < st.month + '-01').pop();
            const after = keys.find((k) => k > M.monthEnd);
            const target = before || after;
            noteEl.appendChild(h('div', { class: 'notice' }, `No trades closed in ${T.fmtMonth(st.month)}.`,
                target ? h('button', { class: 'link', type: 'button', onclick: () => ctx.set({ month: target.slice(0, 7) }) }, `Go to ${T.fmtMonth(target.slice(0, 7))}`) : null));
        } else if (!D.days.size && !ctx.data.trades.length) {
            noteEl.appendChild(h('div', { class: 'empty-note' }, h('b', null, 'No trades yet.'), ' Closed positions appear here once they sync.'));
        }
    }

    // ---------- events ----------

    calEl.addEventListener('click', (e) => {
        if (drag && drag.moved) { drag = null; return; }
        const c = e.target.closest('.cell');
        if (!c || c.classList.contains('future')) return;
        const key = c.dataset.k;
        if (e.shiftKey) {
            const anchor = S().sel ? S().sel[0] : (S().day || key);
            const [a, b] = anchor <= key ? [anchor, key] : [key, anchor];
            ctx.set({ sel: [a, b], day: null });
            return;
        }
        ctx.openDrawer(key);
    });
    calEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.shiftKey) return;
        const c = e.target.closest('.cell');
        if (!c || c.classList.contains('future')) return;
        drag = { start: c.dataset.k, moved: false };
    });
    calEl.addEventListener('pointerover', (e) => {
        if (!drag) return;
        const c = e.target.closest('.cell');
        if (!c || c.classList.contains('future')) return;
        const k = c.dataset.k;
        if (k === drag.start && !drag.moved) return;
        drag.moved = true;
        const [a, b] = drag.start <= k ? [drag.start, k] : [k, drag.start];
        drag.range = [a, b];
        for (const el of calEl.querySelectorAll('.cell')) el.classList.toggle('rng', el.dataset.k >= a && el.dataset.k <= b);
    });
    window.addEventListener('pointerup', onUp);
    function onUp() {
        if (!drag) return;
        if (drag.moved && drag.range) { const r = drag.range; ctx.set({ sel: r, day: null }); setTimeout(() => { drag = null; }, 0); }
        else drag = null;
    }

    function onKey(e) {
        const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!M || !arrows.includes(e.key)) return false;
        const active = document.activeElement;
        const onCell = active && active.classList && active.classList.contains('cell');
        const keys = M.navKeys.filter((k) => k <= M.today);
        if (!keys.length) return false;
        if (!onCell) {
            if (active && active !== document.body && active.closest && active.closest('.drawer')) return false;
            const t = calEl.querySelector('.cell[tabindex="0"]') || calEl.querySelector('.cell');
            if (t) { t.focus(); return true; }
            return false;
        }
        const i = Math.max(0, keys.indexOf(active.dataset.k));
        const cols = M.cols.length;
        let j = i;
        if (e.key === 'ArrowLeft') j = i - 1; else if (e.key === 'ArrowRight') j = i + 1;
        else if (e.key === 'ArrowUp') j = i - cols; else if (e.key === 'ArrowDown') j = i + cols;
        else if (e.key === 'Home') j = i - (i % cols); else if (e.key === 'End') j = Math.min(keys.length - 1, i - (i % cols) + cols - 1);
        j = Math.max(0, Math.min(keys.length - 1, j));
        const key = keys[j];
        if (e.shiftKey) {
            const anchor = S().sel ? S().sel[0] : keys[i];
            const [a, b] = anchor <= key ? [anchor, key] : [key, anchor];
            ctx.set({ sel: [a, b], day: null });
        } else if (S().day) ctx.openDrawer(key);
        const t = calEl.querySelector(`.cell[data-k="${key}"]`);
        for (const c of calEl.querySelectorAll('.cell[tabindex="0"]')) c.tabIndex = -1;
        if (t) { t.tabIndex = 0; t.focus(); }
        return true;
    }

    // ---------- update ----------

    function update() {
        const st = S();
        M = monthModel();
        lensSeg.set(st.lens);
        lensSeg.classList.toggle('pay', st.lens === 'pay');
        titleEl.textContent = T.fmtMonth(st.month);
        const animate = prevMonth !== st.month;
        prevMonth = st.month;
        renderHero();
        renderCurve();
        renderNotice();
        renderRibbon();
        renderGrid(animate);
        renderLegend();
        renderSel();
        tips.hide();
    }

    update();
    return {
        update, onKey,
        unmount() { ro && ro.disconnect(); window.removeEventListener('pointerup', onUp); root.removeEventListener('pointerleave', onRootLeave); tips.destroy(); ui.clear(root); }
    };
}
