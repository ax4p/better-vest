// Better Vest P&L card, Payout (9.0): a card for the payouts themselves. The owner: "add todays payout card to the pnl page and also make it
// support even lifetime payouts". Today: what Vest paid you this Vest day (it ends at 8 pm New York); Lifetime: everything Vest has paid you.
// Pure: no DOM, no chrome. The payouts are the Calendar's own synced records (journal/model.js normalizePayout), and only Vest's EXECUTED
// ones count: the money received (trader_amount, the record's `net`). PROCESSING, REFUNDED and FAILED never reach a card.
// (Not 8.2's removed "Payouts" summary list: this is the payout itself.)

import { dayKey, addDays, parseKey, etWallToUtc } from '../journal/time.js';

export const PAY_KINDS = ['today', 'lifetime'];
const r2 = (v) => Math.round(v * 100) / 100;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// when the money arrived: Vest's executed_at; a record without one counts at its last update, then at its request
export const paidAt = (p) => (p && (p.executedAt || p.updatedAt || p.createdAt)) || null;

// The payouts that are money received, each once, oldest first
export function receivedPayouts(list) {
    const seen = new Set();
    const out = [];
    for (const p of Array.isArray(list) ? list : []) {
        if (!p || typeof p !== 'object' || p.status !== 'EXECUTED' || !Number.isFinite(p.net) || !(paidAt(p) > 0)) continue;
        const id = String(p.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(p);
    }
    return out.sort((a, b) => paidAt(a) - paidAt(b) || (String(a.id) < String(b.id) ? -1 : 1));
}

// What the Payout card shows. o = { kind: 'today' | 'lifetime', today: Vest's day 'YYYY-MM-DD' (default: now's), names: Map account id -> name }.
// Today with nothing paid today is the latest day something was (latest: true), so the evening after a payout still has its card.
// { empty: true } when nothing was ever received.
export function payoutModel(payouts, o) {
    const opt = o || {};
    const kind = opt.kind === 'lifetime' ? 'lifetime' : 'today';
    const done = receivedPayouts(payouts);
    if (!done.length) return { kind, empty: true };
    const names = opt.names instanceof Map ? opt.names : new Map();
    const nameOf = (id) => (id != null && names.get(String(id))) || (id != null ? 'Account ' + String(id).slice(-4) : 'Account');
    const item = (p) => ({ id: String(p.id), accountId: p.accountId == null ? '' : String(p.accountId), name: nameOf(p.accountId), net: r2(p.net),
        gross: Number.isFinite(p.gross) ? r2(p.gross) : null, at: paidAt(p), day: dayKey(paidAt(p), 'vest') });
    const accountsIn = (list) => new Set(list.map((p) => (p.accountId == null ? '' : String(p.accountId)))).size;
    const total = r2(done.reduce((s, p) => s + p.net, 0));
    // the biggest; on a tie the first one paid
    const big = done.reduce((a, p) => (p.net > a.net ? p : a), done[0]);
    const life = { total, count: done.length, accounts: accountsIn(done), first: item(done[0]), last: item(done[done.length - 1]), biggest: item(big) };
    if (kind === 'lifetime') {
        return Object.assign({ kind, empty: false, day: life.last.day, items: done.slice().reverse().map(item) }, life);
    }
    const today = KEY_RE.test(String(opt.today || '')) ? opt.today : dayKey(Date.now(), 'vest');
    let list = done.filter((p) => dayKey(paidAt(p), 'vest') === today);
    const latest = !list.length;
    const day = latest ? life.last.day : today;
    if (latest) list = done.filter((p) => dayKey(paidAt(p), 'vest') === day);
    return {
        kind, empty: false, day, today, latest, total: r2(list.reduce((s, p) => s + p.net, 0)), count: list.length, accounts: accountsIn(list),
        items: list.slice().reverse().map(item),
        // this day's last payout is your nth
        nth: done.indexOf(list[list.length - 1]) + 1,
        lifetime: { total: life.total, count: life.count }
    };
}

// 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st...
export function ordinal(n) {
    const v = Math.abs(Math.round(n)), t = v % 100;
    return v + (t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[v % 10] || 'th');
}

// ---------- sample payouts: the copier demo, and a computer whose Calendar has none yet (the card says Sample) ----------

function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
// names whose first letters differ, so the masked list ("100K***") still tells them apart
export const SAMPLE_PAY_ACCOUNTS = [['sample-pay-a', '100K Funded · 1'], ['sample-pay-b', '50K Funded · 2'], ['sample-pay-c', '150K Funded · 3']];
export const samplePayNames = () => new Map(SAMPLE_PAY_ACCOUNTS);
// About a dozen payouts over the half year up to `today` (Vest's day), the last one paid on it at 2:32 pm New York. Same day, same payouts.
export function samplePayouts(today) {
    const t = KEY_RE.test(String(today || '')) ? today : dayKey(Date.now(), 'vest');
    const rnd = seeded('payouts|' + t);
    const out = [];
    let k = addDays(t, -180);
    for (let i = 0; k < t && out.length < 11; i++) {
        const [acc] = SAMPLE_PAY_ACCOUNTS[Math.floor(rnd() * SAMPLE_PAY_ACCOUNTS.length)];
        const net = r2(1200 + rnd() * 4300);
        const { y, m, d } = parseKey(k);
        const at = etWallToUtc(y, m, d, 10 + Math.floor(rnd() * 7), Math.floor(rnd() * 59));
        out.push(samplePay(i, acc, net, at));
        k = addDays(k, 12 + Math.floor(rnd() * 9));
    }
    // today's: always there, so the Today card has one
    const { y, m, d } = parseKey(t);
    out.push(samplePay(out.length, SAMPLE_PAY_ACCOUNTS[0][0], 4823.5, etWallToUtc(y, m, d, 14, 32)));
    return out;
}
function samplePay(i, acc, net, at) {
    return { id: 'sample-pay-' + i, accountId: acc, targetAccountId: 'sample-primary', gross: r2(net / 0.8), net, platformCut: r2(net / 0.8 - net),
        status: 'EXECUTED', failureReason: null, createdAt: at - 3 * 3600e3, updatedAt: at, executedAt: at, counted: true, sample: true };
}

// the day a payout is shown under on the card's date chip, written short: "3 Mar 2026"
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayShort(key) {
    if (!KEY_RE.test(String(key || ''))) return '';
    const { y, m, d } = parseKey(key);
    return d + ' ' + MON[m - 1] + ' ' + y;
}
