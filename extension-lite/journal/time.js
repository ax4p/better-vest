// Better Vest Calendar - time and number formatting (pure, no DOM, no chrome APIs).
// A "Vest day" ends at 20:00 New York time, when Vest resets the daily loss limit. Everything is
// computed with Intl in America/New_York so DST days come out as 23 or 25 hours.

export const ET = 'America/New_York';
export const MINUS = '−';
export const DAY_MODES = {
    vest: { label: 'Vest day · 20:00 ET', boundaryHour: 20 },
    cme: { label: 'CME day · 18:00 ET', boundaryHour: 18 },
    et: { label: 'ET midnight', boundaryHour: 0 },
    local: { label: 'Local midnight', boundaryHour: 0 }
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const etFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
});

export const pad2 = (n) => (n < 10 ? '0' : '') + n;
export const keyOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

export function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return { y, m, d };
}

// Wall-clock parts of a timestamp in New York.
export function etParts(ts) {
    const o = {};
    for (const p of etFmt.formatToParts(new Date(ts))) o[p.type] = p.value;
    return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second, dow: DOW_INDEX[o.weekday] };
}

export function addDays(key, n) {
    const { y, m, d } = parseKey(key);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function dowOfKey(key) {
    const { y, m, d } = parseKey(key);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function daysBetween(a, b) {
    const pa = parseKey(a), pb = parseKey(b);
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 864e5);
}

// UTC timestamp of a New York wall-clock time. Two passes settle the offset on DST days.
export function etWallToUtc(y, m, d, h = 0, mi = 0) {
    const target = Date.UTC(y, m - 1, d, h, mi);
    let ts = target + 5 * 3600e3;
    for (let i = 0; i < 3; i++) {
        const p = etParts(ts);
        const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
        const diff = seen - target;
        if (!diff) break;
        ts -= diff;
    }
    return ts;
}

export function etDateKey(ts) {
    const p = etParts(ts);
    return keyOf(p.y, p.m, p.d);
}

// The calendar day a timestamp belongs to. vest: >= 20:00 ET counts toward the next date.
export function dayKey(ts, mode = 'vest') {
    if (ts == null || !isFinite(ts)) return null;
    if (mode === 'local') {
        const t = new Date(ts);
        return keyOf(t.getFullYear(), t.getMonth() + 1, t.getDate());
    }
    const p = etParts(ts);
    const key = keyOf(p.y, p.m, p.d);
    const b = (DAY_MODES[mode] || DAY_MODES.vest).boundaryHour;
    return b && p.h >= b ? addDays(key, 1) : key;
}

// Start/end timestamps of a day key, and its length in hours (23 / 24 / 25 on DST days).
export function dayWindow(key, mode = 'vest') {
    const { y, m, d } = parseKey(key);
    let start, end;
    if (mode === 'local') {
        start = new Date(y, m - 1, d).getTime();
        end = new Date(y, m - 1, d + 1).getTime();
    } else {
        const b = (DAY_MODES[mode] || DAY_MODES.vest).boundaryHour;
        if (b) {
            const prev = parseKey(addDays(key, -1));
            start = etWallToUtc(prev.y, prev.m, prev.d, b);
            end = etWallToUtc(y, m, d, b);
        } else {
            const next = parseKey(addDays(key, 1));
            start = etWallToUtc(y, m, d, 0);
            end = etWallToUtc(next.y, next.m, next.d, 0);
        }
    }
    return { start, end, hours: Math.round((end - start) / 36e5) };
}

// Payouts are transfers, not trading: they sit on their plain ET calendar date (no 20:00 shift).
export function payoutDayKey(p, basis = 'executed') {
    const ts = basis === 'requested' ? p.createdAt : (p.status === 'EXECUTED' && p.executedAt ? p.executedAt : p.createdAt);
    return ts ? etDateKey(ts) : null;
}

// ms until the next 20:00 ET reset.
export function vestResetIn(now = Date.now()) {
    const p = etParts(now);
    let t = etWallToUtc(p.y, p.m, p.d, 20);
    if (now >= t) {
        const n = parseKey(addDays(keyOf(p.y, p.m, p.d), 1));
        t = etWallToUtc(n.y, n.m, n.d, 20);
    }
    return t - now;
}

export function isoWeek(key) {
    const { y, m, d } = parseKey(key);
    const t = new Date(Date.UTC(y, m - 1, d));
    const dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
    const week = Math.ceil(((t - yearStart) / 864e5 + 1) / 7);
    return { year: t.getUTCFullYear(), week, label: 'Wk ' + week };
}

// Weeks (Monday first) covering a month. Each day: { key, inMonth, dow } with dow 0 = Sunday.
export function monthGrid(y, m) {
    const first = keyOf(y, m, 1);
    const lead = (dowOfKey(first) + 6) % 7;
    let cur = addDays(first, -lead);
    const weeks = [];
    for (let w = 0; w < 6; w++) {
        const days = [];
        for (let i = 0; i < 7; i++) {
            const { m: mm } = parseKey(cur);
            days.push({ key: cur, inMonth: mm === m, dow: dowOfKey(cur) });
            cur = addDays(cur, 1);
        }
        weeks.push({ key: days[0].key, label: isoWeek(days[0].key).label, days });
        if (parseKey(cur).m !== m) break;
    }
    return weeks;
}

export const monthKey = (key) => key.slice(0, 7);
export function shiftMonth(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}`;
}

// ---------- number formatting (en-US) ----------

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const signOf = (v) => (v > 0 ? '+' : v < 0 ? MINUS : '');
const ok = (v) => v != null && isFinite(v);

// ctx 'cell': compact for calendar cells; anything else: always 2 decimals.
export function fmtUsd(v, { ctx = 'table', sign = true } = {}) {
    if (!ok(v)) return '—';
    const a = Math.abs(v);
    let body;
    if (ctx === 'cell') {
        if (a < 10) {
            const r = Math.round(a * 100) / 100;
            if (r === 0) return '$0';
            body = '$' + nf2.format(r);
        } else if (a < 9999.5) body = '$' + nf0.format(a);
        else if (a < 999950) body = '$' + (a / 1e3).toFixed(1) + 'k';
        else body = '$' + (a / 1e6).toFixed(1) + 'M';
    } else {
        const r = Math.round(a * 100) / 100;
        if (r === 0) return '$0.00';
        body = '$' + nf2.format(r);
    }
    const s = sign ? signOf(v) : v < 0 ? MINUS : '';
    return s + body;
}

// Big hero number split so the cents can be set smaller.
export function heroParts(v) {
    if (!ok(v)) return { sign: '', int: '—', cents: '' };
    const r = Math.round(Math.abs(v) * 100) / 100;
    const [i, c] = r.toFixed(2).split('.');
    return { sign: r === 0 ? '' : signOf(v), cur: '$', int: nf0.format(+i), cents: '.' + c };
}

// fraction in, percent out: 0.0124 -> "+1.24%"
export function fmtPct(f, { sign = true } = {}) {
    if (!ok(f)) return '—';
    const p = f * 100, a = Math.abs(p);
    const dp = a < 10 ? 2 : 1;
    const r = +a.toFixed(dp);
    if (r === 0) return '0%';
    return (sign ? signOf(p) : p < 0 ? MINUS : '') + r.toFixed(dp) + '%';
}

export function fmtRate(f) {
    return ok(f) ? Math.round(f * 100) + '%' : '—';
}

export function fmtPts(v, { dp = 2, unit = true, sign = true } = {}) {
    if (!ok(v)) return '—';
    const a = Math.abs(v);
    const s = (+a.toFixed(dp)).toString();
    const body = s.includes('.') ? s : s;
    const r = +a.toFixed(dp);
    return (sign && r !== 0 ? signOf(v) : !sign && v < 0 ? MINUS : '') + body + (unit ? ' pts' : '');
}

export function fmtR(v, { sign = true } = {}) {
    if (!ok(v)) return '—';
    const r = +Math.abs(v).toFixed(2);
    return (sign && r !== 0 ? signOf(v) : !sign && v < 0 ? MINUS : '') + r.toFixed(2) + 'R';
}

export function fmtNum(v, dp = 2) {
    if (!ok(v)) return '—';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(v).replace('-', MINUS);
}

export function fmtCount(n) {
    return ok(n) ? nf0.format(n) : '—';
}

// Price with the symbol's decimals and thousands separators.
export function fmtPrice(v, dp = 2) {
    if (!ok(v)) return '—';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(v);
}

export function fmtDur(ms) {
    if (!ok(ms) || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ' + pad2(m % 60) + 'm';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}

export function fmtTimeET(ts, { seconds = true, suffix = false } = {}) {
    if (!ok(ts)) return '—';
    const p = etParts(ts);
    return pad2(p.h) + ':' + pad2(p.mi) + (seconds ? ':' + pad2(p.s) : '') + (suffix ? ' ET' : '');
}

export function fmtTimeLocal(ts, { seconds = false } = {}) {
    if (!ok(ts)) return '—';
    const t = new Date(ts);
    return pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + (seconds ? ':' + pad2(t.getSeconds()) : '');
}

// style: 'short' Wed 14 Oct · 'long' Wed 14 Oct 2026 · 'dm' 14 Oct · 'month' October 2026 · 'iso' 2026-10-14
export function fmtDate(key, style = 'short') {
    if (!key) return '—';
    const { y, m, d } = parseKey(key);
    if (style === 'month') return MONTHS[m - 1] + ' ' + y;
    if (style === 'iso') return key;
    if (style === 'dm') return d + ' ' + MON3[m - 1];
    const w = DOW3[dowOfKey(key)];
    return style === 'long' ? `${w} ${d} ${MON3[m - 1]} ${y}` : `${w} ${d} ${MON3[m - 1]}`;
}

export function fmtMonth(ym, { short = false } = {}) {
    const [y, m] = ym.split('-').map(Number);
    return short ? MON3[m - 1] + ' \u2019' + String(y).slice(2) : MONTHS[m - 1] + ' ' + y; // 'Oct ’26' so it never reads as a day
}

export function fmtAgo(ts, now = Date.now()) {
    if (!ok(ts)) return 'never';
    const s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
}

export { MONTHS, MON3, DOW3 };
