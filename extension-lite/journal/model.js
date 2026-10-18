/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { pad2 } from './time.js';

export const STATUS_NAMES = {
    1: 'Created', 2: 'Active', 3: 'Goal passed', 4: 'Failed (max drawdown)', 5: 'Failed (daily loss)', 6: 'Claimed', 7: 'Blocked'
};

export const EXIT_LABELS = {
    user_requested: 'Self-requested',
    take_profit: 'Take Profit',
    stop_loss: 'Stop Loss',
    liquidation: 'Liquidation',
    corporate_action: 'Corporate Action',
    auto_deleverage: 'Auto Deleverage'
};

export const DEFAULT_TAGS = ['A+', 'Mistake', 'FOMO', 'Held winner', 'Early exit', 'Revenge', 'Rule break', 'test'];

export const NORMALIZER_VERSION = 5;

const BUILTIN_DISPLAY = { 'NDX-USD-PERP': 'NQ-PERP', 'SPX-USD-PERP': 'ES-PERP' };

export const BRACKET_WINDOW_MS = 120000;
const MIN_RISK_TICKS = 2;
const MIN_RISK_FRACTION = 0.0002;
const MAX_RISK_FRACTION = 0.10;


export function num(v) {
    if (v == null || v === '') return null; /* Property of Astral (@ax4p). Better Vest 9.2.5. No copying without written permission. bv-88e52998 */
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

export function tsMs(v) {
    if (v == null || v === '' || v === 0 || v === '0') return null;
    let n;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string') {
        const s = v.trim();
        n = /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : Date.parse(s);
    } else if (v instanceof Date) n = v.getTime();
    else return null;
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < 1e11) return Math.round(n * 1000);
    if (n < 1e14) return n;
    if (n < 1e17) return Math.round(n / 1e3);
    return Math.round(n / 1e6);
}

const lc = (v) => (v == null ? '' : String(v).toLowerCase());

function symbolEntry(symbolsMap, symbol) {
    if (!symbolsMap || symbol == null) return null;
    return (symbolsMap instanceof Map ? symbolsMap.get(symbol) : symbolsMap[symbol]) || null;
}

export function displaySymbol(symbol, symbolsMap) {
    const e = symbolEntry(symbolsMap, symbol);
    const d = e && (e.display || e.displaySymbol);
    return d || BUILTIN_DISPLAY[symbol] || symbol;
}


function shortSize(v) {
    if (v == null) return '';
    const trim = (x) => String(+x.toFixed(1));
    if (v >= 1e6) return trim(v / 1e6) + 'M';
    if (v >= 1e3) return trim(v / 1e3) + 'K';
    return String(v);
}

const PHASE_WORD = { eval: 'Eval', funded: 'Funded', instant: 'Instant', primary: 'Primary' };

function buildName(a) {
    if (a.kind === 'primary') return 'Primary';
    const size = shortSize(a.initialCapital);
    const plan = (a.planName || a.product || '').replace(/^\$?\d+(\.\d+)?\s*[kKmM]\b\s*/, '').trim();
    const phase = (PHASE_WORD[a.phase] || '') + (a.attemptIndex != null ? ' ' + pad2(a.attemptIndex + 1) : '');
    const tail = a.id ? String(a.id).slice(-4) : '';
    return [[size, plan].filter(Boolean).join(' '), phase, tail].filter(Boolean).join(' · ');
}

export function accountName(acc) {
    if (!acc) return '';
    return acc.name || buildName(acc);
}

export function normalizeCapitalAccount(row) {
    const type = num(row.account_type);
    const status = num(row.status);
    const product = row.plan_product_type == null ? null : String(row.plan_product_type);
    const attemptIndex = num(row.attempt_index);
    const finalizedAt = tsMs(row.finalized_at);
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.2.5. bv-1869e75c */ const blockedAt = tsMs(row.blocked_at);
    const a = {
        id: String(row.id),
        kind: 'capital',
        type,
        stage: num(row.stage),
        status,
        statusName: STATUS_NAMES[status] || (status == null ? '' : 'Status ' + status),
        isFinal: !!(finalizedAt || blockedAt || (status != null && status >= 4 && status <= 7)),
        phase: product === 'instant_funded' ? 'instant' : type === 3 ? 'funded' : 'eval',
        product,
        planId: row.plan_id == null ? null : String(row.plan_id),
        planName: row.plan_name == null ? null : String(row.plan_name),
        chainId: String(row.root_account_id || row.id),
        step: num(row.step),
        stepsTotal: num(row.steps_total),
        attemptIndex,
        origin: row.origin == null ? null : String(row.origin),
        initialCapital: num(row.initial_capital),
        targetEquity: num(row.target_equity),
        ddFloor: num(row.max_drawdown_limit),
        ddPct: num(row.max_drawdown_pct),
        maxDailyLossPct: num(row.max_daily_loss_pct),
        maxLeverage: num(row.max_leverage),
        profitSplit: num(row.max_profit_split_pct),
        createdAt: tsMs(row.created_at),
        activatedAt: tsMs(row.activated_at),
        finalizedAt,
        blockedAt, /* Property of Astral (@ax4p). Better Vest 9.2.5. No copying without written permission. bv-48ec0ed3 */
        updatedAt: tsMs(row.updated_at),
        dailyResetAt: tsMs(row.daily_reset_at),
        finalBalance: num(row.final_balance),
        finalEquity: num(row.final_equity),
        balance: null,
        balanceVersion: null,
        vestLabel: attemptIndex != null ? 'Account ' + pad2(attemptIndex + 1) : 'Legacy Account',
        name: '',
        hiddenInVest: status === 6
    };
    a.name = buildName(a);
    return a;
}

export function normalizePrimaryAccount(row) {
    const id = String(row.account_id != null ? row.account_id : row.id);
    const type = num(row.account_type);
    const balance = num(row.amount);
    const balanceVersion = num(row.balance_version);
    if (type != null && type !== 1) {
        return { id, kind: 'capital', balance, balanceVersion, balanceAt: tsMs(row.updated_at) };
    }
    return {
        id, kind: 'primary', type: 1, stage: null, status: null,
        statusName: row.active === false ? 'Inactive' : 'Active',
        isFinal: false, phase: 'primary', product: null, planId: null, planName: null, chainId: id,
        step: null, stepsTotal: null, attemptIndex: null, origin: null,
        initialCapital: null, targetEquity: null, ddFloor: null, ddPct: null, maxDailyLossPct: null,
        maxLeverage: null, profitSplit: null,
        createdAt: null, activatedAt: null, finalizedAt: null, blockedAt: null,
        updatedAt: tsMs(row.updated_at), dailyResetAt: null,
        finalBalance: null, finalEquity: null, balance, balanceVersion,
        vestLabel: 'Primary', name: 'Primary', hiddenInVest: false
    };
}

export function mergeAccount(prev, next) {
    if (!prev) return next;
    if (!next) return prev;
    let older = prev, newer = next;
    if (prev.updatedAt != null && next.updatedAt != null && next.updatedAt < prev.updatedAt) { older = next; newer = prev; }
    const out = { ...older };
    for (const k of Object.keys(newer)) if (newer[k] != null) out[k] = newer[k];
    out.name = buildName(out);
    return out;
}


const ENTRY_ROLES = new Set(['open', 'append']);
const EXIT_ROLES = new Set(['reduce', 'close']); /*! Property of Astral (@ax4p). Better Vest 9.2.5. No copying without written permission. bv-7b57391e */

export function normalizeFills(row) {
    const sideSign = lc(row.side).includes('short') || lc(row.side) === 'sell' ? -1 : 1;
    const out = [];
    for (const o of row.orders || []) {
        const qty = num(o.executed_quantity);
        if (!(qty > 0)) continue;
        let role = lc(o.position_order_type);
        if (!ENTRY_ROLES.has(role) && !EXIT_ROLES.has(role)) {
            const os = lc(o.side) === 'sell' ? -1 : 1;
            role = os === sideSign ? 'append' : 'reduce';
        }
        out.push({
            id: o.order_id == null ? null : String(o.order_id),
            ts: tsMs(o.execution_time) ?? tsMs(o.updated_at) ?? tsMs(o.created_at),
            side: lc(o.side),
            role, qty,
            px: num(o.execution_price) > 0 ? num(o.execution_price) : null,
            fee: num(o.fee) || 0,
            orderType: o.order_type || null,
            status: o.status || null,
            closeReason: o.close_reason || null
        });
    }
    out.forEach((f, i) => { f.i = i; });
    out.sort((a, b) => ((a.ts ?? 0) - (b.ts ?? 0)) || (ENTRY_ROLES.has(b.role) - ENTRY_ROLES.has(a.role)) || (a.i - b.i));
    out.forEach((f) => { delete f.i; });
    return out;
}

function summarizeFills(list) {
    const f = { n: list.length, entries: 0, exits: 0, scaleIns: 0, scaleOuts: 0, peakQty: null, avgEntry: null, avgExit: null, fee: null };
    if (!list.length) return f;
    let q = 0, peak = 0, eq = 0, ev = 0, xq = 0, xv = 0, fee = 0;
    for (const x of list) {
        fee += x.fee;
        if (ENTRY_ROLES.has(x.role)) {
            f.entries++;
            if (x.role === 'append') f.scaleIns++;
            q += x.qty;
            if (x.px != null) { eq += x.qty; ev += x.qty * x.px; }
        } else {
            f.exits++;
            if (x.role === 'reduce') f.scaleOuts++;
            q -= x.qty;
            if (x.px != null) { xq += x.qty; xv += x.qty * x.px; }
        } /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-750bd256 */
        if (q > peak) peak = q;
    }
    f.peakQty = peak;
    f.avgEntry = eq > 0 ? ev / eq : null;
    f.avgExit = xq > 0 ? xv / xq : null;
    f.fee = fee;
    return f;
}


function bracketEntries(...lists) {
    const m = new Map();
    let k = 0;
    for (const list of lists) {
        for (const e of list || []) {
            const key = e.id != null ? 'id:' + e.id : 'ix:' + (k++);
            const prev = m.get(key);
            if (!prev || (tsMs(e.updatedAt) ?? 0) >= (tsMs(prev.updatedAt) ?? 0)) m.set(key, e);
        }
    }
    return [...m.values()]
        .map((e) => ({ px: num(e.triggerPrice), at: tsMs(e.createdAt) }))
        .filter((e) => e.px != null);
}

function initialBracket(entries, openTs, entryPx, sign, kind) {
    if (!entries.length) return { px: null, flag: 'none' };
    const first = entries.reduce((a, b) => ((b.at ?? Infinity) < (a.at ?? Infinity) ? b : a));
    if (first.at == null || openTs == null || first.at - openTs > BRACKET_WINDOW_MS) return { px: null, flag: 'late' };
    if (entryPx == null) return { px: null, flag: 'wrong-side' };
    const below = first.px < entryPx, above = first.px > entryPx;
    const good = kind === 'sl' ? (sign > 0 ? below : above) : (sign > 0 ? above : below);
    return good ? { px: first.px, flag: null } : { px: null, flag: 'wrong-side' };
}


export function normalizePosition(row, symbolsMap) {
    const s = lc(row.side);
    const sign = s.includes('short') || s === 'sell' ? -1 : 1;
    const openTs = tsMs(row.openDate);
    const closeTs = tsMs(row.closeDate);
    const open = closeTs == null;
    const pos = (v) => (v != null && v > 0 ? v : null);
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.2.5. bv-f34fa135 */ const qty = pos(num(row.quantity));
    const openPx = pos(num(row.openPrice));
    const closePx = pos(num(row.closePrice));
    const gross = num(row.pnl) ?? 0;
    const fee = num(row.fee) ?? 0;
    const funding = num(row.funding) ?? 0;

    const fills = summarizeFills(normalizeFills(row));
    const entryPx = fills.avgEntry ?? openPx;
    const exitPx = open ? null : (fills.avgExit ?? closePx);
    const points = !open && entryPx != null && exitPx != null ? sign * (exitPx - entryPx) : null;

    const sl = initialBracket(bracketEntries(row.stopLossHistory, row.stopLosses), openTs, entryPx, sign, 'sl');
    const tp = initialBracket(bracketEntries(row.takeProfitHistory, row.takeProfits), openTs, entryPx, sign, 'tp');
    if (sl.px != null && entryPx != null) {
        const se = symbolEntry(symbolsMap, row.symbol);
        const tick = se && se.tick > 0 ? se.tick : 0;
        const min = Math.max(MIN_RISK_TICKS * tick, MIN_RISK_FRACTION * Math.abs(entryPx));
        const dist = Math.abs(entryPx - sl.px);
        if (dist < min) { sl.px = null; sl.flag = 'tiny'; }
        else if (dist > MAX_RISK_FRACTION * Math.abs(entryPx)) { sl.px = null; sl.flag = 'far'; }
    }
    const riskPts = sl.px != null && entryPx != null ? Math.abs(entryPx - sl.px) : null;
    const rewardPts = tp.px != null && entryPx != null ? Math.abs(tp.px - entryPx) : null;
    const size = fills.peakQty || qty;

    const exit = row.closeReason == null || row.closeReason === '' ? null : String(row.closeReason);

    return {
        id: String(row.positionId),
        accountId: String(row.accountId),
        symbol: row.symbol,
        display: displaySymbol(row.symbol, symbolsMap),
        side: sign > 0 ? 'long' : 'short',
        sign,
        open,
        qty, leverage: num(row.leverage), openPx, closePx, openTs, closeTs,
        gross, fee, funding,
        net: gross - fee + funding,
        fills,
        entryPx, exitPx, points,
        initialSL: sl.px, initialTP: tp.px, slFlag: sl.flag, tpFlag: tp.flag,
        riskPts,
        riskUsd: riskPts != null && size != null ? riskPts * size : null,
        rewardPts,
        plannedRR: riskPts > 0 && rewardPts != null ? rewardPts / riskPts : null,
        rMult: riskPts > 0 && points != null ? points / riskPts : null,
        heldMs: openTs != null && closeTs != null ? closeTs - openTs : null,
        exit,
        void: !open && fills.n === 0 && !qty && gross === 0 && fee === 0 && funding === 0,
        flags: { /*! Property of Astral (@ax4p). Better Vest 9.2.5. No copying without written permission. bv-f4bb9d24 */
            feeMatch: fills.n ? Math.abs(fee - fills.fee) <= 1e-6 : null,
            pnlMatch: points != null && qty != null ? Math.abs(points * qty - gross) <= Math.max(0.01, 1e-6 * Math.abs(gross)) : null
        },
        test: false
    };
}

export function exitLabel(exit) {
    if (!exit) return '—';
    const k = lc(exit);
    if (EXIT_LABELS[k]) return EXIT_LABELS[k];
    return k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}


export function normalizePayout(row) {
    const status = String(row.status || '').toUpperCase();
    return {
        id: String(row.request_id),
        accountId: row.account_id == null ? null : String(row.account_id),
        targetAccountId: row.target_account_id == null ? null : String(row.target_account_id),
        gross: num(row.requested_amount) ?? 0,
        net: num(row.trader_amount) ?? 0,
        platformCut: num(row.platform_amount) ?? 0,
        status,
        failureReason: row.failure_reason || null,
        createdAt: tsMs(row.created_at),
        updatedAt: tsMs(row.updated_at),
        executedAt: tsMs(row.executed_at),
        counted: status === 'EXECUTED'
    };
}

export function normalizeSymbol(row) {
    const symbol = row.symbol;
    return {
        symbol,
        display: row.displaySymbol || row.display || BUILTIN_DISPLAY[symbol] || symbol,
        name: row.displayName || row.name || null,
        priceDecimals: num(row.priceDecimals),
        sizeDecimals: num(row.sizeDecimals),
        tick: row.tick != null ? num(row.tick) : num(Array.isArray(row.tickSizes) ? row.tickSizes[0] : null),
        asset: row.asset || null
    }; /*! Better Vest (c) 2026 Astral. All rights reserved. bv-f59fa014 */
}

export const AUTO_SYNC_AWAY_MS = 120000;
export function autoSyncWhy(o) {
    if (o.dev) return 'fixture';
    if (!o.chrome) return 'no-extension';
    if (o.syncing) return 'syncing';
    if (o.why === 'back' && !(o.awayMs > AUTO_SYNC_AWAY_MS)) return 'brief';
    return '';
}
export function autoSyncFail(prev, next, auto) {
    return auto && next.state === 'offline' ? { state: prev.state, msg: prev.msg } : next;
}
