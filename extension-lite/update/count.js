/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

export const COUNT_EDITION = 'lite';
const SENT_KEY = 'bvCountSent';
const ID_KEY = 'bvCountId';
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

export const COUNT_URL = 'https://bv.astrals.dev/api/count';
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const COUNT_EDITIONS = ['standard', 'lite', 'wicked'];

export function installBody(version, edition) {
    if (!VERSION_RE.test(String(version)) || COUNT_EDITIONS.indexOf(edition) < 0) return null;
    return JSON.stringify({ k: 'i', v: version, e: edition });
} /*! Copyright Astral 2026. From Better Vest 9.2.6 (lite), ref bv-c090bff0. Not licensed for reuse. */

export function post(fetchFn, body) {
    if (typeof body !== 'string') return;
    try {
        const r = fetchFn(COUNT_URL, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', cache: 'no-store', keepalive: true, referrerPolicy: 'no-referrer' });
        if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) {}
}

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

const HB_MIN = 3;
const ID_RE = /^[0-9a-f]{32}$/;
const VEST_TABS = ['https://next.vestmarkets.com/*'];

export function newCountId(cryptoObj) {
    const b = new Uint8Array(16);
    cryptoObj.getRandomValues(b);
    let s = '';
    for (const x of b) s += x.toString(16).padStart(2, '0');
    return s;
}

export function heartbeatBody(version, edition, id) {
    if (!VERSION_RE.test(String(version)) || COUNT_EDITIONS.indexOf(edition) < 0 || typeof id !== 'string' || !ID_RE.test(id)) return null;
    return JSON.stringify({ k: 'h', v: version, e: edition, id });
}

async function heartbeatId(env) {
    const got = await env.storage.get(ID_KEY);
    if (got && typeof got[ID_KEY] === 'string' && ID_RE.test(got[ID_KEY])) return got[ID_KEY];
    const id = newCountId(env.cryptoObj);
    await env.storage.set({ [ID_KEY]: id });
    return id;
/*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-64d03c89 */ }

export function countHeartbeat(env) {
    return serial(async () => {
        const tabs = await env.tabs.query({ url: VEST_TABS });
        if (!Array.isArray(tabs) || !tabs.length) return false;
        const body = heartbeatBody(env.version, env.edition, await heartbeatId(env));
        if (!body) return false;
        post(env.fetchFn, body);
        return true;
    });
}

export function countUsage(env) {
    return serial(async () => {
        const tabs = await env.tabs.query({ url: VEST_TABS });
        if (!Array.isArray(tabs) || !tabs.length) return false;
        return usageReport(env, await heartbeatId(env)).catch(() => false);
    });
}

async function scheduleHeartbeat(env) {
    const a = await env.alarms.get(HB_ALARM);
    if (!a || a.periodInMinutes !== HB_MIN) await env.alarms.create(HB_ALARM, { delayInMinutes: HB_MIN, periodInMinutes: HB_MIN });
    const u = await env.alarms.get(USE_ALARM);
    if (!u || u.periodInMinutes !== USE_MIN) await env.alarms.create(USE_ALARM, { delayInMinutes: USE_MIN, periodInMinutes: USE_MIN });
}

const USAGE_SCHEMA = {"set":{"acct.100k":{"num":[0,200]},"acct.10k":{"num":[0,200]},"acct.150k":{"num":[0,200]},"acct.200k":{"num":[0,200]},"acct.25k":{"num":[0,200]},"acct.50k":{"num":[0,200]},"acct.5k":{"num":[0,200]},"acct.count":["0","1","2","3","4-5","6-9","10-19","20+"],"acct.eval":{"num":[0,200]},"acct.funded":{"num":[0,200]},"acct.instant":{"num":[0,200]},"acct.otherSize":{"num":[0,200]},"acct.primary":{"num":[0,50]},"accts.menu":"bool","accts.panel":"bool","accts.points":"bool","accts.sort":["limit","name","value","today"],"accts.strip":"bool","accts.stripAt":["top","market"],"accts.warn":"bool","autobe.on":"bool","autobe.unit":["pt","usd"],"card.collapsed":"bool","card.partPct":{"num":[1,99]},"card.partials":"bool","card.place":["float","ticket","dock"],"card.preset":["5k","10k","25k","custom"],"card.prices":"bool","card.risk":"bool","card.slOn":"bool","card.slUnit":["pt","usd","price"],"card.targets":{"num":[1,10]},"card.tpOn":"bool","card.tpUnit":["pt","usd","price"],"card.vestTicket":"bool","ch":["github","store","wicked","phone"],"chart.hideGrid":"bool","chart.hideSessions":"bool","chart.hideVolume":"bool","chart.stars":["auto","on","off"],"chart.sync":"bool","copy.engine":["none","light","turbo","mixed"],"copy.followers":{"num":[0,50]},"copy.groups":{"num":[0,20]},"copy.limits":"bool","copy.on":"bool","copy.ultra":"bool","dll.flat":"bool","dll.on":"bool","dll.profit":"bool","dll.vest":"bool","font":["site","system","inter","geist","manrope","grotesk","plex","jetbrains","mono"],"hide.banner":"bool","hide.book":"bool","hide.footer":"bool","hide.health":"bool","hide.leftRail":"bool","hide.leftTools":"bool","hide.nav":"bool","hide.positions":"bool","hide.stats":"bool","hide.ticket":"bool","hide.topStats":"bool","keys.be":"key","keys.bracket":"bool","keys.flat":"key","keys.limitBuy":"key","keys.limitSell":"key","keys.long":"key","keys.on":"bool","keys.short":"key","keys.toast":"bool","limit.show":"bool","look.accent":["theme","own"],"look.bg":["none","color","aurora","dusk","ocean","forest","image"],"look.compactDock":"bool","look.dockCalendar":"bool","look.glass":{"num":[0,100]},"look.updown":["theme","classic","cvd","teal","custom"],"mch.layout":["1","2h","2v","3","4"],"mnq":"bool","news.cpi":"bool","news.fomc":"bool","news.gdp":"bool","news.nfp":"bool","news.pce":"bool","news.ppi":"bool","phone.hold":"bool","phone.mini":"bool","phone.vestOrder":"bool","phone.vestToasts":"bool","pnl.autoPop":"bool","pnl.tape":"bool","session.lead1":"bool","session.lead5":"bool","session.on":"bool","session.open":"bool","stops.show":"bool","theme":["astral","dark","oled","light","nebula","starfield","midnight","native","dracula","catppuccin","custom"],"tilt.on":"bool","tpsl.beMode":["pctProfit","ticks","points"],"tpsl.beShow":"bool","tpsl.followBars":"bool","tpsl.makeRoom":"bool","tpsl.on":"bool","tpsl.showR":"bool","trail.now":"bool","trail.on":"bool","trail.unit":["pt","usd"],"vc.mode":["ptt","wake"],"vc.on":"bool","vc.open":"bool","voice.exits":"bool","voice.on":"bool","voice.orders":"bool","voice.pack":["arthur","eddie","elara","belle","emma","tala"],"voice.risk":"bool","voice.session":"bool","voice.vol":{"num":[0,100]},"wick.always":"bool","wick.ask":"bool","wick.variant":["3","4","5"],"widget.spread":"bool"},"use":{"accts.manage":1,"accts.menu":1,"accts.panel":1,"accts.payout":1,"alert.add":1,"alert.hit":1,"alert.remove":1,"buy.none":1,"buy.other":1,"buy.wick":1,"cal.open":1,"card.collapse":1,"card.cxl":1,"card.flat":1,"card.half":1,"card.limit":1,"card.lock":1,"card.long":1,"card.part":1,"card.rev":1,"card.short":1,"card.stop":1,"cert.open":1,"chart.be":1,"chart.drag":1,"copy.light":1,"copy.on":1,"copy.turbo":1,"dock.charts":1,"dock.macros":1,"hk.be":1,"hk.flat":1,"hk.limitBuy":1,"hk.limitSell":1,"hk.long":1,"hk.short":1,"mch.change":1,"phone.card":1,"phone.copy":1,"phone.draw":1,"phone.full":1,"phone.menu":1,"phone.min":1,"phone.restore":1,"phone.strip":1,"pnl.gif":1,"pnl.open":1,"pnl.png":1,"pnl.video":1,"set.alerts":1,"set.chart":1,"set.exec":1,"set.focus":1,"set.keys":1,"set.look":1,"set.market":1,"set.more":1,"set.open":1,"set.risk":1,"set.tpsl":1,"spend.none":1,"spend.other":1,"spend.wick":1,"trade.autobe":1,"trade.eval":1,"trade.funded":1,"trade.instant":1,"trade.nostop":1,"trade.notarget":1,"trade.nq":1,"trade.other":1,"trade.partials":1,"trade.price":1,"trade.primary":1,"trade.risk":1,"trade.trail":1,"trade.usd":1,"upd.open":1,"vc.be":1,"vc.flat":1,"vc.half":1,"vc.heard":1,"vc.limitBuy":1,"vc.limitSell":1,"vc.listenPtt":1,"vc.listenWake":1,"vc.long":1,"vc.micBlocked":1,"vc.miss":1,"vc.noEngine":1,"vc.rev":1,"vc.short":1,"vc.talkSec":1,"vc.window":1,"voice.test":1,"wick.always":1,"wick.ask":1,"wick.auto":1,"wick.fail":1,"wick.no":1,"wick.ok":1,"wick.use":1,"wick.v3Always":1,"wick.v3Ask":1,"wick.v3No":1,"wick.v3Use":1,"wick.v4Always":1,"wick.v4Ask":1,"wick.v4No":1,"wick.v4Use":1,"wick.v5Always":1,"wick.v5Ask":1,"wick.v5No":1,"wick.v5Use":1}};
const USE_MAX = 100000;
const USE_MIN = 10;
const USE_NAME_RE = /^[a-z][a-zA-Z0-9]{0,15}\.[a-zA-Z0-9]{1,24}$/; /* Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-19f639c5 */
const KEY_RE = /^([a-z0-9]|f([1-9]|1[0-9]|2[0-4]))$/;

export function vestDay(ms) {
    const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(ms))
        .reduce((a, p) => ((a[p.type] = p.value), a), {});
    const d = new Date(Date.UTC(+ny.year, +ny.month - 1, +ny.day));
    if (+ny.hour >= 20) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

export function usageValue(type, v) {
    if (type === 'bool') return v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : undefined;
    if (type === 'key') return typeof v === 'string' && (v === 'none' || v === 'other' || KEY_RE.test(v)) ? v : undefined;
    if (Array.isArray(type)) return typeof v === 'string' && type.indexOf(v) >= 0 ? v : undefined;
    if (type && Array.isArray(type.num)) return Number.isInteger(v) && v >= type.num[0] && v <= type.num[1] ? v : undefined;
    return undefined;
}

export function cleanUses(schema, n) {
    const out = {};
    if (!n || typeof n !== 'object' || Array.isArray(n)) return out;
    for (const k of Object.keys(n).slice(0, 300)) {
        const v = n[k];
        if (USE_NAME_RE.test(k) && Object.prototype.hasOwnProperty.call(schema.use, k) && Number.isInteger(v) && v >= 1) out[k] = Math.min(v, USE_MAX);
    }
    return out;
}

export function cleanAccounts(schema, a) {
    const out = {};
    if (!a || typeof a !== 'object' || Array.isArray(a)) return out;
    for (const k of Object.keys(a).slice(0, 40)) {
        if (!/^acct\.[a-zA-Z0-9]{1,16}$/.test(k) || k === 'acct.count' || !schema.set[k]) continue;
        const v = usageValue(schema.set[k], a[k]);
        if (v !== undefined) out[k] = v;
    }
    return out;
}

const on = (v) => v !== false; /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-f9833fb9 */
const yes = (v) => v === true;
const pick = (v, list, d) => (list.indexOf(v) >= 0 ? v : d);
const hkey = (k) => (typeof k !== 'string' || k === '' ? 'none' : KEY_RE.test(k) ? k : 'other');

export function usageSettings(schema, st, acct, ch) {
    const S = st && typeof st === 'object' ? st : {};
    const o = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const ui = o(S.ui), ch2 = o(S.chart), hide = o(S.hide), xc = o(S.xc), tp = o(S.tpsl), ss = o(S.session), mc = o(S.macros);
    const be = o(tp.be), tr = o(tp.trail), ab = o(tp.autoBe), dll = o(S.dll), vu = o(S.vestui), sh = o(S.share), cp = o(S.copy);
    const act = o(mc.act);
    const groups = (Array.isArray(cp.groups) ? cp.groups : []).filter((g) => g && typeof g === 'object' && g.leaderId && Array.isArray(g.followers) && g.followers.length);
    const engines = new Set(groups.map((g) => (g.engine === 'tabs' ? 'turbo' : 'light')));
    const raw = {
        ch,
        theme: S.theme, font: S.font,
        'look.accent': ui.accent ? 'own' : 'theme', 'look.updown': ui.updown || 'theme', 'look.bg': o(ui.bg).kind || 'none',
        'look.glass': Number.isFinite(Number(ui.glass)) ? Math.round(Number(ui.glass)) : undefined,
        'look.compactDock': yes(ui.compactDock), 'look.dockCalendar': on(ui.dockCalendar),
        'chart.sync': on(ch2.sync), 'chart.hideVolume': on(ch2.hideVolume), 'chart.hideGrid': on(ch2.hideGrid), 'chart.hideSessions': on(ch2.hideSessions),
        'chart.stars': pick(ch2.stars, ['auto', 'on', 'off'], 'auto'),
        'widget.spread': yes(o(S.widgets).basis),
        'card.place': xc.place || 'float', 'card.vestTicket': yes(xc.vestTicket), 'card.prices': yes(xc.prices), 'card.partials': yes(xc.partials),
        'card.targets': Array.isArray(xc.targets) && xc.targets.length ? Math.min(xc.targets.length, 10) : 1,
        'card.slOn': on(xc.slOn), 'card.tpOn': on(xc.tpOn), 'card.slUnit': xc.slUnit || 'pt', 'card.tpUnit': xc.tpUnit || 'pt',
        'card.risk': yes(xc.riskOn), 'card.collapsed': yes(xc.collapsed), 'card.preset': S.account || 'custom',
        'card.partPct': Number.isInteger(xc.partPct) ? xc.partPct : 33,
        mnq: yes(S.mnqView),
        'tpsl.on': on(tp.enabled), 'tpsl.showR': on(tp.showR), 'tpsl.followBars': yes(tp.followBars), 'tpsl.makeRoom': on(tp.makeRoom),
        'tpsl.beShow': on(be.show), 'tpsl.beMode': be.mode || 'pctProfit',
        'trail.on': yes(tr.auto), 'trail.unit': tr.unit || 'pt', 'trail.now': yes(tr.now),
        'autobe.on': yes(ab.on), 'autobe.unit': ab.unit || 'pt',
        'stops.show': on(o(tp.stops).show), 'limit.show': on(o(tp.limit).show),
        'keys.on': yes(mc.on), 'keys.toast': on(mc.toast), 'keys.bracket': yes(mc.limitBracket),
        'vc.on': yes(o(S.vcmd).on), 'vc.mode': o(S.vcmd).mode === 'wake' ? 'wake' : 'ptt', 'vc.open': on(o(S.vcmd).open), /* This file is part of Better Vest by Astral and is protected by copyright. ref bv-f1f1403b */
        'mch.layout': o(S.mch).layout || '1',
        'dll.on': yes(dll.on), 'dll.flat': on(dll.flat), 'dll.vest': on(dll.vest), 'dll.profit': yes(dll.pon), 'tilt.on': yes(o(S.tilt).on),
        'accts.menu': on(vu.menu), 'accts.panel': on(vu.panel), 'accts.strip': on(vu.strip), 'accts.points': on(vu.points), 'accts.warn': on(vu.warn),
        'accts.sort': vu.sort || 'limit', 'accts.stripAt': vu.stripAt || 'top',
        'pnl.autoPop': on(sh.autoPop), 'pnl.tape': on(sh.tape),
        'wick.ask': on(ui.wickAsk), 'wick.always': yes(ui.wickAlways), 'wick.variant': ui.wickVariant,
        'copy.on': groups.some((g) => g.on === true), 'copy.groups': groups.length,
        'copy.followers': Math.min(50, groups.reduce((a, g) => a + g.followers.filter((f) => f && f.on !== false).length, 0)),
        'copy.engine': !groups.length ? 'none' : engines.size > 1 ? 'mixed' : [...engines][0],
        'copy.ultra': groups.some((g) => g.sendAtPending !== false), 'copy.limits': groups.some((g) => g.mirrorLimits !== false)
    };
    for (const k of Object.keys(hide)) raw['hide.' + k] = yes(hide[k]);
    for (const id of ['long', 'short', 'limitBuy', 'limitSell', 'be', 'flat']) if (act[id]) raw['keys.' + id] = act[id].on === false ? 'none' : hkey(act[id].key);
    if (S.session && typeof S.session === 'object') {
        Object.assign(raw, { 'session.on': on(ss.on), 'session.open': on(ss.open), 'session.lead5': on(ss.lead5), 'session.lead1': on(ss.lead1) });
        for (const k of ['cpi', 'ppi', 'nfp', 'fomc', 'gdp', 'pce']) raw['news.' + k] = on(o(ss.kinds)[k]);
    }
    const a = cleanAccounts(schema, acct);
    Object.assign(raw, a);
    const total = ['acct.primary', 'acct.eval', 'acct.funded', 'acct.instant'].reduce((x, k) => x + (Number(a[k]) || 0), 0);
    if (Object.keys(a).length) raw['acct.count'] = total >= 20 ? '20+' : total >= 10 ? '10-19' : total >= 6 ? '6-9' : total >= 4 ? '4-5' : String(total);
    const out = {};
    for (const k of Object.keys(raw)) {
        if (!Object.prototype.hasOwnProperty.call(schema.set, k)) continue;
        const v = usageValue(schema.set[k], raw[k]);
        if (v !== undefined) out[k] = v;
    }
    return out;
}

export function usageBody(version, edition, id, d, n, s) {
    if (!VERSION_RE.test(String(version)) || COUNT_EDITIONS.indexOf(edition) < 0 || typeof id !== 'string' || !ID_RE.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return null;
    return JSON.stringify({ k: 'u', v: version, e: edition, id, d, n: n || {}, s: s || {} });
}

const schemaOf = (env) => env.usageSchema || USAGE_SCHEMA;
const nowOf = (env) => (typeof env.now === 'function' ? env.now() : Date.now());

function channel(env) {
    if (env.edition === 'wicked') return 'wicked';
    let m = null;
    try { m = env.runtime.getManifest(); } catch (e) {}
    return m && m.update_url ? 'store' : 'github';
}

async function usageState(env) {
    const got = await env.storage.get(USAGE_KEY);
    const u = got && got[USAGE_KEY] && typeof got[USAGE_KEY] === 'object' ? got[USAGE_KEY] : {};
    return { on: u.on !== false, ack: u.ack === true };
}

export function usageAdd(env, n, acct) {
    return serial(async () => {
        const schema = schemaOf(env);
        const add = cleanUses(schema, n);
        const a = cleanAccounts(schema, acct);
        const st = await usageState(env);
        if (!st.on) return false;
        const d = vestDay(nowOf(env));
        const got = await env.storage.get(USE_DAY_KEY);
        let day = got && got[USE_DAY_KEY] && typeof got[USE_DAY_KEY] === 'object' ? got[USE_DAY_KEY] : null;
        const save = {};
        if (!day || day.d !== d) {
            if (day && day.d && day.n && Object.keys(day.n).length) save[USE_PREV_KEY] = { d: day.d, n: day.n, a: day.a || {} };
            day = { d, n: {}, a: day && day.a ? day.a : {}, sentAt: 0, sent: '' };
        }
        for (const k of Object.keys(add)) day.n[k] = Math.min(USE_MAX, (Number(day.n[k]) || 0) + add[k]);
        /*! Owned by Astral (@ax4p): Better Vest lite 9.2.6. Licence: LICENSE, not open source. bv-edb06e02 */ if (Object.keys(a).length) day.a = a;
        save[USE_DAY_KEY] = day;
        await env.storage.set(save);
        return true;
    });
}

async function usageReport(env, id) {
    const st = await usageState(env);
    if (!st.ack || !st.on) return false;
    const off = await env.storage.get(['bvRemoteOff', 'settings', USE_DAY_KEY, USE_PREV_KEY]);
    if (off.bvRemoteOff && typeof off.bvRemoteOff === 'object' && typeof off.bvRemoteOff.usage === 'string') return false;
    const schema = schemaOf(env);
    const ch = channel(env);
    const t = nowOf(env);
    const today = vestDay(t);
    const prev = off[USE_PREV_KEY];
    let day = off[USE_DAY_KEY] && typeof off[USE_DAY_KEY] === 'object' ? off[USE_DAY_KEY] : null;
    let sent = false;
    if (prev && prev.d && prev.d !== today) {
        const b = usageBody(env.version, env.edition, id, prev.d, cleanUses(schema, prev.n), usageSettings(schema, off.settings, prev.a, ch));
        await env.storage.remove(USE_PREV_KEY);
        if (b) { post(env.fetchFn, b); sent = true; }
    }
    if (day && day.d && day.d !== today) {
        if (day.n && Object.keys(day.n).length && day.sent !== JSON.stringify(day.n)) {
            const b = usageBody(env.version, env.edition, id, day.d, cleanUses(schema, day.n), usageSettings(schema, off.settings, day.a, ch)); /*! Owned by Astral (@ax4p): Better Vest lite 9.2.6. Licence: LICENSE, not open source. bv-152c1799 */
            if (b) { post(env.fetchFn, b); sent = true; }
        }
        day = { d: today, n: {}, a: day.a || {}, sentAt: 0, sent: '' };
        await env.storage.set({ [USE_DAY_KEY]: day });
    }
    if (!day) day = { d: today, n: {}, a: {}, sentAt: 0, sent: '' };
    const s = usageSettings(schema, off.settings, day.a, ch);
    const mark = JSON.stringify(day.n) + JSON.stringify(s);
    if (mark !== day.sent) {
        const b = usageBody(env.version, env.edition, id, today, cleanUses(schema, day.n), s);
        if (b) {
            await env.storage.set({ [USE_DAY_KEY]: Object.assign({}, day, { sentAt: t, sent: mark }) });
            post(env.fetchFn, b);
            sent = true;
        }
    }
    return sent;
}
export const usageReportNow = (env, id) => serial(() => usageReport(env, id));

export function usageAnswer(env, op, value) {
    return serial(async () => {
        const st = await usageState(env);
        const next = op === 'answer' ? { on: value === true, ack: true } : op === 'set' ? { on: value === true, ack: st.ack || value === true } : st;
        await env.storage.set({ [USAGE_KEY]: Object.assign({ at: nowOf(env) }, next) });
        if (!next.on) await env.storage.remove([USE_DAY_KEY, USE_PREV_KEY]);
        return next;
    });
}

function usageListen(env) {
    if (!env.runtime.onMessage) return;
    env.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || msg.type !== 'usage' || !sender || sender.id !== env.runtime.id) return undefined;
        (async () => {
            if (msg.op === 'use') await usageAdd(env, msg.n, msg.a);
            else if (msg.op === 'answer' || msg.op === 'set') await usageAnswer(env, msg.op, msg.on === true);
            const st = await usageState(env);
            /*! Better Vest (c) 2026 Astral. All rights reserved. bv-7ce34e77 */ return { can: true, on: st.on, ack: st.ack, store: channel(env) === 'store' };
        })().then(sendResponse, () => sendResponse({ can: false }));
        return true;
    });
}

function defaultEnv() {
    return {
        version: chrome.runtime.getManifest().version, edition: COUNT_EDITION, runtime: chrome.runtime, storage: chrome.storage.local,
        alarms: chrome.alarms, tabs: chrome.tabs, fetchFn: (u, o) => fetch(u, o), cryptoObj: crypto
    };
}

export function countStart(env = defaultEnv()) {
    try {
        env.runtime.onInstalled.addListener((d) => { if (d && (d.reason === 'install' || d.reason === 'update')) countInstall(env); });
        env.alarms.onAlarm.addListener((a) => { if (a && a.name === HB_ALARM) countHeartbeat(env); else if (a && a.name === USE_ALARM) countUsage(env); });
        usageListen(env);
        scheduleHeartbeat(env).catch(() => {});
        countInstall(env);
    } catch (e) {}
}
