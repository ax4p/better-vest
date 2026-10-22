/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { compareVersions } from './core.js';

export const FLAGS_URL = 'https://bv.astrals.dev/api/flags';
export const SWITCHES = Object.freeze(['all', 'copier', 'turbo', 'orders', 'close', 'stops', 'limits', 'tpsl', 'trail', 'autobe', 'accounts', 'lossclose', 'usage', 'voicecmd', 'wickauto']);
export const REMOTE_KEY = 'bvRemote';
export const REMOTE_OFF_KEY = 'bvRemoteOff';
export const STORE_ASK_KEY = 'bvStoreAsk';
export const STORE_PENDING_KEY = 'bvStorePending';
export const STORE_DONE_KEY = 'bvStoreDone';
export const STORE_UPDATED_KEY = 'bvStoreUpdated';
export const NEWS_KEY = 'bvNews';
const ALARM = 'bv-remote';
const EVERY_MIN = 3; /* Copyright Astral 2026. From Better Vest 9.2.6 (nostats), ref bv-86c3be1c. Not licensed for reuse. */
const STALE_MS = 60 * 1000;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 16 * 1024;
const STORE_ASK_GAP_MS = (5 * 60 + 10) * 60 * 1000;
const IDLE_FRESH_MS = 20 * 1000;
const VERSION_RE = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const VEST_TABS = ['https://next.vestmarkets.com/*'];

let STORE_EDITION = false;

let queue = Promise.resolve();
function serial(fn) {
    const run = queue.then(fn, fn).catch(() => false);
    queue = run;
    return run;
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const CTRL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]', 'g');
export function cleanWhy(s) {
    return cleanText(s, 200);
}
function cleanText(s, max) {
    if (typeof s !== 'string') return '';
    return s.replace(CTRL_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const NEWS_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NEWS_PATH_RE = /^\/(?!\/)[A-Za-z0-9\/_-]{0,60}$/;
const isMs = (x) => typeof x === 'number' && Number.isInteger(x) && x > 0 && x < 1e14;
export function cleanNews(n) {
    if (!isObj(n) || typeof n.id !== 'string' || !NEWS_ID_RE.test(n.id) || !isMs(n.end)) return null;
    const title = cleanText(n.title, 80);
    if (!title) return null;
    const start = isMs(n.start) && n.start < n.end ? n.start : null;
    let link = null;
    if (isObj(n.link) && typeof n.link.path === 'string' && NEWS_PATH_RE.test(n.link.path)) {
        const label = cleanText(n.link.label, 24);
        if (label) link = { label, path: n.link.path };
    }
    return { id: n.id, title, text: cleanText(n.text, 240), start, end: n.end, link }; /* Owned by Astral (@ax4p): Better Vest nostats 9.2.6. Licence: LICENSE, not open source. bv-2fa0171e */
}

export function cleanVersion(v) {
    return typeof v === 'string' && VERSION_RE.test(v) ? v : null;
}

export function parseFlags(json) {
    if (!isObj(json) || json.v !== 1) return null;
    if (own(json, 'off') && !isObj(json.off)) return null;
    const src = isObj(json.off) ? json.off : {};
    const off = {};
    for (const name of SWITCHES) {
        if (!own(src, name)) continue;
        const e = src[name];
        off[name] = isObj(e) ? { why: cleanWhy(e.why), below: cleanVersion(e.below) } : { why: '', below: null };
    }
    return { off, store: cleanVersion(json.store), news: cleanNews(json.news) };
}

export function activeOff(off, version) {
    const out = {};
    if (!isObj(off)) return out;
    for (const name of SWITCHES) {
        const e = off[name];
        if (!isObj(e)) continue;
        if (e.below && compareVersions(version, e.below) >= 0) continue;
        out[name] = cleanWhy(e.why);
    }
    return out;
}

export async function fetchFlags(env) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : 0;
    try {
        const r = await env.fetchFn(FLAGS_URL, { method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined });
        if (!r || !r.ok) return null;
        const text = await r.text();
        if (typeof text !== 'string' || text.length > MAX_BYTES) return null;
        return parseFlags(JSON.parse(text));
    } catch (e) {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function getKey(env, key) {
    const got = await env.storage.get(key);
    return got ? got[key] : undefined;
}

async function writeActive(env, off) {
    const now = activeOff(off, env.version);
    const cur = await getKey(env, REMOTE_OFF_KEY);
    if (JSON.stringify(isObj(cur) ? cur : {}) !== JSON.stringify(now)) await env.storage.set({ [REMOTE_OFF_KEY]: now });
    return now;
}

async function writeNews(env, news) {
    const now = cleanNews(news);
    const cur = await getKey(env, NEWS_KEY);
    if (JSON.stringify(cur === undefined ? null : cur) !== JSON.stringify(now)) await env.storage.set({ [NEWS_KEY]: now });
    return now;
} /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-d6f74600 */

let lastTry = 0;

export function remoteTick(env, force) {
    return serial(async () => {
        if (!force) {
            const tabs = await env.tabs.query({ url: VEST_TABS });
            if (!Array.isArray(tabs) || !tabs.length) return false;
        }
        lastTry = env.now();
        const got = await fetchFlags(env);
        if (!got) return false;
        await env.storage.set({ [REMOTE_KEY]: { at: env.now(), off: got.off, store: got.store, news: got.news } });
        await writeActive(env, got.off);
        await writeNews(env, got.news);
        if (got.store) await storeCheck(env, got.store);
        return true;
    });
}

export function remoteWake(env) {
    if (env.now() - lastTry < STALE_MS) return Promise.resolve(false);
    lastTry = env.now();
    return remoteTick(env, true);
}


export async function storeCheck(env, served) {
    if (!env.store || !env.storeInstall) return 'off';
    if (!cleanVersion(served) || compareVersions(served, env.version) <= 0) return 'current';
    const asked = await getKey(env, STORE_ASK_KEY);
    if (isObj(asked) && asked.v === served && env.now() - (asked.at || 0) < STORE_ASK_GAP_MS) return 'asked';
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.2.6. bv-95d19fde */ await env.storage.set({ [STORE_ASK_KEY]: { v: served, at: env.now() } });
    try {
        const r = await env.runtime.requestUpdateCheck();
        return isObj(r) && typeof r.status === 'string' ? r.status : 'no-answer';
    } catch (e) {
        return 'error';
    }
}

export async function storeReady(env, details) {
    const v = cleanVersion(details && details.version);
    if (!env.store || !v || compareVersions(v, env.version) <= 0) return false;
    await env.storage.set({ [STORE_PENDING_KEY]: { v, at: env.now() } });
    await storeApply(env);
    return true;
}

export function storeApply(env) {
    return serial(async () => {
        if (!env.store) return 'off';
        const p = await getKey(env, STORE_PENDING_KEY);
        if (!isObj(p) || !cleanVersion(p.v) || compareVersions(p.v, env.version) <= 0) return 'none';
        const tabs = await env.tabs.query({ url: VEST_TABS });
        for (const t of Array.isArray(tabs) ? tabs : []) {
            const st = await env.tabState(t.id);
            if (!isObj(st) || st.idle !== true || env.now() - (st.seenAt || 0) > IDLE_FRESH_MS) return 'busy';
        }
        await env.storage.set({ [STORE_DONE_KEY]: { from: env.version, to: p.v, at: env.now() } });
        await env.storage.remove(STORE_PENDING_KEY);
        env.runtime.reload();
        return 'reloading';
    });
}

export async function storeAfter(env) {
    const d = await getKey(env, STORE_DONE_KEY);
    if (!isObj(d)) return false;
    await env.storage.remove(STORE_DONE_KEY);
    if (d.to !== env.version || env.now() - (d.at || 0) > 10 * 60 * 1000) return false;
    await env.storage.set({ [STORE_UPDATED_KEY]: { v: env.version, at: env.now() } });
    const tabs = await env.tabs.query({ url: VEST_TABS });
    for (const t of Array.isArray(tabs) ? tabs : []) env.tabs.reload(t.id).catch(() => {});
    return true;
}

function defaultEnv() {
    const m = chrome.runtime.getManifest();
    return {
        version: m.version, store: STORE_EDITION, storeInstall: own(m, 'update_url'), runtime: chrome.runtime, storage: chrome.storage.local,
        alarms: chrome.alarms, tabs: chrome.tabs, fetchFn: (u, o) => fetch(u, o), now: () => Date.now(),
        tabState: async (id) => { const k = 'tab:' + id; const got = await chrome.storage.session.get(k); return got ? got[k] : null; }
    };
}

let started = null;

export function remoteStart(env = defaultEnv()) {
    started = env;
    try {
        env.alarms.onAlarm.addListener((a) => {
            if (!a || a.name !== ALARM) return;
            remoteTick(env, false);
            storeApply(env);
        });
        env.alarms.get(ALARM).then((a) => {
            if (!a || a.periodInMinutes !== EVERY_MIN) env.alarms.create(ALARM, { delayInMinutes: EVERY_MIN, periodInMinutes: EVERY_MIN });
        }).catch(() => {});
        /* Property of Astral (@ax4p). Better Vest 9.2.6. No copying without written permission. bv-ec222c27 */ if (env.store) {
            env.runtime.onUpdateAvailable.addListener((d) => { storeReady(env, d); });
            storeAfter(env).catch(() => {});
        }
        getKey(env, REMOTE_KEY).then((r) => { if (isObj(r)) return writeActive(env, r.off).then(() => writeNews(env, r.news)); }).catch(() => {});
        remoteTick(env, false);
    } catch (e) {}
}

export function remotePageState(st) {
    if (!started) return;
    remoteWake(started).catch(() => {});
    if (started.store && st && st.idle === true) storeApply(started).catch(() => {});
}
