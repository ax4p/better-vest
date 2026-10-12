// Better Vest Calendar - statistics (pure: no DOM, no chrome APIs, no network).
// Inputs are normalized trades/accounts/payouts from model.js. Every KPI returns
// { value, n, formula, parts } so the UI can show a popover with the arithmetic.

import { dayKey, etParts, addDays, dowOfKey, daysBetween, etDateKey, payoutDayKey, monthKey, DOW3 } from './time.js';
import { accountName, exitLabel } from './model.js';

// A day is green/red only beyond one cent; $0.01 and below counts as flat.
export const EPS = 0.01;
export const MISTAKE_TAGS = ['Mistake', 'FOMO', 'Revenge', 'Rule break'];
export const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000];

// Calendar cell tint: level k (1-5) mixes the sign colour at INTENSITY_STEPS[k-1] * INTENSITY_MAX[theme] percent.
// The design asks for min(30, M) per theme, which is 30 everywhere. tests/journal/contrast.test.mjs proves 4.5:1 at 30;
// the highest level-5 percent that still passes is astral 40, dark 38, oled 46, light 43, nebula 42, starfield 45, ember 42, terminal 44.
export const INTENSITY_STEPS = [0.17, 0.33, 0.54, 0.77, 1];
export const INTENSITY_MAX = {
    astral: 30, dark: 30, oled: 30, light: 30, nebula: 30, starfield: 30, ember: 30, terminal: 30
};

// ---------- small helpers ----------

const isNum = (v) => v != null && Number.isFinite(v);
const sum = (arr, f) => { let s = 0; for (const x of arr) s += f(x); return s; };
const mean = (arr) => (arr.length ? sum(arr, (x) => x) / arr.length : null);
const median = (arr) => (arr.length ? percentile(arr.slice().sort((a, b) => a - b), 0.5) : null);
// Average R is clipped at ±R_CLIP so one odd stop cannot dominate it.
export const R_CLIP = 10;
const toSet = (v) => (v == null ? null : v instanceof Set ? v : new Set(Array.isArray(v) ? v : [v]));

function lookup(m, k) {
    if (!m || k == null) return undefined;
    return m instanceof Map ? m.get(k) : m[k];
}

function tickOf(symbolsMap, symbol) {
    const e = lookup(symbolsMap, symbol);
    return e && isNum(e.tick) && e.tick > 0 ? e.tick : null;
}

const valOf = (t, basis) => (basis === 'gross' ? t.gross : t.net);

function byClose(a, b) {
    return ((a.closeTs ?? 0) - (b.closeTs ?? 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// closed, real trades only (void = an order that never filled; see model.js)
const closedSorted = (trades) => trades.filter((t) => !t.open && !t.void && t.closeTs != null).sort(byClose);

function noteOf(ctx, key) {
    const m = ctx && ctx.notesByKey;
    return m ? (m instanceof Map ? m.get(key) : m[key]) : undefined;
}

// Tags on the trade's own note plus its Vest-day note. Map of lower-case tag -> display tag.
function tagsOf(t, ctx, mode) {
    const out = new Map();
    const add = (n) => { for (const g of (n && n.tags) || []) if (g) out.set(String(g).toLowerCase(), String(g)); };
    add(noteOf(ctx, 'trade:' + t.id));
    add(noteOf(ctx, 'day:' + dayKey(t.closeTs, mode)));
    return out;
}

export function isTestTrade(t, ctx) {
    if (t.test) return true;
    if (ctx && ctx.testTradeIds && toSet(ctx.testTradeIds).has(t.id)) return true;
    const n = noteOf(ctx, 'trade:' + t.id);
    return !!(n && (n.tags || []).some((g) => String(g).toLowerCase() === 'test'));
}

// Linear-interpolated percentile of an ascending array.
export function percentile(sorted, p) {
    if (!sorted.length) return null;
    const x = (sorted.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
}

// ---------- filtering ----------

const SCOPE_PHASES = { funded: ['funded', 'instant'], eval: ['eval'], primary: ['primary'] };

// Open trades are always dropped. f.accounts / symbols / sides / exits / tags: absent or empty = no filter.
// f.from / f.to are inclusive Vest-day keys ('YYYY-MM-DD') or, as numbers, a [from, to) close-time window in ms.
export function filterTrades(trades, f = {}, ctx = {}) {
    const mode = f.mode || 'vest';
    const scope = f.scope || 'all';
    const excludeTest = f.excludeTest !== false;
    const phases = SCOPE_PHASES[scope] || null;
    const accSet = toSet(f.accounts), symSet = toSet(f.symbols), sideSet = toSet(f.sides);
    const exitSet = toSet(f.exits);
    const tagSet = f.tags && (Array.isArray(f.tags) ? f.tags : [...f.tags]).length ? new Set([...f.tags].map((g) => String(g).toLowerCase())) : null;
    const byId = ctx.accountsById;
    const out = [];
    for (const t of trades) {
        if (t.open || t.void || t.closeTs == null) continue;
        if (phases) {
            const a = lookup(byId, t.accountId);
            if (!a || !phases.includes(a.phase)) continue;
        }
        if (accSet && accSet.size && !accSet.has(t.accountId)) continue;
        if (symSet && symSet.size && !symSet.has(t.symbol) && !symSet.has(t.display)) continue;
        if (sideSet && sideSet.size && !sideSet.has(t.side)) continue;
        if (exitSet && exitSet.size && !exitSet.has(t.exit)) continue;
        if (excludeTest && isTestTrade(t, ctx)) continue;
        if (f.from != null || f.to != null) {
            if (typeof f.from === 'number' || typeof f.to === 'number') {
                if (f.from != null && t.closeTs < f.from) continue;
                if (f.to != null && t.closeTs >= f.to) continue;
            } else {
                const k = dayKey(t.closeTs, mode);
                if (f.from != null && k < f.from) continue;
                if (f.to != null && k > f.to) continue;
            }
        }
        if (tagSet) {
            let hit = false;
            for (const g of tagsOf(t, ctx, mode).keys()) if (tagSet.has(g)) { hit = true; break; }
            if (!hit) continue;
        }
        out.push(t);
    }
    return out.sort(byClose);
}

// ---------- classification ----------

// rule: {kind:'tick'} (default) | {kind:'usd', usd} | {kind:'off'}. basis picks which P&L is tested.
export function classify(trade, rule, symbolsMap, basis = 'net') {
    const v = valOf(trade, basis);
    const kind = (rule && rule.kind) || 'tick';
    let scratch = false;
    if (kind === 'usd') scratch = Math.abs(v) <= (rule.usd || 0) + 1e-9;
    else if (kind === 'tick') {
        const tick = tickOf(symbolsMap, trade.symbol);
        if (trade.points != null && tick != null) scratch = Math.abs(trade.points) <= tick + 1e-9;
        else scratch = Math.abs(v) <= 2 * (trade.fee || 0) + 1e-9;
    }
    if (scratch || Math.abs(v) < 1e-9) return 'scratch';
    return v > 0 ? 'win' : 'loss';
}

function ruleOf(opts) {
    const r = opts && opts.rule;
    return r && r.kind ? r : { kind: 'tick' };
}

// ---------- days ----------

function newDay(key) {
    return {
        key, n: 0, wins: 0, losses: 0, scratch: 0, net: 0, gross: 0, fees: 0, funding: 0,
        best: null, worst: null, points: 0, pointsN: 0, rSum: 0, rN: 0, riskPtsSum: 0, riskN: 0, rrSum: 0, rrN: 0,
        accounts: new Set(), symbols: new Set(),
        byPhase: {
            funded: { n: 0, net: 0, gross: 0 }, eval: { n: 0, net: 0, gross: 0 },
            instant: { n: 0, net: 0, gross: 0 }, primary: { n: 0, net: 0, gross: 0 }
        },
        capitalBase: 0, capNet: 0, capGross: 0, tradeIds: [], carried: 0
    };
}

// One Day per Vest day (by close time). Day.net / Day.gross are always the true sums; opts.basis only
// decides which P&L drives wins/losses/scratch and best/worst. byPhase[phase] = {n, net, gross}.
export function aggregateDays(trades, opts = {}) {
    const mode = opts.mode || 'vest', basis = opts.basis || 'net', rule = ruleOf(opts);
    const days = new Map();
    const baseSeen = new Map();
    for (const t of closedSorted(trades)) {
        const key = dayKey(t.closeTs, mode);
        let d = days.get(key);
        if (!d) { d = newDay(key); days.set(key, d); baseSeen.set(key, new Set()); }
        const v = valOf(t, basis);
        d.n++;
        d.net += t.net; d.gross += t.gross; d.fees += t.fee; d.funding += t.funding;
        const c = classify(t, rule, opts.symbolsMap, basis);
        if (c === 'win') d.wins++; else if (c === 'loss') d.losses++; else d.scratch++;
        if (d.best == null || v > d.best) d.best = v;
        if (d.worst == null || v < d.worst) d.worst = v;
        if (t.points != null) { d.points += t.points; d.pointsN++; }
        if (t.rMult != null) { d.rSum += t.rMult; d.rN++; }
        if (t.riskPts != null) { d.riskPtsSum += t.riskPts; d.riskN++; }
        if (t.plannedRR != null) { d.rrSum += t.plannedRR; d.rrN++; }
        d.accounts.add(t.accountId);
        d.symbols.add(t.symbol);
        const acc = lookup(opts.accountsById, t.accountId);
        if (acc) {
            const ph = d.byPhase[acc.phase];
            if (ph) { ph.n++; ph.net += t.net; ph.gross += t.gross; }
            const seen = baseSeen.get(key);
            if (acc.kind === 'capital' && acc.initialCapital > 0) {
                // the % unit compares capital-account P&L with capital-account size (the primary has no size)
                d.capNet += t.net; d.capGross += t.gross;
                if (!seen.has(acc.id)) { seen.add(acc.id); d.capitalBase += acc.initialCapital; }
            }
        }
        d.tradeIds.push(t.id);
        if (t.openTs != null && dayKey(t.openTs, mode) < key) d.carried++;
    }
    return days;
}

// Totals over any list of Days (a week, a range selection).
export function sumDays(days) {
    const o = { net: 0, gross: 0, fees: 0, funding: 0, n: 0, wins: 0, losses: 0, scratch: 0, days: 0, winRate: null };
    for (const d of days) {
        if (!d || !d.n) continue;
        o.days++; o.n += d.n; o.net += d.net; o.gross += d.gross; o.fees += d.fees; o.funding += d.funding;
        o.wins += d.wins; o.losses += d.losses; o.scratch += d.scratch;
    }
    o.winRate = o.wins + o.losses ? o.wins / (o.wins + o.losses) : null;
    return o;
}

// ---------- cell units and intensity ----------

// $ snaps to 0 inside the flat band; % needs a capital base; pts only when the day is one symbol; R needs known risk.
export function cellValue(day, unit = 'usd', basis = 'net') {
    if (!day || !day.n) return null;
    const usd = basis === 'gross' ? day.gross : day.net;
    switch (unit) {
        case 'usd': return Math.abs(usd) <= EPS ? 0 : usd;
        case 'pct': return day.capitalBase > 0 ? (basis === 'gross' ? day.capGross : day.capNet) / day.capitalBase : null;
        case 'pts': return day.symbols.size <= 1 && day.pointsN > 0 ? day.points : null;
        case 'r': return day.rN > 0 ? day.rSum : null;
        default: return null;
    }
}

function scaleOf(arr) {
    if (!arr.length) return null;
    if (arr.length < 5) return Math.max(...arr);
    return percentile(arr.slice().sort((a, b) => a - b), 0.85);
}

// {pos, neg}: P85 of positive values and of |negative| values; fewer than 5 of a sign uses that sign's max.
export function intensityScale(values) {
    const pos = [], neg = [];
    for (const v of values) {
        if (!isNum(v)) continue;
        if (v > 1e-9) pos.push(v); else if (v < -1e-9) neg.push(-v);
    }
    return { pos: scaleOf(pos), neg: scaleOf(neg) };
}

// entries [{key, value}] -> scale over the trailing windowDays ending at asOf (default: latest key).
// A window with fewer than 20 values falls back to every entry in scope.
export function scaleFromDays(entries, { asOf, windowDays = 365 } = {}) {
    const ok = entries.filter((e) => isNum(e.value));
    if (!ok.length) return { pos: null, neg: null };
    const end = asOf || ok.reduce((m, e) => (e.key > m ? e.key : m), ok[0].key);
    const start = addDays(end, -(windowDays - 1));
    const win = ok.filter((e) => e.key >= start && e.key <= end);
    return intensityScale((win.length < 20 ? ok : win).map((e) => e.value));
}

// Integer -5..5: sign of v, magnitude ceil(5 * sqrt(|v| / s)) clamped to 1..5. 0 = flat.
export function level(v, scale) {
    if (!isNum(v) || Math.abs(v) < 1e-9) return 0;
    const pos = v > 0;
    let s = scale && (pos ? scale.pos : scale.neg);
    if (!(s > 0)) s = Math.abs(v);
    const k = Math.min(5, Math.max(1, Math.ceil(5 * Math.sqrt(Math.abs(v) / s) - 1e-9)));
    return pos ? k : -k;
}

// ---------- curves ----------

export function equityCurve(trades, basis = 'net') {
    let cum = 0;
    return closedSorted(trades).map((t) => {
        const v = valOf(t, basis);
        cum += v;
        return { ts: t.closeTs, cum, net: v, id: t.id };
    });
}

// Largest peak-to-trough drop of the cumulative curve, starting from 0 (peakTs null = the start).
export function maxDrawdown(curve) {
    let peak = 0, peakTs = null, worst = 0, wPeakTs = null, wTroughTs = null;
    for (const p of curve) {
        if (p.cum > peak) { peak = p.cum; peakTs = p.ts; }
        const dd = p.cum - peak;
        if (dd < worst) { worst = dd; wPeakTs = peakTs; wTroughTs = p.ts; }
    }
    return { value: worst, peakTs: wPeakTs, troughTs: wTroughTs };
}

// bins: a count (default 20). Equal-width bins on net P&L with 0 on a bin edge; the last bin includes its upper edge.
export function histogram(trades, bins = 20, basis = 'net') {
    const vals = closedSorted(trades).map((t) => valOf(t, basis));
    if (!vals.length) return [];
    const min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) return [{ x0: min, x1: max, n: vals.length }];
    const w = (max - min) / Math.max(1, bins);
    const lo = Math.floor(min / w) * w;
    const nb = Math.max(1, Math.ceil((max - lo) / w - 1e-9));
    const out = [];
    for (let i = 0; i < nb; i++) out.push({ x0: lo + i * w, x1: lo + (i + 1) * w, n: 0 });
    for (const v of vals) out[Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / w + 1e-12)))].n++;
    return out;
}

// ---------- breakdowns ----------

function groupStats(key, label, list, opts) {
    const basis = opts.basis || 'net', rule = ruleOf(opts);
    let wins = 0, losses = 0, scratch = 0, net = 0, gp = 0, gl = 0;
    for (const t of list) {
        const v = valOf(t, basis);
        net += v;
        const c = classify(t, rule, opts.symbolsMap, basis);
        if (c === 'win') { wins++; gp += v; } else if (c === 'loss') { losses++; gl += -v; } else scratch++;
    }
    return {
        key, label, n: list.length, net, wins, losses, scratch,
        winRate: wins + losses ? wins / (wins + losses) : null,
        profitFactor: gl > 0 ? gp / gl : null,
        expectancy: list.length ? net / list.length : null
    };
}

// by: 'hour' (ET hour of the open; opts.hourBy 'close' for the close) | 'weekday' (Vest-day weekday, Mon first) |
// 'symbol' | 'side' | 'exit' | 'account' | 'tag'. Only buckets with trades are returned.
export function breakdown(trades, by, opts = {}) {
    const mode = opts.mode || 'vest';
    const groups = new Map();
    const add = (key, label, t) => {
        let g = groups.get(key);
        if (!g) { g = { key, label, list: [] }; groups.set(key, g); }
        g.list.push(t);
    };
    for (const t of closedSorted(trades)) {
        switch (by) {
            case 'hour': {
                const ts = opts.hourBy === 'close' ? t.closeTs : (t.openTs ?? t.closeTs);
                const h = etParts(ts).h;
                add(h, String(h).padStart(2, '0') + ':00', t);
                break;
            }
            case 'weekday': {
                const d = dowOfKey(dayKey(t.closeTs, mode));
                add(d, DOW3[d], t);
                break;
            }
            case 'symbol': add(t.symbol, t.display || t.symbol, t); break;
            case 'side': add(t.side, t.side === 'long' ? 'Long' : 'Short', t); break;
            case 'exit': add(t.exit || 'unknown', exitLabel(t.exit), t); break;
            case 'account': {
                const a = lookup(opts.accountsById, t.accountId);
                add(t.accountId, a ? accountName(a) : t.accountId, t);
                break;
            }
            case 'tag':
                for (const [k, label] of tagsOf(t, opts, mode)) add(k, label, t);
                break;
            default: throw new Error('breakdown: unknown dimension ' + by);
        }
    }
    const rows = [...groups.values()].map((g) => groupStats(g.key, g.label, g.list, opts));
    if (by === 'hour') rows.sort((a, b) => a.key - b.key);
    else if (by === 'weekday') rows.sort((a, b) => ((a.key + 6) % 7) - ((b.key + 6) % 7));
    else rows.sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : 1));
    return rows;
}

// ---------- KPIs ----------

function metric(value, n, formula, parts = {}, extra) {
    return { value, n, formula, parts, ...extra };
}

// Filtered symbol, else the symbol holding >= 80% of the trades, else null.
function focusSymbolOf(list, opts) {
    if (opts.focusSymbol) {
        const hit = list.find((t) => t.symbol === opts.focusSymbol || t.display === opts.focusSymbol);
        return hit ? hit.symbol : opts.focusSymbol;
    }
    if (!list.length) return null;
    const c = new Map();
    for (const t of list) c.set(t.symbol, (c.get(t.symbol) || 0) + 1);
    let best = null, bn = 0;
    for (const [s, n] of c) if (n > bn) { best = s; bn = n; }
    return bn * 5 >= list.length * 4 ? best : null;
}

// Typical risk per symbol: the median distance (robust to the odd far or close stop); means kept alongside.
function riskBySymbol(list) {
    const m = {};
    for (const t of list) {
        const r = m[t.symbol] || (m[t.symbol] = { n: 0, pts: [], usd: [] });
        r.n++;
        if (t.riskPts != null) { r.pts.push(t.riskPts); if (t.riskUsd != null) r.usd.push(t.riskUsd); }
    }
    const out = {};
    for (const [s, r] of Object.entries(m)) {
        const known = r.pts.length;
        out[s] = {
            avgRiskPts: known ? median(r.pts) : null,
            avgRiskUsd: r.usd.length ? median(r.usd) : null,
            meanRiskPts: known ? mean(r.pts) : null,
            meanRiskUsd: r.usd.length ? mean(r.usd) : null,
            n: r.n, known, coverage: r.n ? known / r.n : 0
        };
    }
    return out;
}

function streaks(signs) {
    let maxWin = 0, maxLoss = 0, cur = 0;
    for (const s of signs) {
        if (s > 0) cur = cur > 0 ? cur + 1 : 1;
        else if (s < 0) cur = cur < 0 ? cur - 1 : -1;
        else continue;
        if (cur > maxWin) maxWin = cur;
        if (-cur > maxLoss) maxLoss = -cur;
    }
    return { maxWin, maxLoss, current: cur };
}

export function kpis(trades, opts = {}) {
    const basis = opts.basis || 'net', rule = ruleOf(opts);
    const list = closedSorted(trades);
    const n = list.length;
    const label = basis === 'gross' ? 'gross P&L' : 'net P&L';

    const cls = list.map((t) => classify(t, rule, opts.symbolsMap, basis));
    const wins = [], losses = [];
    let scratch = 0;
    list.forEach((t, i) => {
        const v = valOf(t, basis);
        if (cls[i] === 'win') wins.push(v); else if (cls[i] === 'loss') losses.push(v); else scratch++;
    });
    const W = wins.length, L = losses.length;
    const grossProfit = sum(wins, (x) => x), grossLoss = sum(losses, (x) => -x);
    const total = sum(list, (t) => valOf(t, basis));
    const netSum = sum(list, (t) => t.net), grossSum = sum(list, (t) => t.gross);
    const feeSum = sum(list, (t) => t.fee), fundSum = sum(list, (t) => t.funding);

    const k = {};
    k.net = metric(netSum, n, 'Net = Σ (gross − fees + funding)', { gross: grossSum, fees: feeSum, funding: fundSum });
    k.gross = metric(grossSum, n, 'Gross = Σ closed P&L before fees and funding');
    k.fees = metric(feeSum, n, 'Fees = Σ trading fees');
    k.funding = metric(fundSum, n, 'Funding = Σ funding paid (−) or received (+)');
    k.trades = metric(n, n, 'Trades = closed positions in scope', { wins: W, losses: L, scratch });
    k.scratchCount = metric(scratch, n, 'Scratch = trades inside the scratch rule, excluded from win rate', { rule });
    k.rule = metric(rule, n, 'Scratch rule: ' + (rule.kind === 'usd' ? `|${basis === 'gross' ? 'gross' : 'net'}| ≤ $${rule.usd || 0}` : rule.kind === 'off' ? 'off' : '|points| ≤ one tick (or |net| ≤ 2 × fee when points are unknown)'), { scratch });

    k.winRate = metric(W + L ? W / (W + L) : null, W + L, 'Win rate = wins ÷ (wins + losses); scratch trades excluded', { wins: W, losses: L, scratch, rule });
    k.winRateAll = metric(n ? W / n : null, n, 'Win rate (all) = wins ÷ all trades, scratch counted as non-wins', { wins: W, scratch, trades: n });
    k.profitFactor = metric(n >= 5 && grossLoss > 0 ? grossProfit / grossLoss : null, n, 'PF = Σ wins ÷ Σ |losses|', { grossProfit, grossLoss, needs: 'at least 5 trades and one loss' });
    k.expectancy = metric(n ? total / n : null, n, `Expectancy = Σ ${label} ÷ trades`, { total });
    const avgWin = W ? grossProfit / W : null, avgLoss = L ? -grossLoss / L : null;
    k.avgWin = metric(avgWin, W, 'Avg win = Σ wins ÷ number of wins', { grossProfit });
    k.avgLoss = metric(avgLoss, L, 'Avg loss = Σ losses ÷ number of losses (negative)', { grossLoss });
    k.payoff = metric(avgWin != null && avgLoss ? avgWin / Math.abs(avgLoss) : null, W + L, 'Payoff = avg win ÷ |avg loss|', { avgWin, avgLoss });
    k.largestWin = metric(W ? Math.max(...wins) : null, W, 'Largest win = best winning trade');
    k.largestLoss = metric(L ? Math.min(...losses) : null, L, 'Largest loss = worst losing trade (negative)');

    // days
    const dayMap = opts.days || aggregateDays(list, { ...opts, basis, rule });
    const dayList = [...dayMap.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    const dv = (d) => (basis === 'gross' ? d.gross : d.net);
    const green = dayList.filter((d) => dv(d) > EPS), red = dayList.filter((d) => dv(d) < -EPS);
    const flat = dayList.length - green.length - red.length;
    const greenSum = sum(green, dv);
    k.greenDays = metric(green.length, dayList.length, 'Green days = days with P&L above +$0.01', { sum: greenSum });
    k.redDays = metric(red.length, dayList.length, 'Red days = days with P&L below −$0.01', { sum: sum(red, dv) });
    k.flatDays = metric(flat, dayList.length, 'Flat days = days within ±$0.01');
    k.dayWinRate = metric(green.length + red.length ? green.length / (green.length + red.length) : null, green.length + red.length, 'Day WR = green days ÷ (green + red days)', { green: green.length, red: red.length, flat });
    const bestD = dayList.reduce((b, d) => (!b || dv(d) > dv(b) ? d : b), null);
    const worstD = dayList.reduce((b, d) => (!b || dv(d) < dv(b) ? d : b), null);
    k.bestDay = metric(bestD ? dv(bestD) : null, dayList.length, 'Best day = highest daily P&L', { key: bestD && bestD.key });
    k.worstDay = metric(worstD ? dv(worstD) : null, dayList.length, 'Worst day = lowest daily P&L', { key: worstD && worstD.key });
    k.avgDay = metric(dayList.length ? sum(dayList, dv) / dayList.length : null, dayList.length, 'Avg day = Σ daily P&L ÷ trading days', { total: sum(dayList, dv) });
    k.bestDayShare = metric(bestD && greenSum > 0 && dv(bestD) > EPS ? dv(bestD) / greenSum : null, green.length, 'Best-day share = best day ÷ Σ green days', { bestDay: bestD ? dv(bestD) : null, greenSum });

    // drawdown and recovery
    const dd = maxDrawdown(equityCurve(list, basis));
    const acct = opts.singleAccount;
    const pct = acct && acct.initialCapital > 0 ? dd.value / acct.initialCapital : null;
    k.maxDrawdown = metric(dd.value, n, 'Max drawdown = largest peak-to-trough fall of cumulative closed P&L' + (pct != null ? ', as % of the starting balance' : ''), { peakTs: dd.peakTs, troughTs: dd.troughTs, pct }, { peakTs: dd.peakTs, troughTs: dd.troughTs, pct });
    k.recoveryFactor = metric(dd.value < 0 ? total / Math.abs(dd.value) : null, n, 'Recovery = Σ P&L ÷ |max drawdown|', { total, maxDrawdown: dd.value });

    // streaks
    k.streakTrades = metric(streaks(cls.map((c) => (c === 'win' ? 1 : c === 'loss' ? -1 : 0))), n, 'Streak = longest run of winning or losing trades; scratch trades neither extend nor break it');
    k.streakDays = metric(streaks(dayList.map((d) => (dv(d) > EPS ? 1 : dv(d) < -EPS ? -1 : 0))), dayList.length, 'Day streak = longest run of green or red days; flat days are skipped');

    // risk
    const bySymbol = riskBySymbol(list);
    const focus = focusSymbolOf(list, opts);
    const fr = focus ? bySymbol[focus] : null;
    k.avgRisk = metric(fr ? fr.avgRiskPts : null, fr ? fr.n : n, 'Avg risk = median |entry − initial stop| per symbol, over trades with a stop set within 2 min of entry', { symbol: focus, known: fr ? fr.known : null, mean: fr ? fr.meanRiskPts : null },
        { usd: fr ? fr.avgRiskUsd : null, symbol: focus, bySymbol, coverage: fr ? fr.coverage : (n ? list.filter((t) => t.riskPts != null).length / n : 0), known: fr ? fr.known : list.filter((t) => t.riskPts != null).length });
    const rr = list.filter((t) => t.plannedRR != null).map((t) => t.plannedRR);
    k.plannedRR = metric(median(rr), rr.length, 'Planned RR = median (initial target distance ÷ initial risk) over trades with both set', { mean: mean(rr) });
    const rs = list.filter((t) => t.rMult != null).map((t) => t.rMult);
    const clipped = rs.filter((r) => Math.abs(r) > R_CLIP).length;
    k.avgR = metric(mean(rs.map((r) => Math.max(-R_CLIP, Math.min(R_CLIP, r)))), rs.length, `Avg R = mean (points ÷ initial risk), each trade clipped at ±${R_CLIP}R`, { median: median(rs), clipped });
    k.rCoverage = metric(n ? rs.length / n : null, n, 'R coverage = trades with a known initial stop ÷ all trades', { known: rs.length });

    const held = list.filter((t) => t.heldMs != null).map((t) => t.heldMs);
    k.avgHold = metric(mean(held), held.length, 'Avg hold = mean (close − open)');
    for (const side of ['long', 'short']) {
        const s = list.filter((t) => t.side === side);
        const sw = s.filter((t) => classify(t, rule, opts.symbolsMap, basis) === 'win').length;
        const sl = s.filter((t) => classify(t, rule, opts.symbolsMap, basis) === 'loss').length;
        k[side] = metric({ n: s.length, winRate: sw + sl ? sw / (sw + sl) : null, net: sum(s, (t) => t.net) }, s.length, `${side === 'long' ? 'Long' : 'Short'} = trades, win rate and net P&L of ${side} positions`);
    }
    const posGross = sum(list, (t) => Math.max(t.gross, 0));
    k.feeDrag = metric(posGross > 0 ? feeSum / posGross : null, n, 'Fee drag = Σ fees ÷ Σ winning gross P&L', { fees: feeSum, positiveGross: posGross });
    return k;
}

// ---------- payouts ----------

const payTs = (p) => (p.status === 'EXECUTED' && p.executedAt ? p.executedAt : p.createdAt);

// EXECUTED payouts are the money received. PROCESSING is pending; REFUNDED / FAILED are excluded.
export function payoutStats(payouts) {
    const done = payouts.filter((p) => p.status === 'EXECUTED').sort((a, b) => (payTs(a) ?? 0) - (payTs(b) ?? 0));
    const processing = payouts.filter((p) => p.status === 'PROCESSING');
    const refunded = payouts.filter((p) => p.status === 'REFUNDED');
    const net = sum(done, (p) => p.net), gross = sum(done, (p) => p.gross);
    const months = new Map();
    for (const p of done) {
        const ym = monthKey(payoutDayKey(p, 'executed'));
        const m = months.get(ym) || { ym, net: 0, gross: 0, n: 0 };
        m.net += p.net; m.gross += p.gross; m.n++;
        months.set(ym, m);
    }
    let cum = 0, mi = 0;
    const milestones = MILESTONES.map((amount) => ({ amount, reachedAt: null }));
    for (const p of done) {
        cum += p.net;
        while (mi < milestones.length && cum >= milestones[mi].amount - 1e-9) { milestones[mi].reachedAt = payTs(p); mi++; }
    }
    return {
        lifetimeNet: net,
        lifetimeGross: gross,
        vestShare: sum(done, (p) => p.platformCut),
        pending: sum(processing, (p) => p.gross),
        pendingCount: processing.length,
        count: done.length,
        avg: done.length ? net / done.length : null,
        largest: done.length ? Math.max(...done.map((p) => p.net)) : null,
        refundedCount: refunded.length,
        refundedGross: sum(refunded, (p) => p.gross),
        byMonth: [...months.values()].sort((a, b) => (a.ym < b.ym ? -1 : 1)),
        milestones
    };
}

// Map dayKey -> {net, gross, n, pending, items}. basis 'executed' (default) or 'requested' picks the date.
// net/gross/n count EXECUTED payouts only; items lists every payout dated that day, whatever its status.
export function payoutDays(payouts, basis = 'executed') {
    const m = new Map();
    for (const p of payouts) {
        const key = payoutDayKey(p, basis);
        if (!key) continue;
        let d = m.get(key);
        if (!d) { d = { net: 0, gross: 0, n: 0, pending: 0, items: [] }; m.set(key, d); }
        d.items.push(p);
        if (p.status === 'EXECUTED') { d.net += p.net; d.gross += p.gross; d.n++; }
        else if (p.status === 'PROCESSING') d.pending += p.gross;
    }
    return m;
}

// ---------- accounts, journeys, reconciliation ----------

function indexTrades(trades) {
    const m = new Map();
    for (const t of trades) {
        if (t.open || t.void || t.closeTs == null || t.test) continue;
        let a = m.get(t.accountId);
        if (!a) m.set(t.accountId, a = []);
        a.push(t);
    }
    return m;
}

function winRateOf(list, opts = {}) {
    let w = 0, l = 0;
    for (const t of list) {
        const c = classify(t, opts.rule, opts.symbolsMap);
        if (c === 'win') w++; else if (c === 'loss') l++;
    }
    return w + l ? w / (w + l) : null;
}

export function accountStats(accounts, trades, payouts, opts = {}) {
    const byAcc = indexTrades(trades);
    const paid = new Map();
    for (const p of payouts) if (p.status === 'EXECUTED') paid.set(p.accountId, (paid.get(p.accountId) || 0) + p.net);
    const out = new Map();
    for (const a of accounts) {
        const list = byAcc.get(a.id) || [];
        out.set(a.id, {
            net: sum(list, (t) => t.net),
            n: list.length,
            winRate: winRateOf(list, opts),
            payoutsNet: paid.get(a.id) || 0,
            firstTs: list.length ? Math.min(...list.map((t) => t.openTs ?? t.closeTs)) : null,
            lastTs: list.length ? Math.max(...list.map((t) => t.closeTs)) : null
        });
    }
    return out;
}

const OUTCOME_BY_STATUS = { 1: 'active', 2: 'active', 3: 'passed', 4: 'failed-drawdown', 5: 'failed-dailyloss', 6: 'claimed', 7: 'blocked' };

// Groups capital accounts by chainId (eval -> funded). Pass rate counts chains whose evaluation has
// resolved: passed (last eval goal-passed or a funded account exists) vs failed (last eval status 4/5).
export function journeys(accounts, trades, payouts, opts = {}) {
    const caps = accounts.filter((a) => a.kind !== 'primary');
    const byAcc = indexTrades(trades);
    const paid = new Map();
    for (const p of payouts) if (p.status === 'EXECUTED') paid.set(p.accountId, (paid.get(p.accountId) || 0) + p.net);
    const groups = new Map();
    for (const a of caps) {
        const g = groups.get(a.chainId);
        if (g) g.push(a); else groups.set(a.chainId, [a]);
    }
    const rank = (a) => a.step ?? (a.phase === 'eval' ? 0 : Infinity);
    const chains = [];
    let passed = 0, failedEval = 0;
    const failures = { drawdown: 0, dailyLoss: 0 };
    for (const [chainId, list] of groups) {
        list.sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1) || ((a.createdAt ?? 0) - (b.createdAt ?? 0)));
        const last = list[list.length - 1];
        const evals = list.filter((a) => a.phase === 'eval');
        const later = list.filter((a) => a.phase !== 'eval');
        const lastEval = evals[evals.length - 1] || null;
        const evalPassed = !!lastEval && (lastEval.status === 3 || later.length > 0);
        let daysToPass = null, passTs = null;
        const startTs = list[0].activatedAt ?? list[0].createdAt ?? null;
        if (evalPassed) {
            const nxt = later[0];
            passTs = lastEval.finalizedAt ?? (nxt ? (nxt.activatedAt ?? nxt.createdAt) : null);
            const from = evals[0].activatedAt ?? evals[0].createdAt;
            if (passTs != null && from != null) daysToPass = daysBetween(etDateKey(from), etDateKey(passTs)) + 1;
        }
        if (lastEval) {
            if (evalPassed) passed++;
            else if (lastEval.status === 4 || lastEval.status === 5) failedEval++;
        }
        for (const a of list) {
            if (a.status === 4) failures.drawdown++;
            else if (a.status === 5) failures.dailyLoss++;
        }
        const ts = list.flatMap((a) => byAcc.get(a.id) || []);
        chains.push({
            chainId,
            accounts: list,
            phases: list.map((a) => a.phase),
            outcome: OUTCOME_BY_STATUS[last.status] || 'active',
            daysToPass,
            passTs,
            startTs,
            net: sum(ts, (t) => t.net),
            n: ts.length,
            winRate: winRateOf(ts, opts),
            payoutsNet: sum(list, (a) => paid.get(a.id) || 0),
            planName: last.planName,
            initialCapital: last.initialCapital
        });
    }
    chains.sort((a, b) => ((b.startTs ?? 0) - (a.startTs ?? 0)));
    const activeChains = chains.filter((c) => c.outcome === 'active');
    return {
        chains,
        passRate: passed + failedEval ? passed / (passed + failedEval) : null,
        passed, failedEval,
        failures,
        active: activeChains.length,
        activeChains
    };
}

// Does the account's own arithmetic add up? Tolerance is one cent.
//  eval-active: initial + Σnet == balance (verified exact on live data)
//  final:       information only (ok is always null). Vest's final_equity is a snapshot taken when the
//               account passed or failed, open P&L included, and final_balance is what is left after the
//               capital is swept back, so neither can equal the closed-trade sum. expected/actual/diff
//               describe initial + Σnet − Σgross(EXECUTED|PROCESSING) against final_equity.
//  primary, status 6 (claimed), funded/instant active, anything without the needed balance: not-reconcilable
export function reconcile(account, trades, payouts) {
    const none = { kind: 'not-reconcilable', ok: null, expected: null, actual: null, diff: null };
    if (!account || account.kind === 'primary' || account.status === 6 || account.initialCapital == null) return none;
    const mine = trades.filter((t) => t.accountId === account.id && !t.open && t.closeTs != null);
    const netSum = sum(mine, (t) => t.net);
    const finish = (kind, expected, actual) => {
        const diff = actual - expected;
        return { kind, ok: Math.abs(diff) <= EPS + 1e-9, expected, actual, diff };
    };
    if (account.status >= 3 && account.status <= 7 && (account.finalEquity != null || account.finalBalance != null)) {
        const out = sum(payouts.filter((p) => p.accountId === account.id && (p.status === 'EXECUTED' || p.status === 'PROCESSING')), (p) => p.gross);
        const expected = account.initialCapital + netSum - out;
        const actual = account.finalEquity != null ? account.finalEquity : account.finalBalance;
        return { kind: 'final', ok: null, expected, actual, diff: actual - expected };
    }
    if ((account.status === 1 || account.status === 2) && account.phase === 'eval' && account.balance != null) {
        return finish('eval-active', account.initialCapital + netSum, account.balance);
    }
    return none;
}

// ---------- tags ----------

function tagCost(list, ctx, mode) {
    const bad = new Set(MISTAKE_TAGS.map((g) => g.toLowerCase()));
    const hit = list.filter((t) => { for (const g of tagsOf(t, ctx, mode).keys()) if (bad.has(g)) return true; return false; });
    return metric(sum(hit, (t) => t.net), hit.length, 'Cost of mistakes = Σ net P&L of trades tagged ' + MISTAKE_TAGS.join(' / '), { tags: MISTAKE_TAGS, tradeIds: hit.map((t) => t.id) });
}

export function costOfMistakes(trades, notesByKey, dayMode = 'vest') {
    return tagCost(closedSorted(trades).filter((t) => !t.test), { notesByKey }, dayMode);
}

// [{tag, n, net, winRate, expectancy}] by net P&L; the array also carries .costOfMistakes.
// A trade carries the tags of its own note and of its Vest-day note.
export function tagStats(trades, notesByKey, dayMode = 'vest', opts = {}) {
    const ctx = { notesByKey };
    const list = closedSorted(trades).filter((t) => !t.test);
    const groups = new Map();
    for (const t of list) {
        for (const [k, label] of tagsOf(t, ctx, dayMode)) {
            let g = groups.get(k);
            if (!g) groups.set(k, g = { tag: label, list: [] });
            g.list.push(t);
        }
    }
    const rows = [...groups.values()].map((g) => {
        const net = sum(g.list, (t) => t.net);
        return { tag: g.tag, n: g.list.length, net, winRate: winRateOf(g.list, opts), expectancy: net / g.list.length };
    }).sort((a, b) => b.n - a.n || (a.tag < b.tag ? -1 : 1));
    rows.costOfMistakes = tagCost(list, ctx, dayMode);
    return rows;
}

// ---------- summary (popup and header) ----------

// today = the Vest day containing `now`; week = Mon..Sun around it; month = its calendar month.
export function summary(trades, payouts, now = Date.now(), mode = 'vest') {
    const today = dayKey(now, mode);
    const monday = addDays(today, -((dowOfKey(today) + 6) % 7));
    const sunday = addDays(monday, 6);
    const ym = monthKey(today);
    const t = { net: 0, n: 0 }, w = { net: 0, n: 0, days: new Set() }, m = { net: 0, n: 0, days: new Set() };
    for (const x of trades) {
        if (x.open || x.void || x.closeTs == null || x.test) continue;
        const k = dayKey(x.closeTs, mode);
        if (k === today) { t.net += x.net; t.n++; }
        if (k >= monday && k <= sunday) { w.net += x.net; w.n++; w.days.add(k); }
        if (monthKey(k) === ym) { m.net += x.net; m.n++; m.days.add(k); }
    }
    let paid = 0;
    for (const p of payouts) {
        if (p.status !== 'EXECUTED') continue;
        const k = payoutDayKey(p, 'executed');
        if (k && monthKey(k) === ym) paid += p.net;
    }
    return { today: t, week: { net: w.net, n: w.n, days: w.days.size }, month: { net: m.net, n: m.n, days: m.days.size, paid } };
}
