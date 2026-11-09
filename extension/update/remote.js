/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { compareVersions } from './core.js';

export const FLAGS_URL = 'https://bv.astrals.dev/api/flags';
export const SWITCHES = Object.freeze(['all', 'copier', 'turbo', 'orders', 'close', 'stops', 'limits', 'tpsl', 'trail', 'autobe', 'accounts', 'lossclose', 'usage', 'voicecmd', 'wickauto', 'errors', 'wicktip']);
export const REMOTE_KEY = 'bvRemote';
export const REMOTE_OFF_KEY = 'bvRemoteOff';
export const STORE_ASK_KEY = 'bvStoreAsk';
export const STORE_PENDING_KEY = 'bvStorePending';
export const STORE_DONE_KEY = 'bvStoreDone';
export const STORE_UPDATED_KEY = 'bvStoreUpdated';
export const NEWS_KEY = 'bvNews';
export const WICKP_KEY = 'bvWickp';
export const RULES_KEY = 'bvRemoteRules';
const ALARM = 'bv-remote';
const AT_ALARM = 'bv-remote-at';
const EVERY_MIN = 3;
const STALE_MS = 60 * 1000;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 16 * 1024;
const STORE_ASK_GAP_MS = (5 * 60 + 10) * 60 * 1000;
const IDLE_FRESH_MS = 20 * 1000;
const VERSION_RE = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const VEST_TABS = ['https://next.vestmarkets.com/*'];

let STORE_EDITION = false;
let BUILD_EDITION = 'wicked';
BUILD_EDITION = 'standard';

let queue = Promise.resolve();
function serial(fn) {
    const run = queue.then(fn, fn).catch(() => false); /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-5036d4ae */
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
        const label = cleanText(n.link.label, 24); /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-e4beeb5c */
        if (label) link = { label, path: n.link.path };
    }
    return { id: n.id, title, text: cleanText(n.text, 240), start, end: n.end, link };
}

const WICKP_ARMS = ['p01', 'p02', 'p03', 'p05', 'p06', 'p07', 'p09', 'p10', 'p11', 'p12', 'p15'];
const WICKP_SEGS = ['newcomer', 'regular', 'copier'];
export function cleanWickp(x) {
    if (!isObj(x)) return null;
    const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    const arms = {}, value = {};
    const src = isObj(x.arms) ? x.arms : {};
    for (const a of WICKP_ARMS) {
        if (!isObj(src[a])) continue;
        const one = {};
        for (const s of WICKP_SEGS) {
            const p = src[a][s];
            if (Array.isArray(p) && p.length === 2 && num(p[0], 0.5, 500) && num(p[1], 0.5, 500)) one[s] = [p[0], p[1]];
        }
        if (Object.keys(one).length) arms[a] = one;
    }
    const vs = isObj(x.value) ? x.value : {};
    for (const a of WICKP_ARMS) if (num(vs[a], 0.01, 2)) value[a] = vs[a];
    if (!Object.keys(arms).length && !Object.keys(value).length) return null;
    return { asOf: typeof x.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.asOf) ? x.asOf : '', arms, value };
}

export function cleanVersion(v) {
    return typeof v === 'string' && VERSION_RE.test(v) ? v : null;
}

export const FEATURES = Object.freeze([
    ['all', 'all', 'use'],
    ['copier', 'copier', 'trade'], ['copier.flash', '', 'trade'], ['copier.light', '', 'trade'], ['copier.turbo', 'turbo', 'trade'],
    ['copier.limits', '', 'trade'], ['copier.stops', '', 'use'], ['copier.tpsl', '', 'exit'], ['copier.reduce', '', 'exit'],
    ['exec', '', 'trade'], ['exec.long-short', 'orders', 'trade'], ['exec.close', 'close', 'exit'], ['exec.pct', '', 'trade'], ['exec.risk', '', 'trade'],
    ['exec.whatif', '', 'use'], ['exec.partials', '', 'trade'], ['exec.trail', 'trail', 'exit'], ['exec.autobe', 'autobe', 'exit'],
    ['exec.stop', 'stops', 'trade'], ['exec.limit', 'limits', 'trade'], ['exec.alert', '', 'use'], ['exec.timeexit', '', 'exit'],
    ['exec.place', '', 'use'], ['exec.place.ticket', '', 'use'], ['exec.place.dock', '', 'use'],
    ['chart', '', 'use'], ['chart.tpsl', 'tpsl', 'exit'], ['chart.heatmap', '', 'use'], ['chart.labels', '', 'use'], ['chart.pencil', '', 'trade'],
    ['accounts', 'accounts', 'use'], ['accounts.switch', '', 'use'], ['accounts.manage', '', 'use'], ['accounts.payouts', '', 'use'],
    ['losslimit', '', 'use'], ['losslimit.close', 'lossclose', 'exit'],
    ['spend', '', 'use'], ['spend.counter', '', 'use'],
    ['wick', '', 'use'], ['wick.auto', 'wickauto', 'use'], ['wick.tip', 'wicktip', 'use'], ['wick.ask', '', 'use'],
    ['calendar', '', 'use'], ['share', '', 'use'], ['voice', '', 'use'], ['voicecmd', 'voicecmd', 'trade'], ['alerts', '', 'use'], ['news', '', 'use'],
    ['onboarding', '', 'use'], ['feedback', '', 'use'], ['usage', 'usage', 'use'], ['errors', 'errors', 'use']
]);
export const EDITIONS = Object.freeze(['standard', 'lite', 'nostats', 'wicked', 'store', 'mobile']);
export const CHANNELS = Object.freeze(['github', 'store', 'phone']);
export const SCOPES = Object.freeze(['new', 'all']); /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-afc4cf32 */
export const RULES_MAX = 40;
export const CASTS_MAX = 10;
export const ONLY_MAX = 12;
export const WARN_DEFAULT_MS = 30 * 60 * 1000;
export const WARN_MAX_MS = 24 * 3600 * 1000;
const NOT_IN_ALL = ['usage', 'errors'];
const KIND = new Map(FEATURES.map((x) => [x[0], x[2]]));
const OLD_TO_NEW = new Map(FEATURES.filter((x) => x[1]).map((x) => [x[1], x[0]]));

export function featureName(n) {
    if (typeof n !== 'string') return null;
    return KIND.has(n) ? n : OLD_TO_NEW.has(n) ? OLD_TO_NEW.get(n) : null;
}
export function featureKind(n) { return KIND.get(n) || null; }
export function featureFamily(n) {
    if (!KIND.has(n)) return [];
    if (n === 'all') return FEATURES.map((x) => x[0]).filter((x) => NOT_IN_ALL.indexOf(x) < 0);
    return FEATURES.map((x) => x[0]).filter((x) => x === n || x.startsWith(n + '.'));
}
export function featureReach(f, scope) {
    const fam = featureFamily(f);
    if (KIND.get(f) === 'exit' || scope === 'all' || !fam.some((x) => KIND.get(x) === 'trade')) return { off: fam, ex: fam };
    return { off: fam.filter((x) => x === f || KIND.get(x) === 'trade'), ex: [] };
}

const isMsAt = (x) => typeof x === 'number' && Number.isInteger(x) && x > 0 && x < 1e14;
export function readTargets(r) {
    const bad = { broken: true, from: null, below: null, only: null, ed: null, ch: null, none: false };
    if (!isObj(r)) return bad;
    const ver = (k) => (!own(r, k) || r[k] === null ? null : cleanVersion(r[k]) || false);
    const from = ver('from'), below = ver('below');
    if (from === false || below === false) return bad;
    let only = null;
    if (own(r, 'only') && r.only !== null) {
        if (!Array.isArray(r.only) || !r.only.length || r.only.length > ONLY_MAX || r.only.some((v) => !cleanVersion(v)) || from || below) return bad;
        only = r.only.slice();
    }
    if (from && below && compareVersions(from, below) >= 0) return bad;
    let none = false;
    const list = (k, known) => {
        if (!own(r, k) || r[k] === null) return null;
        if (!Array.isArray(r[k]) || !r[k].length || r[k].some((x) => typeof x !== 'string')) return false;
        const kept = r[k].filter((x) => known.indexOf(x) >= 0);
        if (!kept.length) none = true;
        return kept;
    /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-4ac425d3 */ };
    const ed = list('ed', EDITIONS), ch = list('ch', CHANNELS);
    if (ed === false || ch === false) return bad;
    return { broken: false, from, below, only, ed, ch, none };
}
export function targetsHit(t, me) {
    if (!t || t.broken) return true;
    if (t.none || !me) return false;
    const v = String(me.version || '');
    if (t.only && !t.only.some((x) => compareVersions(v, x) === 0)) return false;
    if (t.from && compareVersions(v, t.from) < 0) return false;
    if (t.below && compareVersions(v, t.below) >= 0) return false;
    if (t.ed && t.ed.indexOf(me.edition) < 0) return false;
    if (t.ch && t.ch.indexOf(me.channel) < 0) return false;
    return true;
}
export function parseRules(a) {
    if (!Array.isArray(a)) return [];
    const out = [];
    for (const r of a.slice(0, RULES_MAX)) {
        if (!isObj(r) || typeof r.f !== 'string' || !KIND.has(r.f)) continue;
        const at = own(r, 'at') && r.at !== null ? (isMsAt(r.at) ? r.at : 0) : 0;
        const warn = typeof r.warn === 'number' && Number.isFinite(r.warn) && r.warn >= 0 && r.warn <= WARN_MAX_MS ? Math.round(r.warn) : WARN_DEFAULT_MS;
        out.push({ f: r.f, why: cleanWhy(r.why), t: readTargets(r), update: r.update === true, scope: SCOPES.indexOf(r.scope) >= 0 ? r.scope : 'new', at, warn: at ? warn : 0 });
    }
    return out;
}
export function parseCasts(a) {
    if (!Array.isArray(a)) return [];
    const out = [];
    for (const c of a.slice(0, CASTS_MAX)) {
        if (!isObj(c) || typeof c.id !== 'string' || !NEWS_ID_RE.test(c.id) || !isMsAt(c.end)) continue;
        const text = cleanText(c.text, 240);
        if (!text) continue;
        out.push({ id: c.id, level: c.level === 'warn' ? 'warn' : 'info', text, start: isMsAt(c.start) && c.start < c.end ? c.start : null, end: c.end, t: readTargets(c) });
    }
    return out;
}
const LEGACY_REACH = { accounts: ['accounts', 'accounts.switch', 'accounts.payouts'] };
export function legacyReach(old) {
    if (old === 'all') {
        const s = new Set();
        /*! Owned by Astral (@ax4p): Better Vest standard 9.6.3. Licence: LICENSE, not open source. bv-293f495e */ for (const n of SWITCHES) if (n !== 'all' && NOT_IN_ALL.indexOf(n) < 0) for (const x of legacyReach(n)) s.add(x);
        return [...s];
    }
    return own(LEGACY_REACH, old) ? LEGACY_REACH[old].slice() : featureFamily(OLD_TO_NEW.get(old));
}
function itemOf(f, why, update, scope, at, warn, legacy, reach) {
    const r = reach || featureReach(f, scope);
    return { f, why, update: !!update, scope, at: at || 0, warn: at ? warn : 0, off: r.off, ex: r.ex, legacy: !!legacy };
}
export function planFor(got, me) {
    const items = [], casts = [];
    if (!isObj(got)) return { items, casts };
    for (const r of Array.isArray(got.rules) ? got.rules : []) {
        if (targetsHit(r.t, me)) items.push(itemOf(r.f, r.why, r.update, r.scope, r.at, r.warn, false));
    }
    const off = isObj(got.off) ? got.off : {};
    for (const name of SWITCHES) {
        const e = off[name];
        if (!isObj(e) || (e.below && compareVersions(me && me.version, e.below) >= 0)) continue;
        const reach = legacyReach(name);
        items.push(itemOf(OLD_TO_NEW.get(name), cleanWhy(e.why), false, 'all', 0, 0, true, { off: reach, ex: reach.slice() }));
    }
    for (const c of Array.isArray(got.casts) ? got.casts : []) {
        if (targetsHit(c.t, me)) casts.push({ id: c.id, level: c.level, text: c.text, start: c.start, end: c.end });
    }
    return { items, casts };
}
export function itemsNow(items, now) {
    return (Array.isArray(items) ? items : []).filter((x) => isObj(x) && !(x.at > now));
}
export function offNow(items, now) {
    const out = {};
    for (const x of itemsNow(items, now)) for (const n of x.off || []) if (!own(out, n)) out[n] = x.why;
    return out;
}
export function offItem(items, name, exit, now, rulesOnly) {
    const n = featureName(name);
    if (!n) return null;
    for (const x of itemsNow(items, now)) if (!(rulesOnly && x.legacy) && (exit ? x.ex : x.off || []).indexOf(n) >= 0) return x;
    return null;
}
export function itemsSoon(items, now) {
    return (Array.isArray(items) ? items : []).filter((x) => isObj(x) && x.at > now && now >= x.at - (x.warn || 0)).sort((a, b) => a.at - b.at);
}
export function nextStart(items, now) {
    let t = 0;
    for (const x of Array.isArray(items) ? items : []) if (isObj(x) && x.at > now && (!t || x.at < t)) t = x.at;
    return t;
}

export function parseFlags(json) {
    if (!isObj(json) || json.v !== 1) return null;
    if (own(json, 'off') && !isObj(json.off)) return null; /*! Copyright Astral 2026. From Better Vest 9.6.3 (standard), ref bv-1aeb4abd. Not licensed for reuse. */
    const src = isObj(json.off) ? json.off : {};
    const off = {};
    for (const name of SWITCHES) {
        if (!own(src, name)) continue;
        const e = src[name];
        off[name] = isObj(e) ? { why: cleanWhy(e.why), below: cleanVersion(e.below) } : { why: '', below: null };
    }
    let news = cleanNews(own(json, 'ownNews') ? json.ownNews : json.news);
    if (news && news.id.startsWith('w-')) news = null;
    return { off, store: cleanVersion(json.store), news, wickp: cleanWickp(json.wickp), rules: parseRules(json.rules), casts: parseCasts(json.casts) };
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
    /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-5ecde789 */ try {
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

export function meOf(env) {
    return { version: String(env.version || ''), edition: env.edition || (env.store ? 'store' : BUILD_EDITION), channel: env.channel || (env.store ? 'store' : 'github') };
}

async function writeActive(env, got) {
    const plan = planFor({ off: isObj(got) && isObj(got.off) ? got.off : {}, rules: isObj(got) ? got.rules : [], casts: isObj(got) ? got.casts : [] }, meOf(env));
    const t = env.now();
    const now = offNow(plan.items, t);
    const cur = await getKey(env, REMOTE_OFF_KEY);
    const rules = { items: plan.items, casts: plan.casts, ch: meOf(env).channel };
    const curRules = await getKey(env, RULES_KEY);
    const sets = {};
    if (JSON.stringify(isObj(curRules) ? curRules : null) !== JSON.stringify(rules)) sets[RULES_KEY] = rules;
    if (JSON.stringify(isObj(cur) ? cur : {}) !== JSON.stringify(now)) sets[REMOTE_OFF_KEY] = now;
    if (Object.keys(sets).length) await env.storage.set(sets);
    const next = nextStart(plan.items, t);
    try {
        if (next && env.alarms) env.alarms.create(AT_ALARM, { when: next + 500 });
        else if (env.alarms && typeof env.alarms.clear === 'function') Promise.resolve(env.alarms.clear(AT_ALARM)).catch(() => {});
    } catch (e) {}
    return now;
}

async function writeWickp(env, wickp) {
    const now = cleanWickp(wickp);
    const cur = await getKey(env, WICKP_KEY);
    if (JSON.stringify(cur === undefined ? null : cur) !== JSON.stringify(now)) await env.storage.set({ [WICKP_KEY]: now });
    return now;
}

async function writeNews(env, news) {
    const now = cleanNews(news);
    const cur = await getKey(env, NEWS_KEY);
    if (JSON.stringify(cur === undefined ? null : cur) !== JSON.stringify(now)) await env.storage.set({ [NEWS_KEY]: now });
    return now;
}

let lastTry = 0;

export function remoteTick(env, force) {
    return serial(async () => {
        if (!force) {
            const tabs = await env.tabs.query({ url: VEST_TABS });
            if (!Array.isArray(tabs) || !tabs.length) return false;
        }
        lastTry = env.now();
        const got = await fetchFlags(env);
        /* @license Better Vest 9.6.3. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-70d78818 */ if (!got) return false;
        await env.storage.set({ [REMOTE_KEY]: { at: env.now(), off: got.off, store: got.store, news: got.news, wickp: got.wickp, rules: got.rules, casts: got.casts } });
        await writeActive(env, got);
        await writeNews(env, got.news);
        await writeWickp(env, got.wickp);
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
    await env.storage.set({ [STORE_ASK_KEY]: { v: served, at: env.now() } });
    try {
        const r = await env.runtime.requestUpdateCheck();
        return isObj(r) && typeof r.status === 'string' ? r.status : 'no-answer';
    } catch (e) {
        return 'error';
    }
}

export async function storeReady(env, details) {
    const v = cleanVersion(details && details.version); /* @license Better Vest 9.6.3. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-d177f2c2 */
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

/* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-346a677b */ function defaultEnv() {
    const m = chrome.runtime.getManifest();
    return {
        version: m.version, store: STORE_EDITION, storeInstall: own(m, 'update_url'), runtime: chrome.runtime, storage: chrome.storage.local,
        edition: STORE_EDITION ? 'store' : BUILD_EDITION, channel: STORE_EDITION || own(m, 'update_url') ? 'store' : 'github',
        alarms: chrome.alarms, tabs: chrome.tabs, fetchFn: (u, o) => fetch(u, o), now: () => Date.now(),
        tabState: async (id) => { const k = 'tab:' + id; const got = await chrome.storage.session.get(k); return got ? got[k] : null; }
    };
}

let started = null;

export function remoteStart(env = defaultEnv()) {
    started = env;
    try {
        env.alarms.onAlarm.addListener((a) => {
            if (a && a.name === AT_ALARM) { serial(() => getKey(env, REMOTE_KEY).then((r) => writeActive(env, r))); return; }
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
        getKey(env, REMOTE_KEY).then((r) => { if (isObj(r)) return writeActive(env, r).then(() => writeNews(env, r.news)).then(() => writeWickp(env, r.wickp)); }).catch(() => {});
        remoteTick(env, false);
    } catch (e) {}
}

export function remotePageState(st) {
    if (!started) return;
    remoteWake(started).catch(() => {});
    if (started.store && st && st.idle === true) storeApply(started).catch(() => {});
}
