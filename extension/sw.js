// Better Vest by Astral - service worker (ES module, static imports only).
// 1. Keeps the latest page state per tab (for the popup and the toolbar badge).
// 2. Journal hub: receives the trade history that the Vest page streams over the 'journal' port,
//    validates and normalizes it, writes it to IndexedDB, runs the post-conditions, and serves
//    the popup summary, the sync command relay and the Calendar tab opener.
// 3. Updates (Standard, loaded unpacked): asks GitHub for the latest release every 6 hours; update.html does the rest.

import { openDb, getAll, get, putMany, putMeta, getMeta, listUserIds } from './journal/db.js';
import {
    normalizeCapitalAccount, normalizePrimaryAccount, mergeAccount, normalizePosition, normalizePayout, normalizeSymbol, NORMALIZER_VERSION
} from './journal/model.js';
import { filterTrades, reconcile, summary } from './journal/stats.js';
import { LATEST_URL, compareVersions, parseLatest } from './update/core.js';
import { cleanSnap } from './cert/share-model.js';

const stateKey = (tabId) => 'tab:' + tabId;

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== 'state' || !sender.tab) return;
    const st = msg.state || {};
    chrome.storage.session.set({ [stateKey(sender.tab.id)]: st }).catch(() => {});
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: st.feed ? updateBadge : '!' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: st.feed ? '#2563eb' : '#b91c1c' }).catch(() => {});
    chrome.action.setTitle({
        tabId: sender.tab.id,
        title: `Better Vest by Astral v${st.version || ''}` + (st.symbol ? ` · ${st.symbol}` : '') + (st.feed ? ' · tape live' : ' · tape reconnecting')
    }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove(stateKey(tabId)).catch(() => {});
});

// ---------- journal: validation ----------

const MAX_MSG_BYTES = 4 * 1024 * 1024;
const USER_RE = /^[\w.:-]{1,128}$/;
const OPS = new Set(['begin', 'symbols', 'accounts', 'positions', 'payouts', 'plans', 'progress', 'end', 'error', 'manifest?', 'resume']);
const ACCOUNT_SOURCES = new Set(['active', 'history', 'all', 'primary']);
const RUN_MODES = new Set(['auto', 'manual', 'full', 'delta']);
const SYNC_STATES = new Set(['full', 'delta', 'stamp', 'incomplete']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0 && v.length <= 256;
// ids become object keys and IndexedDB keys: never accept prototype names
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isId = (v) => isStr(v) && v.length <= 128 && !BAD_KEYS.has(v);
const numOrNull = (v) => {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? parseFloat(v) : NaN);
    return Number.isFinite(n) ? n : null;
};

class Reject extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function approxBytes(msg) {
    try { return JSON.stringify(msg).length; } catch (e) { return Infinity; }
}

// Shape checks only. Counts the page claims are never trusted: the rows themselves are what is stored.
export function validateMessage(msg) {
    if (!isObj(msg) || msg.v !== 1 || typeof msg.op !== 'string' || !OPS.has(msg.op)) throw new Reject('shape');
    if (msg.op === 'resume') {
        if (!Number.isInteger(msg.lastAck) || msg.lastAck < 0) throw new Reject('shape');
        return msg;
    }
    if (!Number.isInteger(msg.seq) || msg.seq < 0 || msg.seq > 1e9) throw new Reject('shape');
    if (typeof msg.userId !== 'string' || !USER_RE.test(msg.userId)) throw new Reject('user');
    if (approxBytes(msg) > MAX_MSG_BYTES) throw new Reject('size');
    switch (msg.op) {
        case 'begin':
            if (!isStr(msg.runId) || !RUN_MODES.has(msg.mode)) throw new Reject('shape');
            break;
        case 'symbols':
        case 'payouts':
        case 'plans':
            if (!Array.isArray(msg.rows) || msg.rows.some((r) => !isObj(r))) throw new Reject('shape');
            break;
        case 'accounts':
            if (!Array.isArray(msg.rows) || msg.rows.some((r) => !isObj(r)) || !ACCOUNT_SOURCES.has(msg.source)) throw new Reject('shape');
            for (const r of msg.rows) {
                const id = r.id != null ? String(r.id) : r.account_id != null ? String(r.account_id) : null;
                if (id != null && !isId(id)) throw new Reject('shape');
            }
            break;
        case 'positions':
            if (!isId(msg.accountId) || !Array.isArray(msg.rows)) throw new Reject('shape');
            // every row must belong to the account the page says it asked for
            for (const r of msg.rows) {
                if (!isObj(r) || !isId(r.positionId) || r.accountId !== msg.accountId) throw new Reject('account-mismatch');
            }
            break;
        case 'progress':
            if (!Number.isFinite(msg.done) || !Number.isFinite(msg.total)) throw new Reject('shape');
            break;
        case 'end':
            if (!isStr(msg.runId) || typeof msg.ok !== 'boolean' || !isObj(msg.stats)) throw new Reject('shape');
            break;
        case 'error':
            if (!isStr(msg.runId) || !isStr(msg.code)) throw new Reject('shape');
            break;
        default:
            break;
    }
    return msg;
}

// ---------- journal: one IDB connection per user ----------

const dbs = new Map(); // userId -> Promise<IDBDatabase>
const symbolMaps = new Map(); // userId -> Map(symbol -> Symbol)

function dbFor(userId) {
    let p = dbs.get(userId);
    if (!p) {
        p = openDb(userId).then(async (db) => {
            const drop = () => { if (dbs.get(userId) === p) dbs.delete(userId); };
            db.addEventListener('versionchange', drop);
            db.addEventListener('close', drop);
            await renormalizeIfNeeded(userId, db).catch(() => {});
            return db;
        });
        dbs.set(userId, p);
        p.catch(() => { if (dbs.get(userId) === p) dbs.delete(userId); });
    }
    return p;
}

// A handle that was closed by a versionchange or a browser-side close throws InvalidStateError.
async function withDb(userId, fn) {
    try {
        return await fn(await dbFor(userId));
    } catch (e) {
        if (e && e.name === 'InvalidStateError') {
            dbs.delete(userId);
            return fn(await dbFor(userId));
        }
        throw e;
    }
}

// Stored trades are derived fields; the raw API rows are kept. When the derivation rules change
// (NORMALIZER_VERSION), every trade is rebuilt from its raw row before anything reads the store.
async function renormalizeIfNeeded(userId, db) {
    if ((await getMeta(db, 'normalizerVersion')) === NORMALIZER_VERSION) return;
    const raws = await getAll(db, 'raw');
    if (raws.length) {
        const syms = new Map();
        for (const s of await getAll(db, 'symbols')) syms.set(s.symbol, s);
        const testIds = new Set(Array.isArray(await getMeta(db, 'testTradeIds')) ? await getMeta(db, 'testTradeIds') : []);
        const trades = [];
        for (const r of raws) {
            if (!r || !r.row) continue;
            try {
                const t = normalizePosition(r.row, syms);
                if (testIds.has(t.id)) t.test = true;
                trades.push(t);
            } catch (e) {}
        }
        for (let i = 0; i < trades.length; i += 500) await putMany(db, { trades: trades.slice(i, i + 500) });
    }
    await putMeta(db, 'normalizerVersion', NORMALIZER_VERSION);
    if (raws.length) broadcast({ type: 'journal-updated', userId, done: true, renormalized: raws.length });
}

async function symbolsMap(userId, db) {
    let m = symbolMaps.get(userId);
    if (!m) {
        m = new Map();
        for (const s of await getAll(db, 'symbols')) m.set(s.symbol, s);
        symbolMaps.set(userId, m);
    }
    return m;
}

// ---------- journal: broadcast to the Calendar page and popup ----------

const BROADCAST_MS = 250;
let lastBroadcast = 0;
let pendingBroadcast = null;
let broadcastTimer = null;

function emit(payload) {
    lastBroadcast = Date.now();
    chrome.runtime.sendMessage(payload).catch(() => {});
}

// At most 4 per second; progress frames coalesce, the newest one wins.
function broadcast(payload) {
    const wait = lastBroadcast + BROADCAST_MS - Date.now();
    if (wait <= 0 && !broadcastTimer) { emit(payload); return; }
    if (pendingBroadcast && pendingBroadcast.done && !payload.done) return;
    pendingBroadcast = payload;
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
        broadcastTimer = null;
        const p = pendingBroadcast;
        pendingBroadcast = null;
        if (p) emit(p);
    }, Math.max(0, wait));
}

// ---------- journal: message handling ----------

const runs = new Map(); // userId -> {runId, mode, startedAt, rejected: []}

async function writeAccounts(db, msg) {
    const prevAll = new Map((await getAll(db, 'accounts')).map((a) => [a.id, a]));
    const out = new Map();
    let dropped = 0;
    for (const row of msg.rows) {
        try {
            if (msg.source === 'primary') {
                if (row.account_id == null && row.id == null) { dropped++; continue; }
                const next = normalizePrimaryAccount(row);
                const prev = out.get(next.id) || prevAll.get(next.id);
                // a balance-only patch for a capital account we do not hold yet has nothing to attach to
                if (!prev && next.kind !== 'primary') { dropped++; continue; }
                out.set(next.id, mergeAccount(prev, next));
            } else {
                if (row.id == null) { dropped++; continue; }
                const next = normalizeCapitalAccount(row);
                out.set(next.id, mergeAccount(out.get(next.id) || prevAll.get(next.id), next));
            }
        } catch (e) { dropped++; }
    }
    await putMany(db, { accounts: [...out.values()] });
    return dropped;
}

async function writePositions(userId, db, msg) {
    const stored = await get(db, 'accounts', msg.accountId);
    if (!stored) throw new Reject('unknown-account');
    const syms = await symbolsMap(userId, db);
    const at = Date.now();
    const trades = [];
    const raw = [];
    for (const row of msg.rows) {
        const t = normalizePosition(row, syms);
        if (t.accountId !== msg.accountId) throw new Reject('account-mismatch');
        trades.push(t);
        raw.push({ id: t.id, accountId: msg.accountId, row, at });
    }
    // trade ids the harness (or the user) marked as test trades stay marked after a re-sync
    const testIds = await getMeta(db, 'testTradeIds');
    if (Array.isArray(testIds) && testIds.length) {
        const set = new Set(testIds);
        for (const t of trades) if (set.has(t.id)) t.test = true;
    }
    await putMany(db, { raw, trades });
}

async function writeSymbols(userId, db, msg) {
    const rows = msg.rows.filter((r) => isStr(r.symbol)).map((r) => normalizeSymbol(r));
    await putMany(db, { symbols: rows });
    await putMeta(db, 'symbolsAt', Date.now());
    const m = new Map();
    for (const s of await getAll(db, 'symbols')) m.set(s.symbol, s);
    symbolMaps.set(userId, m);
}

async function writePayouts(db, msg) {
    const rows = [];
    for (const r of msg.rows) {
        if (!isStr(r.request_id)) continue;
        rows.push(normalizePayout(r));
    }
    await putMany(db, { payouts: rows });
}

async function buildManifest(db) {
    const [trades, accounts, sync, symbolsAt, lastFullSync, lastSync, lastDiscovery] = await Promise.all([
        getAll(db, 'trades'), getAll(db, 'accounts'), getMeta(db, 'sync'),
        getMeta(db, 'symbolsAt'), getMeta(db, 'lastFullSync'), getMeta(db, 'lastSync'), getMeta(db, 'lastDiscovery')
    ]);
    const bySync = Object.assign(Object.create(null), isObj(sync) ? sync : {});
    const acc = Object.create(null);
    const entry = (id) => acc[id] || (acc[id] = { count: 0, ids: [], openIds: [] });
    for (const t of trades) {
        const e = entry(t.accountId);
        e.count++;
        e.ids.push(t.id);
        if (t.open) e.openIds.push(t.id);
    }
    for (const a of accounts) if (bySync[a.id]) entry(a.id);
    for (const id of Object.keys(acc)) {
        const s = bySync[id] || {};
        Object.assign(acc[id], {
            apiTotal: s.apiTotal == null ? null : s.apiTotal,
            rowUpdatedAt: s.rowUpdatedAt == null ? null : s.rowUpdatedAt,
            balanceVersion: s.balanceVersion == null ? null : s.balanceVersion,
            finalizedAt: s.finalizedAt == null ? null : s.finalizedAt,
            syncedAt: s.syncedAt == null ? null : s.syncedAt,
            incomplete: !!s.incomplete
        });
    }
    return { accounts: acc, symbolsAt: symbolsAt || null, lastFullSync: lastFullSync || null, lastSync: lastSync || null, lastDiscovery: lastDiscovery || null };
}

// Per-account bookkeeping from the page's end message. Only the sync bookkeeping uses these claims;
// stored rows are never touched by them.
function mergeSyncRecords(prev, stats, nowMs) {
    const out = Object.assign(Object.create(null), isObj(prev) ? prev : {});
    const accounts = isObj(stats.accounts) ? stats.accounts : {};
    for (const id of Object.keys(accounts)) {
        const s = accounts[id];
        if (!isObj(s) || !SYNC_STATES.has(s.state)) continue;
        const at = numOrNull(s.at);
        const rec = {
            apiTotal: numOrNull(s.total),
            syncedAt: at != null && at > 0 && at <= nowMs + 60000 ? at : nowMs,
            rowUpdatedAt: numOrNull(s.rowUpdatedAt),
            balanceVersion: s.bv == null ? null : (numOrNull(s.bv) != null ? numOrNull(s.bv) : String(s.bv).slice(0, 64)),
            finalizedAt: numOrNull(s.finalizedAt)
        };
        if (s.state === 'incomplete') rec.incomplete = true;
        out[id] = rec;
    }
    return out;
}

async function runPostconditions(db, run, msg) {
    const nowMs = Date.now();
    const sync = mergeSyncRecords(await getMeta(db, 'sync'), msg.stats, nowMs);
    await putMeta(db, 'sync', sync);
    const [accounts, trades, payouts] = await Promise.all([getAll(db, 'accounts'), getAll(db, 'trades'), getAll(db, 'payouts')]);
    const byAcc = new Map();
    for (const t of trades) {
        let e = byAcc.get(t.accountId);
        if (!e) byAcc.set(t.accountId, e = []);
        e.push(t);
    }
    const results = {};
    let countBad = 0;
    let reconBad = 0;
    let incomplete = 0;
    for (const a of accounts) {
        const mine = byAcc.get(a.id) || [];
        const open = mine.filter((t) => t.open).length;
        const closed = mine.length - open;
        const s = sync[a.id];
        const apiTotal = s && s.apiTotal != null ? s.apiTotal : null;
        const countOk = apiTotal == null ? null : closed + open === apiTotal;
        let rec = null;
        try { rec = reconcile(a, mine, payouts); } catch (e) { rec = { kind: 'not-reconcilable', ok: null, expected: null, actual: null, diff: null }; }
        if (countOk === false) countBad++;
        if (rec.ok === false) reconBad++;
        if (s && s.incomplete) incomplete++;
        results[a.id] = { closed, open, apiTotal, countOk, incomplete: !!(s && s.incomplete), reconcile: rec };
    }
    const pc = {
        at: nowMs,
        runId: run ? run.runId : msg.runId,
        accounts: results,
        summary: { accounts: accounts.length, countMismatch: countBad, reconcileMismatch: reconBad, incomplete },
        coverage: isObj(msg.stats.coverage) ? {
            bare: numOrNull(msg.stats.coverage.bare), extras: numOrNull(msg.stats.coverage.extras), unknown: !!msg.stats.coverage.unknown
        } : null,
        rejected: run ? run.rejected.slice(0, 20) : []
    };
    await putMeta(db, 'postconditions', pc);
    const stats = msg.stats;
    await putMeta(db, 'lastRun', {
        runId: msg.runId, mode: stats.mode, ok: msg.ok, at: nowMs, ms: numOrNull(stats.ms), pages: numOrNull(stats.pages),
        errors: Array.isArray(stats.errors) ? stats.errors.slice(0, 50).map((e) => ({ code: String(e && e.code || '').slice(0, 40) })) : []
    });
    // A run that reached its end after reading the account lists counts as a sync even if some accounts
    // failed (they carry their own state and are retried next time); otherwise one bad account would keep
    // every automatic refresh off. lastRun.ok tells the Calendar whether the run was partial.
    if (msg.ok || (run && run.accountsWritten)) {
        await putMeta(db, 'lastSync', nowMs);
        // a CLOSED-event delta only re-reads active accounts, so it does not count as a discovery
        if (stats.mode !== 'delta') await putMeta(db, 'lastDiscovery', nowMs);
        if (stats.mode === 'full' && msg.ok) await putMeta(db, 'lastFullSync', nowMs);
    }
    return pc;
}

async function handleMessage(port, raw, bind) {
    let msg;
    try {
        msg = validateMessage(raw);
        if (msg.op !== 'resume') {
            if (!bind.userId) bind.userId = msg.userId;
            else if (bind.userId !== msg.userId) throw new Reject('user');
        }
    } catch (e) {
        const seq = raw && Number.isInteger(raw.seq) ? raw.seq : null;
        if (seq != null) port.postMessage({ op: 'ack', seq, ok: false, code: e.code || 'shape' });
        return;
    }
    if (msg.op === 'resume') return; // the page resends its unacked messages; every write is idempotent
    const userId = msg.userId;
    let ok = true;
    let code = null;
    try {
        if (msg.op === 'manifest?') {
            const manifest = await withDb(userId, (db) => buildManifest(db));
            port.postMessage(Object.assign({ op: 'manifest', seq: msg.seq }, manifest));
            return;
        }
        switch (msg.op) {
            case 'begin':
                runs.set(userId, { runId: msg.runId, mode: msg.mode, startedAt: Date.now(), rejected: [] });
                await withDb(userId, (db) => putMeta(db, 'runStartedAt', Date.now()));
                chrome.storage.local.set({ journalLastUser: userId }).catch(() => {});
                broadcast({ type: 'journal-updated', userId, progress: { done: 0, total: 0, phase: 'start' } });
                break;
            case 'symbols':
                await withDb(userId, (db) => writeSymbols(userId, db, msg));
                break;
            case 'accounts': {
                await withDb(userId, (db) => writeAccounts(db, msg));
                const run = runs.get(userId);
                if (run) run.accountsWritten = true;
                break;
            }
            case 'positions':
                await withDb(userId, (db) => writePositions(userId, db, msg));
                break;
            case 'payouts':
                await withDb(userId, (db) => writePayouts(db, msg));
                break;
            case 'plans':
                await withDb(userId, (db) => putMeta(db, 'plans', { at: Date.now(), rows: msg.rows }));
                break;
            case 'progress':
                broadcast({ type: 'journal-updated', userId, progress: { done: msg.done, total: msg.total, phase: isStr(msg.phase) ? msg.phase : '' } });
                break;
            case 'error': {
                const note = { runId: msg.runId, code: msg.code, msg: String(msg.msg || '').slice(0, 300), at: Date.now() };
                await withDb(userId, (db) => putMeta(db, 'lastError', note));
                broadcast({ type: 'journal-updated', userId, error: { code: msg.code } });
                break;
            }
            case 'end': {
                const run = runs.get(userId) || null;
                const pc = await withDb(userId, (db) => runPostconditions(db, run, msg));
                runs.delete(userId);
                broadcast({ type: 'journal-updated', userId, done: true, ok: msg.ok, mismatches: pc.summary.countMismatch + pc.summary.reconcileMismatch });
                break;
            }
            default:
                break;
        }
    } catch (e) {
        ok = false;
        code = (e && e.code) || (e && e.name) || 'write';
        const run = runs.get(userId);
        if (run && run.rejected.length < 50) run.rejected.push({ op: msg.op, code, accountId: msg.accountId || null });
        withDb(userId, (db) => putMeta(db, 'lastError', { runId: runs.get(userId) ? runs.get(userId).runId : null, code, op: msg.op, at: Date.now() })).catch(() => {});
    }
    port.postMessage(ok ? { op: 'ack', seq: msg.seq } : { op: 'ack', seq: msg.seq, ok: false, code });
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'journal') return;
    // only our own content script on the Vest site opens this port
    const s = port.sender;
    if (!s || s.id !== chrome.runtime.id || !s.tab || !String(s.url || '').startsWith('https://next.vestmarkets.com/')) {
        port.disconnect();
        return;
    }
    let chain = Promise.resolve();
    const bind = { userId: null };
    port.onMessage.addListener((raw) => {
        chain = chain.then(() => handleMessage(port, raw, bind)).catch(() => {});
    });
});

// ---------- journal: popup, Calendar and command relay ----------

async function lastUserId() {
    const r = await chrome.storage.local.get('journalLastUser').catch(() => null);
    return r && typeof r.journalLastUser === 'string' && USER_RE.test(r.journalLastUser) ? r.journalLastUser : null;
}

async function journalSummary() {
    const userId = await lastUserId();
    if (!userId) return { userId: null };
    const ids = await listUserIds().catch(() => []);
    if (ids.length && !ids.includes(userId)) return { userId: null };
    return withDb(userId, async (db) => {
        const [trades, payouts, accounts, mode, lastSync, notes, testIds] = await Promise.all([
            getAll(db, 'trades'), getAll(db, 'payouts'), getAll(db, 'accounts'), getMeta(db, 'dayMode'), getMeta(db, 'lastSync'),
            getAll(db, 'notes'), getMeta(db, 'testTradeIds')
        ]);
        const dayMode = typeof mode === 'string' ? mode : 'vest';
        const accountsById = new Map(accounts.map((a) => [a.id, a]));
        const notesByKey = new Map(notes.map((n) => [n.key, n]));
        const ctx = { accountsById, notesByKey, testTradeIds: Array.isArray(testIds) ? testIds : [] };
        const closed = filterTrades(trades, { scope: 'all', excludeTest: true, mode: dayMode }, ctx);
        const s = summary(closed, payouts, Date.now(), dayMode);
        return { userId, today: s.today, week: s.week, month: s.month, lastSync: lastSync || null };
    });
}

const VEST_URLS = ['https://next.vestmarkets.com/*'];

async function journalSync(mode) {
    const op = mode === 'full' ? 'fullSync' : mode === 'abort' ? 'abort' : 'sync';
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: VEST_URLS }); } catch (e) { tabs = []; }
    tabs = tabs.filter((t) => !t.discarded && t.id != null);
    tabs.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
    for (const tab of tabs) {
        const reply = await Promise.race([
            chrome.tabs.sendMessage(tab.id, { type: 'journal-cmd', op }).catch(() => null),
            new Promise((resolve) => setTimeout(() => resolve(null), 3000))
        ]);
        if (reply && reply.ok) return { ok: true, reason: 'sent' };
    }
    return { ok: false, reason: 'no-vest-tab' };
}

// Opens (or focuses) one of the extension's own pages; from a Vest tab it opens right next to that tab.
async function openExtPage(file, sender) {
    const base = chrome.runtime.getURL(file);
    let ctxs = [];
    try { ctxs = await chrome.runtime.getContexts({ contextTypes: ['TAB'] }); } catch (e) { ctxs = []; }
    const hit = ctxs.find((c) => typeof c.documentUrl === 'string' && c.documentUrl.startsWith(base) && c.tabId >= 0);
    if (hit) {
        await chrome.tabs.update(hit.tabId, { active: true });
        if (hit.windowId >= 0) await chrome.windows.update(hit.windowId, { focused: true }).catch(() => {});
        return { ok: true, reason: 'focused' };
    }
    // opened from a Vest tab: put the Calendar right next to it, in the same window
    const opts = { url: base };
    if (sender && sender.tab && sender.tab.windowId >= 0) { opts.windowId = sender.tab.windowId; opts.index = sender.tab.index + 1; }
    await chrome.tabs.create(opts);
    return { ok: true, reason: 'created' };
}

const journalOpen = (sender) => openExtPage('journal.html', sender);
const certOpen = (sender) => openExtPage('certificate.html', sender);
// the share poster: the trade page's snapshot of today's P&L, cleaned, kept for this browser session only, then the page (an open one
// re-reads it: it listens to the change). It lives in cert/ because the 8.0.5 self-updater only installs files in folders it knows.
async function shareOpen(snap, sender) {
    const clean = cleanSnap(snap);
    if (!clean) return { ok: false, reason: 'bad' };
    await chrome.storage.session.set({ shareSnap: clean });
    return openExtPage('cert/share.html', sender);
}

const EXT_BASE = chrome.runtime.getURL('');
const fromExtensionPage = (sender) => !!sender && sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(EXT_BASE);
const fromVestScript = (sender) => !!sender && sender.id === chrome.runtime.id && !!sender.tab && String(sender.url || '').startsWith('https://next.vestmarkets.com/');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isObj(msg) || typeof msg.type !== 'string') return;
    if (msg.type === 'journal-summary' && fromExtensionPage(sender)) {
        journalSummary().then(sendResponse, () => sendResponse({ userId: null }));
        return true;
    }
    if (msg.type === 'journal-sync' && fromExtensionPage(sender)) {
        journalSync(msg.mode).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
    if (msg.type === 'journal-open' && (fromExtensionPage(sender) || fromVestScript(sender))) {
        journalOpen(sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
    // the total-payouts certificate page (certificate.html); same rules as journal-open
    if (msg.type === 'cert-open' && (fromExtensionPage(sender) || fromVestScript(sender))) {
        certOpen(sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
    // the dock's Share button: only Vest's own trade page sends the snapshot
    if (msg.type === 'share-open' && fromVestScript(sender)) {
        shareOpen(msg.snap, sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
    // updates: the dock and the popup ask; only extension pages may check, switch or open
    if (msg.type === 'update-state' && (fromExtensionPage(sender) || fromVestScript(sender))) {
        updateState().then(sendResponse, () => sendResponse(null));
        return true;
    }
    if (msg.type === 'update-check' && fromExtensionPage(sender)) {
        checkUpdate(true).then(sendResponse, () => sendResponse(null));
        return true;
    }
    if (msg.type === 'update-auto' && fromExtensionPage(sender) && typeof msg.on === 'boolean') {
        chrome.storage.local.set({ bvUpdateCheck: msg.on }).then(scheduleUpdates).then(updateState).then(sendResponse, () => sendResponse(null));
        return true;
    }
    if (msg.type === 'update-open' && (fromExtensionPage(sender) || fromVestScript(sender))) {
        openExtPage('update.html', sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
});

// ---------- updates ----------
// Only the Standard build loaded unpacked from the GitHub zip updates from GitHub: the WICKED build is rebuilt from
// its own source, and the private Copier build must never take a public Standard release (it would lose the copy
// trader), so the line below stays a comment in both. Web Store copies are updated by Chrome. The check is a plain GET
// to GitHub's API with nothing from the user in it; nothing is downloaded until Update is clicked.
let UPDATER = false;
UPDATER = true;
const UPDATE_ALARM = 'bv-update-check';
const UPDATE_EVERY_MIN = 30;
let updateBadge = '';

async function updaterSupported() {
    if (!UPDATER || 'update_url' in chrome.runtime.getManifest()) return false;
    try {
        if (chrome.management && chrome.management.getSelf) return (await chrome.management.getSelf()).installType === 'development';
    } catch (e) {}
    return true;
}

async function updateState() {
    const supported = await updaterSupported();
    const st = await chrome.storage.local.get(['bvUpdate', 'bvUpdateCheck', 'bvUpdateAt']);
    const version = chrome.runtime.getManifest().version;
    const available = supported && st.bvUpdate && compareVersions(st.bvUpdate.version, version) > 0 ? st.bvUpdate : null;
    return { supported, on: st.bvUpdateCheck !== false, available, checkedAt: st.bvUpdateAt || null, version };
}

async function paintUpdateBadge() {
    const s = await updateState();
    updateBadge = s.available ? 'NEW' : '';
    await chrome.action.setBadgeText({ text: updateBadge }).catch(() => {});
    if (updateBadge) await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' }).catch(() => {});
}

async function checkUpdate(force) {
    if (!(await updaterSupported())) return updateState();
    const { bvUpdateCheck } = await chrome.storage.local.get('bvUpdateCheck');
    if (bvUpdateCheck === false && !force) return updateState();
    try {
        const r = await fetch(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        if (r.ok) {
            const rel = parseLatest(await r.json());
            await chrome.storage.local.set({ bvUpdateAt: Date.now() });
            if (rel && compareVersions(rel.version, chrome.runtime.getManifest().version) > 0) await chrome.storage.local.set({ bvUpdate: rel });
            else await chrome.storage.local.remove('bvUpdate');
        }
    } catch (e) {}
    await paintUpdateBadge();
    return updateState();
}

async function scheduleUpdates() {
    const on = (await updaterSupported()) && (await chrome.storage.local.get('bvUpdateCheck')).bvUpdateCheck !== false;
    if (!on) {
        await chrome.alarms.clear(UPDATE_ALARM).catch(() => {});
        return;
    }
    // copies from before 7.5.1 made this alarm with a 6-hour period: replace it when the period differs
    const a = await chrome.alarms.get(UPDATE_ALARM);
    if (!a || a.periodInMinutes !== UPDATE_EVERY_MIN) chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: UPDATE_EVERY_MIN });
}

// After update.html rewrote the folder and restarted us: reload the Vest tabs (their page script is the old one
// until then) and show the done page. The flag is only honoured by the version it names.
let afterUpdateRan = false;
async function afterSelfUpdate() {
    if (afterUpdateRan) return;
    afterUpdateRan = true;
    const { bvUpdated } = await chrome.storage.local.get('bvUpdated');
    if (!bvUpdated) return;
    const v = chrome.runtime.getManifest().version;
    if (bvUpdated.to !== v) {
        // Running again and still the old version: the new files went into a copy Chrome doesn't run (an identical one
        // in another folder), or the page closed before the restart. Say so once. A worker that starts before reloadAt
        // is the old one waking up early (the restart is a timer set for reloadAt, never sooner).
        const t = Date.now();
        if (bvUpdated.from === v && t >= (bvUpdated.reloadAt || bvUpdated.at || 0) && t - (bvUpdated.at || 0) < 10 * 60 * 1000) {
            await chrome.storage.local.remove('bvUpdated');
            await chrome.tabs.create({ url: chrome.runtime.getURL('update.html#elsewhere') }).catch(() => {});
        }
        return;
    }
    await chrome.storage.local.remove(['bvUpdated', 'bvUpdate']);
    await paintUpdateBadge();
    if (bvUpdated.reloadTabs) {
        let tabs = [];
        try { tabs = await chrome.tabs.query({ url: VEST_URLS }); } catch (e) { tabs = []; }
        for (const tab of tabs) chrome.tabs.reload(tab.id).catch(() => {});
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL('update.html#done') }).catch(() => {});
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === UPDATE_ALARM) checkUpdate(false); });
chrome.runtime.onStartup.addListener(() => { scheduleUpdates(); checkUpdate(false); });
chrome.runtime.onInstalled.addListener(() => { scheduleUpdates(); afterSelfUpdate(); });
paintUpdateBadge().catch(() => {});
scheduleUpdates().catch(() => {});
afterSelfUpdate().catch(() => {});

// Whenever the worker starts, bring the last user's stored trades up to the current derivation rules.
lastUserId().then((uid) => { if (uid) dbFor(uid).catch(() => {}); }).catch(() => {});

// ---------- copy trader: follower tabs and the copy log (WICKED and Standard) ----------
// The Tabs engine: the leader's page asks for one background tab per switched-on follower account
// (/trade/<market>?bvCopy=<accountId>), grouped as "Copy" and collapsed. Each follower tab pins its own account and announces
// 'follower-ready'. Orders never pass through here as requests of ours: 'tabs-exec' only hands the leader's actions to the
// follower pages, whose own code calls Vest's own functions. The worker sleeps, so all state lives in chrome.storage.session
// and every handler reloads it. Only this block uses the tabGroups permission.

const COPY_KEY = 'copy:tabs';
const COPY_WATCH_ALARM = 'bv-copy-watch';
const COPY_MAX_FOLLOWERS = 10;
const COPY_MAX_ACTIONS = 256;
const COPY_SNAP_BYTES = 200 * 1024; // a follower tab's snapshot of its own account (positions, orders, events) is small; anything bigger is not one
const COPY_MARKET_RE = /^[A-Za-z0-9._-]{1,40}$/;
const COPY_ID_RE = /^[\w.:-]{1,128}$/;
// An exec message gets BASE plus PER for each of its actions (the page's own limit is 5 s per action). The leader tab's own limit for the batch is
// CE_T.actionMs per action plus CE_T.slackMs (20-engines.js): it must stay ABOVE this one, so that the worker, not the leader, ends a hung tab
// and every other follower's result still reaches the leader. The tab drops an exec that is older than this when it finally runs it.
const COPY_EXEC_BASE_MS = 3000;
const COPY_EXEC_PER_MS = 5000;
const COPY_EXEC_MAX_MS = 60000;
const COPY_PING_MS = 8000;        // a tab's main thread can be busy for seconds (eleven Vest tabs on one machine): that is not a crash
const COPY_ALIVE_MS = 10000;      // a tab that pushed a snapshot or answered an exec this lately is alive: the watch does not ping it
const COPY_RELOAD_GRACE_MS = 30000; // a tab that became ready this lately is not reloaded by the watch
const COPY_STAGGER_MS = 250;      // tabs are opened this far apart: nine tabs refreshing a login at one instant could log each other out
const COPY_REOPEN_MAX = 5;
const COPY_REOPEN_WINDOW_MS = 2 * 60 * 1000;
const COPY_ORIGIN = 'https://next.vestmarkets.com/';
const COPY_LOG_KEY = 'copy:log';
const COPY_LOG_MAX = 3000; // 8.0.5: a 10-follower order writes about 20 to 50 lines; 1000 held only about 20 orders
const COPY_LOG_BYTES = 2 * 1024 * 1024; // 8.0.5: 3000 lines, and trouble lines carry their debug trail (code + state); storage.local allows 10 MB

const copyBlank = () => ({ on: false, market: null, leaderTabId: null, windowId: null, groupId: null, followers: {}, specs: {} });
let copyState = null;
let copyLoading = null;
let copyChain = Promise.resolve();
let copySeq = 0;
const copyAlive = new Map();     // tabId -> when the tab last pushed a snapshot, answered an exec or announced itself (memory only: a restart pings once)
const copyInflight = new Map();  // tabId -> exec messages on their way to the tab: a busy tab is never taken for a dead one

function copyLoad() {
    if (copyState) return Promise.resolve(copyState);
    if (!copyLoading) {
        copyLoading = chrome.storage.session.get(COPY_KEY).then((r) => {
            const v = r && r[COPY_KEY];
            copyState = isObj(v) ? Object.assign(copyBlank(), v) : copyBlank();
            if (!isObj(copyState.followers)) copyState.followers = {};
            return copyState;
        }, () => (copyState = copyBlank()));
    }
    return copyLoading;
}
const copySave = () => chrome.storage.session.set({ [COPY_KEY]: copyState }).catch(() => {});
// state changes run one at a time; reads (tabs-exec, tabs-status) do not wait for them
function copyLock(fn) {
    const run = copyChain.then(fn);
    copyChain = run.then(() => {}, () => {});
    return run;
}
function copyTimeout(p, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
}
const copySleep = (ms) => new Promise((r) => setTimeout(r, ms));
const copyErr = (e) => String((e && e.message) || e || 'error').slice(0, 200);
// ids become object keys: own keys only, so a name like "toString" is never mistaken for a follower
const copyFollower = (st, id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(st.followers, id) ? st.followers[id] : null);
const copyUrl = (market, accountId) => `${COPY_ORIGIN}trade/${encodeURIComponent(market)}?bvCopy=${encodeURIComponent(accountId)}`;
const copyIdOf = (st, tabId) => Object.keys(st.followers).find((k) => st.followers[k].tabId === tabId);
const copyTabAlive = (tabId) => (tabId == null ? Promise.resolve(false) : chrome.tabs.get(tabId).then(() => true, () => false));

function copyNotifyLeader(st, payload) {
    if (st.leaderTabId == null) return;
    chrome.tabs.sendMessage(st.leaderTabId, Object.assign({ type: 'copy' }, payload)).catch(() => {});
}


// Chrome frees a hidden tab that has not been used for a while (memory saver) unless it is told not to; the flag is set when a tab is created, and
// set again whenever the worker hears from it or looks at it (it costs nothing, and a tab that was replaced, restored or discarded and reloaded
// keeps it only because Chrome says so).
const copyKeep = (tabId) => { if (tabId != null) chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {}); };

// A tab that did not receive an exec (no receiver: it was discarded, crashed or is on an error page) is reloaded at once, not at the next 30 s watch.
// A tab that is merely loading is left alone, and one tab is reloaded at most every 10 s. The leader has already been told (copyUnready).
async function copyRecover(st, id, tabId) {
    const f = copyFollower(st, id);
    if (!f || f.tabId !== tabId || Date.now() - (f.reloadAt || 0) < 10000) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || (!tab.discarded && tab.status !== 'complete')) return;
    f.reloadAt = Date.now();
    chrome.tabs.reload(tabId).catch(() => {});
}

// A follower tab that cannot take actions now. The leader is told at once (its engine then refuses that follower's actions, which is not an
// attempt): until now only a closed tab was reported, so the leader kept sending, got 'follower-not-ready' (counted as an attempt) and paused the
// follower after two tries with a text that hid the cause. `why` is for the log.
function copyUnready(st, id, why) {
    const f = copyFollower(st, id);
    if (!f) return;
    f.ready = false;
    f.readyAt = 0;
    copySave();
    copyNotifyLeader(st, { op: 'follower-lost', accountId: id, why });
}

async function copyArmWatch(on) {
    if (on) {
        const a = await chrome.alarms.get(COPY_WATCH_ALARM);
        if (!a) chrome.alarms.create(COPY_WATCH_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
    } else {
        await chrome.alarms.clear(COPY_WATCH_ALARM).catch(() => {});
    }
}

// Creates a background tab per account (staggered, in parallel), then groups them together: "Copy", blue, collapsed.
async function copyCreateTabs(st, accountIds) {
    const open = async (id, i) => {
        if (i) await copySleep(i * COPY_STAGGER_MS);
        const opts = { url: copyUrl(st.market, id), active: false };
        if (st.windowId != null && st.windowId >= 0) opts.windowId = st.windowId;
        try {
            return await chrome.tabs.create(opts);
        } catch (e) {
            // the window is gone: fall back to wherever the leader is now
            const lead = await chrome.tabs.get(st.leaderTabId).catch(() => null);
            if (!lead) throw e;
            st.windowId = lead.windowId;
            opts.windowId = lead.windowId;
            return chrome.tabs.create(opts);
        }
    };
    const tabs = await Promise.all(accountIds.map((id, i) => open(id, i).catch(() => null)));
    const made = [];
    accountIds.forEach((id, i) => {
        const f = copyFollower(st, id);
        if (!f) return;
        f.ready = false;
        f.readyAt = 0;
        f.tabId = tabs[i] ? tabs[i].id : null;
        if (tabs[i]) made.push(tabs[i]);
    });
    // a discarded tab would stop answering: keep Chrome from freeing these
    for (const t of made) chrome.tabs.update(t.id, { autoDiscardable: false }).catch(() => {});
    if (!made.length) return;
    const winId = made[0].windowId;
    let gid = st.groupId;
    if (gid != null) {
        const g = await chrome.tabGroups.get(gid).catch(() => null);
        if (!g || g.windowId !== winId) gid = null;
    }
    try {
        gid = await chrome.tabs.group(gid != null ? { groupId: gid, tabIds: made.map((t) => t.id) } : { tabIds: made.map((t) => t.id), createProperties: { windowId: winId } });
        st.groupId = gid;
        await chrome.tabGroups.update(gid, { title: 'Copy', color: 'blue', collapsed: true });
    } catch (e) {
        /* the tabs work ungrouped too */
    }
}

async function copyShutdown(st) {
    const ids = Object.keys(st.followers).map((k) => st.followers[k].tabId).filter((t) => t != null);
    st.on = false;
    st.followers = {};
    st.groupId = null;
    st.market = null;
    st.leaderTabId = null;
    await copySave();
    await copyArmWatch(false);
    // state is cleared first, so the removals below are not mistaken for crashes
    if (ids.length) await chrome.tabs.remove(ids).catch(() => {});
}

// The size and price decimals of the markets the copier manages, by Vest's API spelling: the leader tab sends them (a follower tab has no GET
// bridge to learn them from) and they go to the follower tabs with their ready answer and with every exec message.
function copySpecsOf(v) {
    const out = {};
    if (!isObj(v)) return out;
    for (const k of Object.keys(v).slice(0, 64)) {
        const s = v[k];
        if (!COPY_MARKET_RE.test(k) || !isObj(s)) continue;
        const sizeDec = Number(s.sizeDec), priceDec = Number(s.priceDec), tick = Number(s.tick);
        if (!Number.isInteger(sizeDec) || sizeDec < 0 || sizeDec > 18 || !Number.isInteger(priceDec) || priceDec < 0 || priceDec > 18) continue;
        out[k] = { sizeDec, priceDec, tick: Number.isFinite(tick) && tick > 0 ? tick : null };
    }
    return out;
}

function copyValidOpen(msg) {
    if (typeof msg.market !== 'string' || !COPY_MARKET_RE.test(msg.market)) return null;
    if (!Array.isArray(msg.followers) || msg.followers.length > COPY_MAX_FOLLOWERS) return null;
    const out = [];
    const seen = new Set();
    for (const f of msg.followers) {
        if (!isObj(f) || !isId(f.accountId) || !COPY_ID_RE.test(f.accountId) || seen.has(f.accountId)) return null;
        seen.add(f.accountId);
        out.push({ accountId: f.accountId, label: typeof f.label === 'string' ? f.label.slice(0, 64) : '' });
    }
    return { market: msg.market, followers: out, specs: copySpecsOf(msg.specs) };
}

const copyIsFollowerPage = (st, sender) => !!sender.tab && copyIdOf(st, sender.tab.id) !== undefined;

function copyOpen(sender, msg) {
    return copyLock(async () => {
        const st = await copyLoad();
        const req = copyValidOpen(msg);
        if (!req) return { ok: false, error: 'shape' };
        // a follower tab is never a leader
        if (copyIsFollowerPage(st, sender) || /[?&]bvCopy=/.test(String(sender.url || ''))) return { ok: false, error: 'follower' };
        const leader = sender.tab;
        const wanted = new Map(req.followers.map((f) => [f.accountId, f]));
        // followers that are no longer wanted
        const drop = [];
        for (const id of Object.keys(st.followers)) {
            if (wanted.has(id)) continue;
            if (st.followers[id].tabId != null) drop.push(st.followers[id].tabId);
            delete st.followers[id];
        }
        // adopt the asking tab as the leader; the followers stay in the window they have unless none is left alive
        let anyAlive = false;
        for (const id of Object.keys(st.followers)) if (await copyTabAlive(st.followers[id].tabId)) anyAlive = true;
        st.leaderTabId = leader.id;
        if (!st.on || !anyAlive || st.windowId == null) st.windowId = leader.windowId;
        const marketChanged = st.market !== req.market;
        st.market = req.market;
        st.specs = Object.assign(isObj(st.specs) ? st.specs : {}, req.specs);
        st.on = true;
        const create = [];
        for (const [id, f] of wanted) {
            let cur = copyFollower(st, id);
            if (!cur) cur = st.followers[id] = { label: f.label, tabId: null, ready: false, readyAt: 0, reopens: [], failed: false };
            cur.label = f.label;
            cur.failed = false;
            if (await copyTabAlive(cur.tabId)) {
                if (marketChanged) {
                    cur.ready = false;
                    chrome.tabs.update(cur.tabId, { url: copyUrl(st.market, id) }).catch(() => {});
                }
            } else {
                create.push(id);
            }
        }
        if (drop.length) chrome.tabs.remove(drop).catch(() => {});
        if (create.length) await copyCreateTabs(st, create);
        await copySave();
        await copyArmWatch(true);
        return copyStatusOf(st);
    });
}

function copyClose(sender) {
    return copyLock(async () => {
        const st = await copyLoad();
        if (st.leaderTabId != null && sender.tab && sender.tab.id !== st.leaderTabId) return { ok: false, error: 'not-leader' };
        await copyShutdown(st);
        return { ok: true };
    });
}

function copyStatusOf(st) {
    return {
        ok: true,
        on: st.on,
        market: st.market,
        leaderTabId: st.leaderTabId,
        windowId: st.windowId,
        groupId: st.groupId,
        followers: Object.keys(st.followers).map((id) => {
            const f = st.followers[id];
            return { accountId: id, label: f.label, tabId: f.tabId, ready: !!f.ready, failed: !!f.failed, reopens: (f.reopens || []).length };
        })
    };
}

// Hands each action to the tab of the follower it names, all tabs at once, and returns every result with its timings.
// Nothing waits for a tab that is not ready: that action fails fast and the reconciler fixes it later.
async function copyExec(sender, msg) {
    const st = await copyLoad();
    if (!st.on) return { ok: false, error: 'off' };
    if (!sender.tab || sender.tab.id !== st.leaderTabId) return { ok: false, error: 'not-leader' };
    const actions = msg.actions;
    if (!Array.isArray(actions) || !actions.length || actions.length > COPY_MAX_ACTIONS) return { ok: false, error: 'shape' };
    const groups = new Map();
    for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        if (!isObj(a) || typeof a.accountId !== 'string') return { ok: false, error: 'shape' };
        if (!groups.has(a.accountId)) groups.set(a.accountId, []);
        groups.get(a.accountId).push(i);
    }
    const bid = typeof msg.bid === 'string' && COPY_ID_RE.test(msg.bid) ? msg.bid : null; // the leader's name for this batch: each tab's result is relayed under it
    const specs = copySpecsOf(msg.specs);
    if (Object.keys(specs).length) st.specs = Object.assign(isObj(st.specs) ? st.specs : {}, specs); // kept in memory, saved with the next save
    const startedAt = Date.now();
    const t0 = performance.now();
    const results = new Array(actions.length);
    const followers = {};
    const snaps = {}; // each follower tab's own account as it saw it after its actions (the leader trusts it over its own reads)
    const fail = (idxs, error) => idxs.forEach((i) => { results[i] = { action: actions[i], ok: false, ms: 0, error }; });
    await Promise.all([...groups].map(async ([id, idxs]) => {
        const f = copyFollower(st, id);
        if (!f) return fail(idxs, 'unknown-follower');
        if (f.tabId == null || !f.ready || f.failed) { copyNotifyLeader(st, { op: 'follower-lost', accountId: id, why: 'not-ready' }); return fail(idxs, 'follower-not-ready'); }
        const sent = performance.now();
        const tabId = f.tabId;
        copyInflight.set(tabId, (copyInflight.get(tabId) || 0) + 1);
        const limitMs = Math.min(COPY_EXEC_MAX_MS, COPY_EXEC_BASE_MS + COPY_EXEC_PER_MS * idxs.length);
        try {
            const resp = await copyTimeout(chrome.tabs.sendMessage(f.tabId, {
                type: 'copy', op: 'exec', rid: 'x' + (++copySeq) + '-' + startedAt.toString(36), sentAt: Date.now(), limitMs, actions: idxs.map((i) => actions[i]), specs
            }), limitMs);
            const back = performance.now();
            const arr = resp && Array.isArray(resp.results) ? resp.results : null;
            idxs.forEach((i, n) => {
                const r = arr && isObj(arr[n]) ? arr[n] : { ok: false, error: (resp && typeof resp.error === 'string' && resp.error) || 'bad-reply' };
                results[i] = Object.assign({ action: actions[i] }, r);
            });
            followers[id] = { sendMs: Math.round((sent - t0) * 10) / 10, rtMs: Math.round((back - sent) * 10) / 10 };
            if (resp && copySnapOk(resp.snap)) snaps[id] = resp.snap;
            copyAlive.set(tabId, Date.now());
            // this follower's answer goes to the leader now, not with the whole batch: the leader may give up on the batch (a slow tab, a worker that
            // went away) and would lose the acknowledgements of every tab that did answer
            if (bid && arr) copyNotifyLeader(st, { op: 'follower-result', bid, accountId: id, results: arr, snap: resp && copySnapOk(resp.snap) ? resp.snap : undefined });
        } catch (e) {
            // no receiver means the tab is reloading or gone: stop sending until it announces itself again, and say so to the leader
            if (!/timeout/.test(copyErr(e))) { copyUnready(st, id, 'send-failed'); copyRecover(st, id, tabId).catch(() => {}); }
            fail(idxs, copyErr(e));
            followers[id] = { sendMs: Math.round((sent - t0) * 10) / 10, rtMs: Math.round((performance.now() - sent) * 10) / 10, error: copyErr(e) };
        } finally {
            const n = (copyInflight.get(tabId) || 1) - 1;
            if (n > 0) copyInflight.set(tabId, n); else copyInflight.delete(tabId);
        }
    }));
    return { ok: true, results, snaps, timings: { startedAt, totalMs: Math.round((performance.now() - t0) * 10) / 10, followers } };
}

function copyReady(sender, msg) {
    return copyLock(async () => {
        const st = await copyLoad();
        const f = copyFollower(st, msg.accountId);
        // only the tab this follower was opened in may announce it
        if (!st.on || !f || !sender.tab || f.tabId !== sender.tab.id) return { ok: false, error: 'unknown-tab' };
        f.ready = true;
        f.readyAt = Date.now();
        f.failed = false;
        copyAlive.set(sender.tab.id, Date.now());
        copyKeep(sender.tab.id);
        await copySave();
        copyNotifyLeader(st, { op: 'follower-ready', accountId: msg.accountId, label: f.label, tabId: f.tabId });
        return { ok: true, specs: isObj(st.specs) ? st.specs : {} };
    });
}

function copySnapOk(snap) {
    if (!isObj(snap) || !Array.isArray(snap.positions)) return false;
    try { return JSON.stringify(snap).length <= COPY_SNAP_BYTES; } catch (e) { return false; }
}

// A follower tab's own account, passed on to the leader tab as it came. Four a second from each of ten tabs: nothing is saved and nothing
// waits for the lock (the saved state is read from memory, and only the tab this follower was opened in may speak for it).
async function copySnap(sender, msg) {
    const st = await copyLoad();
    const f = st.on ? copyFollower(st, msg.accountId) : null;
    if (!f || !sender.tab || f.tabId !== sender.tab.id) return { ok: false, error: 'unknown-tab' };
    if (!copySnapOk(msg.snap)) return { ok: false, error: 'shape' };
    copyAlive.set(sender.tab.id, Date.now());
    copyNotifyLeader(st, { op: 'follower-snap', accountId: msg.accountId, snap: msg.snap });
    return { ok: true };
}

// A follower tab that closed or crashed gets opened again (at most COPY_REOPEN_MAX times in two minutes).
async function copyReopen(st, accountId) {
    const f = copyFollower(st, accountId);
    if (!st.on || !f || f.failed) return;
    if (await copyTabAlive(f.tabId)) return;
    const t = Date.now();
    f.reopens = (f.reopens || []).filter((x) => t - x < COPY_REOPEN_WINDOW_MS);
    f.tabId = null;
    copyUnready(st, accountId, 'reopen');
    if (f.reopens.length >= COPY_REOPEN_MAX) {
        f.failed = true;
        await copySave();
        copyNotifyLeader(st, { op: 'follower-failed', accountId, reason: 'reopen-limit' });
        return;
    }
    f.reopens.push(t);
    await copyCreateTabs(st, [accountId]);
    await copySave();
}

// Every 30 s: the tabs match the state, a tab that is gone is opened again, a discarded one is reloaded, a silent one is pinged. The lock is held
// only for the look at the tabs and for the decision, never across the pings (ten pings in turn held it for up to 30 s, and the follower tabs'
// own 'follower-ready' needs it). A tab is alive when it pushed a snapshot or answered an exec in the last COPY_ALIVE_MS: only the silent ones are
// pinged, all at once, and a tab is reloaded only after two missed pings (so 16 s of a busy main thread is forgiven), never with an exec on its way.
async function copyWatch() {
    const plan = await copyLock(async () => {
        const st = await copyLoad();
        if (!st.on) { await copyArmWatch(false); return null; }
        if (!(await copyTabAlive(st.leaderTabId))) { await copyShutdown(st); return null; }
        const ping = [];
        const announce = [];
        for (const id of Object.keys(st.followers)) {
            const f = st.followers[id];
            if (f.failed) continue;
            const tab = f.tabId == null ? null : await chrome.tabs.get(f.tabId).catch(() => null);
            if (!tab) { await copyReopen(st, id); continue; }
            if (tab.autoDiscardable !== false) copyKeep(tab.id);
            if (tab.discarded) { copyUnready(st, id, 'discarded'); chrome.tabs.reload(tab.id).catch(() => {}); continue; }
            if (tab.status !== 'complete' || copyInflight.has(tab.id)) continue;
            const heard = Date.now() - (copyAlive.get(tab.id) || 0) < COPY_ALIVE_MS;
            if (heard) { if (!f.ready) announce.push(tab.id); continue; }
            ping.push({ id, tabId: tab.id, ready: !!f.ready });
        }
        await copySave();
        return { announce, ping };
    });
    if (!plan) return;
    const quiet = [];
    await Promise.all([
        ...plan.announce.map((tabId) => chrome.tabs.sendMessage(tabId, { type: 'copy', op: 'announce' }).catch(() => {})),
        ...plan.ping.map(async (p) => {
            // the bridge answers a ping without the page: no answer twice in a row on a finished tab means a crashed or error page
            for (let k = 0; k < 2; k++) {
                try {
                    await copyTimeout(chrome.tabs.sendMessage(p.tabId, { type: 'copy', op: 'ping' }), COPY_PING_MS);
                    copyAlive.set(p.tabId, Date.now());
                    if (!p.ready) chrome.tabs.sendMessage(p.tabId, { type: 'copy', op: 'announce' }).catch(() => {});
                    return;
                } catch (e) {
                }
            }
            quiet.push(p);
        })
    ]);
    if (!quiet.length) return;
    await copyLock(async () => {
        const st = await copyLoad();
        if (!st.on) return;
        for (const p of quiet) {
            const f = copyFollower(st, p.id);
            // judged again: it may have spoken, been replaced or been given an exec while the pings were out
            if (!f || f.tabId !== p.tabId || copyInflight.has(p.tabId) || Date.now() - (copyAlive.get(p.tabId) || 0) < COPY_ALIVE_MS) continue;
            if (f.ready && Date.now() - (f.readyAt || 0) < COPY_RELOAD_GRACE_MS) continue;
            copyUnready(st, p.id, 'ping');
            chrome.tabs.reload(p.tabId).catch(() => {});
        }
        await copySave();
    });
}

// Follower tabs this worker has no record of (the extension was reloaded or updated, the browser restored the tabs): nobody drives
// them, so they are closed. Runs when the worker starts, after the saved state is back.
function copySweep() {
    return copyLock(async () => {
        const st = await copyLoad();
        let tabs = [];
        try { tabs = await chrome.tabs.query({ url: COPY_ORIGIN + '*' }); } catch (e) { return; }
        const known = new Set(Object.keys(st.followers).map((k) => st.followers[k].tabId));
        const stray = tabs.filter((t) => /[?&]bvCopy=/.test(String(t.url || '')) && !known.has(t.id)).map((t) => t.id);
        if (stray.length) await chrome.tabs.remove(stray).catch(() => {});
    });
}

// The copy trader's log (what it sent): the last 500 entries survive a reload of the page.
// Entries are plain data the page already scrubbed of anything token-like; only the shape and size are checked here.
function copyLogSave(msg) {
    if (!Array.isArray(msg.entries)) return Promise.resolve({ ok: false, error: 'shape' });
    let out = msg.entries.slice(-COPY_LOG_MAX).filter((e) => isObj(e) && Number.isFinite(e.t) && typeof e.type === 'string');
    if (JSON.stringify(out).length > COPY_LOG_BYTES) out = out.slice(-Math.floor(out.length / 2));
    return chrome.storage.local.set({ [COPY_LOG_KEY]: out }).then(() => ({ ok: true }));
}
function copyLogLoad() {
    return chrome.storage.local.get(COPY_LOG_KEY).then((r) => {
        const v = r && r[COPY_LOG_KEY];
        return { ok: true, entries: Array.isArray(v) ? v.slice(-COPY_LOG_MAX) : [] };
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isObj(msg) || msg.type !== 'copy' || typeof msg.op !== 'string') return;
    const answer = (p) => { p.then(sendResponse, (e) => sendResponse({ ok: false, error: copyErr(e) })); return true; };
    const vest = fromVestScript(sender);
    switch (msg.op) {
        case 'tabs-open': return vest ? answer(copyOpen(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'tabs-close': return vest || fromExtensionPage(sender) ? answer(copyClose(sender)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'tabs-exec': return vest ? answer(copyExec(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'tabs-status': return vest || fromExtensionPage(sender) ? answer(copyLoad().then(copyStatusOf)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'log-save': return vest ? answer(copyLogSave(msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'log-load': return vest ? answer(copyLogLoad()) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'follower-ready': return vest && isId(msg.accountId) ? answer(copyReady(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'follower-snap': return vest && isId(msg.accountId) ? answer(copySnap(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        default: return;
    }
});

chrome.tabs.onRemoved.addListener((tabId, info) => {
    copyLock(async () => {
        const st = await copyLoad();
        if (!st.on) return;
        if (tabId === st.leaderTabId) { await copyShutdown(st); return; }
        const id = copyIdOf(st, tabId);
        if (id === undefined) return;
        const f = st.followers[id];
        f.tabId = null;
        f.ready = false;
        await copySave();
        // a closing window takes the leader with it, and that removal shuts everything down
        if (info && info.isWindowClosing) return;
        copyNotifyLeader(st, { op: 'follower-lost', accountId: id });
        // quick path; if the worker sleeps first, the watch alarm reopens it
        setTimeout(() => copyLock(async () => { await copyReopen(await copyLoad(), id); }).catch(() => {}), 800);
    }).catch(() => {});
});

// A follower tab that starts loading cannot take actions until its page pins the account and announces itself again. The leader tab
// loading (a reload) ends copying: a reload never resumes it, so the follower tabs have no one to serve.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'loading') return;
    copyLock(async () => {
        const st = await copyLoad();
        if (!st.on) return;
        if (tabId === st.leaderTabId) { await copyShutdown(st); return; }
        const id = copyIdOf(st, tabId);
        if (id === undefined || !st.followers[id].ready) return;
        copyUnready(st, id, 'loading');
        await copySave();
    }).catch(() => {});
}); // no filter argument: Chrome's tabs.onUpdated takes none (a filter throws and the whole worker fails to register)

chrome.alarms.onAlarm.addListener((a) => { if (a.name === COPY_WATCH_ALARM) copyWatch().catch(() => {}); });
copySweep().catch(() => {});
