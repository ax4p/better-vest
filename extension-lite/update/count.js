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
    return run; /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-507a5e4a */
}

export const COUNT_URL = 'https://bv.astrals.dev/api/count';
export const BYE_URL = 'https://bv.astrals.dev/bye';
export function byeAddress(version, edition, installedAt, now) {
    if (!VERSION_RE.test(String(version)) || ['standard', 'lite', 'wicked', 'store'].indexOf(edition) < 0) return null;
    const at = Number(installedAt);
    const d = at > 0 && now >= at ? Math.min(3650, Math.floor((now - at) / 86400000)) : null;
    return BYE_URL + '?v=' + version + '&e=' + edition + (d === null ? '' : '&d=' + d);
}
export async function byeUrl(env) {
    if (!env.runtime || typeof env.runtime.setUninstallURL !== 'function') return false;
    let at = null;
    try { const o = await env.storage.get('bvInstalledAt'); at = o && o.bvInstalledAt; } catch (e) {}
    const url = byeAddress(env.version, channel(env) === 'store' ? 'store' : env.edition, at, Date.now());
    if (!url) return false;
    await env.runtime.setUninstallURL(url);
    return true;
}
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const COUNT_EDITIONS = ['standard', 'lite', 'wicked'];

export function installBody(version, edition) {
    if (!VERSION_RE.test(String(version)) || COUNT_EDITIONS.indexOf(edition) < 0) return null;
    return JSON.stringify({ k: 'i', v: version, e: edition });
}

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

const HB_MIN = 3; /* (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-01b09806 */
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
}

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
    const e = await env.alarms.get(ERR_ALARM);
    if (!e || e.periodInMinutes !== ERR_MIN) await env.alarms.create(ERR_ALARM, { delayInMinutes: ERR_MIN, periodInMinutes: ERR_MIN });
}

const USAGE_SCHEMA = {"set":{"acct.100k":{"num":[0,200]},"acct.10k":{"num":[0,200]},"acct.150k":{"num":[0,200]},"acct.200k":{"num":[0,200]},"acct.25k":{"num":[0,200]},"acct.50k":{"num":[0,200]},"acct.5k":{"num":[0,200]},"acct.count":["0","1","2","3","4-5","6-9","10-19","20+"],"acct.eval":{"num":[0,200]},"acct.funded":{"num":[0,200]},"acct.instant":{"num":[0,200]},"acct.otherSize":{"num":[0,200]},"acct.primary":{"num":[0,50]},"accts.menu":"bool","accts.panel":"bool","accts.points":"bool","accts.sort":["limit","name","value","today"],"accts.strip":"bool","accts.stripAt":["top","market"],"accts.warn":"bool","autobe.on":"bool","autobe.unit":["pt","usd"],"card.collapsed":"bool","card.partPct":{"num":[1,99]},"card.partials":"bool","card.place":["float","ticket","dock"],"card.preset":["5k","10k","25k","custom"],"card.prices":"bool","card.risk":"bool","card.slOn":"bool","card.slUnit":["pt","usd","price"],"card.targets":{"num":[1,10]},"card.tpOn":"bool","card.tpUnit":["pt","usd","price"],"card.vestTicket":"bool","ch":["github","store","wicked","phone"],"chart.hideGrid":"bool","chart.hideSessions":"bool","chart.hideVolume":"bool","chart.stars":["auto","on","off"],"chart.sync":"bool","copy.engine":["none","light","turbo","mixed"],"copy.followers":{"num":[0,50]},"copy.groups":{"num":[0,20]},"copy.limits":"bool","copy.on":"bool","copy.ultra":"bool","dll.flat":"bool","dll.on":"bool","dll.profit":"bool","dll.vest":"bool","font":["site","system","inter","geist","manrope","grotesk","plex","jetbrains","mono"],"heat.engine":["hide","show"],"heat.on":"bool","hide.banner":"bool","hide.book":"bool","hide.footer":"bool","hide.health":"bool","hide.leftRail":"bool","hide.leftTools":"bool","hide.nav":"bool","hide.positions":"bool","hide.stats":"bool","hide.ticket":"bool","hide.topStats":"bool","keys.be":"key","keys.bracket":"bool","keys.flat":"key","keys.limitBuy":"key","keys.limitSell":"key","keys.long":"key","keys.on":"bool","keys.short":"key","keys.toast":"bool","layout.posSize":["vest","small","tall"],"limit.show":"bool","look.accent":["theme","own"],"look.bg":["none","color","aurora","dusk","ocean","forest","image"],"look.compactDock":"bool","look.dockCalendar":"bool","look.glass":{"num":[0,100]},"look.updown":["theme","classic","cvd","teal","custom"],"mch.layout":["1","2h","2v","3","4"],"mnq":"bool","news.cpi":"bool","news.fomc":"bool","news.gdp":"bool","news.nfp":"bool","news.pce":"bool","news.ppi":"bool","onb.goals":["none","copy","fast","prop","clean","copy+fast","copy+prop","copy+clean","fast+prop","fast+clean","prop+clean","copy+fast+prop","copy+fast+clean","copy+prop+clean","fast+prop+clean","copy+fast+prop+clean"],"onb.state":["new","done","skipped"],"phone.hold":"bool","phone.mini":"bool","phone.vestOrder":"bool","phone.vestToasts":"bool","pnl.autoPop":"bool","pnl.tape":"bool","session.lead1":"bool","session.lead5":"bool","session.on":"bool","session.open":"bool","stops.show":"bool","theme":["astral","dark","oled","light","nebula","starfield","midnight","native","dracula","catppuccin","custom"],"tilt.on":"bool","tpsl.beMode":["pctProfit","ticks","points"],"tpsl.beShow":"bool","tpsl.followBars":"bool","tpsl.makeRoom":"bool","tpsl.on":"bool","tpsl.showR":"bool","trail.now":"bool","trail.on":"bool","trail.unit":["pt","usd"],"vc.mode":["ptt","wake"],"vc.on":"bool","vc.open":"bool","voice.exits":"bool","voice.on":"bool","voice.orders":"bool","voice.pack":["arthur","eddie","elara","belle","emma","tala"],"voice.risk":"bool","voice.session":"bool","voice.vol":{"num":[0,100]},"wick.always":"bool","wick.ask":"bool","wick.on":"bool","wick.seg":["newcomer","regular","copier"],"wick.state":["asking","armed","always","quiet","done","off"],"wick.variant":["3","4","5"],"widget.spread":"bool"},"use":{"accts.manage":1,"accts.menu":1,"accts.panel":1,"accts.payout":1,"alert.add":1,"alert.hit":1,"alert.remove":1,"buy.none":1,"buy.other":1,"buy.wick":1,"cal.open":1,"card.collapse":1,"card.cxl":1,"card.flat":1,"card.flatReduce":1,"card.half":1,"card.limit":1,"card.lock":1,"card.long":1,"card.part":1,"card.rev":1,"card.short":1,"card.stop":1,"cert.open":1,"chart.be":1,"chart.drag":1,"copy.light":1,"copy.on":1,"copy.turbo":1,"dock.charts":1,"dock.macros":1,"fb.open":1,"fb.sent":1,"heat.on":1,"hk.be":1,"hk.flat":1,"hk.limitBuy":1,"hk.limitSell":1,"hk.long":1,"hk.short":1,"mch.change":1,"onb.copyHow":1,"onb.copyOpen":1,"onb.done":1,"onb.list":1,"onb.look":1,"onb.shown":1,"onb.skip":1,"onb.step":1,"onb.tour":1,"phone.card":1,"phone.copy":1,"phone.draw":1,"phone.full":1,"phone.menu":1,"phone.min":1,"phone.restore":1,"phone.strip":1,"pnl.gif":1,"pnl.open":1,"pnl.png":1,"pnl.video":1,"set.alerts":1,"set.chart":1,"set.exec":1,"set.focus":1,"set.keys":1,"set.look":1,"set.market":1,"set.more":1,"set.open":1,"set.risk":1,"set.tpsl":1,"spend.none":1,"spend.other":1,"spend.wick":1,"time.active":1,"trade.autobe":1,"trade.eval":1,"trade.funded":1,"trade.instant":1,"trade.nostop":1,"trade.notarget":1,"trade.nq":1,"trade.other":1,"trade.partials":1,"trade.price":1,"trade.primary":1,"trade.risk":1,"trade.trail":1,"trade.usd":1,"upd.open":1,"vc.be":1,"vc.flat":1,"vc.half":1,"vc.heard":1,"vc.limitBuy":1,"vc.limitSell":1,"vc.listenPtt":1,"vc.listenWake":1,"vc.long":1,"vc.micBlocked":1,"vc.miss":1,"vc.noEngine":1,"vc.rev":1,"vc.short":1,"vc.talkSec":1,"vc.window":1,"voice.test":1,"wick.always":1,"wick.ask":1,"wick.auto":1,"wick.fail":1,"wick.no":1,"wick.ok":1,"wick.p01No":1,"wick.p01Paid":1,"wick.p01Show":1,"wick.p01Yes":1,"wick.p02No":1,"wick.p02Paid":1,"wick.p02Show":1,"wick.p02Yes":1,"wick.p03No":1,"wick.p03Paid":1,"wick.p03Show":1,"wick.p03Yes":1,"wick.p05No":1,"wick.p05Paid":1,"wick.p05Show":1,"wick.p05Yes":1,"wick.p06No":1,"wick.p06Paid":1,"wick.p06Show":1,"wick.p06Yes":1,"wick.p07No":1,"wick.p07Paid":1,"wick.p07Show":1,"wick.p07Yes":1,"wick.p09No":1,"wick.p09Paid":1,"wick.p09Show":1,"wick.p09Yes":1,"wick.p10No":1,"wick.p10Paid":1,"wick.p10Show":1,"wick.p10Yes":1,"wick.p11No":1,"wick.p11Paid":1,"wick.p11Show":1,"wick.p11Yes":1,"wick.p12No":1,"wick.p12Paid":1,"wick.p12Show":1,"wick.p12Yes":1,"wick.p15No":1,"wick.p15Paid":1,"wick.p15Show":1,"wick.p15Yes":1,"wick.tipCopy":1,"wick.tipPage":1,"wick.tipSent":1,"wick.use":1,"wick.v3Always":1,"wick.v3Ask":1,"wick.v3No":1,"wick.v3Use":1,"wick.v4Always":1,"wick.v4Ask":1,"wick.v4No":1,"wick.v4Use":1,"wick.v5Always":1,"wick.v5Ask":1,"wick.v5No":1,"wick.v5Use":1}};
const USE_MAX = 100000;
const USE_CAP = { 'time.active': 1440 };
const useCap = (k) => (Object.prototype.hasOwnProperty.call(USE_CAP, k) ? USE_CAP[k] : USE_MAX);
const USE_MIN = 10;
const USE_NAME_RE = /^[a-z][a-zA-Z0-9]{0,15}\.[a-zA-Z0-9]{1,24}$/;
const KEY_RE = /^([a-z0-9]|f([1-9]|1[0-9]|2[0-4]))$/;

/* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-8e1233e8 */ export function vestDay(ms) {
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
    if (!n || typeof n !== 'object' || Array.isArray(n)) return out; /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-e0138106 */
    for (const k of Object.keys(n).slice(0, 300)) {
        const v = n[k];
        if (USE_NAME_RE.test(k) && Object.prototype.hasOwnProperty.call(schema.use, k) && Number.isInteger(v) && v >= 1) out[k] = Math.min(v, useCap(k));
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

const on = (v) => v !== false;
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
        'layout.posSize': pick(S.posSize, ['vest', 'small', 'tall'], 'vest'),
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
        'vc.on': yes(o(S.vcmd).on), 'vc.mode': o(S.vcmd).mode === 'wake' ? 'wake' : 'ptt', 'vc.open': on(o(S.vcmd).open), /* @license Better Vest 9.5.4. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-608ce5a3 */
        'heat.on': yes(o(S.heat).on), 'heat.engine': o(S.heat).engine === 'show' ? 'show' : 'hide',
        'onb.state': ['new', 'done', 'skipped'].includes(o(S.onb).state) ? o(S.onb).state : undefined,
        'onb.goals': ['done', 'skipped'].includes(o(S.onb).state) ? (['copy', 'fast', 'prop', 'clean'].filter((k) => String(o(S.onb).goals || '').split('+').includes(k)).join('+') || 'none') : undefined,
        'mch.layout': o(S.mch).layout || '1',
        'dll.on': yes(dll.on), 'dll.flat': on(dll.flat), 'dll.vest': on(dll.vest), 'dll.profit': yes(dll.pon), 'tilt.on': yes(o(S.tilt).on),
        'accts.menu': on(vu.menu), 'accts.panel': on(vu.panel), 'accts.strip': on(vu.strip), 'accts.points': on(vu.points), 'accts.warn': on(vu.warn),
        'accts.sort': vu.sort || 'limit', 'accts.stripAt': vu.stripAt || 'top',
        'pnl.autoPop': on(sh.autoPop), 'pnl.tape': on(sh.tape),
        'wick.ask': on(ui.wickAsk), 'wick.always': yes(ui.wickAlways),
        'wick.on': on(o(S.wkx).on), 'wick.seg': o(S.wkx).v === 1 ? o(S.wkx).seg : undefined, 'wick.state': o(S.wkx).v === 1 ? o(S.wkx).st : undefined,
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
        /* (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-f7fff89b */ if (!st.on) return false;
        const d = vestDay(nowOf(env));
        const got = await env.storage.get(USE_DAY_KEY);
        let day = got && got[USE_DAY_KEY] && typeof got[USE_DAY_KEY] === 'object' ? got[USE_DAY_KEY] : null;
        const save = {};
        if (!day || day.d !== d) {
            if (day && day.d && day.n && Object.keys(day.n).length) save[USE_PREV_KEY] = { d: day.d, n: day.n, a: day.a || {} };
            day = { d, n: {}, a: day && day.a ? day.a : {}, sentAt: 0, sent: '' };
        }
        for (const k of Object.keys(add)) day.n[k] = Math.min(useCap(k), (Number(day.n[k]) || 0) + add[k]);
        if (Object.keys(a).length) day.a = a;
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
    /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-8a39d8ce */ const today = vestDay(t);
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
            const b = usageBody(env.version, env.edition, id, day.d, cleanUses(schema, day.n), usageSettings(schema, off.settings, day.a, ch));
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
/*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-de69ac5a */ }
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
            return { can: true, on: st.on, ack: st.ack, store: channel(env) === 'store' };
        })().then(sendResponse, () => sendResponse({ can: false }));
        return true;
    });
}

export const ERR_URL = 'https://bv.astrals.dev/api/errors';
const ERR_KEY = 'bvErrs';
const ERR_ALARM = 'bv-errs';
const ERR_MIN = 5;
export const ERR_CATS = ['js', 'toast', 'copy', 'order', 'sync', 'update', 'worker', 'other'];
const ERR_K_RE = /^[a-z]{2,8}(\.[A-Za-z0-9_-]{1,40}){0,4}$/;
const ERR_X = ['engine', 'kind', 'side', 'vest', 'http', 'market', 'n', 'state', 'why', 'fn', 'file', 'line', 'col', 'page', 'mode', 'ms', 'tab'];
const ERR_FN_RE = /^[\w$.@<>:, -]{1,240}$/;
const ERR_FILE_RE = /^[\w./-]{1,80}$/;
const ERR_NEW_MAX = 30;
const ERR_DAY_MAX = 100;
const ERR_ITEMS_MAX = 40;
const ERR_PEND_MAX = 200;
const ERR_SENT_MAX = 500;
const ERR_GAP_MS = 2000;
const ERR_CODE_AT = /(?:\berror[_ ]?code|\bcode|\berror|\bHTTP|\bHTTP \d{3}|\bstatus|\bmint|\brejected the order)["'\s:=]*$/i;
const errCodeAt = (d, at, all) => d.length >= 3 && d.length <= 6 && (ERR_CODE_AT.test(all.slice(Math.max(0, at - 40), at))
    || (/^\s*$/.test(all.slice(0, at)) && /^(\s*$| \()/.test(all.slice(at + d.length))));

export function errScrub(s, max) {
    const t = String(s == null ? '' : s)
        .replace(/Bearer\s+\S+/gi, 'Bearer ***')
        .replace(/\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/g, '***')
        .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
        .replace(/\b0x[0-9a-f]{6,}\b/gi, '<addr>')
        .replace(/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, '<id>')
        .replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/gi, '$1')
        .replace(/\b(?=[\w-]{20,})(?=[A-Za-z_-]*\d)[\w-]+/g, '<tok>')
        .replace(/[$€£]\s?-?[\d,]*\.?\d+k?/gi, '$#')
        .replace(/-?\b\d{1,3}(,\d{3})+(\.\d+)?\b/g, '#')
        .replace(/-?\b\d+\.\d+\b/g, '#') /* Better Vest (c) 2026 Astral. All rights reserved. bv-0cb63b53 */
        .replace(/\b\d+\b/g, (d, at, all) => (errCodeAt(d, at, all) ? d : '#'))
        .replace(/\s+/g, ' ')
        .trim();
    return t.slice(0, max || 240);
}

export function errClean(it, now) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
    const c = ERR_CATS.indexOf(it.c) >= 0 ? it.c : 'other';
    const k = typeof it.k === 'string' && ERR_K_RE.test(it.k) && it.k.split('.')[0] === c ? it.k : c;
    const m = errScrub(it.m, 240);
    const x = {};
    const src = it.x && typeof it.x === 'object' && !Array.isArray(it.x) ? it.x : {};
    for (const key of ERR_X) {
        const v = src[key];
        if (typeof v === 'number' && Number.isFinite(v)) x[key] = Math.round(v);
        else if (typeof v === 'boolean') x[key] = v;
        else if (typeof v === 'string' && v) {
            const s = key === 'fn' ? (ERR_FN_RE.test(v) ? v : '') : key === 'file' ? (ERR_FILE_RE.test(v) ? v : '') : errScrub(v, 80);
            if (s) x[key] = s;
        }
    }
    const t = Number.isFinite(now) ? now : Date.now();
    const f = Number.isFinite(it.f) && it.f > 0 && it.f <= t ? Math.round(it.f) : t;
    const l = Number.isFinite(it.l) && it.l >= f && it.l <= t ? Math.round(it.l) : f;
    return { c, k, m, x, n: Number.isInteger(it.n) && it.n >= 1 ? Math.min(it.n, 10000) : 1, f, l };
}

export function errUa(ua) {
    const s = String(ua || '');
    const b = /Edg(A|iOS)?\//.test(s) ? 'edge' : /OPR\//.test(s) ? 'opera' : /Firefox\/|FxiOS\//.test(s) ? 'firefox' : /Chrome\/|CriOS\//.test(s) ? 'chrome' : /Safari\//.test(s) ? 'safari' : 'other';
    const re = { edge: /Edg(?:A|iOS)?\/(\d+)/, opera: /OPR\/(\d+)/, firefox: /(?:Firefox|FxiOS)\/(\d+)/, chrome: /(?:Chrome|CriOS)\/(\d+)/, safari: /Version\/(\d+)/ }[b];
    const v = re ? Number((re.exec(s) || [])[1]) : NaN;
    const os = /iPhone|iPad|iPod/.test(s) ? 'ios' : /Android/.test(s) ? 'android' : /CrOS/.test(s) ? 'chromeos' : /Mac OS X|Macintosh/.test(s) ? 'mac' : /Windows/.test(s) ? 'win' : /Linux/.test(s) ? 'linux' : 'other';
    return { b, bv: Number.isInteger(v) && v > 0 && v < 1000 ? v : 0, os };
}

export function errBody(version, edition, id, ch, ua, items) {
    if (!VERSION_RE.test(String(version)) || COUNT_EDITIONS.indexOf(edition) < 0 || !Array.isArray(items) || !items.length) return null;
    const body = { k: 'e', v: version, e: edition, ch: ['github', 'store', 'wicked', 'phone'].indexOf(ch) >= 0 ? ch : 'github', ua: ua || errUa(''), x: items.slice(0, ERR_ITEMS_MAX) };
    if (typeof id === 'string' && ID_RE.test(id)) body.id = id; /*! Better Vest (c) 2026 Astral. All rights reserved. bv-20af4439 */
    return JSON.stringify(body);
}

async function errState(env) {
    const got = await env.storage.get([ERR_KEY, 'settings', 'bvRemoteOff']);
    const st = got && got.settings && typeof got.settings === 'object' ? got.settings : {};
    const off = got && got.bvRemoteOff && typeof got.bvRemoteOff === 'object' && typeof got.bvRemoteOff.errors === 'string';
    const on = !off && !(st.errs && typeof st.errs === 'object' && st.errs.on === false);
    const r = got && got[ERR_KEY] && typeof got[ERR_KEY] === 'object' ? got[ERR_KEY] : {};
    return { on, rec: { d: r.d || '', sent: r.sent && typeof r.sent === 'object' ? r.sent : {}, news: Number(r.news) || 0, reports: Number(r.reports) || 0,
        pend: r.pend && typeof r.pend === 'object' ? r.pend : {}, lastAt: Number(r.lastAt) || 0 } };
}
function errDay(r, d) {
    return r.d === d ? r : { d, sent: {}, news: 0, reports: 0, pend: r.pend, lastAt: r.lastAt };
}
const errSig = (it) => it.c + '|' + it.k + '|' + it.m;

export function errsAdd(env, items) {
    return serial(async () => {
        if (!Array.isArray(items) || !items.length) return 0;
        const st = await errState(env);
        if (!st.on) {
            if (Object.keys(st.rec.pend).length) await env.storage.remove(ERR_KEY);
            return 0;
        }
        const t = nowOf(env);
        const r = errDay(st.rec, vestDay(t));
        let fresh = 0;
        for (const raw of items.slice(0, 50)) {
            const it = errClean(raw, t);
            if (!it) continue;
            const sig = errSig(it);
            const p = r.pend[sig];
            if (p) {
                p.n = Math.min(10000, (Number(p.n) || 1) + it.n);
                p.f = Math.min(Number(p.f) || it.f, it.f);
                p.l = Math.max(Number(p.l) || it.l, it.l);
            } else if (Object.keys(r.pend).length < ERR_PEND_MAX) r.pend[sig] = it;
            else continue;
            if (!r.sent[sig] && r.news < ERR_NEW_MAX) fresh++;
        }
        await env.storage.set({ [ERR_KEY]: r });
        return fresh;
    }).then((fresh) => {
        if (fresh) errsSoon(env);
        return fresh;
    });
} /*! Owned by Astral (@ax4p): Better Vest lite 9.5.4. Licence: LICENSE, not open source. bv-62a0fde8 */

let errTimer = 0;
function errsSoon(env) {
    if (errTimer) return;
    errTimer = setTimeout(() => { errTimer = 0; errsReport(env, true).catch(() => false); }, 300);
}

export function errsReport(env, soon) {
    return serial(async () => {
        const st = await errState(env);
        if (!st.on) return false;
        const t = nowOf(env);
        const r = errDay(st.rec, vestDay(t));
        const keys = Object.keys(r.pend);
        if (!keys.length) return false;
        if (soon && (r.news >= ERR_NEW_MAX || !keys.some((k) => !r.sent[k]))) return false;
        const capped = r.reports >= ERR_DAY_MAX;
        const ready = capped ? keys.filter((k) => r.sent[k]) : keys;
        if (!ready.length || (soon && capped)) return false;
        if (t - r.lastAt < ERR_GAP_MS) {
            if (!errTimer) errTimer = setTimeout(() => { errTimer = 0; errsReport(env, soon).catch(() => false); }, ERR_GAP_MS - (t - r.lastAt) + 50);
            return false;
        }
        const pick = ready.sort((a, b) => (r.sent[a] ? 1 : 0) - (r.sent[b] ? 1 : 0)).slice(0, ERR_ITEMS_MAX);
        const items = pick.map((k) => r.pend[k]);
        let fresh = false;
        for (const k of pick) {
            if (!r.sent[k]) {
                fresh = true; /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.5.4. bv-6c8de0c5 */
                if (Object.keys(r.sent).length < ERR_SENT_MAX) { r.sent[k] = 1; r.news++; }
            }
            delete r.pend[k];
        }
        if (fresh) r.reports++;
        r.lastAt = t;
        let id = null;
        try { if (typeof env.idOf === 'function') id = env.idOf(); else { const got = await env.storage.get(ID_KEY); id = got && got[ID_KEY]; } } catch (e) {}
        const body = errBody(env.version, env.edition, id, channel(env), errUa(env.ua), items);
        await env.storage.set({ [ERR_KEY]: r });
        if (!body) return false;
        try {
            const p = env.fetchFn(ERR_URL, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', cache: 'no-store', keepalive: true, referrerPolicy: 'no-referrer' });
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {}
        return true;
    });
}

function errsListen(env) {
    if (!env.runtime.onMessage) return;
    env.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || msg.type !== 'errs' || !sender || sender.id !== env.runtime.id) return undefined;
        (async () => {
            if (msg.op === 'add') await errsAdd(env, msg.items);
            const st = await errState(env);
            return { can: true, on: st.on };
        })().then(sendResponse, () => sendResponse({ can: false }));
        return true;
    });
}

function errsWorker(env) {
    const g = typeof self !== 'undefined' ? self : null;
    if (!g || typeof g.addEventListener !== 'function') return;
    const add = (e, why) => {
        /* This file is part of Better Vest by Astral and is protected by copyright. ref bv-f437ce3a */ const name = e && e.name ? String(e.name) : why;
        const st = String((e && e.stack) || '');
        const at = /\/((?:update|journal|cert|page)?\/?[\w.-]+\.js):(\d+):(\d+)/.exec(st);
        errsAdd(env, [{ c: 'worker', k: 'worker.' + (/^[A-Za-z]{1,30}$/.test(name) ? name : why), m: e && e.message ? e.message : String(e), x: at ? { file: at[1], line: Number(at[2]), col: Number(at[3]) } : {} }]).catch(() => {});
    };
    g.addEventListener('error', (ev) => { try { add(ev && (ev.error || ev), 'error'); } catch (e) {} });
    g.addEventListener('unhandledrejection', (ev) => { try { add(ev && ev.reason, 'rejection'); } catch (e) {} });
    g.bvErrReport = (c, k, m, x) => { try { errsAdd(env, [{ c, k, m, x }]).catch(() => {}); } catch (e) {} };
}

function defaultEnv() {
    return {
        version: chrome.runtime.getManifest().version, edition: COUNT_EDITION, runtime: chrome.runtime, storage: chrome.storage.local,
        alarms: chrome.alarms, tabs: chrome.tabs, fetchFn: (u, o) => fetch(u, o), cryptoObj: crypto,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : ''
    };
}

export function countStart(env = defaultEnv()) {
    try {
        env.runtime.onInstalled.addListener((d) => { if (d && (d.reason === 'install' || d.reason === 'update')) countInstall(env); });
        env.alarms.onAlarm.addListener((a) => {
            if (a && a.name === HB_ALARM) countHeartbeat(env);
            else if (a && a.name === USE_ALARM) countUsage(env);
            else if (a && a.name === ERR_ALARM) errsReport(env).catch(() => {});
        });
        usageListen(env);
        errsListen(env);
        errsWorker(env);
        scheduleHeartbeat(env).catch(() => {});
        countInstall(env);
        byeUrl(env).catch(() => {});
    } catch (e) {}
}
