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
// its own source (the line below stays a comment there), and Web Store copies are updated by Chrome. The check is a
// plain GET to GitHub's API with nothing from the user in it; nothing is downloaded until Update is clicked.
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
