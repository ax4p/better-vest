/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import * as T from './time.js';
import * as stats from './stats.js';
import * as model from './model.js';
import * as DB from './db.js';
import { THEMES, themeVarsCss, themeKnown, customTheme } from './theme-tokens.js';
import * as ui from './ui.js';
import * as charts from './charts.js';
import * as calendar from './views/calendar.js';
import * as drawer from './views/drawer.js';
/* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-9bda4ba0 */ import * as statsView from './views/stats.js';
import * as tradesView from './views/trades.js';
import * as payoutsView from './views/payouts.js';
import * as accountsView from './views/accounts.js';

const { h, icon } = ui;

export const TABS = [
    { id: 'calendar', label: 'Calendar', mod: calendar },
    { id: 'stats', label: 'Stats', mod: statsView },
    { id: 'trades', label: 'Trades', mod: tradesView },
    { id: 'payouts', label: 'Payouts', mod: payoutsView },
    { id: 'accounts', label: 'Accounts', mod: accountsView }
];

const HAS_CHROME = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const FX = (location.hash.includes('fixture') || !HAS_CHROME) ? await import('./fixture.js').catch(() => null) : null;
const DEV = !!FX;
const buildFixture = FX ? FX.buildFixture : null;
const FIXTURE_NOW = FX ? FX.FIXTURE_NOW : 0;
const PREF_KEY = 'bv-journal-prefs';
const UNITS = ['usd', 'pct', 'pts', 'r'];
const ALWAYS_STARS = new Set(['starfield']);

const DEFAULTS = {
    tab: 'calendar', month: null, day: null, wide: false, scope: 'all', accounts: null, symbols: [], sides: [], exits: [], tags: [],
    excludeTest: true, unit: 'usd', basis: 'net', lens: 'pnl', hide: false, mode: 'vest', line: 'nwr', payBasis: 'executed', sel: null
};
const PREF_KEYS = ['unit', 'basis', 'hide', 'mode', 'line', 'payBasis'];


const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {  } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {  } }
};
const loadPrefs = () => { try { return JSON.parse(ls.get(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } };
const prefs = loadPrefs();
const savePrefs = () => ls.set(PREF_KEY, JSON.stringify(prefs));


const state = { ...DEFAULTS };
for (const k of PREF_KEYS) if (prefs[k] != null) state[k] = prefs[k];

const csv = (v) => (v == null ? [] : String(v).split(',').filter(Boolean));

function parseHash(raw) {
    const hs = raw.replace(/^#/, '');
    const [path, qs = ''] = hs.split('?');
    const parts = path.split('/').filter(Boolean);
    const q = new URLSearchParams(qs);
    const p = {};
    if (parts[0] && TABS.some((t) => t.id === parts[0])) p.tab = parts[0];
    if (parts[1] && /^\d{4}-\d{2}$/.test(parts[1])) p.month = parts[1];
    if (q.has('scope') && ['all', 'funded', 'eval', 'primary'].includes(q.get('scope'))) p.scope = q.get('scope');
    if (q.has('acc')) p.accounts = q.get('acc') === '-' ? [] : csv(q.get('acc'));
    if (q.has('sym')) p.symbols = csv(q.get('sym'));
    if (q.has('side')) p.sides = csv(q.get('side'));
    if (q.has('exit')) p.exits = csv(q.get('exit'));
    if (q.has('tag')) p.tags = csv(q.get('tag'));
    if (q.has('test')) p.excludeTest = q.get('test') !== '0';
    if (q.has('u') && UNITS.includes(q.get('u'))) p.unit = q.get('u');
    if (q.has('b') && ['net', 'gross'].includes(q.get('b'))) p.basis = q.get('b');
    if (q.has('lens') && ['pnl', 'pay'].includes(q.get('lens'))) p.lens = q.get('lens');
    if (q.has('hide')) p.hide = q.get('hide') === '1';
    if (q.has('dm') && T.DAY_MODES[q.get('dm')]) p.mode = q.get('dm');
    if (q.has('line')) p.line = q.get('line');
    if (q.has('pb') && ['executed', 'requested'].includes(q.get('pb'))) p.payBasis = q.get('pb');
    if (q.has('d') && /^\d{4}-\d{2}-\d{2}$/.test(q.get('d'))) p.day = q.get('d');
    if (q.has('w')) p.wide = q.get('w') === '1'; /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-5066187a */
    if (q.has('rng')) { const [a, b] = q.get('rng').split('..'); if (a && b) p.sel = [a, b]; }
    return p;
}

function serializeHash() {
    const q = new URLSearchParams();
    const D = DEFAULTS;
    if (state.scope !== D.scope) q.set('scope', state.scope);
    if (state.accounts) q.set('acc', state.accounts.length ? state.accounts.join(',') : '-');
    if (state.symbols.length) q.set('sym', state.symbols.join(','));
    if (state.sides.length) q.set('side', state.sides.join(','));
    if (state.exits.length) q.set('exit', state.exits.join(','));
    if (state.tags.length) q.set('tag', state.tags.join(','));
    if (!state.excludeTest) q.set('test', '0');
    if (state.unit !== D.unit) q.set('u', state.unit);
    if (state.basis !== D.basis) q.set('b', state.basis);
    if (state.lens !== D.lens) q.set('lens', state.lens);
    if (state.hide) q.set('hide', '1');
    if (state.mode !== D.mode) q.set('dm', state.mode);
    if (state.line !== D.line) q.set('line', state.line);
    if (state.payBasis !== D.payBasis) q.set('pb', state.payBasis);
    if (state.day) q.set('d', state.day);
    if (state.wide) q.set('w', '1');
    if (state.sel) q.set('rng', state.sel.join('..'));
    if (DEV) q.set('fixture', '1');
    const qs = q.toString();
    return '#/' + state.tab + (state.month ? '/' + state.month : '') + (qs ? '?' + qs : '');
}

let writingHash = false;
function writeHash(replace = true) {
    const hs = serializeHash(); /*! Copyright (c) 2026 Astral. Better Vest 9.3.0 is licensed to its users only to run it, never to copy it. bv-622e9401 */
    if (hs === location.hash) return;
    writingHash = true;
    try { history[replace ? 'replaceState' : 'pushState'](null, '', hs); } catch (e) { location.hash = hs; }
    setTimeout(() => { writingHash = false; }, 0);
}


const t0 = performance.now();
const now = () => (DEV ? FIXTURE_NOW + (performance.now() - t0) : Date.now());
const todayKey = () => T.dayKey(now(), state.mode);


let settingsTheme = null;
let settingsCustom = null;
let themeOverride = ls.get('bv-journal-theme-override') || '';
if (themeOverride && (themeOverride === 'custom' || !themeKnown(themeOverride))) { themeOverride = ''; ls.del('bv-journal-theme-override'); }
const followName = () => (themeKnown(settingsTheme) ? settingsTheme : settingsTheme ? 'dark' : 'astral');
const themeName = () => (themeOverride && themeKnown(themeOverride) ? themeOverride : followName());
const themeDef = (name) => (name === 'custom' ? customTheme(settingsCustom) : THEMES[name]);
const themeInfo = { name: 'astral', def: THEMES.astral, light: false };

function intensityCss(name) {
    const mx = (stats.INTENSITY_MAX && stats.INTENSITY_MAX[name]) || 30;
    const steps = stats.INTENSITY_STEPS || [0.17, 0.33, 0.54, 0.77, 1];
    const m = steps.map((s, i) => `--j-m${i + 1}: ${(s * mx).toFixed(2)}%;`).join(' ');
    return `:root { ${m} }`;
}

function applyTheme() {
    const name = themeName();
    const def = themeDef(name);
    themeInfo.name = name; themeInfo.def = def; themeInfo.light = !!def.light;
    const css = themeVarsCss(def) + intensityCss(name);
    let style = document.getElementById('theme-vars');
    if (!style) { style = document.createElement('style'); style.id = 'theme-vars'; document.head.appendChild(style); }
    style.textContent = css;
    document.documentElement.setAttribute('data-theme', name);
    ls.set('bv-journal-theme', name);
    ls.set('bv-journal-themecss', css);
    paintStars();
}


const SF_TYPES = [['dot', 64], ['plus', 10], ['spark', 18], ['hollow', 8]];
function sfRand(seed) {
    let t = seed + 0x6d2b79f5;
    return () => { /*! Copyright Astral 2026. From Better Vest 9.3.0 (nostats), ref bv-8f9faae5. Not licensed for reuse. */
        t = (t + 0x6d2b79f5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}
function buildStars(w, h) {
    const rnd = sfRand(4242);
    const n = Math.round((w * h) / 2600 * 0.6);
    const total = SF_TYPES.reduce((a, t) => a + t[1], 0);
    const out = [];
    for (let i = 0; i < n; i++) {
        let pick = rnd() * total, type = 'dot';
        for (const [k, wgt] of SF_TYPES) { if ((pick -= wgt) <= 0) { type = k; break; } }
        const tier = rnd();
        out.push({
            x: rnd() * w, y: rnd() * h, type,
            size: type === 'dot' ? 0.6 + rnd() * 1.1 : 2 + rnd() * 2.6,
            a: tier < 0.4 ? 0.22 + rnd() * 0.18 : tier < 0.8 ? 0.45 + rnd() * 0.25 : 0.78 + rnd() * 0.22
        });
    }
    return out;
}
function paintStars() {
    const c = document.getElementById('stars');
    if (!c) return;
    const on = ALWAYS_STARS.has(themeInfo.name) && prefs.stars !== false;
    c.classList.toggle('on', on);
    if (!on) return;
    const w = window.innerWidth, hh = window.innerHeight, dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    for (const s of buildStars(w, hh)) {
        g.fillStyle = g.strokeStyle = `rgba(255,255,255,${s.a.toFixed(3)})`;
        const { x, y, size } = s;
        if (s.type === 'dot') { g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill(); continue; }
        g.lineWidth = 0.9;
        g.beginPath();
        if (s.type === 'plus') { g.moveTo(x - size, y); g.lineTo(x + size, y); g.moveTo(x, y - size); g.lineTo(x, y + size); g.stroke(); continue; }
        const k = size * 0.28;
        g.moveTo(x, y - size); g.quadraticCurveTo(x + k, y - k, x + size, y); g.quadraticCurveTo(x + k, y + k, x, y + size);
        g.quadraticCurveTo(x - k, y + k, x - size, y); g.quadraticCurveTo(x - k, y - k, x, y - size);
        if (s.type === 'spark') g.fill(); else g.stroke();
    }
}


const data = { accounts: [], trades: [], payouts: [], symbols: [], notes: [], meta: {} };
let dataVer = 0;
let db = null;
let userId = null;
const sync = { state: 'idle', done: 0, total: 0, phase: '', at: null, error: null, msg: '' }; /* (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-cff14bcf */
let loaded = false;
let loadError = null;
let syncPulse = false;

const chromeGet = (keys) => (HAS_CHROME && chrome.storage && chrome.storage.local
    ? chrome.storage.local.get(keys).catch(() => ({})) : Promise.resolve({}));

async function openUserDb() {
    if (db) return db;
    const got = await chromeGet(['journalLastUser']);
    let id = got.journalLastUser;
    if (!id) { const ids = await DB.listUserIds().catch(() => []); id = ids[0]; }
    if (!id) return null;
    userId = String(id);
    db = await DB.openDb(userId);
    return db;
}

async function loadData() {
    if (DEV) {
        const fx = buildFixture();
        const forced = (location.hash.match(/state=(\w+)/) || [])[1];
        if (forced === 'cold' || forced === 'syncing') { fx.accounts = []; fx.trades = []; fx.payouts = []; fx.notes = []; }
        Object.assign(data, fx);
        sync.at = fx.meta.lastSync;
        if (forced === 'syncing') { sync.state = 'syncing'; sync.done = 23; sync.total = 71; }
        else if (['offline', 'session', 'error'].includes(forced)) { sync.state = forced; sync.msg = forced === 'error' ? 'Vest asked us to slow down (429)' : ''; }
        if (forced === 'empty') data.trades = [];
    } else {
        try {
            const d = await openUserDb();
            if (!d) { data.accounts = []; data.trades = []; data.payouts = []; data.symbols = []; data.notes = []; data.meta = {}; }
            else {
                /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-fab3afba */ const [accounts, trades, payouts, symbols, notes, lastSync, lastFull, testIds] = await Promise.all([
                    DB.getAll(d, 'accounts'), DB.getAll(d, 'trades'), DB.getAll(d, 'payouts'), DB.getAll(d, 'symbols'), DB.getAll(d, 'notes'),
                    DB.getMeta(d, 'lastSync'), DB.getMeta(d, 'lastFullSync'), DB.getMeta(d, 'testTradeIds')
                ]);
                Object.assign(data, { accounts, trades, payouts, symbols, notes });
                data.meta = { lastSync: lastSync ?? lastFull ?? null, testTradeIds: testIds || [] };
                if (!sync.at && data.meta.lastSync) sync.at = data.meta.lastSync;
                if (!sync.at && accounts.length) sync.at = Math.max(0, ...accounts.map((a) => a.syncedAt || a.updatedAt || 0)) || null;
                await mergeMirroredNotes();
            }
            loadError = null;
        } catch (e) {
            loadError = e;
            console.warn('journal: load failed', e);
        }
    }
    dataVer++;
    loaded = true;
}

async function mergeMirroredNotes() {
    if (!userId) return;
    const got = await chromeGet(['journalNotes:' + userId]);
    const mirror = got['journalNotes:' + userId];
    if (!mirror || typeof mirror !== 'object') return;
    const have = new Map(data.notes.map((n) => [n.key, n]));
    for (const n of Object.values(mirror)) {
        if (n && n.key && (!have.get(n.key) || (have.get(n.key).updatedAt || 0) < (n.updatedAt || 0))) have.set(n.key, n);
    }
    data.notes = [...have.values()];
}


let memo = { sig: '', v: null };
const rule = { kind: 'tick' };

function derive() {
    const s = state;
    const sig = [dataVer, s.scope, s.accounts ? s.accounts.join(',') : '*', s.symbols, s.sides, s.exits, s.tags, s.excludeTest, s.mode, s.basis, s.payBasis, noteVer].join('|'); /* Copyright Astral 2026. From Better Vest 9.3.0 (nostats), ref bv-3345226b. Not licensed for reuse. */
    if (memo.sig === sig) return memo.v;
    const accountsById = new Map(data.accounts.map((a) => [a.id, a]));
    const symbolsMap = new Map(data.symbols.map((x) => [x.symbol, x]));
    const notesByKey = new Map(data.notes.map((n) => [n.key, n]));
    const fctx = { accountsById, notesByKey, testTradeIds: data.meta.testTradeIds };
    const filtered = stats.filterTrades(data.trades, {
        scope: s.scope, accounts: s.accounts ? (s.accounts.length ? s.accounts : ['__none__']) : null,
        symbols: s.symbols, sides: s.sides, exits: s.exits, tags: s.tags, excludeTest: s.excludeTest, mode: s.mode
    }, fctx);
    const days = stats.aggregateDays(filtered, { mode: s.mode, basis: s.basis, rule, symbolsMap, accountsById });
    const tradesById = new Map(filtered.map((t) => [t.id, t]));
    const symbolsInScope = new Set(filtered.map((t) => t.symbol));
    const phases = { funded: ['funded', 'instant'], eval: ['eval'], primary: ['primary'] }[s.scope];
    const accSet = s.accounts ? new Set(s.accounts) : null;
    const payouts = data.payouts.filter((p) => {
        const a = accountsById.get(p.accountId);
        if (phases && !(a && phases.includes(a.phase))) return false;
        if (accSet && !accSet.has(p.accountId)) return false;
        return true;
    });
    const payDays = stats.payoutDays(payouts, s.payBasis);
    let hasR = false;
    for (const t of filtered) if (t.rMult != null) { hasR = true; break; }
    const unitOk = { usd: true, pct: true, pts: symbolsInScope.size <= 1 && filtered.length > 0, r: hasR };
    const v = {
        filtered, days, tradesById, payouts, payDays, accountsById, symbolsMap, notesByKey, symbolsInScope, unitOk, fctx,
        kpiOpts(extra) {
            const single = s.accounts && s.accounts.length === 1 ? accountsById.get(s.accounts[0]) : null;
            return {
                mode: s.mode, basis: s.basis, rule, symbolsMap, accountsById,
                singleAccount: single && single.kind === 'capital' ? single : null,
                focusSymbol: s.symbols.length === 1 ? s.symbols[0] : undefined, ...extra
            };
        }
    };
    memo = { sig, v };
    return v;
}
let noteVer = 0;


const BULLETS = '••••';
const fmt = {
    usd(v, { ctx = 'table', base, sign = true } = {}) {
        if (v == null || !isFinite(v)) return '—';
        if (state.hide) return base > 0 ? T.fmtPct(v / base, { sign }) : BULLETS;
        return T.fmtUsd(v, { ctx, sign });
    }, /*! All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-cdb46575 */
    unitValue(v, unit, { ctx = 'cell', base, sign = true } = {}) {
        if (v == null || !isFinite(v)) return '—';
        if (unit === 'pct') return T.fmtPct(v, { sign });
        if (unit === 'pts') return T.fmtPts(v, { dp: 1, unit: false, sign });
        if (unit === 'r') return T.fmtR(v, { sign });
        return fmt.usd(v, { ctx, base, sign });
    },
    pct: T.fmtPct, pts: T.fmtPts, r: T.fmtR, num: T.fmtNum, count: T.fmtCount, rate: T.fmtRate, dur: T.fmtDur,
    timeET: T.fmtTimeET, date: T.fmtDate, bullets: BULLETS
};


async function saveNote(key, patch) {
    const prev = data.notes.find((n) => n.key === key) || { key, text: '', tags: [], mood: undefined, planFollowed: undefined };
    const next = { ...prev, ...patch, key, updatedAt: Date.now() };
    const empty = !next.text && !(next.tags && next.tags.length) && next.mood == null && next.planFollowed == null;
    data.notes = data.notes.filter((n) => n.key !== key);
    if (!empty) data.notes.push(next);
    noteVer++;
    if (!DEV && db) {
        try { if (empty) await DB.del(db, 'notes', key); else await DB.put(db, 'notes', next); } catch (e) { console.warn('journal: note save failed', e); }
        try {
            if (HAS_CHROME && chrome.storage && userId) {
                const mk = 'journalNotes:' + userId;
                const got = (await chromeGet([mk]))[mk] || {};
                if (empty) delete got[key]; else got[key] = next;
                await chrome.storage.local.set({ [mk]: got });
            }
        } catch (e) {  }
    }
    if (view && view.update) view.update(ctx);
    return next;
}
const noteFor = (key) => data.notes.find((n) => n.key === key) || null;


const ctx = {
    data, state, fmt, stats, time: T, model, ui, charts, h, dev: DEV, sync, theme: themeInfo,
    now, todayKey, derived: derive, noteFor, saveNote, TABS,
    get syncPulse() { return syncPulse; },
    set(patch, opts = {}) { applyState(patch, opts); },
    openDrawer(key) { applyState({ day: key, sel: null }, { push: false }); },
    closeDrawer() { applyState({ day: null }); },
    shiftMonth(n) { goMonth(T.shiftMonth(state.month, n)); },
    goToday() { goMonth(T.monthKey(todayKey()), true); },
    exportCsv, syncNow
};


let view = null, viewId = null, drawerView = null;
const dom = {};
let filterSig = '';
let clockEl = null;

function normalizeState() {
    if (!UNITS.includes(state.unit)) state.unit = 'usd';
    const D = derive();
    if (!D.unitOk[state.unit]) state.unit = 'usd';
    if (!state.month) {
        const tk = todayKey();
        let ym = T.monthKey(tk);
        if (!D.days.size) {  }
        else if (![...D.days.keys()].some((k) => k.startsWith(ym))) ym = T.monthKey([...D.days.keys()].sort().pop());
        state.month = ym;
    /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-62497307 */ }
}

function applyState(patch, { push = false, force = false } = {}) {
    let changed = force;
    for (const k of Object.keys(patch)) {
        if (JSON.stringify(state[k]) !== JSON.stringify(patch[k])) { state[k] = patch[k]; changed = true; }
    }
    if (!changed) return;
    for (const k of PREF_KEYS) if (k in patch) prefs[k] = state[k];
    if (PREF_KEYS.some((k) => k in patch)) savePrefs();
    if ('mode' in patch && db) DB.putMeta(db, 'dayMode', state.mode).catch(() => {});
    normalizeState();
    render('tab' in patch);
    writeHash(!push);
}

function goMonth(ym, jump) {
    if (ym === state.month) return;
    const swap = () => applyState({ month: ym, sel: null }, { push: false }); /* Copyright (c) 2026 Astral. Better Vest 9.3.0 is licensed to its users only to run it, never to copy it. bv-281f4bea */
    if (document.startViewTransition && !ui.reducedMotion() && document.visibilityState === 'visible') {
        try { const t = document.startViewTransition(swap); t.ready.catch(() => {}); t.finished.catch(() => {}); return; } catch (e) {  }
    }
    swap();
}

function syncText() {
    if (loadError) return { cls: 'warn', text: 'Cannot read local data' };
    const s = sync;
    if (s.state === 'syncing') return { cls: 'busy', text: s.total ? `Syncing ${s.done}/${s.total}` : 'Syncing…' };
    if (s.state === 'offline') return { cls: 'warn', text: 'Open Vest to refresh' };
    if (s.state === 'session') return { cls: 'warn', text: 'Open the Vest tab once to refresh its session' };
    if (s.state === 'error') return { cls: 'warn', text: 'Sync problem · Retry' };
    if (s.state === 'partial') return { cls: 'warn', text: 'Partly synced · Retry' };
    if (!s.at) return { cls: 'idle', text: DEV ? 'Fixture data' : 'Not synced' };
    const age = now() - s.at;
    if (DEV) return { cls: '', text: 'synced ' + T.fmtAgo(s.at, now()) };
    if (age > 6 * 36e5) return { cls: 'warn', text: 'Updated ' + T.fmtAgo(s.at, now()) + ' · Sync' };
    return { cls: '', text: 'synced ' + T.fmtAgo(s.at, now()) };
}

function buildTopbar() {
    const st = syncText();
    const single = TABS.length === 1;
    const pill = h('button', { class: 'pill ' + st.cls, type: 'button', title: 'Sync now (S)', onclick: () => syncNow('manual') }, h('i', { class: 'dot' }), h('span', null, st.text));
    return [
        h('div', { class: 'brand' },
            h('span', { class: 'logo bv-tile', style: '--t:26px', role: 'img', 'aria-label': 'Better Vest' }, h('span', { class: 'bv-b' }, h('i'))),
            h('b', null, 'Calendar'),
            h('small', null, 'Better Vest · Astral')),
        single ? null : h('nav', { class: 'tabs' }, TABS.map((t, i) => h('button', {
            class: 'tab' + (t.id === state.tab ? ' on' : ''), type: 'button', onclick: () => switchTab(t.id)
        }, t.label, h('kbd', null, String(i + 1))))),
        h('div', { class: 'grow' }),
        pill,
        h('button', { class: 'icon-btn', type: 'button', title: 'Theme', 'aria-label': 'Theme', onclick: (e) => themeMenu(e.currentTarget) }, icon('palette', 17)),
        h('button', { class: 'icon-btn', type: 'button', title: 'Settings', 'aria-label': 'Settings', onclick: (e) => settingsMenu(e.currentTarget) }, icon('sliders', 17))
    ];
}

function updatePill() {
    const pill = dom.topbar && dom.topbar.querySelector('.pill');
    if (!pill) { renderTopbar(); return; }
    const st = syncText();
    pill.className = 'pill ' + st.cls;
    const span = pill.querySelector('span');
    if (span) span.textContent = st.text;
    dom.hair.classList.toggle('on', sync.state === 'syncing');
    dom.hair.classList.toggle('indet', sync.state === 'syncing' && !sync.total);
    dom.hair.style.setProperty('--p', sync.total ? Math.max(0.04, sync.done / sync.total).toFixed(3) : '0.06');
}

/* Owned by Astral (@ax4p): Better Vest nostats 9.3.0. Licence: LICENSE, not open source. bv-63e5ef2a */ function renderTopbar() {
    ui.clear(dom.topbar);
    ui.append(dom.topbar, buildTopbar());
    dom.hair.classList.toggle('on', sync.state === 'syncing');
    dom.hair.classList.toggle('indet', sync.state === 'syncing' && !sync.total);
    dom.hair.style.setProperty('--p', sync.total ? Math.max(0.04, sync.done / sync.total).toFixed(3) : '0.06');
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function scopeLabel() {
    return { all: 'All', funded: 'Funded', eval: 'Evaluation', primary: 'Primary' }[state.scope];
}

function buildFilters() {
    const D = derive();
    const c = [];
    c.push(ui.seg({
        options: [{ k: 'all', label: 'All' }, { k: 'funded', label: 'Funded', title: 'Funded and Instant accounts' }, { k: 'eval', label: 'Evaluation' }, { k: 'primary', label: 'Primary' }],
        value: state.scope, label: 'Account scope', onChange: (k) => applyState({ scope: k, accounts: null })
    }));
    c.push(menuButton(accountsLabel(), state.accounts != null, (btn) => accountsMenu(btn)));
    c.push(menuButton(state.symbols.length ? (state.symbols.length === 1 ? state.symbols[0] : state.symbols.length + ' symbols') : 'Symbol', state.symbols.length > 0, (btn) => symbolsMenu(btn)));
    c.push(menuButton(state.sides.length === 1 ? cap(state.sides[0]) : 'Side', state.sides.length > 0, (btn) => simpleMenu(btn, 'Side', [{ k: 'long', label: 'Long' }, { k: 'short', label: 'Short' }], state.sides, 'sides')));
    c.push(menuButton(state.exits.length ? state.exits.length === 1 ? model.exitLabel(state.exits[0]) : state.exits.length + ' exits' : 'Exit', state.exits.length > 0, (btn) => exitsMenu(btn)));
    c.push(menuButton(state.tags.length ? (state.tags.length === 1 ? '#' + state.tags[0] : state.tags.length + ' tags') : 'Tags', state.tags.length > 0, (btn) => tagsMenu(btn)));
    c.push(ui.chip('Exclude test', { on: state.excludeTest, onClick: () => applyState({ excludeTest: !state.excludeTest }), title: 'Hide trades tagged #test' }));
    c.push(h('div', { class: 'grow' }));
    const units = ui.seg({
        options: [
            { k: 'usd', label: '$', title: 'Dollars' },
            { k: 'pct', label: '%', title: '% of the capital of accounts that traded each day' },
            { k: 'pts', label: 'pts', title: D.unitOk.pts ? 'Points (one symbol)' : 'Points need a single symbol: pick one in Symbol', disabled: !D.unitOk.pts },
            { k: 'r', label: 'R', title: D.unitOk.r ? 'R multiples (trades with a stop at entry)' : 'No trades with a recorded stop', disabled: !D.unitOk.r }
        ],
        value: state.unit, label: 'Units (U)', onChange: (k) => applyState({ unit: k })
    });
    c.push(units);
    c.push(ui.seg({ options: [{ k: 'net', label: 'Net', title: 'After fees and funding (B)' }, { k: 'gross', label: 'Gross', title: 'Before fees and funding (B)' }], value: state.basis, label: 'Basis', onChange: (k) => applyState({ basis: k }) }));
    c.push(h('button', {
        class: 'icon-btn' + (state.hide ? ' on' : ''), type: 'button', title: 'Hide $ (H)', 'aria-pressed': String(state.hide), 'aria-label': 'Hide dollar amounts',
        style: 'border:1px solid var(--j-hair)', onclick: () => applyState({ hide: !state.hide })
    }, icon(state.hide ? 'eyeOff' : 'eye', 16)));
    clockEl = h('b', null, '');
    const mode = T.DAY_MODES[state.mode];
    const clk = h('button', { class: 'clock', type: 'button', title: 'Day boundary: change how trades are grouped into days', onclick: (e) => modeMenu(e.currentTarget) },
        h('span', { class: 'cl-full' }, mode.label), h('span', { class: 'cl-short' }, mode.label.split(' · ')[0]), state.mode === 'vest' ? h('span', { class: 'mut' }, '·') : null, state.mode === 'vest' ? h('span', null, 'resets in ', clockEl) : null);
    c.push(clk);
    tickClock();
    return c;
}

function tickClock() {
    if (!clockEl || state.mode !== 'vest') return;
    const ms = T.vestResetIn(now());
    const hh = Math.floor(ms / 36e5), mm = Math.floor((ms % 36e5) / 6e4);
    clockEl.textContent = T.pad2(hh) + ':' + T.pad2(mm);
}

function accountsLabel() { /*! Copyright (c) 2026 Astral. Better Vest 9.3.0 is licensed to its users only to run it, never to copy it. bv-5e4286ac */
    const a = state.accounts;
    if (a == null) return 'All accounts';
    if (!a.length) return 'No accounts';
    return a.length === 1 ? (data.accounts.find((x) => x.id === a[0]) ? model.accountName(data.accounts.find((x) => x.id === a[0])) : '1 account') : `Accounts ${a.length}`;
}

function menuButton(label, set, open) {
    const b = h('button', { class: 'fb' + (set ? ' set' : ''), type: 'button', 'aria-haspopup': 'menu' }, h('span', null, label), icon('chevD', 12));
    b.onclick = () => open(b);
    return b;
}

function renderFilters(force) {
    const sig = [dataVer, state.scope, state.accounts && state.accounts.join(','), state.symbols, state.sides, state.exits, state.tags, state.excludeTest, state.unit, state.basis, state.hide, state.mode, derive().unitOk.pts, derive().unitOk.r].join('|');
    if (!force && sig === filterSig) return;
    filterSig = sig;
    ui.clear(dom.filters);
    ui.append(dom.filters, buildFilters());
}


function simpleMenu(anchor, title, options, selected, key) {
    ui.popover(anchor, (el) => {
        el.classList.add('menu');
        const draw = () => {
            ui.clear(el);
            el.appendChild(h('div', { class: 'mi head' }, title));
            for (const o of options) {
                const on = selected.includes(o.k);
                el.appendChild(h('div', { class: 'mi', role: 'menuitemcheckbox', tabindex: 0, onclick: () => toggle(o.k) },
                    ui.checkbox(on, () => toggle(o.k)), h('span', { class: 'grow' }, o.label), o.right ? h('span', { class: 'r' }, o.right) : null));
            }
            el.appendChild(h('div', { class: 'mi', style: 'justify-content:flex-end' }, h('button', { class: 'link', type: 'button', onclick: () => { applyState({ [key]: [] }); selected = []; draw(); } }, 'Clear')));
        };
        const toggle = (k) => {
            selected = selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k];
            applyState({ [key]: selected });
            draw();
        };
        draw();
    }, { cls: 'menu' });
} /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-574b005b */

function symbolsMenu(anchor) {
    const counts = new Map();
    for (const t of data.trades) if (!t.open) counts.set(t.display, (counts.get(t.display) || 0) + 1);
    const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, label: k, right: n.toLocaleString('en-US') }));
    simpleMenu(anchor, 'Symbol', opts, state.symbols, 'symbols');
}

function exitsMenu(anchor) {
    const counts = new Map();
    for (const t of data.trades) if (!t.open && t.exit) counts.set(t.exit, (counts.get(t.exit) || 0) + 1);
    const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, label: model.exitLabel(k), right: n.toLocaleString('en-US') }));
    simpleMenu(anchor, 'Exit reason', opts, state.exits, 'exits');
}

function tagsMenu(anchor) {
    const counts = new Map();
    for (const n of data.notes) for (const g of n.tags || []) counts.set(g, (counts.get(g) || 0) + 1);
    const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k: k.toLowerCase(), label: '#' + k, right: String(n) }));
    if (!opts.length) { ui.toast('No tags yet: add them in a day or trade note'); return; }
    /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-a30a720b */ simpleMenu(anchor, 'Tags (day and trade notes)', opts, state.tags, 'tags');
}

function modeMenu(anchor) {
    ui.popover(anchor, (el, api) => {
        el.classList.add('menu');
        el.appendChild(h('div', { class: 'mi head' }, 'A day ends at'));
        for (const [k, m] of Object.entries(T.DAY_MODES)) {
            el.appendChild(h('div', { class: 'mi' + (k === state.mode ? ' sel-row' : ''), tabindex: 0, onclick: () => { applyState({ mode: k, day: null, sel: null }); api.close(); } },
                h('span', { class: 'grow' }, m.label), k === state.mode ? icon('check', 14) : null));
        }
        el.appendChild(h('div', { class: 'sub', style: 'padding:6px 8px 4px' }, 'Vest checks the daily loss limit at 20:00 ET, so Vest day is the default. Sunday 18:00–20:00 ET trades form their own cell; CME day folds them into Monday.'));
    }, { cls: 'menu', placement: 'bottom-end', width: 312 });
}

function accountGroup(a) {
    if (a.kind === 'primary') return 'Primary';
    if (!a.isFinal) return 'Active';
    if (a.status === 3) return 'Passed';
    if (a.status === 6) return 'Claimed';
    return 'Failed';
}
const GROUP_ORDER = ['Active', 'Passed', 'Failed', 'Claimed', 'Primary'];

function accountsMenu(anchor) {
    const D = derive();
    const phases = { funded: ['funded', 'instant'], eval: ['eval'], primary: ['primary'] }[state.scope];
    const all = data.accounts.filter((a) => !phases || phases.includes(a.phase));
    const aStats = stats.accountStats(data.accounts, data.trades, data.payouts);
    let query = '';
    let onlyMonth = false;
    const monthHas = new Set();
    for (const [k, d] of D.days) if (k.startsWith(state.month)) for (const id of d.accounts) monthHas.add(id);
    ui.popover(anchor, (el) => {
        el.classList.add('menu');
        el.style.width = '372px';
        const search = h('input', { class: 'field', placeholder: 'Search accounts', 'aria-label': 'Search accounts' });
        const list = h('div', { class: 'mi-scroll' });
        const foot = h('div');
        el.append(h('div', { class: 'field-wrap' }, icon('search', 14), search), list, foot);
        const selected = () => (state.accounts ? new Set(state.accounts) : new Set(all.map((a) => a.id)));
        const commit = (set) => {
            const everyone = all.every((a) => set.has(a.id)) && set.size === all.length;
            applyState({ accounts: everyone ? null : [...set] });
            draw();
        };
        /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-8acf0a6f */ const draw = () => {
            ui.clear(list); ui.clear(foot);
            const sel = selected();
            const q = query.trim().toLowerCase();
            const rows = all.filter((a) => (!q || model.accountName(a).toLowerCase().includes(q) || a.id.toLowerCase().includes(q)) && (!onlyMonth || monthHas.has(a.id)));
            for (const g of GROUP_ORDER) {
                const items = rows.filter((a) => accountGroup(a) === g).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                if (!items.length) continue;
                const nSel = items.filter((a) => sel.has(a.id)).length;
                list.appendChild(h('div', { class: 'mi head', role: 'group' },
                    ui.checkbox(nSel === items.length, (on) => { const s2 = selected(); for (const a of items) on ? s2.add(a.id) : s2.delete(a.id); commit(s2); }, { indeterminate: nSel > 0 && nSel < items.length, label: g }),
                    h('span', { class: 'grow' }, g), h('span', { class: 'r' }, String(items.length))));
                for (const a of items) {
                    const as = aStats.get(a.id);
                    const row = h('div', { class: 'mi', tabindex: 0, role: 'menuitemcheckbox', onclick: () => { const s2 = selected(); sel.has(a.id) ? s2.delete(a.id) : s2.add(a.id); commit(s2); } },
                        ui.checkbox(sel.has(a.id), () => { const s2 = selected(); sel.has(a.id) ? s2.delete(a.id) : s2.add(a.id); commit(s2); }, { label: model.accountName(a) }),
                        h('span', { class: 'grow', title: model.accountName(a) }, model.accountName(a)),
                        a.phase === 'eval' ? h('span', { class: 'chip mini sim' }, 'Eval') : null,
                        h('span', { class: 'r ' + (as && as.net > 0 ? 'up' : as && as.net < 0 ? 'dn' : '') }, as && as.n ? fmt.usd(as.net, { ctx: 'cell' }) : '—'));
                    list.appendChild(row);
                }
            }
            if (!rows.length) list.appendChild(h('div', { class: 'dshim' }, 'No accounts match'));
            foot.appendChild(h('div', { class: 'set-row' }, h('span', null, 'Only accounts with trades this month'), ui.toggle(onlyMonth, (v) => { onlyMonth = v; draw(); }, 'Only accounts with trades this month')));
            foot.appendChild(h('div', { class: 'mi', style: 'justify-content:space-between' },
                h('button', { class: 'link', type: 'button', onclick: () => { applyState({ accounts: null }); draw(); } }, 'Select all'),
                h('button', { class: 'link', type: 'button', onclick: () => { applyState({ accounts: [] }); draw(); } }, 'None')));
        };
        search.addEventListener('input', () => { query = search.value; draw(); });
        draw();
        setTimeout(() => search.focus(), 30);
    }, { cls: 'menu' });
}

function themeMenu(anchor) {
    ui.popover(anchor, (el, api) => {
        el.classList.add('menu');
        el.appendChild(h('div', { class: 'mi head' }, 'Theme'));
        const follow = h('div', { class: 'mi', tabindex: 0, onclick: () => { themeOverride = ''; ls.del('bv-journal-theme-override'); applyTheme(); renderAll(true); api.close(); } }, /*! Better Vest (c) 2026 Astral. All rights reserved. bv-04492c40 */
            h('span', { class: 'grow' }, 'Follow Better Vest'), h('span', { class: 'r' }, themeDef(followName()).label), !themeOverride ? icon('check', 14) : null);
        el.appendChild(follow);
        for (const [k, t] of Object.entries(THEMES)) {
            el.appendChild(h('div', { class: 'mi', tabindex: 0, onclick: () => { themeOverride = k; ls.set('bv-journal-theme-override', k); applyTheme(); renderAll(true); api.close(); } },
                h('i', { class: 'sw', style: { background: t.page.startsWith('radial') ? `radial-gradient(circle at 50% 0, ${t.card}, ${t.base})` : t.base, boxShadow: `inset 0 0 0 1px ${t.line}, inset 0 -4px 0 ${t.accent}` } }),
                h('span', { class: 'grow' }, t.label), themeOverride === k ? icon('check', 14) : null));
        }
    }, { cls: 'menu', placement: 'bottom-end', width: 244 });
}

function settingsMenu(anchor) {
    ui.popover(anchor, (el, api) => {
        el.classList.add('menu');
        el.appendChild(h('div', { class: 'mi head' }, 'Calendar'));
        el.appendChild(h('div', { class: 'set-row' }, h('span', null, 'Hide $ amounts'), ui.toggle(state.hide, () => applyState({ hide: !state.hide }), 'Hide $')));
        el.appendChild(h('div', { class: 'set-row' }, h('span', null, 'Reduce motion'), ui.toggle(ls.get('bv-journal-motion') === 'off', (v) => {
            ls.set('bv-journal-motion', v ? 'off' : 'on');
            document.documentElement.toggleAttribute('data-reduce-motion', v);
            if (v) document.documentElement.setAttribute('data-reduce-motion', '1');
        }, 'Reduce motion')));
        el.appendChild(h('hr', { style: 'border:0;border-top:1px solid var(--j-hair);margin:6px 0' }));
        const row = (label, fn, k) => el.appendChild(h('div', { class: 'mi', tabindex: 0, onclick: () => { api.close(); fn(); } }, h('span', { class: 'grow' }, label), k ? ui.kbd(k) : null));
        row('Sync now', () => syncNow('manual'), 'S');
        row('Full re-sync', () => syncNow('full'));
        row('Export this month as CSV', exportCsv, '⇧E');
        row('Keyboard shortcuts', shortcutSheet, '?');
        el.appendChild(h('div', { class: 'sub', style: 'padding:8px 8px 4px' }, DEV ? 'Fixture data: synthetic, nothing real.' : 'Data stays on this device. This page makes no network requests.'));
    }, { cls: 'menu', placement: 'bottom-end', width: 264 });
}

function shortcutSheet() {
    const rows = [
        ['Move between days', ['←', '↑', '↓', '→']], ['Open the day', ['Enter']], ['Close layer / drawer / selection', ['Esc']],
        ['Previous / next month', ['[', ']']], ['Jump to today', ['T']], ['Widen the day drawer', ['E']],
        ['Switch tab', ['1', '–', '5']], ['Cycle units', ['U']], ['Net / Gross', ['B']], ['Hide $', ['H']], ['Sync now', ['S']],
        ['Export this month (CSV)', ['⇧', 'E']], ['Shortcuts', ['?']]
    ];
    ui.sheet((body) => {
        const k = h('div', { class: 'keys' });
        for (const [label, ks] of rows) { k.appendChild(h('span', null, ks.map((x) => ui.kbd(x)))); k.appendChild(h('div', null, label)); }
        body.appendChild(k);
        body.appendChild(h('div', { class: 'sub', style: 'margin-top:14px' }, 'Click selects and opens a day; Shift-click or drag selects a range; click a week summary to select its days.'));
    }, { title: 'Keyboard shortcuts', width: 460 });
}


function exportCsv() {
    const D = derive();
    const ym = state.month;
    const list = D.filtered.filter((t) => T.dayKey(t.closeTs, state.mode).startsWith(ym)); /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-fe717b73 */
    if (!list.length) { ui.toast('No trades in ' + T.fmtMonth(ym) + ' to export', { tone: 'warn' }); return; }
    const money = !state.hide;
    const cols = ['close_time_et', 'vest_day', 'account', 'symbol', 'side', 'qty', 'entry', 'exit', 'points', ...(money ? ['gross', 'fee', 'funding', 'net', 'risk_usd'] : []), 'risk_pts', 'r_multiple', 'held_s', 'exit_reason'];
    const q = (v) => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [cols.join(',')];
    for (const t of list) {
        const a = D.accountsById.get(t.accountId);
        const r = [T.etDateKey(t.closeTs) + ' ' + T.fmtTimeET(t.closeTs), T.dayKey(t.closeTs, state.mode), a ? model.accountName(a) : t.accountId, t.display, t.side, t.qty, t.entryPx, t.exitPx, t.points];
        if (money) r.push(t.gross, t.fee, t.funding, t.net, t.riskUsd);
        r.push(t.riskPts, t.rMult != null ? +t.rMult.toFixed(3) : '', t.heldMs != null ? Math.round(t.heldMs / 1000) : '', model.exitLabel(t.exit));
        rows.push(r.map(q).join(','));
    }
    const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `better-vest-trades-${ym}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    ui.toast(money ? `Exported ${list.length} trades` : `Exported ${list.length} trades without dollar columns (Hide $ is on)`);
}


let syncWatch = 0;
async function syncNow(mode = 'manual', opts) {
    const auto = !!(opts && opts.auto);
    if (DEV) { if (!auto) ui.toast('Fixture data: nothing to sync'); return; }
    if (!HAS_CHROME) return;
    const prev = { state: sync.state, msg: sync.msg || '' };
    sync.state = 'syncing'; sync.done = 0; sync.total = 0; sync.error = null;
    const sentAt = Date.now();
    updatePill();
    if (isCold() && !auto) render();
    const fail = (state, msg) => {
        clearTimeout(syncWatch);
        const s = model.autoSyncFail(prev, { state, msg: msg || '' }, auto);
        sync.state = s.state; sync.msg = s.msg;
        updatePill(); renderBanner();
        if (isCold()) render();
    };
    try {
        const resp = await chrome.runtime.sendMessage({ type: 'journal-sync', mode });
        if (resp && resp.ok === false) {
            const why = String(resp.reason || resp.error || '');
            fail(/session|401|auth/i.test(why) ? 'session' : /tab|offline|vest/i.test(why) ? 'offline' : 'error', why);
            return;
        } /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-dc5a7b1f */
        clearTimeout(syncWatch);
        syncWatch = setTimeout(() => {
            if (sync.state === 'syncing' && !(sync.lastMsgAt > sentAt)) fail('offline', 'the Vest tab did not start a sync');
        }, 12000);
    } catch (e) {
        fail('offline');
    }
}

function autoSync(why, awayMs) {
    if (model.autoSyncWhy({ dev: DEV, chrome: HAS_CHROME, syncing: sync.state === 'syncing', why, awayMs })) return;
    syncNow('manual', { auto: true });
}

let reloadTimer = 0, lastReload = 0;
function onJournalUpdated(msg) {
    if (!msg || msg.type !== 'journal-updated' || !dom.app) return;
    if (msg.userId && String(msg.userId) !== userId) { userId = String(msg.userId); db = null; }
    sync.lastMsgAt = Date.now();
    if (msg.error) {
        clearTimeout(syncWatch);
        const code = String(msg.error.code || msg.error);
        sync.state = /session/i.test(code) ? 'session' : 'error';
        sync.msg = msg.error.msg || code;
    } else if (msg.progress) {
        sync.state = 'syncing'; sync.done = msg.progress.done || 0; sync.total = msg.progress.total || 0; sync.phase = msg.progress.phase || '';
    } else if (msg.done && !msg.renormalized) {
        clearTimeout(syncWatch);
        if (msg.ok === false) {
            if (sync.state !== 'session' && sync.state !== 'error') sync.state = 'partial';
        } else {
            sync.state = 'idle'; sync.at = Date.now();
        }
    }
    updatePill();
    renderBanner();
    clearTimeout(reloadTimer);
    const wait = msg.done ? 30 : Math.max(250, 1500 - (performance.now() - lastReload));
    reloadTimer = setTimeout(async () => {
        lastReload = performance.now();
        await loadData();
        syncPulse = !!msg.done;
        renderAll(true);
        syncPulse = false;
    }, wait);
}


function renderBanner() {
    if (!dom.banner) return;
    ui.clear(dom.banner);
    let b = null;
    if (loadError) b = ['Could not read the local journal database.', 'Retry', () => location.reload()];
    else if (sync.state === 'error') b = [sync.msg ? 'Sync problem: ' + sync.msg + '. Showing your last good data.' : 'Sync problem. Showing your last good data.', 'Retry', () => syncNow('manual')];
    else if (sync.state === 'session') b = ['Open the Vest tab once to refresh its session. Showing your last good data.', 'Open Vest', openVest];
    else if (sync.state === 'partial') b = ['Some accounts did not sync completely. Showing everything that was read; they are retried on the next sync.', 'Retry', () => syncNow('manual')];
    else if (sync.state === 'offline' && data.trades.length) b = ['Open Vest to refresh. Showing the data stored on this device.', 'Open Vest', openVest];
    else if (!DEV && sync.at && now() - sync.at > 24 * 36e5) b = ['Last sync was ' + T.fmtAgo(sync.at, now()) + '. Numbers may be out of date.', 'Sync', () => syncNow('manual')];
    if (!b) return;
    dom.banner.appendChild(h('div', { class: 'banner', role: 'status' }, icon('info', 16), h('span', { class: 'grow' }, b[0]), h('button', { class: 'btn', type: 'button', onclick: b[2] }, b[1])));
}

function openVest() { /*! Property of Astral (@ax4p). Better Vest 9.3.0. No copying without written permission. bv-af3f8706 */
    try { chrome.runtime.sendMessage({ type: 'journal-open' }).catch(() => {}); } catch (e) {  }
    window.open('https://next.vestmarkets.com/', '_blank', 'noopener');
}

function isCold() {
    return loaded && !data.accounts.length && !data.trades.length;
}

function renderCold() {
    ui.clear(dom.inner);
    const syncing = sync.state === 'syncing';
    const card = h('div', { class: 'cold-card' });
    card.appendChild(ui.sparkle(42, 'mark'));
    if (!syncing) {
        card.append(
            h('h2', null, 'Your trading, in one calm place.'),
            h('p', null, 'Better Vest reads your trades, accounts and payouts from your open Vest tab (read-only) and keeps them on this device. Nothing is sent anywhere.'),
            h('button', { class: 'btn primary lg', type: 'button', onclick: () => syncNow('full') }, 'Build my calendar'),
            h('div', { class: 'fine' }, sync.state === 'offline' ? 'Open the Vest tab first, then try again.' : sync.state === 'session' ? 'Open the Vest tab once to refresh its session.' : 'Vest day ends at 20:00 ET · history loads newest first'));
        if (sync.state === 'offline' || sync.state === 'session') card.appendChild(h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: openVest }, 'Open Vest')));
    } else {
        card.append(
            h('h2', null, 'Building your calendar'),
            h('p', null, 'Reading your Vest history. Newest accounts first; the calendar fills in as it arrives.'),
            h('div', { class: 'prog' }, h('div', null, h('span', null, 'Accounts'), h('b', null, sync.total ? `${sync.done} / ${sync.total}` : '…')), h('div', null, h('span', null, 'Trades'), h('b', null, T.fmtCount(data.trades.length)))),
            h('div', { class: 'bar', style: `--p:${sync.total ? Math.max(0.04, sync.done / sync.total) : 0.06}` }, h('i')));
    }
    dom.inner.appendChild(h('div', { class: 'cold' }, card));
}

function switchTab(id) {
    if (id === state.tab && view) return;
    const swap = () => { state.tab = id; render(true); writeHash(false); };
    if (document.startViewTransition && !ui.reducedMotion()) { try { const t = document.startViewTransition(swap); t.ready.catch(() => {}); t.finished.catch(() => {}); return; } catch (e) {  } }
    swap();
}

function ensureView() {
    const tab = TABS.find((t) => t.id === state.tab) || TABS[0];
    if (viewId !== tab.id) {
        if (view && view.unmount) view.unmount();
        ui.clear(dom.inner);
        view = tab.mod.mount(dom.inner, ctx); /*! Copyright Astral 2026. From Better Vest 9.3.0 (nostats), ref bv-b64e0c77. Not licensed for reuse. */
        viewId = tab.id;
    }
}

function render(rebuildTop) {
    if (!dom.app) return;
    normalizeState();
    if (rebuildTop) renderTopbar();
    renderFilters();
    renderBanner();
    dom.filters.hidden = isCold();
    if (isCold() || (loaded && sync.state === 'syncing' && !data.trades.length && !DEV)) {
        if (view && view.unmount) view.unmount();
        view = null; viewId = null;
        renderCold();
        dom.drawerRoot.classList.remove('open');
    } else if (loaded) {
        if (!view && dom.inner.querySelector('.cold')) ui.clear(dom.inner);
        ensureView(); /* Owned by Astral (@ax4p): Better Vest nostats 9.3.0. Licence: LICENSE, not open source. bv-05e72551 */
        view.update(ctx);
    }
    if (drawerView) drawerView.update(ctx);
}

function renderAll() {
    renderTopbar();
    renderFilters(true);
    render();
}


function typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
        if (ui.closeTopLayer()) { e.preventDefault(); return; }
        if (typing(e)) { e.target.blur(); return; }
        if (state.day) { applyState({ day: null }); const c = dom.inner.querySelector('.cell[tabindex="0"]'); c && c.focus(); e.preventDefault(); return; }
        if (state.sel) { applyState({ sel: null }); e.preventDefault(); }
        return;
    }
    if (typing(e)) return;
    if (view && view.onKey && view.onKey(e)) { e.preventDefault(); return; }
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (/^[1-9]$/.test(k) && TABS[+k - 1]) { switchTab(TABS[+k - 1].id); e.preventDefault(); return; }
    if (lower === '[') ctx.shiftMonth(-1);
    else if (lower === ']') ctx.shiftMonth(1);
    else if (lower === 't') ctx.goToday();
    else if (lower === 'u') cycleUnit();
    else if (lower === 'b') applyState({ basis: state.basis === 'net' ? 'gross' : 'net' });
    else if (lower === 'h') applyState({ hide: !state.hide });
    else if (lower === 's') syncNow('manual');
    else if (lower === 'e' && e.shiftKey) exportCsv();
    else if (lower === 'e' && state.day) applyState({ wide: !state.wide });
    else if (k === '?') shortcutSheet();
    else return;
    e.preventDefault();
}

function cycleUnit() {
    const D = derive();
    const order = UNITS.filter((u) => D.unitOk[u]);
    const i = order.indexOf(state.unit);
    applyState({ unit: order[(i + 1) % order.length] });
}


function buildShell() {
    const app = document.getElementById('app');
    dom.app = app;
    dom.topbar = h('header', { class: 'topbar' });
    dom.hair = h('div', { class: 'hairline', role: 'progressbar', 'aria-label': 'Sync progress' }, h('i'));
    dom.filters = h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filters' });
    dom.banner = h('div', { style: 'padding:0 var(--gut)' });
    dom.inner = h('div', { class: 'inner' });
    dom.view = h('main', { class: 'view' }, dom.banner, dom.inner);
    dom.drawerRoot = h('aside', { class: 'drawer', 'aria-label': 'Day details' });
    app.append(dom.topbar, dom.hair, dom.filters, h('div', { class: 'stage' }, dom.view, dom.drawerRoot));
    drawerView = drawer.mount(dom.drawerRoot, ctx);
}

async function boot() {
    const ex = parseHash(location.hash);
    Object.assign(state, ex); /*! Property of Astral (@ax4p). Better Vest 9.3.0. No copying without written permission. bv-61f424d0 */
    if (HAS_CHROME && chrome.storage && chrome.storage.local) {
        const got = await chromeGet(['settings']);
        settingsTheme = got.settings && got.settings.theme;
        settingsCustom = got.settings && got.settings.custom;
        try {
            chrome.storage.onChanged.addListener((ch, area) => {
                if (area !== 'local' || !ch.settings) return;
                const nv = ch.settings.newValue;
                if (!nv) return;
                const custom = nv.theme === 'custom' && JSON.stringify(nv.custom) !== JSON.stringify(settingsCustom);
                if (nv.theme !== settingsTheme || custom) { settingsTheme = nv.theme; settingsCustom = nv.custom; applyTheme(); renderAll(true); }
            });
            chrome.runtime.onMessage.addListener((m) => { onJournalUpdated(m); });
        } catch (e) {  }
    }
    applyTheme();
    buildShell();
    renderTopbar();
    const frame = performance.now();
    await loadData();
    normalizeState();
    const r0 = performance.now();
    renderAll(true);
    window.__journalBoot = { dataMs: Math.round(r0 - frame), renderMs: +(performance.now() - r0).toFixed(1), t0 };
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__journalBoot.paintedAt = performance.now(); }));
    writeHash(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', () => {
        if (writingHash) return;
        Object.assign(state, DEFAULTS, prefsOnly(), parseHash(location.hash));
        render(true);
    });
    let rz = 0;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(paintStars, 150); });
    setInterval(() => { tickClock(); }, 20000);
    setInterval(() => { if (dom.topbar.isConnected) updatePill(); }, 60000);
    let hiddenAt = document.hidden ? Date.now() : 0;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { hiddenAt = Date.now(); return; }
        tickClock();
        renderTopbar();
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        autoSync('back', away); /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.0. bv-a184e847 */
    });
    window.__journal = { ctx, state, derive, applyState };
    autoSync('open');
}

function prefsOnly() { const o = {}; for (const k of PREF_KEYS) if (prefs[k] != null) o[k] = prefs[k]; return o; }

boot();
