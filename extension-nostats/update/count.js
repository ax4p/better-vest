// Better Vest by Astral - usage counts (9.0.1). The public editions and the WICKED zip carry this file: tools/build.py copies it from
// src/public/ to update/count.js and fills in the edition. DEV, the userscript and the WICKED working folder (better-vest/) never count.
// The worker starts it (sw.js, countStart).
//
// What goes out, and nothing more (the site's src/lib/count.ts takes exactly two shapes and drops anything else):
//   install    {"k":"i","v":"9.0.1","e":"standard"}   once after an install, and once after each update or edition switch (every edition)
//   heartbeat  the version, the edition and a random id, every 3 minutes while a Vest tab is open (Standard, Lite and WICKED; below)
// One POST of plain text to https://bv.astrals.dev/api/count: a simple request (no preflight), no cookies, never retried, its answer
// never read, every error swallowed. No new permission: the site answers with Access-Control-Allow-Origin.
// The No stats edition has no heartbeat and no id (the build cuts them out: the STATS markers); switched to No stats on the update page, it deletes
// the id a Standard or Lite copy left and stops that copy's alarm.

export const COUNT_URL = 'https://bv.astrals.dev/api/count';
export const COUNT_EDITION = 'nostats';
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const COUNT_EDITIONS = ['standard', 'lite', 'nostats', 'wicked'];
// the version and edition whose install was counted last ("9.0.1:lite"): a worker that starts again never counts it twice
const SENT_KEY = 'bvCountSent';
// the heartbeat's id and alarm, named out here so that No stats can delete what a Standard or Lite copy left behind
const ID_KEY = 'bvCountId';
const HB_ALARM = 'bv-count-hb';

// one step at a time: onInstalled and the worker's own start both ask at the first start, and only one may count
let queue = Promise.resolve();
function serial(fn) {
    const run = queue.then(fn, fn).catch(() => false);
    queue = run;
    return run;
}

export function installBody(version, edition) {
    if (!VERSION_RE.test(String(version)) || COUNT_EDITIONS.indexOf(edition) < 0) return null;
    return JSON.stringify({ k: 'i', v: version, e: edition });
}

// fire and forget
export function post(fetchFn, body) {
    if (typeof body !== 'string') return;
    try {
        const r = fetchFn(COUNT_URL, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', cache: 'no-store', keepalive: true, referrerPolicy: 'no-referrer' });
        if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) {}
}

// The install count: once per install, and once per new version or edition (a switch on the update page installs another edition).
// Written down before it goes out, so a failed send is lost rather than sent again.
export function countInstall(env) {
    return serial(async () => {
        const body = installBody(env.version, env.edition);
        if (!body) return false;
        const mark = env.version + ':' + env.edition;
        const got = await env.storage.get(SENT_KEY);
        if (got && got[SENT_KEY] === mark) return false;
        await env.storage.set({ [SENT_KEY]: mark });
        post(env.fetchFn, body);
        return true;
    });
}

// No stats has no heartbeat: what a Standard or Lite copy left behind (switched to No stats on the update page) goes
export function forgetHeartbeat(env) {
    return serial(async () => {
        try { await env.alarms.clear(HB_ALARM); } catch (e) {}
        await env.storage.remove(ID_KEY);
        return true;
    });
}

function defaultEnv() {
    return {
        version: chrome.runtime.getManifest().version, edition: COUNT_EDITION, runtime: chrome.runtime, storage: chrome.storage.local,
        alarms: chrome.alarms, tabs: chrome.tabs, fetchFn: (u, o) => fetch(u, o), cryptoObj: crypto
    };
}

// The worker calls this at its first turn: Chrome only wakes a worker for the events it listened to then.
export function countStart(env = defaultEnv()) {
    try {
        env.runtime.onInstalled.addListener((d) => { if (d && (d.reason === 'install' || d.reason === 'update')) countInstall(env); });
        forgetHeartbeat(env);
        // a worker that missed onInstalled (an update written by update.html restarts it) counts here; once per version and edition either way
        countInstall(env);
    } catch (e) {}
}
