/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { openDb, getAll, get, putMany, putMeta, getMeta, listUserIds } from './journal/db.js';
import {
    normalizeCapitalAccount, normalizePrimaryAccount, mergeAccount, normalizePosition, normalizePayout, normalizeSymbol, NORMALIZER_VERSION
} from './journal/model.js';
import { filterTrades, reconcile, summary } from './journal/stats.js';
import { LATEST_URL, compareVersions, parseLatest, whatsNew } from './update/core.js';
import { remoteStart, remotePageState } from './update/remote.js';
import { cleanSnap } from './cert/share-model.js';
import { tapeWrite } from './cert/tape-db.js';
import { VC_IDS } from './cert/listen-cmd.js';
import { countStart } from './update/count.js';

const stateKey = (tabId) => 'tab:' + tabId;

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== 'state' || !sender.tab) return;
    const st = msg.state || {};
    chrome.storage.session.set({ [stateKey(sender.tab.id)]: Object.assign({}, st, { seenAt: Date.now() }) }).catch(() => {});
    remotePageState(st);
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


const MAX_MSG_BYTES = 4 * 1024 * 1024;
/*! Property of Astral (@ax4p). Better Vest 9.2.5. No copying without written permission. bv-98158ea4 */ const USER_RE = /^[\w.:-]{1,128}$/;
const OPS = new Set(['begin', 'symbols', 'accounts', 'positions', 'payouts', 'plans', 'progress', 'end', 'error', 'manifest?', 'resume']);
const ACCOUNT_SOURCES = new Set(['active', 'history', 'all', 'primary']);
const RUN_MODES = new Set(['auto', 'manual', 'full', 'delta']);
const SYNC_STATES = new Set(['full', 'delta', 'stamp', 'incomplete']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0 && v.length <= 256;
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
            break; /* Property of Astral (@ax4p). Better Vest 9.2.5. No copying without written permission. bv-a223b391 */
        case 'accounts':
            if (!Array.isArray(msg.rows) || msg.rows.some((r) => !isObj(r)) || !ACCOUNT_SOURCES.has(msg.source)) throw new Reject('shape');
            for (const r of msg.rows) {
                const id = r.id != null ? String(r.id) : r.account_id != null ? String(r.account_id) : null;
                if (id != null && !isId(id)) throw new Reject('shape');
            }
            break;
        case 'positions':
            if (!isId(msg.accountId) || !Array.isArray(msg.rows)) throw new Reject('shape');
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


const dbs = new Map();
const symbolMaps = new Map();

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

async function withDb(userId, fn) {
    /* Copyright Astral 2026. From Better Vest 9.2.5 (standard), ref bv-514b8fe8. Not licensed for reuse. */ try {
        return await fn(await dbFor(userId));
    } catch (e) {
        if (e && e.name === 'InvalidStateError') {
            dbs.delete(userId);
            return fn(await dbFor(userId));
        }
        throw e;
    }
}

async function renormalizeIfNeeded(userId, db) {
    if ((await getMeta(db, 'normalizerVersion')) === NORMALIZER_VERSION) return;
    const raws = await getAll(db, 'raw'); /* Copyright (c) 2026 Astral. Better Vest 9.2.5 is licensed to its users only to run it, never to copy it. bv-dfe95c78 */
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


const BROADCAST_MS = 250;
let lastBroadcast = 0;
let pendingBroadcast = null;
let broadcastTimer = null;

function emit(payload) {
    lastBroadcast = Date.now();
    chrome.runtime.sendMessage(payload).catch(() => {});
}

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


const runs = new Map();

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
                if (!prev && next.kind !== 'primary') { dropped++; continue; }
                out.set(next.id, mergeAccount(prev, next));
            } else {
                if (row.id == null) { dropped++; continue; }
                const next = normalizeCapitalAccount(row);
                /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-2f103a3a */ out.set(next.id, mergeAccount(out.get(next.id) || prevAll.get(next.id), next));
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
    /*! Property of Astral (@ax4p). Better Vest 9.2.5. No copying without written permission. bv-78d4e796 */ }
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
    for (const id of Object.keys(acc)) { /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-eb8decef */
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
        const apiTotal = s && s.apiTotal != null ? s.apiTotal : null; /* @license Better Vest 9.2.5. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-70f1932c */
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
    if (msg.ok || (run && run.accountsWritten)) {
        await putMeta(db, 'lastSync', nowMs);
        if (stats.mode !== 'delta') await putMeta(db, 'lastDiscovery', nowMs);
        if (stats.mode === 'full' && msg.ok) await putMeta(db, 'lastFullSync', nowMs); /* Owned by Astral (@ax4p): Better Vest standard 9.2.5. Licence: LICENSE, not open source. bv-488ce583 */
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
    if (msg.op === 'resume') return;
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
                await withDb(userId, (db) => writePositions(userId, db, msg)); /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-e75d38e6 */
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
    /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-68c1a487 */ const s = port.sender;
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

async function openExtPage(file, sender) {
    const base = chrome.runtime.getURL(file);
    let ctxs = [];
    try { ctxs = await chrome.runtime.getContexts({ contextTypes: ['TAB'] }); } catch (e) { ctxs = []; } /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-c79198f5 */
    const hit = ctxs.find((c) => typeof c.documentUrl === 'string' && c.documentUrl.startsWith(base) && c.tabId >= 0);
    if (hit) {
        await chrome.tabs.update(hit.tabId, { active: true });
        if (hit.windowId >= 0) await chrome.windows.update(hit.windowId, { focused: true }).catch(() => {});
        return { ok: true, reason: 'focused' };
    }
    const opts = { url: base };
    if (sender && sender.tab && sender.tab.windowId >= 0) { opts.windowId = sender.tab.windowId; opts.index = sender.tab.index + 1; }
    await chrome.tabs.create(opts);
    return { ok: true, reason: 'created' };
}

const journalOpen = (sender) => openExtPage('journal.html', sender);
const certOpen = (sender) => openExtPage('certificate.html', sender);
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
    if (!isObj(msg) || msg.type !== 'tape') return;
    if (!fromVestScript(sender) || /[?&](bvCopy|bvLead|bvChart)=/.test(String(sender.tab.url || ''))) { sendResponse({ ok: false }); return false; }
    tapeWrite(msg.sym, msg.rows, Date.now()).then((n) => sendResponse({ ok: true, n }), () => sendResponse({ ok: false }));
    return true;
});

const VC_URL = chrome.runtime.getURL('cert/listen.html');
const VC_TRADE = /^https:\/\/next\.vestmarkets\.com\/trade\//;
const VC_HELPER = /[?&](bvCopy|bvLead|bvChart)=/;
async function vcOpen() { /*! All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-dc92221e */
    let ctxs = [];
    try { ctxs = await chrome.runtime.getContexts({ contextTypes: ['TAB'] }); } catch (e) { ctxs = []; }
    const hit = ctxs.find((c) => typeof c.documentUrl === 'string' && c.documentUrl.startsWith(VC_URL) && c.windowId >= 0);
    if (hit) { await chrome.windows.update(hit.windowId, { focused: true }).catch(() => {}); return { ok: true, reason: 'focused' }; }
    let at = {};
    try { at = (await chrome.storage.local.get('vcWin')).vcWin || {}; } catch (e) {}
    const opts = { url: VC_URL, type: 'popup', width: 320, height: 380, focused: true };
    if (Number.isInteger(at.left) && Number.isInteger(at.top)) { opts.left = at.left; opts.top = at.top; }
    await chrome.windows.create(opts).catch(() => chrome.windows.create({ url: VC_URL, type: 'popup', width: 320, height: 380, focused: true }));
    return { ok: true, reason: 'created' };
}
async function vcTarget() {
    let w = null;
    try { w = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] }); } catch (e) {}
    const tab = w && Array.isArray(w.tabs) ? w.tabs.find((t) => t.active) : null;
    const url = tab ? String(tab.url || '') : '';
    return tab && VC_TRADE.test(url) && !VC_HELPER.test(url) && !tab.discarded ? tab : null;
}
async function vcSend(msg) {
    if (VC_IDS.indexOf(msg.id) < 0) return { sent: false, why: 'Not a command.' };
    const tab = await vcTarget();
    if (!tab) return { sent: false, why: 'Bring Vest’s trade page to the front.' };
    try {
        const r = await chrome.tabs.sendMessage(tab.id, { type: 'vc', id: msg.id, said: String(msg.said || '').slice(0, 60), seq: Number.isInteger(msg.seq) ? msg.seq : 0 });
        return r && r.ok ? { sent: true } : { sent: false, why: 'Vest’s page did not answer. Reload it.' };
    } catch (e) {
        return { sent: false, why: 'Vest’s page did not answer. Reload it.' };
    }
}
const vcCfgClean = (c) => ({ on: !!(c && c.on === true), mode: c && c.mode === 'wake' ? 'wake' : 'ptt', open: !(c && c.open === false) });
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isObj(msg) || (msg.type !== 'vc-cmd' && msg.type !== 'vc-page')) return;
    if (msg.type === 'vc-cmd') {
        if (!fromExtensionPage(sender) || !String(sender.url).startsWith(VC_URL)) { sendResponse({ sent: false }); return false; }
        vcSend(msg).then(sendResponse, () => sendResponse({ sent: false }));
        return true;
    }
    if (!fromVestScript(sender) || VC_HELPER.test(String(sender.tab.url || ''))) return;
    if (msg.op === 'open') vcOpen().catch(() => {});
    else if (msg.op === 'cfg') chrome.storage.session.set({ vcCfg: vcCfgClean(msg.cfg) }).catch(() => {});
    else if (msg.op === 'ptt') chrome.runtime.sendMessage({ type: 'vc-ptt', down: msg.down === true }).catch(() => {});
    else if (msg.op === 'done' && VC_IDS.indexOf(msg.id) >= 0) {
        chrome.runtime.sendMessage({ type: 'vc-done', id: msg.id, ok: msg.ok === true, why: String(msg.why || '').slice(0, 120), text: String(msg.text || '').slice(0, 60),
            level: msg.level === 'warn' ? 'warn' : '', seq: Number.isInteger(msg.seq) ? msg.seq : null }).catch(() => {});
    }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isObj(msg) || typeof msg.type !== 'string') return;
    if (msg.type === 'journal-summary' && fromExtensionPage(sender)) {
        journalSummary().then(sendResponse, () => sendResponse({ userId: null }));
        return true;
    } /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-113ae479 */
    if (msg.type === 'journal-sync' && fromExtensionPage(sender)) {
        journalSync(msg.mode).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
    if (msg.type === 'journal-open' && (fromExtensionPage(sender) || fromVestScript(sender))) {
        journalOpen(sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
    if (msg.type === 'cert-open' && (fromExtensionPage(sender) || fromVestScript(sender))) {
        certOpen(sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
    if (msg.type === 'share-open' && fromVestScript(sender)) {
        shareOpen(msg.snap, sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
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
    } /* (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-fc6dc658 */
    if (msg.type === 'update-open' && (fromExtensionPage(sender) || fromVestScript(sender))) {
        openExtPage('update.html', sender).then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
        return true;
    }
});

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
    const st = await chrome.storage.local.get(['bvUpdate', 'bvUpdateCheck', 'bvUpdateAt', 'bvLatest']);
    const version = chrome.runtime.getManifest().version;
    const available = supported && st.bvUpdate && compareVersions(st.bvUpdate.version, version) > 0 ? st.bvUpdate : null;
    const latest = supported && isObj(st.bvLatest) && typeof st.bvLatest.tag === 'string' ? st.bvLatest : null;
    return { supported, on: st.bvUpdateCheck !== false, available, checkedAt: st.bvUpdateAt || null, version, latest, heads: available ? whatsNew(available.notes) : [] };
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
        if (r.ok) { /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-dfcb4a22 */
            const rel = parseLatest(await r.json());
            await chrome.storage.local.set(rel ? { bvUpdateAt: Date.now(), bvLatest: rel } : { bvUpdateAt: Date.now() });
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
    const a = await chrome.alarms.get(UPDATE_ALARM);
    if (!a || a.periodInMinutes !== UPDATE_EVERY_MIN) chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: UPDATE_EVERY_MIN });
}

let afterUpdateRan = false;
async function afterSelfUpdate() {
    if (afterUpdateRan) return;
    afterUpdateRan = true;
    const { bvUpdated } = await chrome.storage.local.get('bvUpdated');
    if (!bvUpdated) return;
    const v = chrome.runtime.getManifest().version;
    const name = chrome.runtime.getManifest().name;
    if (bvUpdated.to !== v || (bvUpdated.toName && bvUpdated.toName !== name)) {
        const t = Date.now();
        const stillOld = bvUpdated.from === v && (!bvUpdated.fromName || bvUpdated.fromName === name);
        if (stillOld && t >= (bvUpdated.reloadAt || bvUpdated.at || 0) && t - (bvUpdated.at || 0) < 10 * 60 * 1000) {
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

countStart();

remoteStart();

lastUserId().then((uid) => { if (uid) dbFor(uid).catch(() => {}); }).catch(() => {}); /*! Better Vest (c) 2026 Astral. All rights reserved. bv-89b18068 */


const COPY_KEY = 'copy:tabs';
const COPY_WATCH_ALARM = 'bv-copy-watch';
const COPY_MAX_FOLLOWERS = 10;
const COPY_MAX_ACTIONS = 256;
const COPY_SNAP_BYTES = 200 * 1024;
const COPY_MARKET_RE = /^[A-Za-z0-9._-]{1,40}$/;
const COPY_ID_RE = /^[\w.:-]{1,128}$/;
const COPY_EXEC_BASE_MS = 3000;
const COPY_EXEC_PER_MS = 5000;
const COPY_EXEC_MAX_MS = 60000;
const COPY_PING_MS = 8000;
const COPY_ALIVE_MS = 10000;
const COPY_RELOAD_GRACE_MS = 30000;
const COPY_STAGGER_MS = 250;
const COPY_REOPEN_MAX = 5;
const COPY_REOPEN_WINDOW_MS = 2 * 60 * 1000;
const COPY_ORIGIN = 'https://next.vestmarkets.com/';
const COPY_LOG_KEY = 'copy:log';
const COPY_LOG_MAX = 3000;
const COPY_LOG_BYTES = 2 * 1024 * 1024;

const copyBlank = () => ({ gid: null, on: false, market: null, leaderTabId: null, windowId: null, groupId: null, followers: {}, specs: {} });
const COPY_GID_RE = /^[A-Z]$/;
const copyGid = (v) => (typeof v === 'string' && COPY_GID_RE.test(v) ? v : 'A');
const COPY_TAB_COLORS = ['blue', 'orange', 'cyan', 'pink', 'purple', 'green', 'yellow', 'red'];
const copyRootBlank = () => ({ groups: {}, leads: {}, leadGroup: null });
let copyRoot = null;
let copyLoading = null;
let copyChain = Promise.resolve();
let copySeq = 0;
const copyAlive = new Map();
const copyInflight = new Map(); /*! Copyright (c) 2026 Astral. Better Vest 9.2.5 is licensed to its users only to run it, never to copy it. bv-d9c0b096 */

const copyFix = (v, g) => { const st = Object.assign(copyBlank(), v); if (!isObj(st.followers)) st.followers = {}; st.gid = g; return st; };
function copyLoad() {
    if (copyRoot) return Promise.resolve(copyRoot);
    if (!copyLoading) {
        copyLoading = chrome.storage.session.get(COPY_KEY).then((r) => {
            const v = r && r[COPY_KEY];
            copyRoot = copyRootBlank();
            if (isObj(v) && isObj(v.groups)) {
                for (const g of Object.keys(v.groups)) if (COPY_GID_RE.test(g) && isObj(v.groups[g])) copyRoot.groups[g] = copyFix(v.groups[g], g);
                if (isObj(v.leads)) for (const g of Object.keys(v.leads)) if (COPY_GID_RE.test(g) && isObj(v.leads[g]) && Number.isInteger(v.leads[g].tabId)) copyRoot.leads[g] = { tabId: v.leads[g].tabId, market: v.leads[g].market };
                if (Number.isInteger(v.leadGroup)) copyRoot.leadGroup = v.leadGroup;
            } else if (isObj(v) && isObj(v.followers)) copyRoot.groups.A = copyFix(v, 'A');
            return copyRoot;
        }, () => (copyRoot = copyRootBlank()));
    }
    return copyLoading;
}
const copySave = () => chrome.storage.session.set({ [COPY_KEY]: copyRoot }).catch(() => {});
function copyGroup(root, g) {
    if (!isObj(root.groups[g])) root.groups[g] = copyFix({}, g);
    return root.groups[g];
}
function copyGroupOfTab(root, tabId) {
    if (tabId == null) return null;
    for (const g of Object.keys(root.groups)) {
        const st = root.groups[g];
        if (st.leaderTabId === tabId || copyIdOf(st, tabId) !== undefined) return [g, st];
    }
    return null;
}
const copyAnyOn = (root) => Object.keys(root.groups).some((g) => root.groups[g].on); /* Copyright Astral 2026. From Better Vest 9.2.5 (standard), ref bv-7cd44f11. Not licensed for reuse. */
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
const copyFollower = (st, id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(st.followers, id) ? st.followers[id] : null);
const copyUrl = (market, accountId) => `${COPY_ORIGIN}trade/${encodeURIComponent(market)}?bvCopy=${encodeURIComponent(accountId)}`;
const copyIdOf = (st, tabId) => Object.keys(st.followers).find((k) => st.followers[k].tabId === tabId);
const copyTabAlive = (tabId) => (tabId == null ? Promise.resolve(false) : chrome.tabs.get(tabId).then(() => true, () => false));

function copyNotifyLeader(st, payload) {
    if (st.leaderTabId == null) return;
    chrome.tabs.sendMessage(st.leaderTabId, Object.assign({ type: 'copy' }, payload)).catch(() => {});
}


const copyKeep = (tabId) => { if (tabId != null) chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {}); };

async function copyRecover(st, id, tabId) {
    const f = copyFollower(st, id);
    if (!f || f.tabId !== tabId || Date.now() - (f.reloadAt || 0) < 10000) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || (!tab.discarded && tab.status !== 'complete')) return;
    f.reloadAt = Date.now();
    chrome.tabs.reload(tabId).catch(() => {});
}

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
        /*! Copyright (c) 2026 Astral. Better Vest 9.2.5 is licensed to its users only to run it, never to copy it. bv-72c9c3a8 */ if (!a) chrome.alarms.create(COPY_WATCH_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
    } else {
        await chrome.alarms.clear(COPY_WATCH_ALARM).catch(() => {});
    }
}

async function copyCreateTabs(st, accountIds) {
    const open = async (id, i) => {
        if (i) await copySleep(i * COPY_STAGGER_MS);
        const opts = { url: copyUrl(st.market, id), active: false };
        if (st.windowId != null && st.windowId >= 0) opts.windowId = st.windowId;
        try {
            return await chrome.tabs.create(opts);
        } catch (e) {
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
    for (const t of made) chrome.tabs.update(t.id, { autoDiscardable: false }).catch(() => {});
    if (!made.length) return;
    const gl = st.gid || 'A';
    const winId = made[0].windowId;
    let gid = st.groupId;
    if (gid != null) {
        /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-0a3f903d */ const g = await chrome.tabGroups.get(gid).catch(() => null);
        if (!g || g.windowId !== winId) gid = null;
    }
    try {
        gid = await chrome.tabs.group(gid != null ? { groupId: gid, tabIds: made.map((t) => t.id) } : { tabIds: made.map((t) => t.id), createProperties: { windowId: winId } });
        st.groupId = gid;
        await chrome.tabGroups.update(gid, { title: 'Copy ' + gl, color: COPY_TAB_COLORS[Math.max(0, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(gl)) % COPY_TAB_COLORS.length], collapsed: true });
    } catch (e) {
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
    await copyArmWatch(copyAnyOn(copyRoot || copyRootBlank()));
    if (ids.length) await chrome.tabs.remove(ids).catch(() => {});
}

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

const copyIsFollowerPage = (root, sender) => { const hit = sender.tab ? copyGroupOfTab(root, sender.tab.id) : null; return !!hit && hit[1].leaderTabId !== sender.tab.id; };

function copyOpen(sender, msg) {
    return copyLock(async () => {
        const root = await copyLoad();
        const st = copyGroup(root, copyGid(msg.g));
        const req = copyValidOpen(msg);
        if (!req) return { ok: false, error: 'shape' };
        if (copyIsFollowerPage(root, sender) || /[?&]bvCopy=/.test(String(sender.url || ''))) return { ok: false, error: 'follower' };
        const leader = sender.tab;
        /* Copyright Astral 2026. From Better Vest 9.2.5 (standard), ref bv-725771a8. Not licensed for reuse. */ for (const og of Object.keys(root.groups)) if (root.groups[og] !== st && root.groups[og].on && root.groups[og].leaderTabId === leader.id) await copyShutdown(root.groups[og]);
        const wanted = new Map(req.followers.map((f) => [f.accountId, f]));
        const drop = [];
        for (const id of Object.keys(st.followers)) {
            if (wanted.has(id)) continue;
            if (st.followers[id].tabId != null) drop.push(st.followers[id].tabId);
            delete st.followers[id];
        }
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

function copyClose(sender, msg) {
    return copyLock(async () => {
        const st = copyGroup(await copyLoad(), copyGid(msg && msg.g));
        if (st.leaderTabId != null && sender.tab && sender.tab.id !== st.leaderTabId) return { ok: false, error: 'not-leader' };
        await copyShutdown(st);
        return { ok: true }; /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-8261fbfd */
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

async function copyExec(sender, msg) {
    const st = copyGroup(await copyLoad(), copyGid(msg.g));
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
    const bid = typeof msg.bid === 'string' && COPY_ID_RE.test(msg.bid) ? msg.bid : null;
    const specs = copySpecsOf(msg.specs);
    if (Object.keys(specs).length) st.specs = Object.assign(isObj(st.specs) ? st.specs : {}, specs);
    const startedAt = Date.now();
    const t0 = performance.now();
    const results = new Array(actions.length);
    const followers = {};
    const snaps = {};
    const fail = (idxs, error) => idxs.forEach((i) => { results[i] = { action: actions[i], ok: false, ms: 0, error }; });
    await Promise.all([...groups].map(async ([id, idxs]) => {
        const f = copyFollower(st, id);
        if (!f) return fail(idxs, 'unknown-follower');
        if (f.tabId == null || !f.ready || f.failed) { copyNotifyLeader(st, { op: 'follower-lost', accountId: id, why: 'not-ready' }); return fail(idxs, 'follower-not-ready'); }
        const sent = performance.now();
        const tabId = f.tabId;
        /* Copyright Astral 2026. From Better Vest 9.2.5 (standard), ref bv-11f96323. Not licensed for reuse. */ copyInflight.set(tabId, (copyInflight.get(tabId) || 0) + 1);
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
            if (bid && arr) copyNotifyLeader(st, { op: 'follower-result', bid, accountId: id, results: arr, snap: resp && copySnapOk(resp.snap) ? resp.snap : undefined });
        } catch (e) {
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
        const root = await copyLoad();
        const hit = sender.tab ? copyGroupOfTab(root, sender.tab.id) : null;
        /* Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-c37ed7e2 */ const st = hit ? hit[1] : copyBlank();
        const f = copyFollower(st, msg.accountId);
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

async function copySnap(sender, msg) {
    const root = await copyLoad();
    const hit = sender.tab ? copyGroupOfTab(root, sender.tab.id) : null;
    const st = hit ? hit[1] : copyBlank();
    const f = st.on ? copyFollower(st, msg.accountId) : null; /* @license Better Vest 9.2.5. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-31dc469e */
    if (!f || !sender.tab || f.tabId !== sender.tab.id) return { ok: false, error: 'unknown-tab' };
    if (!copySnapOk(msg.snap)) return { ok: false, error: 'shape' };
    copyAlive.set(sender.tab.id, Date.now());
    copyNotifyLeader(st, { op: 'follower-snap', accountId: msg.accountId, snap: msg.snap });
    return { ok: true };
}

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

async function copyWatch() {
    const plan = await copyLock(async () => {
        const root = await copyLoad();
        if (!copyAnyOn(root)) { await copyArmWatch(false); return null; }
        const ping = [];
        const announce = [];
        for (const g of Object.keys(root.groups)) {
            const st = root.groups[g];
            if (!st.on) continue;
            if (!(await copyTabAlive(st.leaderTabId))) { await copyShutdown(st); continue; }
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
                ping.push({ g, id, tabId: tab.id, ready: !!f.ready });
            }
        }
        await copySave();
        return { announce, ping };
    });
    if (!plan) return;
    const quiet = [];
    await Promise.all([
        ...plan.announce.map((tabId) => chrome.tabs.sendMessage(tabId, { type: 'copy', op: 'announce' }).catch(() => {})),
        ...plan.ping.map(async (p) => {
            for (let k = 0; k < 2; k++) {
                try {
                    await copyTimeout(chrome.tabs.sendMessage(p.tabId, { type: 'copy', op: 'ping' }), COPY_PING_MS);
                    copyAlive.set(p.tabId, Date.now());
                    if (!p.ready) chrome.tabs.sendMessage(p.tabId, { type: 'copy', op: 'announce' }).catch(() => {});
                    return;
                } catch (e) {
                }
            } /*! Copyright (c) 2026 Astral. Better Vest 9.2.5 is licensed to its users only to run it, never to copy it. bv-35685233 */
            quiet.push(p);
        })
    ]);
    if (!quiet.length) return;
    await copyLock(async () => {
        const root = await copyLoad();
        for (const p of quiet) {
            const st = root.groups[p.g];
            if (!st || !st.on) continue;
            const f = copyFollower(st, p.id);
            if (!f || f.tabId !== p.tabId || copyInflight.has(p.tabId) || Date.now() - (copyAlive.get(p.tabId) || 0) < COPY_ALIVE_MS) continue;
            if (f.ready && Date.now() - (f.readyAt || 0) < COPY_RELOAD_GRACE_MS) continue;
            copyUnready(st, p.id, 'ping');
            chrome.tabs.reload(p.tabId).catch(() => {});
        }
        await copySave();
    });
}

function copySweep() {
    return copyLock(async () => {
        const root = await copyLoad();
        let tabs = [];
        try { tabs = await chrome.tabs.query({ url: COPY_ORIGIN + '*' }); } catch (e) { return; }
        const known = new Set();
        for (const g of Object.keys(root.groups)) for (const k of Object.keys(root.groups[g].followers)) known.add(root.groups[g].followers[k].tabId);
        const st = root.groups.A || copyBlank();
        const stray = tabs.filter((t) => /[?&]bvCopy=/.test(String(t.url || '')) && !known.has(t.id)).map((t) => t.id);
        if (stray.length) await chrome.tabs.remove(stray).catch(() => {});
    });
}

const copyLeadUrl = (market, g, start) => `${COPY_ORIGIN}trade/${encodeURIComponent(market)}?bvLead=${g}${start ? '&bvStart=1' : ''}`;

function copyLeadOpen(sender, msg, show) {
    return copyLock(async () => { /* This file is part of Better Vest by Astral and is protected by copyright. ref bv-869dca91 */
        const root = await copyLoad();
        const g = copyGid(msg.g);
        const market = typeof msg.market === 'string' && COPY_MARKET_RE.test(msg.market) ? msg.market : 'NQ-PERP';
        const start = msg.start === true && !show;
        const cur = isObj(root.leads[g]) ? root.leads[g] : null;
        if (cur && (await copyTabAlive(cur.tabId))) {
            if (show) {
                const t = await chrome.tabs.update(cur.tabId, { active: true }).catch(() => null);
                if (t && chrome.windows && t.windowId != null) chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
                return { ok: true, tabId: cur.tabId, opened: false };
            }
            if (start) chrome.tabs.update(cur.tabId, { url: copyLeadUrl(market, g, true) }).catch(() => {});
            return { ok: true, tabId: cur.tabId, opened: false };
        }
        const opts = { url: copyLeadUrl(market, g, start), active: !!show };
        if (sender.tab && sender.tab.windowId != null && sender.tab.windowId >= 0) opts.windowId = sender.tab.windowId;
        const tab = await chrome.tabs.create(opts).catch(() => null);
        if (!tab) return { ok: false, error: 'tab' };
        copyKeep(tab.id);
        root.leads[g] = { tabId: tab.id, market };
        try {
            let tg = root.leadGroup != null ? await chrome.tabGroups.get(root.leadGroup).catch(() => null) : null;
            if (tg && tg.windowId !== tab.windowId) tg = null;
            const gid = await chrome.tabs.group(tg ? { groupId: tg.id, tabIds: [tab.id] } : { tabIds: [tab.id], createProperties: { windowId: tab.windowId } });
            root.leadGroup = gid;
            await chrome.tabGroups.update(gid, { title: 'Better Vest', color: 'grey' });
        } catch (e) {  }
        await copySave();
        return { ok: true, tabId: tab.id, opened: true };
    });
}

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
    }); /* Better Vest (c) 2026 Astral. All rights reserved. bv-36e32c32 */
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isObj(msg) || msg.type !== 'copy' || typeof msg.op !== 'string') return;
    const answer = (p) => { p.then(sendResponse, (e) => sendResponse({ ok: false, error: copyErr(e) })); return true; };
    const vest = fromVestScript(sender);
    switch (msg.op) {
        case 'tabs-open': return vest ? answer(copyOpen(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'tabs-close': return vest || fromExtensionPage(sender) ? answer(copyClose(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'tabs-exec': return vest ? answer(copyExec(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'tabs-status': return vest || fromExtensionPage(sender) ? answer(copyLoad().then((root) => copyStatusOf(copyGroup(root, copyGid(msg.g))))) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'lead-open': return vest ? answer(copyLeadOpen(sender, msg, false)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'lead-show': return vest ? answer(copyLeadOpen(sender, msg, true)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'log-save': return vest ? answer(copyLogSave(msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'log-load': return vest ? answer(copyLogLoad()) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'follower-ready': return vest && isId(msg.accountId) ? answer(copyReady(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        case 'follower-snap': return vest && isId(msg.accountId) ? answer(copySnap(sender, msg)) : (sendResponse({ ok: false, error: 'sender' }), false);
        default: return;
    }
});

chrome.tabs.onRemoved.addListener((tabId, info) => {
    copyLock(async () => {
        const root = await copyLoad();
        for (const g of Object.keys(root.leads)) if (root.leads[g] && root.leads[g].tabId === tabId) { delete root.leads[g]; await copySave(); }
        const hit = copyGroupOfTab(root, tabId);
        if (!hit) return;
        const gk = hit[0], st = hit[1]; /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-115d07c3 */
        if (!st.on) return;
        if (tabId === st.leaderTabId) { await copyShutdown(st); return; }
        const id = copyIdOf(st, tabId);
        if (id === undefined) return;
        const f = st.followers[id];
        f.tabId = null;
        f.ready = false;
        await copySave();
        if (info && info.isWindowClosing) return;
        copyNotifyLeader(st, { op: 'follower-lost', accountId: id });
        setTimeout(() => copyLock(async () => { await copyReopen(copyGroup(await copyLoad(), gk), id); }).catch(() => {}), 800);
    }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'loading') return;
    copyLock(async () => {
        const hit = copyGroupOfTab(await copyLoad(), tabId);
        if (!hit) return;
        const st = hit[1];
        if (!st.on) return;
        if (tabId === st.leaderTabId) { await copyShutdown(st); return; }
        const id = copyIdOf(st, tabId);
        if (id === undefined || !st.followers[id].ready) return;
        copyUnready(st, id, 'loading');
        await copySave();
    }).catch(() => {});
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === COPY_WATCH_ALARM) copyWatch().catch(() => {}); });
copySweep().catch(() => {});

const MCH_KEY = 'mchTabs';
const MCH_RE = /^[A-Z0-9][A-Z0-9-]{0,40}$/;
let mchQueue = Promise.resolve();
function mchLock(fn) {
    const p = mchQueue.then(fn, fn);
    mchQueue = p.catch(() => {});
    return p;
}
async function mchLoad() {
    const r = await chrome.storage.session.get(MCH_KEY).catch(() => null);
    const v = r && r[MCH_KEY];
    return isObj(v) ? v : {};
}
const mchSave = (all) => chrome.storage.session.set({ [MCH_KEY]: all }).catch(() => {});
const mchTab = (id) => (Number.isInteger(id) ? chrome.tabs.get(id).catch(() => null) : Promise.resolve(null));
const mchIsData = (tab, market) => !!tab && String(tab.url || tab.pendingUrl || '').indexOf('bvChart=' + market) >= 0;

async function mchGroup(tab) {
    try {
        const found = await chrome.tabGroups.query({ windowId: tab.windowId, title: 'Charts' });
        if (found && found.length) { await chrome.tabs.group({ groupId: found[0].id, tabIds: [tab.id] }); return; }
        const gid = await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId: tab.windowId } });
        await chrome.tabGroups.update(gid, { title: 'Charts', color: 'grey', collapsed: true });
    } catch (e) {}
}
async function mchOpen(opener, market, reload) {
    const all = await mchLoad();
    const key = String(opener.id);
    const mine = isObj(all[key]) ? all[key] : (all[key] = {});
    /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-f6a940d6 */ const cur = await mchTab(mine[market]);
    if (mchIsData(cur, market)) {
        if (reload) await chrome.tabs.reload(cur.id).catch(() => {});
        return { ok: true, tabId: cur.id };
    }
    if (!(market in mine) && Object.keys(mine).length >= 3) return { ok: false, error: 'max' };
    const tab = await chrome.tabs.create({ windowId: opener.windowId, url: 'https://next.vestmarkets.com/trade/' + market + '?bvChart=' + market, active: false, index: opener.index + 1 });
    chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
    mine[market] = tab.id;
    await mchSave(all);
    await mchGroup(tab);
    return { ok: true, tabId: tab.id };
}
async function mchKeep(opener, markets) {
    const all = await mchLoad();
    const key = String(opener.id);
    const mine = isObj(all[key]) ? all[key] : {};
    const close = [];
    for (const m of Object.keys(mine)) if (markets.indexOf(m) < 0) { close.push(mine[m]); delete mine[m]; } /* Better Vest (c) 2026 Astral. All rights reserved. bv-32094636 */
    if (Object.keys(mine).length) all[key] = mine; else delete all[key];
    await mchSave(all);
    for (const id of close) { const t = await mchTab(id); if (t && /[?&]bvChart=/.test(String(t.url || t.pendingUrl || ''))) chrome.tabs.remove(id).catch(() => {}); }
    return { ok: true };
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isObj(msg) || msg.type !== 'mch') return;
    if (!fromVestScript(sender) || /[?&]bvChart=/.test(String(sender.tab.url || ''))) { sendResponse({ ok: false, error: 'sender' }); return false; }
    const opener = sender.tab;
    const list = Array.isArray(msg.markets) ? msg.markets.filter((m) => typeof m === 'string' && MCH_RE.test(m)).slice(0, 3) : [];
    const p = msg.op === 'open' && typeof msg.market === 'string' && MCH_RE.test(msg.market) ? mchLock(() => mchOpen(opener, msg.market, msg.reload === true))
        : msg.op === 'keep' ? mchLock(() => mchKeep(opener, list))
            : msg.op === 'close' ? mchLock(() => mchKeep(opener, [])) : null;
    if (!p) { sendResponse({ ok: false, error: 'op' }); return false; }
    p.then(sendResponse, () => sendResponse({ ok: false, error: 'failed' }));
    return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
    mchLock(async () => {
        const all = await mchLoad();
        const key = String(tabId);
        let changed = false;
        if (isObj(all[key])) {
            for (const id of Object.values(all[key])) { const t = await mchTab(id); if (t && /[?&]bvChart=/.test(String(t.url || t.pendingUrl || ''))) chrome.tabs.remove(id).catch(() => {}); }
            delete all[key];
            changed = true;
        }
        for (const k of Object.keys(all)) for (const [m, id] of Object.entries(all[k] || {})) if (id === tabId) { delete all[k][m]; changed = true; }
        if (changed) await mchSave(all);
    }).catch(() => {});
});
