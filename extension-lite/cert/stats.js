// Better Vest certificate - payout statistics (pure: no DOM, no chrome APIs).
// Money rules are the Calendar's own: journal/stats.js payoutStats() counts EXECUTED payouts only and sums the
// trader's net amount, so the certificate total equals the "Net to you" tile of the Payouts tab by construction.
// A payout sits on its plain ET calendar day (journal/time.js payoutDayKey), like in the Calendar.

import { payoutStats, MILESTONES } from '../journal/stats.js';
import { payoutDayKey, addDays, daysBetween } from '../journal/time.js';

const payTs = (p) => (p.status === 'EXECUTED' && p.executedAt ? p.executedAt : p.createdAt);
const cents = (v) => Math.round(v * 100);

// payouts: normalized payout records (model.js normalizePayout shape). Returns null when nothing was paid out.
export function certStats(payouts) {
    const list = Array.isArray(payouts) ? payouts : [];
    const ps = payoutStats(list);
    if (!ps.count) return null;
    const done = list
        .filter((p) => p.status === 'EXECUTED')
        .sort((a, b) => ((payTs(a) ?? 0) - (payTs(b) ?? 0)) || (a.id < b.id ? -1 : 1));

    const accountIds = new Set();
    for (const p of done) if (p.accountId != null && p.accountId !== '') accountIds.add(String(p.accountId));

    // largest single net payout, how many payouts hit that exact amount, and the day of the first one
    const largest = ps.largest;
    const hits = done.filter((p) => cents(p.net) === cents(largest));
    const largestKey = payoutDayKey(hits[0], 'executed');

    const dayNet = new Map();
    for (const p of done) {
        const k = payoutDayKey(p, 'executed');
        if (!k) continue;
        dayNet.set(k, (dayNet.get(k) || 0) + p.net);
    }
    const keys = [...dayNet.keys()].sort();
    const firstKey = keys[0] || null;
    const lastKey = keys[keys.length - 1] || null;
    const daily = [];
    if (firstKey) for (let k = firstKey; k <= lastKey; k = addDays(k, 1)) daily.push({ key: k, net: dayNet.get(k) || 0 });

    const milestones = ps.milestones.map((m) => ({
        amount: m.amount,
        reachedAt: m.reachedAt || null,
        reachedKey: m.reachedAt ? payoutDayKey({ status: 'EXECUTED', executedAt: m.reachedAt, createdAt: m.reachedAt }, 'executed') : null
    }));
    const reachedList = milestones.filter((m) => m.reachedAt);
    const reached = reachedList.length ? reachedList[reachedList.length - 1] : null;
    const next = milestones.find((m) => !m.reachedAt) || null;

    return {
        total: ps.lifetimeNet,
        gross: ps.lifetimeGross,
        count: ps.count,
        avg: ps.avg,
        accounts: accountIds.size,
        largest,
        largestCount: hits.length,
        largestKey,
        firstTs: payTs(done[0]),
        lastTs: payTs(done[done.length - 1]),
        firstKey,
        lastKey,
        days: firstKey ? daysBetween(firstKey, lastKey) + 1 : 0,
        daily,
        milestones,
        reached,
        next
    };
}

// The bar strip: one bar per calendar day from the first to the latest payout day. A long history is folded
// into equal runs of days (sum per run) so the strip never exceeds maxBars; a short one is padded with empty
// days to minBars so a single payout still draws as a normal bar. Returns the bars and the index of a day.
export function barSeries(S, maxBars = 45, minBars = 7) {
    const days = S.daily;
    const step = Math.max(1, Math.ceil(days.length / maxBars));
    const bars = [];
    for (let i = 0; i < days.length; i += step) {
        const chunk = days.slice(i, i + step);
        bars.push({ from: chunk[0].key, to: chunk[chunk.length - 1].key, net: chunk.reduce((s, d) => s + d.net, 0) });
    }
    const pad = Math.max(0, minBars - bars.length);
    const lead = Math.floor(pad / 2);
    const out = [];
    for (let i = 0; i < lead; i++) out.push({ from: null, to: null, net: 0 });
    out.push(...bars);
    for (let i = 0; i < pad - lead; i++) out.push({ from: null, to: null, net: 0 });
    const indexOf = (key) => (key ? out.findIndex((b) => b.from && key >= b.from && key <= b.to) : -1);
    return { bars: out, step, indexOf };
}

export { MILESTONES };
