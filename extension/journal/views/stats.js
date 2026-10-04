// Better Vest Calendar - the Stats tab: grouped metric list (left, each row explains its arithmetic) and charts (right).
// Everything comes from stats.js over the shell-filtered trades, narrowed by the period chips. Per-symbol quantities
// (points, risk) are never averaged across symbols. Each chart has a table twin (the Table button, or Shift+T on a chart).
// With Hide $ on, money becomes % of the capital behind the trades (or bullets), and chart axes drop their $ labels.

import { barChart, hbars, chartBox, popBase, dl, foot, tipRegistry, capitalBase, median, pctOf, sideCls, niceTicks, lsGet, lsSet } from './shared.js';
import { svg, scale } from '../charts.js';
import { SPARKLE_PATH } from '../ui.js';

const LS_PERIOD = 'bv-journal-stats-period';
const PERIODS = [['month', 'This month'], ['30', '30D'], ['90', '90D'], ['all', 'All']];
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const DOW_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function mount(root, ctx) {
    const { h, ui, time: T, stats, fmt, model } = ctx;
    const S = () => ctx.state;
    let period = lsGet(LS_PERIOD) || 'all';
    if (!PERIODS.some((p) => p[0] === period)) period = 'all';
    const twinOn = new Set();
    let hotPanel = null;
    let P = null;
    let sig = '';
    let lastD = null;
    const boxes = [];
    const tips = tipRegistry();

    const headEl = h('div', { class: 'vh2' });
    const noteEl = h('div');
    const metricsEl = h('aside', { class: 'st-metrics pn', 'aria-label': 'Metrics' });
    const chartsEl = h('div', { class: 'st-charts' });
    const wrap = h('div', { class: 'vw' }, headEl, noteEl, h('div', { class: 'st-wrap' }, metricsEl, chartsEl));
    root.appendChild(wrap);
    const hover = ui.hoverCard(wrap, '[data-vtip]', (target, el) => tips.build(target.dataset.vtip, el), { delay: 130 });

    // ---------- model ----------

    const effUnit = () => (S().unit === 'usd' && S().hide ? 'pct' : S().unit);

    function periodRange() {
        const today = ctx.todayKey();
        if (period === 'month') return { from: today.slice(0, 7) + '-01', to: today };
        if (period === '30') return { from: T.addDays(today, -29), to: today };
        if (period === '90') return { from: T.addDays(today, -89), to: today };
        return null;
    }

    function compute() {
        const st = S();
        const D = ctx.derived();
        const range = periodRange();
        const inRange = (k) => !range || (k >= range.from && k <= range.to);
        // the shell already aggregated every day for these filters: a period is just a slice of those days
        let list = D.filtered, days = D.days;
        if (range) {
            days = new Map();
            list = [];
            for (const key of [...D.days.keys()].sort()) {
                if (!inRange(key)) continue;
                const d = D.days.get(key);
                days.set(key, d);
                for (const id of d.tradeIds) list.push(D.tradesById.get(id));
            }
        }
        const opts = D.kpiOpts();
        const k = stats.kpis(list, { ...opts, days });
        const byId = new Map(list.map((t) => [t.id, t]));
        const cap = capitalBase(list, D.accountsById);
        const rr = list.filter((t) => t.plannedRR != null).map((t) => t.plannedRR);
        const rs = list.filter((t) => t.rMult != null).map((t) => t.rMult);
        const held = list.filter((t) => t.heldMs != null).map((t) => t.heldMs);
        const pay = D.payouts.filter((p) => p.status === 'EXECUTED').filter((p) => inRange(T.payoutDayKey(p, 'executed') || ''));
        const bo = { ...opts, basis: st.basis, mode: st.mode };
        return {
            D, list, k, days, byId, cap, opts: bo, pay, range, unit: effUnit(),
            med: { rr: median(rr), r: median(rs), hold: median(held), net: median(list.map((t) => (st.basis === 'gross' ? t.gross : t.net))) }
        };
    }

    // money under Hide $: totals use the capital of every account that traded, per-trade figures its average
    const money = (v, kind, o) => fmt.usd(v, { ctx: 'table', base: kind === 'avg' ? P.cap.avg : P.cap.total, ...o });
    const unitFmt = (v, o) => (P.unit === 'usd' ? fmt.usd(v, { ctx: 'table', ...o }) : fmt.unitValue(v, P.unit, { ctx: 'table', ...o }));
    const axisFmt = (v) => (P.unit === 'usd' ? fmt.usd(v, { ctx: 'cell', sign: false }) : P.unit === 'pct' ? T.fmtPct(v, { sign: false }) : P.unit === 'pts' ? T.fmtNum(v, 0) : T.fmtNum(v, Math.abs(v) >= 10 ? 0 : 1) + 'R');
    const scopeText = () => {
        const st = S();
        const bits = [st.accounts ? (st.accounts.length === 1 ? '1 account' : st.accounts.length + ' accounts') : ({ all: 'All accounts', funded: 'Funded accounts', eval: 'Evaluation accounts', primary: 'Primary account' })[st.scope]];
        if (st.symbols.length) bits.push(st.symbols.join(', '));
        bits.push(st.basis === 'gross' ? 'Gross' : 'Net');
        return bits.join(' · ');
    };
    const periodText = () => ({ month: T.fmtMonth(ctx.todayKey().slice(0, 7)), 30: 'Last 30 days', 90: 'Last 90 days', all: 'All time' })[period];
    const dateOf = (ts) => T.fmtDate(T.dayKey(ts, S().mode), 'dm');
    const pct1 = (x) => (x == null ? '—' : T.fmtPct(x, { sign: false }));
    const num = (v, dp = 2) => (v == null ? '—' : T.fmtNum(v, dp));

    // ---------- header ----------

    function renderHead() {
        ui.clear(headEl);
        const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Period' }, PERIODS.map(([k, label]) => ui.chip(label, { on: period === k, onClick: () => { period = k; lsSet(LS_PERIOD, k); lastD = null; update(); } })));
        const dayN = P.days.size;
        headEl.append(
            h('div', { class: 'vh2-t' }, h('h1', null, 'Stats'), h('div', { class: 'sub' }, `${periodText()} · ${scopeText()} · ${P.list.length} trade${P.list.length === 1 ? '' : 's'} · ${dayN} trading day${dayN === 1 ? '' : 's'}`)),
            h('div', { class: 'grow' }), chips);
    }

    // ---------- metric list ----------

    const low = (n) => n > 0 && n < 30;

    function mrow(label, value, { sub, cls = '', n, tip } = {}) {
        const id = tip ? tips.add(tip) : null;
        const v = h('span', { class: 'mv ' + cls });
        if (value instanceof Node) v.appendChild(value); else v.textContent = value == null ? '—' : value;
        return h('div', { class: 'mrow' + (sub ? ' has-sub' : ''), tabindex: id ? 0 : null, 'data-vtip': id, role: 'listitem' },
            h('span', { class: 'ml' }, label, n != null && low(n) ? h('span', { class: 'lowtag', title: `n = ${n}: fewer than 30 trades, read with care` }, 'low n') : null),
            v, sub ? h('span', { class: 'ms' }, sub) : null);
    }
    const group = (title, ...rows) => h('div', { class: 'mgrp', role: 'group', 'aria-label': title }, h('div', { class: 'mg-h' }, title), h('div', { role: 'list' }, rows.filter(Boolean)));

    // hover-card body builder: title, the formula, inputs, a note, then the scope line
    function tipOf(title, m, rows, note) {
        return (el) => {
            popBase(el, title, `n = ${m.n} · ${periodText()}`, { low: low(m.n) });
            el.appendChild(h('div', { class: 'formula' }, m.formula));
            dl(el, rows);
            foot(el, note, scopeText());
            return true;
        };
    }

    function renderMetrics() {
        ui.clear(metricsEl);
        const k = P.k, st = S();
        const W = k.winRate.parts;
        const gross = st.basis === 'gross';
        const none = !P.list.length;
        const dd = k.maxDrawdown;
        const risk = k.avgRisk;
        const sym = (s) => ((P.D.symbolsMap.get(s) || {}).display || s || '');
        // average risk is per symbol: a single number only when one symbol is in focus
        let riskVal, riskSub;
        if (risk.value != null) {
            riskVal = T.fmtPts(risk.value, { dp: 1, sign: false });
            riskSub = `${sym(risk.symbol)} · ${fmt.usd(risk.usd, { ctx: 'table', base: P.cap.avg, sign: false })} · ${risk.known}/${risk.bySymbol[risk.symbol] ? risk.bySymbol[risk.symbol].n : P.list.length} with a stop`;
        } else {
            riskVal = 'per symbol';
            riskSub = `${risk.known ?? 0} of ${P.list.length} trades had a stop at entry · pick a symbol`;
        }
        const riskTip = (el) => {
            popBase(el, 'Average risk', `n = ${P.list.length} · ${periodText()}`, { low: low(P.list.length) });
            el.appendChild(h('div', { class: 'formula' }, risk.formula + '. Risk is measured in points of one symbol, so it is never averaged across symbols.'));
            const ents = Object.entries(risk.bySymbol).sort((a, b) => b[1].n - a[1].n);
            const shown = ents.slice(0, 8);
            dl(el, shown.map(([s, r]) => [sym(s), r.avgRiskPts == null ? `— (0/${r.n})` : `${T.fmtPts(r.avgRiskPts, { dp: 1, sign: false })} · ${fmt.usd(r.avgRiskUsd, { ctx: 'table', base: P.cap.avg, sign: false })} · ${r.known}/${r.n}`]));
            foot(el, ents.length > shown.length ? `+${ents.length - shown.length} more symbols` : null, 'Only trades whose stop was set within 5 s of entry have a known risk.', scopeText());
            return true;
        };
        metricsEl.append(
            group('Performance',
                mrow(gross ? 'Gross P&L' : 'Net P&L', money(gross ? k.gross.value : k.net.value, 'tot'), { cls: sideCls(gross ? k.gross.value : k.net.value) + ' strong', n: k.net.n, tip: tipOf(gross ? 'Gross P&L' : 'Net P&L', gross ? k.gross : k.net, [['Gross', money(k.net.parts.gross, 'tot')], ['Fees', money(-k.net.parts.fees, 'tot')], ['Funding', money(k.net.parts.funding, 'tot')], ['Net', money(k.net.value, 'tot'), sideCls(k.net.value)]], 'Open positions and payouts are not included.') }),
                mrow('Gross / fees', money(k.gross.value, 'tot'), { sub: `fees ${money(-k.fees.value, 'tot')} · funding ${money(k.funding.value, 'tot')}`, cls: sideCls(k.gross.value), tip: tipOf('Gross, fees and funding', k.net, [['Gross', money(k.gross.value, 'tot')], ['Fees', money(-k.fees.value, 'tot')], ['Funding', money(k.funding.value, 'tot')]]) }),
                mrow('Trades', fmt.count(k.trades.value), { sub: none ? '' : `${W.wins}W · ${W.losses}L · ${W.scratch} scratch`, n: k.trades.n, tip: tipOf('Trades', k.trades, [['Wins', String(W.wins)], ['Losses', String(W.losses)], ['Scratch', String(W.scratch)]]) }),
                mrow('Win rate', pct1(k.winRate.value), { sub: k.winRate.value == null ? '' : `${W.wins} of ${W.wins + W.losses} · all ${pctOf(k.winRateAll.value)}`, n: k.winRate.n, tip: tipOf('Win rate', k.winRate, [['Wins', String(W.wins)], ['Losses', String(W.losses)], ['Scratch (excluded)', String(W.scratch)], ['Incl. scratch', pctOf(k.winRateAll.value)]], 'Scratch rule: ' + (k.rule.value.kind === 'tick' ? '|points| ≤ one tick' : k.rule.value.kind === 'usd' ? `|P&L| ≤ $${k.rule.value.usd}` : 'off') + ` · ${k.scratchCount.value} excluded`) }),
                mrow('Profit factor', k.profitFactor.value == null ? '—' : num(k.profitFactor.value), { sub: k.payoff.value == null ? (none || P.list.length < 5 ? 'needs 5+ trades' : '') : `payoff ${num(k.payoff.value)}`, n: k.profitFactor.n, tip: tipOf('Profit factor', k.profitFactor, [['Σ wins', money(k.profitFactor.parts.grossProfit, 'tot')], ['Σ |losses|', money(k.profitFactor.parts.grossLoss, 'tot')], ['Payoff', num(k.payoff.value)]], k.profitFactor.value == null ? 'Needs at least 5 trades and one losing trade.' : null) }),
                mrow('Expectancy', money(k.expectancy.value, 'avg'), { sub: P.med.net == null ? 'per trade' : `per trade · median ${money(P.med.net, 'avg')}`, cls: sideCls(k.expectancy.value), n: k.expectancy.n, tip: tipOf('Expectancy', k.expectancy, [['Σ P&L', money(k.expectancy.parts.total, 'tot')], ['Trades', String(k.expectancy.n)], ['Median trade', money(P.med.net, 'avg')]]) }),
                mrow('Avg win / loss', h('span', null, h('span', { class: 'up' }, money(k.avgWin.value, 'avg', { sign: false })), h('span', { class: 'mut' }, ' / '), h('span', { class: 'dn' }, money(k.avgLoss.value == null ? null : Math.abs(k.avgLoss.value), 'avg', { sign: false }))), { sub: `payoff ${num(k.payoff.value)}`, n: k.avgWin.n + k.avgLoss.n, tip: tipOf('Average win and loss', k.payoff, [['Avg win', money(k.avgWin.value, 'avg'), 'up'], ['Avg loss', money(k.avgLoss.value, 'avg'), 'dn'], ['Payoff', num(k.payoff.value)]]) }),
                mrow('Best / worst trade', h('span', null, h('span', { class: 'up' }, money(k.largestWin.value, 'avg', { sign: false })), h('span', { class: 'mut' }, ' / '), h('span', { class: 'dn' }, money(k.largestLoss.value == null ? null : Math.abs(k.largestLoss.value), 'avg', { sign: false }))), { tip: tipOf('Largest win and loss', k.largestWin, [['Largest win', money(k.largestWin.value, 'avg'), 'up'], ['Largest loss', money(k.largestLoss.value, 'avg'), 'dn']]) })),
            group('Days',
                mrow('Trading days', String(k.greenDays.n), { sub: `${k.greenDays.value}G · ${k.redDays.value}R · ${k.flatDays.value}F`, n: k.greenDays.n, tip: tipOf('Trading days', k.greenDays, [['Green', String(k.greenDays.value)], ['Red', String(k.redDays.value)], ['Flat', String(k.flatDays.value)]]) }),
                mrow('Day win rate', pct1(k.dayWinRate.value), { n: k.dayWinRate.n, tip: tipOf('Day win rate', k.dayWinRate, [['Green days', String(k.greenDays.value)], ['Red days', String(k.redDays.value)]]) }),
                mrow('Avg day', money(k.avgDay.value, 'tot'), { cls: sideCls(k.avgDay.value), n: k.avgDay.n, tip: tipOf('Average day', k.avgDay, [['Σ daily P&L', money(k.avgDay.parts.total, 'tot')], ['Trading days', String(k.avgDay.n)]]) }),
                mrow('Best / worst day', h('span', null, h('span', { class: 'up' }, money(k.bestDay.value, 'tot', { sign: false })), h('span', { class: 'mut' }, ' / '), h('span', { class: 'dn' }, money(k.worstDay.value == null ? null : Math.abs(k.worstDay.value), 'tot', { sign: false }))), { sub: k.bestDay.parts.key ? `${T.fmtDate(k.bestDay.parts.key, 'dm')} · ${T.fmtDate(k.worstDay.parts.key, 'dm')}` : '', n: k.bestDay.n, tip: tipOf('Best and worst day', k.bestDay, [['Best', money(k.bestDay.value, 'tot') + (k.bestDay.parts.key ? ' · ' + T.fmtDate(k.bestDay.parts.key, 'dm') : ''), 'up'], ['Worst', money(k.worstDay.value, 'tot') + (k.worstDay.parts.key ? ' · ' + T.fmtDate(k.worstDay.parts.key, 'dm') : ''), 'dn']]) }),
                mrow('Best-day share', pct1(k.bestDayShare.value), { sub: 'of all green days', n: k.bestDayShare.n, tip: tipOf('Best-day share', k.bestDayShare, [['Best day', money(k.bestDayShare.parts.bestDay, 'tot')], ['Σ green days', money(k.bestDayShare.parts.greenSum, 'tot')]], 'A high share means one day carries the period.') }),
                mrow('Day streaks', none ? '—' : `W${k.streakDays.value.maxWin} · L${k.streakDays.value.maxLoss}`, { sub: none ? '' : `current ${streakText(k.streakDays.value.current)}`, n: k.streakDays.n, tip: tipOf('Day streaks', k.streakDays, [['Longest green run', 'W' + k.streakDays.value.maxWin], ['Longest red run', 'L' + k.streakDays.value.maxLoss], ['Current', streakText(k.streakDays.value.current)]]) })),
            group('Risk',
                mrow('Avg risk', riskVal, { sub: riskSub, n: risk.symbol ? (risk.bySymbol[risk.symbol] || { n: 0 }).n : P.list.length, tip: riskTip }),
                mrow('Planned RR', k.plannedRR.value == null ? '—' : T.fmtR(k.plannedRR.value, { sign: false }), { sub: k.plannedRR.value == null ? 'no trades with stop and target' : `median ${T.fmtR(P.med.rr, { sign: false })} · n ${k.plannedRR.n}`, n: k.plannedRR.n, tip: tipOf('Planned RR', k.plannedRR, [['Mean', T.fmtR(k.plannedRR.value, { sign: false })], ['Median', T.fmtR(P.med.rr, { sign: false })], ['Trades with both legs', String(k.plannedRR.n)]], 'A few extreme ratios can lift the mean: read it next to the median.') }),
                mrow('Avg R', k.avgR.value == null ? '—' : T.fmtR(k.avgR.value), { sub: k.avgR.value == null ? 'no trades with a stop' : `median ${T.fmtR(P.med.r)} · n ${k.avgR.n}`, cls: sideCls(k.avgR.value), n: k.avgR.n, tip: tipOf('Average R', k.avgR, [['Mean', T.fmtR(k.avgR.value)], ['Median', T.fmtR(P.med.r)], ['Trades with a stop', String(k.avgR.n)]], 'R = points ÷ initial risk, so it only exists where a stop was set at entry.') }),
                mrow('R coverage', k.rCoverage.value == null ? '—' : pctOf(k.rCoverage.value), { sub: `${k.rCoverage.parts.known} of ${k.rCoverage.n} have a stop`, n: k.rCoverage.n, tip: tipOf('R coverage', k.rCoverage, [['Stop known', String(k.rCoverage.parts.known)], ['Trades', String(k.rCoverage.n)]]) }),
                mrow('Max drawdown', none ? '—' : unitDollar(dd.value, dd.pct), { sub: dd.pct != null ? pct1(Math.abs(dd.pct)) + ' of the starting balance' : (dd.peakTs ? `${dateOf(dd.peakTs)} → ${dateOf(dd.troughTs)}` : none ? '' : 'no drawdown'), cls: dd.value < 0 ? 'dn' : '', n: dd.n, tip: tipOf('Max drawdown', dd, [['Depth', money(dd.value, 'tot'), 'dn'], dd.peakTs ? ['Peak', dateOf(dd.peakTs) + ' ' + T.fmtTimeET(dd.peakTs, { seconds: false })] : null, dd.troughTs ? ['Trough', dateOf(dd.troughTs) + ' ' + T.fmtTimeET(dd.troughTs, { seconds: false })] : null, dd.pct != null ? ['% of start', T.fmtPct(dd.pct)] : null], dd.pct == null ? 'Percent shows when one capital account is selected.' : null) }),
                mrow('Recovery factor', k.recoveryFactor.value == null ? '—' : num(k.recoveryFactor.value), { n: k.recoveryFactor.n, tip: tipOf('Recovery factor', k.recoveryFactor, [['Σ P&L', money(k.recoveryFactor.parts.total, 'tot')], ['Max drawdown', money(k.recoveryFactor.parts.maxDrawdown, 'tot')]]) })),
            group('Behaviour',
                mrow('Avg hold', k.avgHold.value == null ? '—' : T.fmtDur(k.avgHold.value), { sub: P.med.hold == null ? '' : `median ${T.fmtDur(P.med.hold)}`, n: k.avgHold.n, tip: tipOf('Average hold', k.avgHold, [['Mean', T.fmtDur(k.avgHold.value)], ['Median', T.fmtDur(P.med.hold)]]) }),
                mrow('Long', money(k.long.value.net, 'tot'), { sub: `${k.long.value.n} trades · WR ${pctOf(k.long.value.winRate)}`, cls: sideCls(k.long.value.net), n: k.long.n, tip: tipOf('Long trades', k.long, [['Trades', String(k.long.value.n)], ['Win rate', pctOf(k.long.value.winRate)], ['Net', money(k.long.value.net, 'tot'), sideCls(k.long.value.net)]]) }),
                mrow('Short', money(k.short.value.net, 'tot'), { sub: `${k.short.value.n} trades · WR ${pctOf(k.short.value.winRate)}`, cls: sideCls(k.short.value.net), n: k.short.n, tip: tipOf('Short trades', k.short, [['Trades', String(k.short.value.n)], ['Win rate', pctOf(k.short.value.winRate)], ['Net', money(k.short.value.net, 'tot'), sideCls(k.short.value.net)]]) }),
                mrow('Fee drag', pct1(k.feeDrag.value), { sub: 'of winning gross', n: k.feeDrag.n, tip: tipOf('Fee drag', k.feeDrag, [['Fees', money(k.feeDrag.parts.fees, 'tot')], ['Winning gross', money(k.feeDrag.parts.positiveGross, 'tot')]]) }),
                mrow('Trade streaks', none ? '—' : `W${k.streakTrades.value.maxWin} · L${k.streakTrades.value.maxLoss}`, { sub: none ? '' : `current ${streakText(k.streakTrades.value.current)}`, n: k.streakTrades.n, tip: tipOf('Trade streaks', k.streakTrades, [['Longest win run', 'W' + k.streakTrades.value.maxWin], ['Longest loss run', 'L' + k.streakTrades.value.maxLoss], ['Current', streakText(k.streakTrades.value.current)]]) })));
    }

    const streakText = (c) => (c > 0 ? 'W' + c : c < 0 ? 'L' + -c : '—');
    function unitDollar(v, p) { return p != null && S().hide ? T.fmtPct(p) : money(v, 'tot'); }

    // ---------- chart plumbing ----------

    // Panels below the fold are drawn when they scroll near the viewport: opening the tab only pays for what is visible.
    const pending = new Map();
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            const fn = pending.get(e.target);
            if (fn) { pending.delete(e.target); io.unobserve(e.target); fn(); }
        }
    }, { rootMargin: '400px 0px' }) : null;
    function lazy(el, fn) { if (io) { pending.set(el, fn); io.observe(el); } else fn(); }

    function panel(id, title, sub, { chart, table, span = false, legend, lazyBody }) {
        const body = h('div', { class: 'pn-b' });
        const btn = h('button', { class: 'twin-btn', type: 'button', 'aria-pressed': String(twinOn.has(id)), title: 'Switch between chart and table (Shift+T)' });
        const el = h('section', { class: 'pn st-panel' + (span ? ' span2' : ''), tabindex: 0, 'data-panel': id, 'aria-label': title },
            h('div', { class: 'pn-h' }, h('b', null, title), sub ? h('span', { class: 'sub' }, sub) : null, h('div', { class: 'grow' }), legend || null, btn), body);
        const draw = () => {
            ui.clear(body);
            const on = twinOn.has(id);
            btn.textContent = on ? 'Chart' : 'Table';
            btn.classList.toggle('on', on);
            btn.setAttribute('aria-pressed', String(on));
            const node = on ? table() : chart();
            if (node.destroy) boxes.push(node);
            body.appendChild(node);
        };
        el.toggleTwin = () => { pending.delete(el); if (twinOn.has(id)) twinOn.delete(id); else twinOn.add(id); draw(); };
        btn.onclick = el.toggleTwin;
        el.addEventListener('pointerenter', () => { hotPanel = el; });
        el.addEventListener('focusin', () => { hotPanel = el; });
        lazy(el, draw);
        return el;
    }

    function twin(cols, rows, { max = 300 } = {}) {
        const tb = h('tbody');
        for (const r of rows) tb.appendChild(h('tr', null, r.map((c, i) => h('td', { class: cols[i].cls || '' }, c))));
        if (!rows.length) tb.appendChild(h('tr', null, h('td', { colspan: cols.length, class: 'l mut' }, 'Nothing in this period')));
        return h('div', { class: 'twin', style: { maxHeight: max + 'px' } },
            h('table', { class: 'tbl' }, h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.cls || '' }, c.label)))), tb));
    }
    const empty = (msg) => h('div', { class: 'dshim' }, msg);

    // ---------- equity ----------

    function seriesFor() {
        const st = S();
        if (P.unit === 'usd') return stats.equityCurve(P.list, st.basis).map((p) => ({ ts: p.ts, cum: p.cum, v: p.net, id: p.id }));
        const keys = [...P.days.keys()].sort();
        let cum = 0;
        const out = [];
        for (const key of keys) {
            const d = P.days.get(key);
            const v = stats.cellValue(d, P.unit, st.basis);
            if (v == null) continue;
            cum += v;
            let ts = 0;
            for (const id of d.tradeIds) { const t = P.byId.get(id); if (t && t.closeTs > ts) ts = t.closeTs; }
            out.push({ ts, cum, v, key });
        }
        return out;
    }

    function equityChart(series) {
        if (series.length < 2) return empty('Needs at least two data points in this period.');
        return chartBox({
            height: 262,
            draw(host, W, H) {
                const Mg = { l: 58, r: 18, t: 16, b: 26 };
                const t0 = series[0].ts, t1 = Math.max(series[series.length - 1].ts, t0 + 1);
                const vals = series.map((p) => p.cum);
                const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
                const pad = (hi - lo || 1) * 0.08;
                const x = scale(t0, t1, Mg.l, W - Mg.r);
                const y = scale(lo - (lo < 0 ? pad : 0), hi + pad, H - Mg.b, Mg.t);
                const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Cumulative closed result' });
                const gid = 'eqg' + Math.random().toString(36).slice(2, 7);
                root.appendChild(svg('defs', null, svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
                    svg('stop', { offset: '0', 'stop-color': 'var(--ax-accent)', 'stop-opacity': '.24' }), svg('stop', { offset: '1', 'stop-color': 'var(--ax-accent)', 'stop-opacity': '0' }))));
                for (const tv of niceTicks(lo, hi, 4)) {
                    root.appendChild(svg('line', { class: tv === 0 ? 'ch-zero' : 'ch-grid', x1: Mg.l, x2: W - Mg.r, y1: f1(y(tv)), y2: f1(y(tv)) }));
                    root.appendChild(svg('text', { class: 'ch-axis', x: Mg.l - 8, y: f1(y(tv) + 3.5), 'text-anchor': 'end' }, axisFmt(tv)));
                }
                // x labels
                const nx = Math.max(2, Math.min(7, Math.floor((W - Mg.l - Mg.r) / 96)));
                for (let i = 0; i <= nx; i++) {
                    const ts = t0 + ((t1 - t0) * i) / nx;
                    root.appendChild(svg('text', { class: 'ch-axis', x: f1(x(ts)), y: H - 7, 'text-anchor': i === 0 ? 'start' : i === nx ? 'end' : 'middle' }, dateOf(ts)));
                }
                // thin long series for the path, keep every extreme
                const step = Math.max(1, Math.floor(series.length / (W * 1.5)));
                const idx = [];
                for (let i = 0; i < series.length; i += step) idx.push(i);
                if (idx[idx.length - 1] !== series.length - 1) idx.push(series.length - 1);
                let peak = 0;
                const peaks = series.map((p) => { peak = Math.max(peak, p.cum); return peak; });
                const lineD = 'M' + idx.map((i) => f1(x(series[i].ts)) + ' ' + f1(y(series[i].cum))).join('L');
                const ddD = 'M' + idx.map((i) => f1(x(series[i].ts)) + ' ' + f1(y(peaks[i]))).join('L') + 'L' + idx.slice().reverse().map((i) => f1(x(series[i].ts)) + ' ' + f1(y(series[i].cum))).join('L') + 'Z';
                root.appendChild(svg('path', { class: 'eq-area', d: `${lineD}L${f1(x(series[series.length - 1].ts))} ${f1(y(0))}L${f1(x(t0))} ${f1(y(0))}Z`, fill: `url(#${gid})` }));
                root.appendChild(svg('path', { class: 'eq-dd', d: ddD }));
                root.appendChild(svg('path', { class: 'ch-line glow', d: lineD }));
                root.appendChild(svg('path', { class: 'ch-line', d: lineD }));
                // payout markers sit on the line at the moment they were executed
                const at = (ts) => { let lo2 = 0, hi2 = series.length - 1; while (lo2 < hi2) { const m = (lo2 + hi2 + 1) >> 1; if (series[m].ts <= ts) lo2 = m; else hi2 = m - 1; } return series[lo2]; };
                for (const p of P.pay) {
                    const ts = p.executedAt || p.createdAt;
                    if (!ts || ts < t0 - 864e5 || ts > t1 + 864e5) continue;
                    const pt = at(ts);
                    const cx = Math.max(Mg.l, Math.min(W - Mg.r, x(ts))), cy = y(pt.cum);
                    const id = tips.add((el) => {
                        const a = P.D.accountsById.get(p.accountId);
                        popBase(el, 'Payout executed', T.fmtDate(T.payoutDayKey(p, 'executed'), 'long'));
                        dl(el, [['Net to you', fmt.usd(p.net, { ctx: 'table', base: a && a.initialCapital > 0 ? a.initialCapital : 0, sign: false })], ['Account', a ? model.accountName(a) : p.accountId]]);
                        foot(el, 'Payouts are transfers: they are not part of this closed-trade curve.');
                        return true;
                    });
                    const star = svg('path', { class: 'ch-star', d: SPARKLE_PATH, transform: `translate(${f1(cx - 7)} ${f1(cy - 7)}) scale(${14 / 24})`, 'data-vtip': id, tabindex: 0 });
                    root.appendChild(star);
                }
                // crosshair
                const cross = svg('g', { class: 'eq-cross', visibility: 'hidden' }, svg('line', { class: 'ch-guide', y1: Mg.t - 4, y2: H - Mg.b }), svg('circle', { class: 'eq-dot', r: 4 }));
                root.appendChild(cross);
                host.appendChild(root);
                const tip = h('div', { class: 'curve-tip' });
                host.appendChild(tip);
                const move = (e) => {
                    const r = root.getBoundingClientRect();
                    const ts = t0 + ((e.clientX - r.left - Mg.l) / (W - Mg.l - Mg.r)) * (t1 - t0);
                    let a = 0, b = series.length - 1;
                    while (a < b) { const m = (a + b) >> 1; if (series[m].ts < ts) a = m + 1; else b = m; }
                    if (a > 0 && Math.abs(series[a - 1].ts - ts) < Math.abs(series[a].ts - ts)) a--;
                    const p = series[a];
                    const cx = x(p.ts);
                    cross.setAttribute('visibility', 'visible');
                    const ln = cross.firstChild, dot = cross.lastChild;
                    ln.setAttribute('x1', f1(cx)); ln.setAttribute('x2', f1(cx)); dot.setAttribute('cx', f1(cx)); dot.setAttribute('cy', f1(y(p.cum)));
                    tip.textContent = `${dateOf(p.ts)} ${T.fmtTimeET(p.ts, { seconds: false })} · ${unitFmt(p.cum)} · from peak ${unitFmt(p.cum - peaks[a])}`;
                    tip.classList.add('on');
                    const tw = tip.offsetWidth;
                    tip.style.left = Math.round(Math.min(W - tw - 4, Math.max(4, cx - tw / 2))) + 'px';
                };
                root.addEventListener('pointermove', move);
                root.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.classList.remove('on'); });
            }
        });
    }

    function equityTable() {
        const st = S();
        const keys = [...P.days.keys()].sort().reverse();
        let cum = 0, peak = 0;
        const asc = [...P.days.keys()].sort();
        const cumBy = new Map(), ddBy = new Map();
        for (const k of asc) {
            const d = P.days.get(k);
            const v = stats.cellValue(d, P.unit, st.basis) ?? 0;
            cum += v; peak = Math.max(peak, cum);
            cumBy.set(k, cum); ddBy.set(k, cum - peak);
        }
        return twin([{ label: 'Day', cls: 'l' }, { label: 'Trades' }, { label: 'Day' }, { label: 'Cumulative' }, { label: 'From peak' }],
            keys.map((k) => { const d = P.days.get(k); const v = stats.cellValue(d, P.unit, st.basis); return [T.fmtDate(k, 'short'), String(d.n), h('span', { class: sideCls(v) }, unitFmt(v)), unitFmt(cumBy.get(k)), h('span', { class: sideCls(ddBy.get(k)) }, unitFmt(ddBy.get(k)))]; }));
    }

    // ---------- daily, hour, weekday, histogram ----------

    function dayTip(key, d) {
        return tips.add((el) => {
            const st = S();
            popBase(el, T.fmtDate(key, 'long'), `${d.n} trade${d.n === 1 ? '' : 's'}`);
            dl(el, [['Result', unitFmt(stats.cellValue(d, P.unit, st.basis))], ['Wins / losses', `${d.wins}W ${d.losses}L${d.scratch ? ' ' + d.scratch + 'S' : ''}`], ['Win rate', d.wins + d.losses ? pctOf(d.wins / (d.wins + d.losses)) : '—'], ['Best / worst', `${money(d.best, 'avg')} / ${money(d.worst, 'avg')}`], ['Accounts', String(d.accounts.size)]]);
            return true;
        });
    }

    function dailyChart() {
        const st = S();
        const keys = [...P.days.keys()].sort();
        if (!keys.length) return empty('No trades in this period.');
        const data = keys.map((k) => { const d = P.days.get(k); return { label: T.fmtDate(k, 'dm'), v: stats.cellValue(d, P.unit, st.basis), key: k, d }; });
        data.forEach((d) => { if (d.v == null) d.v = 0; });
        return barChart({ data, height: 190, yLabel: axisFmt, tipId: (d) => dayTip(d.key, d.d) });
    }
    function dailyTable() {
        const st = S();
        return twin([{ label: 'Day', cls: 'l' }, { label: 'Trades' }, { label: 'W / L' }, { label: 'Win rate' }, { label: 'Result' }],
            [...P.days.keys()].sort().reverse().map((k) => { const d = P.days.get(k); const v = stats.cellValue(d, P.unit, st.basis); return [T.fmtDate(k, 'short'), String(d.n), `${d.wins} / ${d.losses}`, d.wins + d.losses ? pctOf(d.wins / (d.wins + d.losses)) : '—', h('span', { class: sideCls(v) }, unitFmt(v))]; }));
    }

    function bucketTip(title, r) {
        return tips.add((el) => {
            popBase(el, title, `${r.n} trade${r.n === 1 ? '' : 's'}`, { low: low(r.n) });
            dl(el, [['Net', money(r.net, 'tot'), sideCls(r.net)], ['Win rate', r.winRate == null ? '—' : pctOf(r.winRate)], ['W / L / S', `${r.wins} / ${r.losses} / ${r.scratch}`], ['Profit factor', r.profitFactor == null ? '—' : num(r.profitFactor)], ['Expectancy', money(r.expectancy, 'avg')]]);
            return true;
        });
    }
    const yMoney = () => (S().hide ? null : (v) => fmt.usd(v, { ctx: 'cell', sign: false }));

    function hourRows() { return stats.breakdown(P.list, 'hour', P.opts); }
    function hourChart() {
        const rows = hourRows();
        if (!rows.length) return empty('No trades in this period.');
        const by = new Map(rows.map((r) => [r.key, r]));
        const lo = rows[0].key, hi = rows[rows.length - 1].key;
        const data = [];
        for (let hh = lo; hh <= hi; hh++) { const r = by.get(hh); data.push({ label: String(hh).padStart(2, '0'), v: r ? r.net : 0, r, hh }); }
        return barChart({ data, height: 180, yLabel: yMoney(), every: 1, tipId: (d) => (d.r ? bucketTip(`${d.label}:00 ET`, d.r) : null) });
    }
    function bucketTable(rows, first) {
        return twin([{ label: first, cls: 'l' }, { label: 'Trades' }, { label: 'WR' }, { label: 'PF' }, { label: 'Expectancy' }, { label: 'Net' }],
            rows.map((r) => [r.label, String(r.n), r.winRate == null ? '—' : pctOf(r.winRate), r.profitFactor == null ? '—' : num(r.profitFactor), money(r.expectancy, 'avg'), h('span', { class: sideCls(r.net) }, money(r.net, 'tot'))]));
    }

    function weekdayChart() {
        const rows = stats.breakdown(P.list, 'weekday', P.opts);
        if (!rows.length) return empty('No trades in this period.');
        const by = new Map(rows.map((r) => [r.label, r]));
        const names = DOW_ORDER.filter((d) => by.has(d) || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(d));
        const data = names.map((d) => { const r = by.get(d); return { label: d, v: r ? r.net : 0, r }; });
        return barChart({ data, height: 180, yLabel: yMoney(), every: 1, tipId: (d) => (d.r ? bucketTip(d.label, d.r) : null) });
    }

    function histChart() {
        const bins = stats.histogram(P.list, 24, S().basis);
        if (!bins.length) return empty('No trades in this period.');
        const compact = (v) => (S().hide ? '' : fmt.usd(v, { ctx: 'cell', sign: false }));
        const data = bins.map((b) => ({
            label: compact(b.x0), v: b.n, cls: b.x1 <= 1e-9 ? 'dn' : b.x0 >= -1e-9 ? 'up' : 'up',
            tip: tips.add((el) => {
                popBase(el, `${money(b.x0, 'avg')} to ${money(b.x1, 'avg')}`, `${b.n} trade${b.n === 1 ? '' : 's'}`);
                el.appendChild(h('div', { class: 'sub' }, 'Net result per trade, equal-width bins with $0 on a bin edge.'));
                return true;
            })
        }));
        const posOf = (val) => { for (let i = 0; i < bins.length; i++) if (val >= bins[i].x0 - 1e-9 && val <= bins[i].x1 + 1e-9) return i + (bins[i].x1 === bins[i].x0 ? 0.5 : (val - bins[i].x0) / (bins[i].x1 - bins[i].x0)); return null; };
        const vlines = [];
        const z = posOf(0);
        if (z != null) vlines.push({ pos: z, label: S().hide ? '' : '$0', anchor: 'end' });
        const mp = P.med.net == null ? null : posOf(P.med.net);
        if (mp != null) vlines.push({ pos: mp, label: 'median', cls: 'med' });
        return barChart({ data, height: 180, every: Math.max(1, Math.round(bins.length / 6)), tipId: (d) => d.tip, vlines });
    }
    function histTable() {
        const bins = stats.histogram(P.list, 24, S().basis);
        return twin([{ label: 'From', cls: 'l' }, { label: 'To' }, { label: 'Trades' }], bins.map((b) => [money(b.x0, 'avg'), money(b.x1, 'avg'), String(b.n)]).reverse());
    }

    // ---------- symbol x side, exits ----------

    function symbolSide() {
        const m = new Map();
        for (const t of P.list) {
            let e = m.get(t.symbol);
            if (!e) m.set(t.symbol, e = { sym: t.symbol, label: t.display || t.symbol, long: { n: 0, net: 0, w: 0, l: 0, pts: 0, pn: 0 }, short: { n: 0, net: 0, w: 0, l: 0, pts: 0, pn: 0 } });
            const s = e[t.side];
            const c = stats.classify(t, P.opts.rule, P.D.symbolsMap, S().basis);
            s.n++; s.net += t.net; if (c === 'win') s.w++; else if (c === 'loss') s.l++;
            if (t.points != null) { s.pts += t.points; s.pn++; }
        }
        return [...m.values()].map((e) => ({ ...e, n: e.long.n + e.short.n, net: e.long.net + e.short.net })).sort((a, b) => b.n - a.n);
    }
    function symbolChart() {
        const all = symbolSide();
        if (!all.length) return empty('No trades in this period.');
        const TOP = 8;
        const top = all.slice(0, TOP);
        const rest = all.slice(TOP);
        const rows = top.map((e) => ({
            label: e.label.replace('-PERP', ''), title: e.label, bars: [{ v: e.long.net, cls: 'long' }, { v: e.short.net, cls: 'short' }],
            right: h('span', null, h('span', { class: sideCls(e.net) }, money(e.net, 'tot', { sign: true })), h('small', null, e.n + 't')), e
        }));
        if (rest.length) {
            const o = { long: { n: 0, net: 0 }, short: { n: 0, net: 0 } };
            for (const e of rest) for (const s of ['long', 'short']) { o[s].n += e[s].n; o[s].net += e[s].net; }
            rows.push({ label: `Other (${rest.length})`, title: rest.map((e) => e.label).join(', '), bars: [{ v: o.long.net, cls: 'long' }, { v: o.short.net, cls: 'short' }], right: h('span', null, h('span', { class: sideCls(o.long.net + o.short.net) }, money(o.long.net + o.short.net, 'tot', { sign: true })), h('small', null, o.long.n + o.short.n + 't')), e: { label: `${rest.length} other symbols`, long: { ...o.long, w: 0, l: 0 }, short: { ...o.short, w: 0, l: 0 } } });
        }
        return hbars({
            rows, tipId: (r) => tips.add((el) => {
                popBase(el, r.e.label, `${r.e.long.n + r.e.short.n} trades`);
                const wr = (s) => (s.w != null && s.w + s.l ? pctOf(s.w / (s.w + s.l)) : '—');
                dl(el, [['Long', `${r.e.long.n} · net ${money(r.e.long.net, 'tot')} · WR ${wr(r.e.long)}`], ['Short', `${r.e.short.n} · net ${money(r.e.short.net, 'tot')} · WR ${wr(r.e.short)}`]]);
                if (r.e.long.pn != null) foot(el, 'Points are per symbol: see the table view.');
                return true;
            })
        });
    }
    function symbolTable() {
        const rows = [];
        for (const e of symbolSide()) for (const side of ['long', 'short']) {
            const s = e[side];
            if (!s.n) continue;
            rows.push([e.label, side === 'long' ? 'Long' : 'Short', String(s.n), s.w + s.l ? pctOf(s.w / (s.w + s.l)) : '—', h('span', { class: sideCls(s.net) }, money(s.net, 'tot')), s.pn ? T.fmtPts(s.pts, { dp: 2, unit: false }) : '—', s.pn ? T.fmtPts(s.pts / s.pn, { dp: 2, unit: false }) : '—']);
        }
        return twin([{ label: 'Symbol', cls: 'l' }, { label: 'Side', cls: 'l' }, { label: 'Trades' }, { label: 'WR' }, { label: 'Net' }, { label: 'Σ pts' }, { label: 'Avg pts' }], rows);
    }

    function exitChart() {
        const rows = stats.breakdown(P.list, 'exit', P.opts);
        if (!rows.length) return empty('No trades in this period.');
        return hbars({
            rows: rows.map((r) => ({ label: r.label, bars: [{ v: r.net }], right: h('span', null, h('span', { class: sideCls(r.net) }, money(r.net, 'tot', { sign: true })), h('small', null, r.n + 't')), r })),
            tipId: (r) => bucketTip(r.r.label, r.r)
        });
    }

    // ---------- tags ----------

    function tagPanel() {
        const rows = stats.tagStats(P.list, P.D.notesByKey, S().mode, P.opts);
        const cost = rows.costOfMistakes;
        const wrap = h('div', { class: 'tg' });
        if (!rows.length) {
            wrap.appendChild(h('div', { class: 'dshim' }, 'No tagged trades in this period. Tag trades or days in the day drawer (A+, Mistake, FOMO…) to see what each habit is worth.'));
            return wrap;
        }
        const costId = tips.add((el) => {
            popBase(el, 'Cost of mistakes', `${cost.n} tagged trade${cost.n === 1 ? '' : 's'}`);
            el.appendChild(h('div', { class: 'formula' }, cost.formula));
            return true;
        });
        wrap.appendChild(h('div', { class: 'tg-cost', 'data-vtip': costId, tabindex: 0 },
            h('span', { class: 'lab' }, 'Cost of mistakes'),
            h('b', { class: sideCls(cost.value) }, cost.n ? money(cost.value, 'tot') : '—'),
            h('span', { class: 'mut' }, cost.n ? `across ${cost.n} trade${cost.n === 1 ? '' : 's'} tagged ${cost.parts.tags.join(' / ')}` : `no trades tagged ${cost.parts.tags.join(' / ')}`)));
        wrap.appendChild(twin([{ label: 'Tag', cls: 'l' }, { label: 'Trades' }, { label: 'WR' }, { label: 'Expectancy' }, { label: 'Net' }],
            rows.map((r) => [h('span', { class: 'tag-chip' }, r.tag), String(r.n), r.winRate == null ? '—' : pctOf(r.winRate), money(r.expectancy, 'avg'), h('span', { class: sideCls(r.net) }, money(r.net, 'tot'))]), { max: 320 }));
        return wrap;
    }

    // ---------- assemble ----------

    function renderCharts() {
        if (io) io.disconnect();
        pending.clear();
        for (const b of boxes.splice(0)) b.destroy && b.destroy();
        ui.clear(chartsEl);
        const k = P.k;
        // the drawdown named in the subtitle is the one of the curve on screen, in its own unit
        const series = seriesFor();
        const dd = P.unit === 'usd' ? k.maxDrawdown : stats.maxDrawdown(series);
        const ddText = dd.value < 0 ? ` · max drawdown ${P.unit === 'usd' ? unitDollar(dd.value, dd.pct) : unitFmt(dd.value)}` : '';
        const gold = h('span', { class: 'lg' }, ui.sparkle(12), 'payout');
        gold.style.color = 'var(--j-gold)';
        chartsEl.append(
            panel('equity', 'Equity', `closed ${S().basis === 'gross' ? 'gross' : 'net'}${P.unit === 'usd' ? '' : ' in ' + ({ pct: '% of capital', pts: 'points', r: 'R' })[P.unit]}, drawdown shaded${ddText}`, { chart: () => equityChart(series), table: equityTable, span: true, legend: P.pay.length ? gold : null }),
            panel('daily', 'Daily result', `${P.days.size} trading days`, { chart: dailyChart, table: dailyTable, span: true }),
            panel('hour', 'By hour', 'ET · entry time', { chart: hourChart, table: () => bucketTable(hourRows(), 'Hour (ET)') }),
            panel('weekday', 'By weekday', 'Vest day', { chart: weekdayChart, table: () => bucketTable(stats.breakdown(P.list, 'weekday', P.opts), 'Weekday') }),
            panel('symbol', 'Symbol × side', 'top 8 by trades', { chart: symbolChart, table: symbolTable, span: true, legend: h('span', { class: 'lg' }, h('i', { class: 'lg-up' }), 'Long', h('i', { class: 'lg-up', style: 'opacity:.55;margin-left:8px' }), 'Short') }),
            panel('exit', 'Exit reasons', 'net per reason', { chart: exitChart, table: () => bucketTable(stats.breakdown(P.list, 'exit', P.opts), 'Reason') }),
            panel('hist', 'Net per trade', P.med.net == null ? 'distribution' : 'distribution · median ' + money(P.med.net, 'avg'), { chart: histChart, table: histTable }),
            tagSection());
    }

    function tagSection() {
        const body = h('div', { class: 'pn-b', style: 'min-height:80px' });
        const el = h('section', { class: 'pn st-panel span2' }, h('div', { class: 'pn-h' }, h('b', null, 'By tag'), h('span', { class: 'sub' }, 'trade and day notes')), body);
        lazy(el, () => body.appendChild(tagPanel()));
        return el;
    }

    function update() {
        const st = S();
        const D = ctx.derived();
        const key = [st.hide, st.unit, st.basis, st.mode, period, twinOn.size].join('|');
        if (D === lastD && key === sig) return;
        lastD = D; sig = key;
        tips.reset();
        hover.hide();
        P = compute();
        renderHead();
        ui.clear(noteEl);
        if (!ctx.data.trades.length) noteEl.appendChild(h('div', { class: 'empty-note' }, h('b', null, 'No trades yet.'), ' Closed positions appear here once they sync.'));
        else if (!P.list.length) noteEl.appendChild(h('div', { class: 'empty-note' }, h('b', null, 'No trades in this period.'), ' ', period === 'all' ? 'Check the filters above.' : h('button', { class: 'link', type: 'button', onclick: () => { period = 'all'; lsSet(LS_PERIOD, 'all'); lastD = null; update(); } }, 'Show all time')));
        renderMetrics();
        renderCharts();
    }

    function onKey(e) {
        if (e.key === 'T' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const el = (hotPanel && hotPanel.isConnected ? hotPanel : null) || chartsEl.querySelector('.st-panel[data-panel]');
            if (el && el.toggleTwin) { el.toggleTwin(); return true; }
        }
        return false;
    }

    update();
    return {
        update, onKey,
        unmount() { hover.hide(); if (io) io.disconnect(); for (const b of boxes.splice(0)) b.destroy && b.destroy(); ui.clear(root); }
    };
}
