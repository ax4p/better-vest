/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

export const COUNT_EDITION = 'nostats';
const SENT_KEY = 'bvCountSent';
const ID_KEY = 'bvCountId'; /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-ee17a759 */
const HB_ALARM = 'bv-count-hb';
const USE_ALARM = 'bv-count-use';
const USAGE_KEY = 'bvUsage';
const USE_DAY_KEY = 'bvUseDay';
const USE_PREV_KEY = 'bvUsePrev';

let queue = Promise.resolve();
function serial(fn) {
    const run = queue.then(fn, fn).catch(() => false);
    queue = run;
    return run;
}

export function forgetHeartbeat(env) {
    return serial(async () => {
        try { await env.alarms.clear(HB_ALARM); } catch (e) {}
        try { await env.alarms.clear(USE_ALARM); } catch (e) {}
        await env.storage.remove([ID_KEY, SENT_KEY, USAGE_KEY, USE_DAY_KEY, USE_PREV_KEY]);
        return true;
    });
}

/*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-832ab180 */ function defaultEnv() {
    return {
        version: chrome.runtime.getManifest().version, edition: COUNT_EDITION, runtime: chrome.runtime, storage: chrome.storage.local,
        alarms: chrome.alarms, tabs: chrome.tabs, fetchFn: (u, o) => fetch(u, o), cryptoObj: crypto
    };
}

export function countStart(env = defaultEnv()) {
    try {
        forgetHeartbeat(env);
    } catch (e) {}
}
