// Better Vest by Astral - remote switches and quick Store updates (9.0.9).
//
// Every 3 minutes while a Vest tab is open (and when a Vest page comes up after a quiet spell), one GET of https://bv.astrals.dev/api/flags.
// Its answer is data, never code: which features Astral has switched off (a bug, a change on Vest's side), each with a short reason and
// optionally "only versions below X", and which version the Chrome Web Store serves. Nothing about the trader goes out: no id, no account,
// no cookies. The answer is read against a fixed list of switch names and everything else in it is ignored. When the site can't be reached
// the last good answer stays: a feature switched off stays off, and an error never switches anything off.
//
// What the page sees is this version's switches, { name: reason } in chrome.storage.local (bvRemoteOff): an entry with "below" applies
// only to versions lower than it. bridge.js passes them to the page, which refuses that feature and stops what of it is running.
//
// The Store edition also reads the served version (storeCheck): Chrome asks the Store only every 5 hours, and an extension's own
// requestUpdateCheck() is refused ("throttled") for 5 hours after a check that found nothing (Chromium's ChromeRuntimeAPIDelegate: its
// backoff starts at kDefaultUpdateFrequency, 5 hours, and only an installed update resets it). So it asks Chrome once, and only when the
// site says the Store serves a newer version; the site reads that from Google's own update service, the one Chrome asks. Chrome then
// downloads the update and holds it (onUpdateAvailable) until storeApply installs it: when every Vest tab says it is idle (flat, nothing
// armed, no copying, no order on its way), the extension restarts on the new version and reloads the Vest tabs.

import { compareVersions } from './core.js';

export const FLAGS_URL = 'https://bv.astrals.dev/api/flags';
// the switch names, in the site's order (site/src/lib/flags.ts); 'all' stands for every other one
export const SWITCHES = Object.freeze(['all', 'copier', 'turbo', 'orders', 'close', 'stops', 'limits', 'tpsl', 'trail', 'autobe', 'accounts', 'lossclose']);
export const REMOTE_KEY = 'bvRemote';           // the last good answer: { at, off: { name: { why, below } }, store }
export const REMOTE_OFF_KEY = 'bvRemoteOff';    // this version's switched-off features: { name: reason }
export const STORE_ASK_KEY = 'bvStoreAsk';      // { v, at }: the version we last asked Chrome for (one ask per version per 5 hours)
export const STORE_PENDING_KEY = 'bvStorePending'; // { v, at }: Chrome holds this update; it goes in when every Vest tab is idle
export const STORE_DONE_KEY = 'bvStoreDone';    // { from, to, at }: written just before the restart; the new version reloads the Vest tabs
export const STORE_UPDATED_KEY = 'bvStoreUpdated'; // { v, at }: the reloaded Vest pages say what just happened (bridge.js)
const ALARM = 'bv-remote';
const EVERY_MIN = 3;
const STALE_MS = 60 * 1000;                     // a Vest page coming up asks again when the last answer is older than this
const TIMEOUT_MS = 8000;
const MAX_BYTES = 16 * 1024;
const STORE_ASK_GAP_MS = (5 * 60 + 10) * 60 * 1000;
const IDLE_FRESH_MS = 20 * 1000;                // a tab's "idle" counts only when it said so this recently
const VERSION_RE = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const VEST_TABS = ['https://next.vestmarkets.com/*'];

let STORE_EDITION = false;

// one step at a time: the alarm, a page coming up and the worker's start may all ask at once
let queue = Promise.resolve();
function serial(fn) {
    const run = queue.then(fn, fn).catch(() => false);
    queue = run;
    return run;
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// a reason as plain text: one line, no control characters, at most 200 characters (the page only ever shows it as text)
// control characters, and the two Unicode line breaks (U+2028, U+2029), written as escapes so no editor turns them into real ones
const CTRL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]', 'g');
export function cleanWhy(s) {
    if (typeof s !== 'string') return '';
    return s.replace(CTRL_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function cleanVersion(v) {
    return typeof v === 'string' && VERSION_RE.test(v) ? v : null;
}

// The site's answer -> { off: { name: { why, below } }, store } or null when it is no answer at all (the last good one then stays).
// A known switch with a broken entry counts as off for every version: the owner meant something by it, and off is the safe side.
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
    return { off, store: cleanVersion(json.store) };
}

// the switches that apply to this version: { name: reason }
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

// bvRemoteOff is written only when it changes (bridge.js tells the page on every change)
async function writeActive(env, off) {
    const now = activeOff(off, env.version);
    const cur = await getKey(env, REMOTE_OFF_KEY);
    if (JSON.stringify(isObj(cur) ? cur : {}) !== JSON.stringify(now)) await env.storage.set({ [REMOTE_OFF_KEY]: now });
    return now;
}

let lastTry = 0;

// One question to the site. Without force, only while a Vest tab is open (nothing needs the answer otherwise).
export function remoteTick(env, force) {
    return serial(async () => {
        if (!force) {
            const tabs = await env.tabs.query({ url: VEST_TABS });
            if (!Array.isArray(tabs) || !tabs.length) return false;
        }
        lastTry = env.now();
        const got = await fetchFlags(env);
        if (!got) return false;
        await env.storage.set({ [REMOTE_KEY]: { at: env.now(), off: got.off, store: got.store } });
        await writeActive(env, got.off);
        if (got.store) await storeCheck(env, got.store);
        return true;
    });
}

// A Vest page reported its state: ask the site again when the last try is older than a minute
export function remoteWake(env) {
    if (env.now() - lastTry < STALE_MS) return Promise.resolve(false);
    lastTry = env.now();
    return remoteTick(env, true);
}

// ---------- the Store edition: ask Chrome once for a version the Store serves, install it when every Vest tab is idle ----------

export async function storeCheck(env, served) {
    if (!env.store || !env.storeInstall) return 'off';
    if (!cleanVersion(served) || compareVersions(served, env.version) <= 0) return 'current';
    const asked = await getKey(env, STORE_ASK_KEY);
    if (isObj(asked) && asked.v === served && env.now() - (asked.at || 0) < STORE_ASK_GAP_MS) return 'asked';
    await env.storage.set({ [STORE_ASK_KEY]: { v: served, at: env.now() } });
    try {
        const r = await env.runtime.requestUpdateCheck();
        return isObj(r) && typeof r.status === 'string' ? r.status : 'no-answer';
    } catch (e) {
        return 'error';
    }
}

// Chrome has the update and holds it while the extension runs
export async function storeReady(env, details) {
    const v = cleanVersion(details && details.version);
    if (!env.store || !v || compareVersions(v, env.version) <= 0) return false;
    await env.storage.set({ [STORE_PENDING_KEY]: { v, at: env.now() } });
    await storeApply(env);
    return true;
}

// Every Vest tab idle (the page's own report, fresh): restart on the new version. A tab that hasn't reported, or reported busy, waits it out.
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

// After the restart: the Vest tabs still run the old page script (and a bridge cut off from the new worker), so reload them
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

// The worker calls this at its first turn: Chrome only wakes a worker for the events it listened to then.
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
        if (env.store) {
            env.runtime.onUpdateAvailable.addListener((d) => { storeReady(env, d); });
            storeAfter(env).catch(() => {});
        }
        // a new version reads the last good answer again ("below" may no longer apply), then asks the site
        getKey(env, REMOTE_KEY).then((r) => { if (isObj(r)) return writeActive(env, r.off); }).catch(() => {});
        remoteTick(env, false);
    } catch (e) {}
}

// sw.js's state handler: a Vest page said how it is (fresh answers for a page that just came up; an idle page may let a held update in)
export function remotePageState(st) {
    if (!started) return;
    remoteWake(started).catch(() => {});
    if (started.store && st && st.idle === true) storeApply(started).catch(() => {});
}
