// Better Vest share poster: the page (cert/share.html; in cert/ so the 8.0.5 self-updater, whose file list allows only known folders, can install it). The dock's P&L button on Vest's trade page sends a snapshot of today's P&L per account
// (src/copy/35-share.js -> bridge.js -> sw.js, cleaned by cert/share-model.js and kept in chrome.storage.session); this page builds the card
// from it (cert/share-card.js) and saves or copies it as a PNG through the certificate's pipeline (cert/raster.js). No request of ours.
// The controls sit in two bars on top (the owner, 2026-10-06): what the card is about and the two actions, then how it looks.
// 8.2: the Summary's rows (accounts, markets, copy groups, trades, sessions), period (from the Calendar for other days), markets, $, %,
// points and after fees on the card; the Replay's copy group, other markets, chart options (colors, chart type, timeframe, what is drawn),
// labels, prices, running P&L, sessions, best trade, and a video you watch here before you save it. Every option's default is 8.1.5's card.

import { cleanSnap, copyGroup, maskName, money, dayLong } from './share-model.js';
import { cardHtml, replayHtml, CARD_SIZES, chartOpts, CHART_DEFAULTS, CHART_PRESETS } from './share-card.js';
import { replayTrades, replayModel, replayFit, replayPick, videoPlan, hhmm, tzShort, replayTf, replayTfs, tfLabel } from './share-replay.js';
import { summaryModel, todayTrades, sampleHistory, snapGroups, periodRange, ROWS } from './share-summary.js';
import { recordReplay, videoMime, videoExt } from './share-video.js';
import { cardToPngBlob } from './raster.js';
import * as DB from '../journal/db.js';

const CARD_CSS = new URL('./share-card.css', import.meta.url).href;
const PREFS_KEY = 'bvSharePrefs';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const HAS_CHROME = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);

// the look you chose is remembered on this computer (this page's own storage); which accounts are on the card comes from each snapshot
const DEFAULT_PREFS = { kind: 'summary', style: 'vest', theme: 'dark', format: 'feed', hero: 'usd', handle: '',
    list: { on: true, green: false, mask: true }, show: { date: true, accounts: true, pct: false, market: true, handle: true, credit: true,
        trades: false, winrate: false, best: false, worst: false, fees: false },
    // 8.2
    rows: 'accounts', period: 'today', afterFees: true,
    rp: { labels: 'usd', prices: false, pnl: false, sessions: false, best: false },
    // 8.2 round 2: the Replay's chart (share-card.js chartOpts); the defaults are 8.1.5's chart
    chart: Object.assign({}, CHART_DEFAULTS) };
function loadPrefs() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) {}
    const o = p && typeof p === 'object' ? p : {};
    const merged = Object.assign({}, DEFAULT_PREFS, o);
    for (const k of ['list', 'show', 'rp']) merged[k] = Object.assign({}, DEFAULT_PREFS[k], o[k]);
    if (!ROWS.includes(merged.rows)) merged.rows = 'accounts';
    if (!['today', 'yesterday', 'week', 'month'].includes(merged.period)) merged.period = 'today';
    // a card kind 8.2 no longer has (Payouts, in the round before the owner's test) comes back as the Summary
    if (!['summary', 'replay'].includes(merged.kind)) merged.kind = 'summary';
    if (!['usd', 'pct', 'both', 'pts'].includes(merged.hero)) merged.hero = 'usd';
    merged.chart = chartOpts(o.chart);
    return merged;
}
function savePrefs() {
    const { kind, style, theme, format, hero, handle, list, show, rows, afterFees, rp, chart } = P;
    // a picked day belongs to one session: Period comes back as Today next time
    const period = P.period === 'day' ? 'today' : P.period;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ kind, style, theme, format, hero, handle, list, show, rows, period, afterFees, rp, chart })); } catch (e) {}
}

// not kept: which accounts, markets, day, group and market are on the card (they belong to one snapshot)
const P = Object.assign(loadPrefs(), { mode: 'accounts', picked: [], markets: null, pick: '', rpAcc: '', rpMarket: '' });
let snap = null;
let TT = [];          // today's trades of the snapshot (share-summary.js todayTrades)
// the Calendar's synced history, for other days (the same database and user the Calendar opens); the demo's is made up
const CAL = { gen: 0, loadingGen: -1, loaded: false, loading: null, trades: [], lastSync: null, err: '', sample: false };
// the Replay's selection: which trades (null: all) and which time (null: the whole session). It belongs to one snapshot, so it is not kept.
let RS = { ids: null, from: null, to: null };
let lastOut = null;   // what the stage shows now: { kind, el, scene }

// a new snapshot: copy trading when the copier is copying, else the account you trade on
function useSnap(s) {
    snap = cleanSnap(s);
    if (!snap) return;
    TT = todayTrades(snap);
    RS = { ids: null, from: null, to: null };
    P.markets = null;
    P.rpAcc = '';
    P.rpMarket = '';
    if (P.period === 'day') P.period = 'today';
    const group = copyGroup(snap);
    if (snap.copying && group.length > 1) {
        P.mode = 'copy';
        P.picked = group;
    } else {
        P.mode = 'accounts';
        const known = snap.accounts.filter((a) => a.pnl != null);
        const first = snap.accounts.find((a) => a.id === snap.activeId && a.pnl != null) || known[0];
        P.picked = first ? [first.id] : [];
    }
    CAL.loaded = false;
    CAL.gen = (CAL.gen || 0) + 1;
    loadCal().then(() => { if (CAL.loaded) { paintControls(); render(); } });
    paintControls();
    render();
}

// ---------- the Calendar's data (8.2) ----------
// One read per snapshot (gen): a read for an older snapshot never fills CAL. The read always starts after CAL.loading is set (a read that
// finished at once, the demo's, once left a resolved promise behind and a card re-rendered forever).
function loadCal() {
    const gen = CAL.gen || 0;
    if (CAL.loading && CAL.loadingGen === gen) return CAL.loading;
    CAL.loadingGen = gen;
    const pr = (async () => {
        await null;
        const data = await readCal();
        if ((CAL.gen || 0) !== gen) return;
        Object.assign(CAL, data, { loaded: true });
    })().finally(() => { if (CAL.loading === pr) CAL.loading = null; });
    CAL.loading = pr;
    return pr;
}
// render once the Calendar is read, only when it is (a newer snapshot's read renders by itself)
const calThenRender = () => loadCal().then(() => { if (CAL.loaded) render(); });
async function readCal() {
    try {
        if (snap && snap.demo) {
            // the demo never mixes in a real account's history: made-up days, marked Sample on the card
            return { trades: sampleHistory(snap, 45), lastSync: Date.now(), err: '', sample: true };
        }
        if (!HAS_CHROME) return { trades: [], err: 'none', sample: false };
        const got = await chrome.storage.local.get(['journalLastUser']).catch(() => ({}));
        let id = got.journalLastUser;
        if (!id) { const ids = await DB.listUserIds().catch(() => []); id = ids[0]; }
        if (!id) return { trades: [], err: 'none', sample: false };
        const db = await DB.openDb(String(id));
        try {
            const [trades, lastSync] = await Promise.all([DB.getAll(db, 'trades'), DB.getMeta(db, 'lastSync').catch(() => null)]);
            return { trades: trades || [], lastSync: lastSync || null, err: '', sample: false };
        } finally { db.close(); }
    } catch (e) {
        return { trades: [], err: 'read-failed', sample: false };
    }
}

const LIST = [['on', 'List'], ['green', 'Only green'], ['mask', 'Hide names']];
const LIST_TIP = { on: 'One row per account under the total', green: 'Only the accounts in profit: the total and the count then cover those', mask: 'Names show as EVAL***' };
const SHOW = {
    summary: [['date', 'Date'], ['accounts', '"Across N accounts" line'], ['pct', '% return (or $ when the big number is %)'], ['market', 'Market'],
        ['trades', 'Trades column'], ['winrate', 'Win rate'], ['best', 'Best trade'], ['worst', 'Biggest loss'], ['fees', 'Fees paid'], ['handle', 'Your name'], ['credit', 'Better Vest credit']],
    replay: [['date', 'Date'], ['accounts', 'Account name'], ['pct', '% return (or $ when the big number is not)'], ['market', 'Market'], ['handle', 'Your name'], ['credit', 'Better Vest credit']]
};
const ROW_NAMES = { accounts: 'Accounts', markets: 'Markets', groups: 'Copy groups', trades: 'Trades', sessions: 'Sessions' };
const ROW_TIP = { accounts: 'One row per account: today it is Vest\'s own day P&L', markets: 'One row per market you traded', groups: 'One row per copy group: its leader and followers together',
    trades: 'One row per trade, in time order', sessions: 'Asia, London and New York, in New York time, by when the trade opened' };
const PERIOD_NAMES = { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month' };
const RP_CHIPS = [['prices', 'Prices', 'The entry and exit price beside each trade'], ['pnl', 'Running P&L', 'A line under the candles: the day\'s P&L as each trade closed'],
    ['sessions', 'Sessions', 'Asia, London and New York in New York time, shaded behind the candles'], ['best', 'Best trade', 'The day\'s best trade, marked']];

// the accounts the picker lists: the copy group (leader first), or every account Vest showed
function pickList() {
    if (!snap) return [];
    return P.mode === 'copy' ? copyGroup(snap).map((id) => snap.accounts.find((a) => a.id === id)).filter(Boolean) : snap.accounts;
}

function paintControls() {
    if (!snap) return;
    const canCopy = copyGroup(snap).length > 1;
    const cp = $('mode').querySelector('[data-v="copy"]');
    cp.disabled = !canCopy;
    cp.title = canCopy ? 'The copy group: the leader and the accounts it copies to, each one a row' : 'Shows up while the copier has a leader and followers';
    const list = pickList();
    $('pick-head').textContent = P.mode === 'copy' ? 'Copy group' : 'Your accounts';
    $('pick').innerHTML = list.map((a) => {
        const known = a.pnl != null;
        const lead = P.mode === 'copy' && a.id === snap.leaderId ? '<span class="tag">LEAD</span>' : '';
        return `<label class="row${known ? '' : ' off'}"><input type="checkbox" data-id="${esc(a.id)}"${P.picked.includes(a.id) ? ' checked' : ''}${known ? '' : ' disabled'}>`
            + `<span class="nm">${esc(a.name)}</span>${lead}<span class="pv ${known ? (a.pnl > 0 ? 'up' : a.pnl < 0 ? 'dn' : '') : ''}">${known ? money(a.pnl) : '–'}</span></label>`;
    }).join('');
    const unknown = list.filter((a) => a.pnl == null).length;
    $('pick-note').textContent = unknown ? unknown + ' account' + (unknown === 1 ? '\'s' : 's\'') + ' P&L could not be read from Vest (open it once in Vest, then press P&L in the dock again).' : '';
    paintPick();
}

// the picker's button: the one account's name, or how many of the list are on the card
function paintPick() {
    if (!snap) return;
    const list = pickList();
    const on = list.filter((a) => P.picked.includes(a.id));
    $('pick-t').textContent = P.mode === 'copy' ? 'Copy group' : on.length === 1 ? on[0].name : 'Accounts';
    $('pick-count').textContent = P.mode === 'copy' || on.length !== 1 ? on.length + ' / ' + list.length : '';
    $('pick-count').hidden = !$('pick-count').textContent;
}

// ---------- the Summary's own drop-downs (8.2) ----------
function summaryOpts() {
    return { rows: P.rows, mode: P.mode, picked: P.picked, greenOnly: !!P.list.green, period: { kind: P.period, pick: P.pick }, markets: P.markets, afterFees: P.afterFees };
}
function paintSummaryControls(M) {
    if (!snap) return;
    const groups = snapGroups(snap);
    $('rows').innerHTML = ROWS.map((k) => {
        const off = k === 'groups' && !groups.length;
        return `<label class="row${off ? ' off' : ''}" title="${esc(ROW_TIP[k])}"><input type="radio" name="rows" data-v="${k}"${P.rows === k ? ' checked' : ''}${off ? ' disabled' : ''}><span class="nm">${ROW_NAMES[k]}</span>${off ? '<span class="hint">no copy group</span>' : ''}</label>`;
    }).join('');
    $('rows-t').textContent = ROW_NAMES[P.rows];
    $('rows-note').textContent = P.rows !== 'accounts' && !snap.demo && snap.tradesErr ? 'Some of today\'s trades could not be read from Vest: press P&L in the dock again.' : snap.tradesCut ? 'A very busy day: the oldest of today\'s trades did not fit in the snapshot.' : '';
    const today = snap.day;
    $('per').innerHTML = ['today', 'yesterday', 'week', 'month'].map((k) => {
        const R = periodRange(k, today);
        return `<label class="row"><input type="radio" name="per" data-v="${k}"${P.period === k ? ' checked' : ''}><span class="nm">${PERIOD_NAMES[k]}</span><span class="hint">${esc(k === 'today' || k === 'yesterday' ? dayLong(R.from).replace(/^\w+, /, '') : R.label)}</span></label>`;
    }).join('');
    const day = $('per-day');
    if (today) { day.max = today; if (document.activeElement !== day) day.value = P.period === 'day' ? P.pick : ''; }
    $('per-t').textContent = P.period === 'day' && P.pick ? dayLong(P.pick).replace(/^\w+, /, '') : PERIOD_NAMES[P.period] || 'Today';
    const past = P.period !== 'today';
    $('per-note').textContent = !past ? 'Today is Vest\'s own day P&L, live. Other days come from your Calendar.'
        : CAL.sample ? 'Sample history (the demo).' : !CAL.loaded ? 'Reading your Calendar…'
        : CAL.err ? 'Other days come from your Calendar: open it and sync your history first.'
        : 'From your Calendar' + (CAL.lastSync ? ', synced ' + new Date(CAL.lastSync).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') + '. Sync it to bring past days up to date.';
    const all = M ? M.markets : [];
    $('mkts').innerHTML = all.length ? all.map((m) => `<label class="row"><input type="checkbox" data-m="${esc(m)}"${!P.markets || P.markets.includes(m) ? ' checked' : ''}><span class="nm">${esc(m)}</span></label>`).join('') : '';
    $('mkts-note').textContent = all.length ? 'Leaving a market out turns the Accounts rows into the realized P&L of the markets you keep.' : 'No trades read for this period yet.';
    $('mkts-t').textContent = !P.markets ? 'All' : P.markets.length === 1 ? P.markets[0] : P.markets.length + ' markets';
    $('mkts-count').textContent = P.markets && all.length ? P.markets.length + ' / ' + all.length : '';
    $('mkts-count').hidden = !$('mkts-count').textContent;
    $('fees-chip').classList.toggle('on', P.afterFees !== false);
    $('fees-chip').setAttribute('aria-pressed', P.afterFees !== false ? 'true' : 'false');
}

// ---------- the Replay's own drop-downs (8.2) ----------
function paintReplayAccounts() {
    if (!snap) return;
    const r = snap.replay;
    const groups = snapGroups(snap);
    const today = !r || !r.day || r.day === snap.day;
    $('rpa').innerHTML = `<label class="row"><input type="radio" name="rpa" data-v=""${!P.rpAcc ? ' checked' : ''}><span class="nm">This account</span></label>`
        + groups.map((g) => {
            const n = [g.leaderId].concat(g.followerIds).filter(Boolean).length;
            const off = !today;
            return `<label class="row${off ? ' off' : ''}"><input type="radio" name="rpa" data-v="${esc(g.id)}"${P.rpAcc === g.id ? ' checked' : ''}${off ? ' disabled' : ''}><span class="nm">Copy group ${esc(g.id)}</span><span class="hint">${n} account${n === 1 ? '' : 's'}</span></label>`;
        }).join('');
    $('rpa-t').textContent = P.rpAcc ? 'Group ' + P.rpAcc : 'This account';
    $('rpa-note').textContent = !groups.length ? 'A copy group shows up here while the copier has a leader and followers.' : !today ? 'Copy groups work on today\'s session.'
        : 'The chart shows this account\'s trades once; the big number is the whole group\'s P&L on this market in this time.';
    const alts = r && Array.isArray(r.alt) ? r.alt : [];
    $('rpm-pop').hidden = P.kind !== 'replay' || !alts.length;
    const mk = [r && r.market].concat(alts.map((a) => a.market)).filter(Boolean);
    $('rpm').innerHTML = mk.map((m, i) => `<label class="row"><input type="radio" name="rpm" data-v="${esc(i ? m : '')}"${(P.rpMarket || '') === (i ? m : '') ? ' checked' : ''}><span class="nm">${esc(m)}</span><span class="hint">${i ? 'traded today' : 'your chart'}</span></label>`).join('');
    $('rpm-t').textContent = P.rpMarket || (r && r.market) || '';
}

let shownFor = '';
function paintShow() {
    if (shownFor === P.kind) return;
    shownFor = P.kind;
    $('show').innerHTML = SHOW[P.kind].map(([k, l]) => `<label class="row"><input type="checkbox" data-k="${k}"><span class="nm">${l}</span></label>`).join('');
}

function paintSettings() {
    const replay = P.kind === 'replay', sum = P.kind === 'summary';
    // each card's own controls stand in the same place
    $('mode').hidden = $('pick-pop').hidden = !sum;
    $('rows-pop').hidden = $('per-pop').hidden = $('mkts-pop').hidden = !sum;
    $('rpt-pop').hidden = $('rpr-pop').hidden = $('rpa-pop').hidden = $('cx-pop').hidden = !replay;
    if (!replay) $('rpm-pop').hidden = true;
    $('sumopts').hidden = !sum;
    $('rplab-g').hidden = $('rpopts').hidden = !replay;
    $('video').hidden = !replay;
    $('mode').querySelectorAll('button').forEach((b) => { b.disabled = b.dataset.v === 'copy' && !(snap && copyGroup(snap).length > 1); });
    $('pick-btn').disabled = !snap;
    $('listopts').querySelectorAll('.chip').forEach((c) => { c.disabled = replay && c.dataset.k !== 'mask'; });
    $('hero').querySelector('[data-v="pct"]').disabled = replay;
    $('hero').querySelector('[data-v="both"]').disabled = replay;
    ['kind', 'mode', 'hero', 'theme', 'format', 'style'].forEach((k) => $(k).querySelectorAll('button').forEach((b) => {
        const on = b.dataset.v === P[k];
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }));
    $('rplab').querySelectorAll('button').forEach((b) => { const on = b.dataset.v === (P.rp.labels || 'usd'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('rpopts').querySelectorAll('.chip').forEach((c) => { const on = !!P.rp[c.dataset.k]; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('listopts').querySelectorAll('.chip').forEach((c) => {
        const on = !!P.list[c.dataset.k];
        c.classList.toggle('on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    paintShow();
    $('show').querySelectorAll('input').forEach((x) => { x.checked = !!P.show[x.dataset.k]; });
    if (document.activeElement !== $('handle')) $('handle').value = P.handle;
}

function render() {
    paintSettings();
    const fit = $('fit');
    const empty = $('empty');
    if (!snap) {
        fit.innerHTML = '';
        empty.hidden = false;
        empty.textContent = 'Press P&L in Better Vest\'s dock on Vest\'s trade page: this page then shows today\'s P&L of your accounts.';
        $('save').disabled = $('copy').disabled = true;
        $('pick-btn').disabled = true;
        $('cap').textContent = '';
        lastOut = null;
        return;
    }
    empty.hidden = true;
    $('sub').textContent = (snap.day ? dayLong(snap.day) : 'Today') + (snap.demo ? ' · sample numbers' : ', from Vest');
    if (P.kind === 'replay') { renderReplay(); return; }
    const M = summaryModel(snap, summaryOpts(), { today: TT, calendar: CAL.trades });
    paintSummaryControls(M);
    // the most account rows that fit the panel without spilling, from all of them down
    fit.style.transform = 'none';
    let out = null;
    for (let m = 60; m >= 1; m--) {
        out = cardHtml(snap, P, m, M);
        fit.innerHTML = out.html;
        const panel = fit.querySelector('.panel');
        if (!panel || panel.scrollHeight <= panel.clientHeight + 1) break;
    }
    lastOut = { kind: 'summary', el: fit.firstElementChild };
    scaleCard();
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    const what = { accounts: P.mode === 'copy' ? 'Copy group' : 'Accounts', markets: 'Markets', groups: 'Rows', trades: 'Period', sessions: 'Period' }[P.rows];
    const why = P.period !== 'today' && !CAL.sample && CAL.loaded && CAL.err ? 'Other days come from your Calendar: open it and sync your history first.'
        : P.rows !== 'accounts' && P.period === 'today' && !snap.demo && !TT.length ? 'No closed trades read for today' + (snap.tradesErr ? ': press P&L in the dock again.' : ' yet.')
        : 'Nothing on the card: pick one in ' + what + (P.list.green ? ', or turn off Only green' : '') + '.';
    $('cap').textContent = out && out.n ? 'Saves at ' + w * 2 + ' × ' + h * 2 + ' px' + (snap.demo ? ' · sample numbers, marked on the card' : '') + (M.live ? '' : ' · from your Calendar') : why;
    $('save').disabled = $('copy').disabled = !out || !out.n;
}

// why there is no Replay chart, in plain words (the codes come from src/copy/35-share.js and cert/share-replay.js)
const REPLAY_WHY = {
    'no-trades': 'No trades on this market for the account on your chart in its latest positions. Trade, then press P&L in the dock again.',
    'no-bars': 'Vest\'s chart did not have candles for today\'s trades. Open the chart on that market and press P&L again.',
    'no-chart': 'The Replay needs Vest\'s chart on the page. Open the trade page and press P&L again.',
    'no-account': 'Better Vest could not tell which account you trade on. Pick it in Vest\'s account menu, then press P&L again.',
    'no-bridge': 'Better Vest could not read your trades yet. Wait a moment after Vest loads, then press P&L again.',
    'read-failed': 'Vest did not send today\'s trades. Press P&L in the dock again.',
    timeout: 'Vest took too long to send today\'s trades and candles. Press P&L in the dock again.',
    'too-big': 'Today has too many trades to draw in one card. The Summary card still works.',
    none: 'Press P&L in the dock again to load the Replay (this card came from an older press).'
};
function renderReplay() {
    const fit = $('fit');
    fit.style.transform = 'none';
    paintReplayAccounts();
    paintReplayControls();
    paintChart();
    const out = replayHtml(snap, Object.assign({}, P, { rsel: RS }));
    if (!out.html) {
        fit.innerHTML = '';
        $('empty').hidden = false;
        $('empty').textContent = REPLAY_WHY[out.err] || REPLAY_WHY['read-failed'];
        $('cap').textContent = '';
        $('save').disabled = $('copy').disabled = $('video').disabled = true;
        lastOut = null;
        return;
    }
    fit.innerHTML = out.html;
    lastOut = { kind: 'replay', el: fit.firstElementChild, scene: out.scene, html: out.html, format: P.format };
    scaleCard();
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    const r = rpReplay() || {};
    const past = r.day && snap.day && r.day !== snap.day;
    if (!out.n) {
        $('cap').textContent = 'No trade on the card: tick one in Trades' + (RS.from != null ? ', or widen the time' : '') + '.';
        $('save').disabled = $('copy').disabled = $('video').disabled = true;
        return;
    }
    const noR = P.rp.labels === 'r' && out.M && out.M.trades.some((t) => !t.open && t.r == null) ? ' · R shows on trades whose stop was set with them' : '';
    $('cap').textContent = (past ? 'No trades today on ' + (r.market || 'this market') + ': your latest session, ' + dayLong(r.day) + ' · ' : '') + 'Saves at ' + w * 2 + ' × ' + h * 2 + ' px · Vest\'s own candles' + (snap.demo ? ' · sample trades, marked on the card' : '') + noR;
    $('save').disabled = $('copy').disabled = !out.n;
    $('video').disabled = !out.n || !videoMime();
    $('video').title = videoMime() ? 'The day plays out: a ' + Math.round(videoPlan(out.scene.n).total) + '-second video of this card (' + videoExt(videoMime()).toUpperCase() + '). It plays here first; nothing is saved until you press Save' : 'This browser cannot record video';
}

// as big as the stage allows, with room around it and for the caption (the card is HTML, so it stays sharp when scaled up)
function scaleCard() {
    const fit = $('fit');
    const card = fit.firstElementChild;
    if (!card) return;
    const stage = $('stage').getBoundingClientRect();
    const k = Math.max(0.2, Math.min(1.35, (stage.width - 96) / card.offsetWidth, (stage.height - 100) / card.offsetHeight));
    fit.style.transform = `scale(${k})`;
}

function fileBase() {
    return 'better-vest-pnl-' + (snap && snap.day ? snap.day : 'today') + (P.kind === 'replay' ? '-replay' : P.mode === 'copy' ? '-copy' : '');
}
function pngName() { return fileBase() + '.png'; }
async function pngBlob() {
    const card = $('fit').firstElementChild;
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    return cardToPngBlob(card, { cssUrl: CARD_CSS, width: w, height: h, scale: 2 });
}

// a short note at the bottom of the page after an action
let toastTimer = 0;
function say(msg, bad, keep) {
    const t = $('toast');
    t.textContent = msg || '';
    t.classList.toggle('bad', !!bad);
    t.classList.toggle('on', !!msg);
    clearTimeout(toastTimer);
    if (msg && !keep) toastTimer = setTimeout(() => t.classList.remove('on'), bad ? 6000 : 2600);
}

function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
let busy = false;
async function onSave() {
    if (busy || $('save').disabled) return;
    busy = true;
    try {
        saveBlob(await pngBlob(), pngName());
        say('Saved ' + pngName());
    } catch (e) { say('Could not make the image: ' + (e && e.message || e), true); }
    busy = false;
}
async function onCopy() {
    if (busy || $('copy').disabled) return;
    busy = true;
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
        say('Copied. Paste it into your post.');
    } catch (e) { say('Could not copy the image (' + (e && e.message || e) + '). Download it instead.', true); }
    busy = false;
}
// Video (8.2; round 2, the owner: "preview a video without downloading it"): the Replay card's day plays out, recorded in this page (keep
// the page in front while it records), then played here. Nothing is saved until Save; Close keeps it for the next press, and when the card
// has changed since, the preview says so and offers Record again.
let VID = null;   // { url, blob, mime, seconds, w, h, html, format }
async function recordVideo() {
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    // the card as it is when the recording starts: an option changed while it records makes the preview say the card changed
    const { html, format } = lastOut;
    const res = await recordReplay(lastOut.el, lastOut.scene, { cssUrl: CARD_CSS, width: w, height: h, scale: 2,
        onProgress: (f) => say('Recording ' + Math.round(f * 100) + '% · keep this page in front', false, true) });
    if (VID) URL.revokeObjectURL(VID.url);
    VID = { url: URL.createObjectURL(res.blob), blob: res.blob, mime: res.mime, seconds: res.seconds, w: w * 2, h: h * 2, html, format };
    window.__shareLastVideo = res;
    say('');
}
async function onVideo() {
    if (busy || $('video').disabled || !lastOut || lastOut.kind !== 'replay' || !lastOut.scene) return;
    if (VID) { openPreview(); return; }
    busy = true;
    const btn = $('video');
    btn.classList.add('rec');
    try { await recordVideo(); openPreview(); } catch (e) { say('Could not record the video: ' + (e && e.message || e), true); }
    btn.classList.remove('rec');
    busy = false;
}
const mmss = (t) => { const v = Math.max(0, Math.round(t || 0)); return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); };
const vmLen = () => { const v = $('vm-video'); return Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (VID ? VID.seconds : 0); };
function vmPaint() {
    const v = $('vm-video');
    const len = vmLen();
    if (document.activeElement !== $('vm-seek')) $('vm-seek').value = len ? Math.round((v.currentTime / len) * 1000) : 0;
    $('vm-time').textContent = mmss(v.currentTime) + ' / ' + mmss(len);
    $('vm-play').classList.toggle('on', !v.paused);
}
function openPreview() {
    if (!VID) return;
    closePops();
    const v = $('vm-video');
    if (v.src !== VID.url) {
        v.src = VID.url;
        // a recorded WebM has no length in it: one seek to the end makes the browser find it, so the bar can scrub
        v.addEventListener('loadedmetadata', function fix() {
            v.removeEventListener('loadedmetadata', fix);
            if (Number.isFinite(v.duration)) return;
            v.addEventListener('timeupdate', function back() { v.removeEventListener('timeupdate', back); v.currentTime = 0; v.play().catch(() => {}); });
            v.currentTime = 1e9;
        });
    }
    v.loop = $('vm-loop').classList.contains('on');
    const kb = VID.blob.size / 1024;
    $('vm-info').textContent = mmss(VID.seconds) + ' · ' + videoExt(VID.mime).toUpperCase() + ' · ' + VID.w + ' × ' + VID.h + ' · ' + (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB');
    const changed = !lastOut || lastOut.kind !== 'replay' || lastOut.html !== VID.html;
    $('vm-again').hidden = !changed;
    $('vm-note').textContent = changed ? 'The card changed since this video was made.' : 'Not saved yet.';
    $('vm-note').classList.toggle('warn', changed);
    $('vm').hidden = false;
    v.currentTime = 0;
    v.play().catch(() => {});
    vmPaint();
    $('vm-save').focus();
}
function closePreview() {
    const v = $('vm-video');
    v.pause();
    $('vm').hidden = true;
}
$('vm-video').addEventListener('timeupdate', vmPaint);
$('vm-video').addEventListener('play', vmPaint);
$('vm-video').addEventListener('pause', vmPaint);
$('vm-video').addEventListener('ended', vmPaint);
const vmToggle = () => { const v = $('vm-video'); if (v.paused) v.play().catch(() => {}); else v.pause(); };
$('vm-play').addEventListener('click', vmToggle);
$('vm-video').addEventListener('click', vmToggle);
$('vm-seek').addEventListener('input', (e) => { const v = $('vm-video'); const len = vmLen(); if (len) v.currentTime = (Number(e.target.value) / 1000) * len; vmPaint(); });
$('vm-loop').addEventListener('click', () => {
    const on = !$('vm-loop').classList.contains('on');
    $('vm-loop').classList.toggle('on', on);
    $('vm-loop').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('vm-video').loop = on;
});
$('vm-save').addEventListener('click', () => {
    if (!VID) return;
    const name = fileBase() + '.' + videoExt(VID.mime);
    saveBlob(VID.blob, name);
    say('Saved ' + name);
    $('vm-note').textContent = 'Saved as ' + name + '.';
    $('vm-note').classList.remove('warn');
});
$('vm-close').addEventListener('click', closePreview);
$('vm-x').addEventListener('click', closePreview);
$('vm').addEventListener('click', (e) => { if (e.target === $('vm')) closePreview(); });
$('vm-again').addEventListener('click', async () => {
    if (busy || !lastOut || lastOut.kind !== 'replay' || !lastOut.scene) return;
    busy = true;
    closePreview();
    $('video').classList.add('rec');
    try { await recordVideo(); openPreview(); } catch (e) { say('Could not record the video: ' + (e && e.message || e), true); }
    $('video').classList.remove('rec');
    busy = false;
});

// ---------- Replay: the chart (8.2 round 2): colours, type, timeframe, what is drawn ----------
const CX_COLORS = [['vest', 'Vest'], ['classic', 'Classic'], ['mono', 'Mono'], ['neon', 'Neon'], ['bo', 'Blue / orange'], ['mine', 'My chart'], ['custom', 'Custom']];
const CX_SHOW = [['grid', 'Grid', 'The price and time lines behind the candles'], ['price', 'Price axis', 'The prices on the right, and the last price'], ['time', 'Time axis', 'The times under the chart'],
    ['zones', 'Trade boxes', 'The shaded box from each entry to its exit'], ['lines', 'Lines', 'The dashed line from each entry to its exit'], ['volume', 'Volume', 'Vest\'s volume under the candles']];
// the chart's own candles carry Vest's volume only while its Volume indicator is on the chart (Better Vest removes it by default)
const CX_NOVOL = 'No volume came with these candles. To get it, turn off Remove volume indicator in Better Vest\'s chart settings, then press P&L in the dock again.';
const cxVest = (light) => (light ? ['#16a34a', '#e11d48'] : ['#00d68f', '#ff3b5c']);
const cxDark = (c) => (/^var\(/.test(c) ? (c.includes('text') ? '#fafafa' : '#737373') : c);
function cxSwatch(id) {
    const light = P.theme === 'light';
    const mine = snap && snap.chartColors;
    const pair = id === 'vest' ? cxVest(light) : id === 'mine' ? (mine ? [mine.up, mine.down] : ['#3a3a3a', '#3a3a3a'])
        : id === 'custom' ? [P.chart.up || '#26a69a', P.chart.down || '#ef5350'] : CHART_PRESETS[id].map(cxDark);
    return `<span class="cx-c"><i style="background:${pair[0]}"></i><i style="background:${pair[1]}"></i><i style="background:${pair[0]}"></i></span>`;
}
function paintChart() {
    const c = P.chart;
    const mine = !!(snap && snap.chartColors);
    $('cx-colors').innerHTML = CX_COLORS.map(([id, l]) => `<button type="button" data-v="${id}" class="${c.colors === id ? 'on' : ''}"${id === 'mine' && !mine ? ' disabled title="Press P&amp;L in the dock again to read your chart\'s colors"' : ''}>${cxSwatch(id)}${l}</button>`).join('');
    $('cx-custom').hidden = c.colors !== 'custom';
    if (c.up) $('cx-up').value = c.up.slice(0, 7);
    if (c.down) $('cx-down').value = c.down.slice(0, 7);
    $('cx-colors-note').textContent = c.colors === 'mine' && !mine ? 'Your chart\'s colors came with a newer press of P&L: press it again in the dock.' : c.colors === 'mine' ? 'The colors your Vest chart draws its candles with.' : '';
    $('cx-type').querySelectorAll('button').forEach((b) => { const on = b.dataset.v === c.type; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('cx-marks').querySelectorAll('button').forEach((b) => { const on = b.dataset.v === c.marks; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    // the timeframes this session can be drawn on: from the finest candles the dock sent
    const r = rpRaw();
    const tfs = r ? replayTfs(r, c.tf) : [];
    const own = r ? Number(r.res) : 0;
    const cur = c.tf || own;
    $('cx-tf').innerHTML = tfs.map((x) => `<button type="button" data-v="${x.own ? 0 : x.min}" class="${x.min === cur || (x.own && !c.tf) ? 'on' : ''}"${x.ok || x.own ? '' : ' disabled'} title="${esc(x.own ? 'The card\'s own: ' + x.n + ' candles' : x.ok ? x.n + ' candles' : x.why)}">${x.label}</button>`).join('');
    const pick = tfs.find((x) => x.min === c.tf);
    $('cx-tf-note').textContent = !r ? '' : c.tf && pick && !pick.ok && !pick.own ? tfLabel(c.tf) + ' cannot be drawn for this session (' + pick.why.toLowerCase() + '): the card shows ' + tfLabel(own) + '.'
        : r.fine ? 'From ' + tfLabel(r.fine.res) + ' candles Vest sent with this press: any whole number of them.' : 'Only whole numbers of ' + tfLabel(own) + ' candles: the dock sent nothing finer for this session.';
    const vol = !!(r && r.bars.every((b) => b.length > 5));
    $('cx-show').innerHTML = CX_SHOW.map(([k, l, tip]) => `<button type="button" class="chip${c[k] && (k !== 'volume' || vol) ? ' on' : ''}" data-k="${k}"${k === 'volume' && !vol ? ' disabled' : ''} title="${esc(k === 'volume' && !vol ? CX_NOVOL : tip)}" aria-pressed="${c[k] ? 'true' : 'false'}"><i></i>${l}</button>`).join('');
    $('cx-show-note').textContent = r && !vol ? CX_NOVOL : '';
    // a dot on the button while the chart is not the card's own
    $('cx-dot').hidden = JSON.stringify(chartOpts(c)) === JSON.stringify(CHART_DEFAULTS);
}
const cxSet = (patch) => { P.chart = chartOpts(Object.assign({}, P.chart, patch)); savePrefs(); render(); };
$('cx-colors').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const v = b.dataset.v;
    // Custom starts from the colors on the card now
    if (v === 'custom' && !P.chart.up) cxSet({ colors: v, up: $('cx-up').value, down: $('cx-down').value });
    else cxSet({ colors: v });
});
$('cx-up').addEventListener('input', (e) => cxSet({ colors: 'custom', up: e.target.value }));
$('cx-down').addEventListener('input', (e) => cxSet({ colors: 'custom', down: e.target.value }));
seg('cx-type', (v) => { P.chart = chartOpts(Object.assign({}, P.chart, { type: v })); savePrefs(); });
seg('cx-marks', (v) => { P.chart = chartOpts(Object.assign({}, P.chart, { marks: v })); savePrefs(); });
$('cx-tf').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; cxSet({ tf: Number(b.dataset.v) || 0 }); });
function cxCustomTf() {
    const n = Math.round(Number($('cx-n').value));
    const r = rpRaw();
    if (!(n >= 1 && n <= 1440) || !r) { $('cx-tf-note').textContent = 'A whole number of minutes, 1 to 1440.'; return; }
    const x = replayTfs(r, n).find((t) => t.min === n);
    if (x && !x.ok && !x.own) { $('cx-tf-note').textContent = tfLabel(n) + ': ' + x.why.toLowerCase() + '.'; return; }
    $('cx-n').value = '';
    cxSet({ tf: n === Number(r.res) ? 0 : n });
}
$('cx-n-go').addEventListener('click', cxCustomTf);
$('cx-n').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cxCustomTf(); } });
$('cx-show').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c || c.disabled) return; cxSet({ [c.dataset.k]: !P.chart[c.dataset.k] }); });
$('cx-reset').addEventListener('click', () => cxSet(Object.assign({}, CHART_DEFAULTS)));

// ---------- Replay: which trades, which time ----------
// the session as the card draws it: the market picked, on the timeframe picked (8.2 round 2)
const rpRaw = () => {
    const r = snap && snap.replay && !snap.replay.err ? replayPick(snap.replay, P.rpMarket) : null;
    return r && !r.err && r.bars.length ? r : null;
};
const rpReplay = () => { const r = rpRaw(); return r && P.chart.tf ? replayTf(r, P.chart.tf) : r; };
const qtyTxt = (q) => String(Math.round(q * 1e4) / 1e4);
function paintReplayControls() {
    const r = rpReplay();
    $('rpt-btn').disabled = $('rpr-btn').disabled = !r;
    if (!r) return;
    const list = replayTrades(r);
    const M = replayModel(r, RS);
    const shown = new Set(M.trades.map((t) => t.id));
    const picked = (t) => !RS.ids || RS.ids.includes(t.id);
    $('rpt').innerHTML = list.map((t) => `<label class="row${picked(t) && !shown.has(t.id) ? ' out' : ''}"><input type="checkbox" data-id="${esc(t.id)}"${picked(t) ? ' checked' : ''}>`
        + `<span class="tm">${hhmm(t.openT, r.tz)}</span><span class="sd ${t.side === 'long' ? 'l' : 's'}">${t.side === 'long' ? 'LONG' : 'SHORT'}</span><span class="qt" title="Size on Vest">${qtyTxt(t.qty)}</span>`
        + `<span class="pv ${t.open ? '' : t.net > 0 ? 'up' : t.net < 0 ? 'dn' : ''}">${t.open ? 'open' : money(t.net)}</span></label>`).join('');
    $('rpt-count').textContent = M.trades.length + ' / ' + list.length;
    $('rpt-note').textContent = list.length ? 'Times in ' + tzShort(r.tz, r.bars[0][0] * 1000) + ', your chart\'s clock.' : 'No trades in this session.';
    // the time: two handles over the session's candles
    const n = r.bars.length;
    // the candle that holds a moment (the card counts that candle in, at either end)
    const idx = (ms, end) => { if (ms == null) return end ? n - 1 : 0; let i = r.bars.findIndex((b) => b[0] * 1000 >= ms); if (i < 0) return n - 1; if (r.bars[i][0] * 1000 > ms && i > 0) i--; return i; };
    for (const el of [$('rpr-a'), $('rpr-b')]) { el.min = 0; el.max = n - 1; el.step = 1; }
    const a = idx(RS.from, false), b = idx(RS.to, true);
    if (document.activeElement !== $('rpr-a')) $('rpr-a').value = a;
    if (document.activeElement !== $('rpr-b')) $('rpr-b').value = b;
    const whole = RS.from == null && RS.to == null;
    const resMs = Number(r.res) * 60000;
    $('rpr-t').textContent = whole ? 'Whole session' : hhmm(r.bars[a][0] * 1000, r.tz) + ' – ' + hhmm(r.bars[b][0] * 1000 + resMs, r.tz);
    $('rpr-from').textContent = hhmm(r.bars[a][0] * 1000, r.tz);
    $('rpr-to').textContent = hhmm(r.bars[b][0] * 1000 + resMs, r.tz);
    const mins = (b - a + 1) * Number(r.res);
    $('rpr-len').textContent = (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60 ? (mins % 60) + ' min' : '') : mins + ' min').trim() + ' · ' + (b - a + 1) + ' candles of ' + tfLabel(r.res);
    $('rpr-spark').innerHTML = sparkSvg(r, list, a, b);
}
// the whole session in small: its candles, a dot per fill, the time on the card lit
function sparkSvg(r, list, a, b) {
    const n = r.bars.length, W = 400, H = 60;
    let lo = Infinity, hi = -Infinity;
    for (const x of r.bars) { if (x[3] < lo) lo = x[3]; if (x[2] > hi) hi = x[2]; }
    const X = (i) => ((i + 0.5) / n) * W, Y = (p) => 4 + (1 - (p - lo) / ((hi - lo) || 1)) * (H - 8);
    let out = '';
    r.bars.forEach((x, i) => { out += `<line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${Y(x[2]).toFixed(1)}" y2="${Y(x[3]).toFixed(1)}" stroke="${x[4] >= x[1] ? '#00D68F' : '#FF3B5C'}" stroke-width="${Math.max(1, (W / n) * 0.6).toFixed(1)}" opacity=".8"/>`; });
    const resS = Number(r.res) * 60;
    for (const t of list) for (const f of t.fills) {
        const i = r.bars.findIndex((x) => x[0] * 1000 <= f.t && f.t < (x[0] + resS) * 1000);
        if (i >= 0) out += `<circle cx="${X(i).toFixed(1)}" cy="${Y(f.px).toFixed(1)}" r="2.2" fill="${f.entry ? '#fff' : '#a3a3a3'}"/>`;
    }
    out += `<rect x="0" y="0" width="${((a / n) * W).toFixed(1)}" height="${H}" fill="#000" opacity=".62"/><rect x="${(((b + 1) / n) * W).toFixed(1)}" y="0" width="${(W - ((b + 1) / n) * W).toFixed(1)}" height="${H}" fill="#000" opacity=".62"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${out}</svg>`;
}
// ticking trades frames the time around them (all of them: the whole session)
function rpPick(ids) {
    const r = rpReplay();
    if (!r) return;
    const all = replayTrades(r).map((t) => t.id);
    RS.ids = ids && ids.length === all.length ? null : ids;
    const f = RS.ids && RS.ids.length ? replayFit(r, RS.ids) : null;
    RS.from = f ? f.from : null;
    RS.to = f ? f.to : null;
    render();
}
$('rpt').addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    const r = rpReplay();
    if (!id || !r) return;
    const cur = RS.ids ? RS.ids.slice() : replayTrades(r).map((t) => t.id);
    rpPick(e.target.checked ? (cur.includes(id) ? cur : cur.concat(id)) : cur.filter((x) => x !== id));
});
$('rpt-all').addEventListener('click', () => rpPick(null));
$('rpt-none').addEventListener('click', () => rpPick([]));
$('rpr-all').addEventListener('click', () => { RS.from = RS.to = null; render(); });
$('rpr-fit').addEventListener('click', () => {
    const r = rpReplay();
    const f = r ? replayFit(r, RS.ids) : null;
    if (f) { RS.from = f.from; RS.to = f.to; render(); }
});
// the two handles: at least 12 candles apart; the one moved pushes the other
let tlRaf = 0;
function onHandle(which) {
    const r = rpReplay();
    if (!r) return;
    const n = r.bars.length, gap = Math.min(11, n - 1);
    let a = +$('rpr-a').value, b = +$('rpr-b').value;
    if (b - a < gap) { if (which === 'a') { a = Math.min(a, n - 1 - gap); b = a + gap; } else { b = Math.max(b, gap); a = b - gap; } }
    $('rpr-a').value = a; $('rpr-b').value = b;
    RS.from = a === 0 && b === n - 1 ? null : r.bars[a][0] * 1000;
    RS.to = a === 0 && b === n - 1 ? null : r.bars[b][0] * 1000;
    cancelAnimationFrame(tlRaf);
    tlRaf = requestAnimationFrame(render);
}
$('rpr-a').addEventListener('input', () => onHandle('a'));
$('rpr-b').addEventListener('input', () => onHandle('b'));

// ---------- the drop-downs: one open at a time; a click outside or Esc closes it ----------
const POPS = [['pick-btn', 'pick-panel'], ['show-btn', 'show-panel'], ['rpt-btn', 'rpt-panel'], ['rpr-btn', 'rpr-panel'],
    ['rows-btn', 'rows-panel'], ['per-btn', 'per-panel'], ['mkts-btn', 'mkts-panel'], ['rpa-btn', 'rpa-panel'], ['rpm-btn', 'rpm-panel'], ['cx-btn', 'cx-panel']];
function closePops(except) {
    POPS.forEach(([b, p]) => { if (p !== except) { $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); } });
}
// an open drop-down is kept inside the window: below about 1600 px the bars wrap, and one at a line's edge opened partly off the page (on a
// 1536 px window Show, then first on the second line, opened almost wholly off it, out of reach)
function keepInside(panel) {
    panel.style.transform = '';
    const r = panel.getBoundingClientRect();
    const dx = r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0;
    const x = r.left + dx < 8 ? 8 - r.left : dx;
    if (x) panel.style.transform = `translateX(${Math.round(x)}px)`;
}
const keepPopsInside = () => POPS.forEach(([, p]) => { if (!$(p).hidden) keepInside($(p)); });
POPS.forEach(([b, p]) => $(b).addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $(p).hidden;
    closePops(p);
    $(p).hidden = !open;
    $(b).setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) keepInside($(p));
}));
// the click's path as it was when it happened: a drop-down that redraws its own buttons on a click (the Chart's colors, timeframes and
// switches) has taken the clicked one out of the page by the time the click gets here
document.addEventListener('click', (e) => { if (!e.composedPath().some((n) => n.classList && n.classList.contains('pop'))) closePops(); });

// ---------- wiring ----------
function seg(id, onPick) {
    $(id).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        onPick(b.dataset.v);
        render();
    });
}
seg('mode', (v) => {
    if (!snap || v === P.mode) return;
    P.mode = v;
    if (v === 'copy') P.picked = copyGroup(snap);
    else { const a = snap.accounts.find((x) => x.id === snap.activeId && x.pnl != null) || snap.accounts.find((x) => x.pnl != null); P.picked = a ? [a.id] : []; }
    paintControls();
});
['kind', 'hero', 'theme', 'format', 'style'].forEach((k) => seg(k, (v) => { P[k] = v; savePrefs(); }));
seg('rplab', (v) => { P.rp.labels = v; savePrefs(); });
$('listopts').innerHTML = LIST.map(([k, l]) => `<button type="button" class="chip" data-k="${k}" title="${esc(LIST_TIP[k])}"><i></i>${l}</button>`).join('');
$('rpopts').innerHTML = RP_CHIPS.map(([k, l, tip]) => `<button type="button" class="chip" data-k="${k}" title="${esc(tip)}"><i></i>${l}</button>`).join('');
$('listopts').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c || c.disabled) return;
    P.list[c.dataset.k] = !P.list[c.dataset.k];
    savePrefs();
    render();
});
$('rpopts').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    P.rp[c.dataset.k] = !P.rp[c.dataset.k];
    savePrefs();
    render();
});
$('fees-chip').addEventListener('click', () => { P.afterFees = P.afterFees === false; savePrefs(); render(); });
$('show').addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    P.show[k] = e.target.checked;
    savePrefs();
    render();
});
$('pick').addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    P.picked = e.target.checked ? P.picked.concat(id) : P.picked.filter((x) => x !== id);
    paintPick();
    render();
});
function pickAll(on) {
    const ids = pickList().filter((a) => a.pnl != null).map((a) => a.id);
    P.picked = on ? ids : [];
    paintControls();
    render();
}
$('pick-all').addEventListener('click', () => pickAll(true));
$('pick-none').addEventListener('click', () => pickAll(false));
// the Summary's rows, period and markets (8.2)
$('rows').addEventListener('change', (e) => { const v = e.target.dataset.v; if (!v) return; P.rows = v; savePrefs(); render(); });
$('per').addEventListener('change', (e) => {
    const v = e.target.dataset.v;
    if (!v) return;
    P.period = v;
    P.markets = null;
    savePrefs();
    if (v !== 'today' && !CAL.loaded) calThenRender();
    render();
});
$('per-day').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || (snap && v > snap.day)) return;
    P.period = 'day';
    P.pick = v;
    P.markets = null;
    if (!CAL.loaded) calThenRender();
    render();
});
$('mkts').addEventListener('change', () => {
    const boxes = [...$('mkts').querySelectorAll('input[data-m]')];
    const on = boxes.filter((b) => b.checked).map((b) => b.dataset.m);
    P.markets = on.length === boxes.length ? null : on;
    render();
});
$('mkts-all').addEventListener('click', () => { P.markets = null; render(); });
// the Replay's group and market (8.2): a new market starts with all its trades and its whole session
$('rpa').addEventListener('change', (e) => { const v = e.target.dataset.v; if (v == null) return; P.rpAcc = v; render(); });
$('rpm').addEventListener('change', (e) => { const v = e.target.dataset.v; if (v == null) return; P.rpMarket = v; RS = { ids: null, from: null, to: null }; render(); });
$('handle').addEventListener('input', (e) => { P.handle = e.target.value.slice(0, 32); savePrefs(); render(); });
$('save').addEventListener('click', onSave);
$('copy').addEventListener('click', onCopy);
$('video').addEventListener('click', onVideo);
// Cmd/Ctrl+S saves, Cmd/Ctrl+C copies the image (not while typing your name or with text selected), Esc closes a drop-down
document.addEventListener('keydown', (e) => {
    // the video preview takes the keys while it is open: Esc closes it, space plays and pauses
    if (!$('vm').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closePreview(); }
        else if (e.key === ' ' && document.activeElement !== $('vm-seek') && !/^(BUTTON)$/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); vmToggle(); }
        return;
    }
    if (e.key === 'Escape') { closePops(); return; }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); onSave(); return; }
    const typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
    if (k === 'c' && !typing && !String(window.getSelection() || '')) { e.preventDefault(); onCopy(); }
});
let resizeRaf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => { render(); keepPopsInside(); }); });

// the snapshot: now, and again whenever P&L is pressed in the dock while this page is open
async function load() {
    let s = null;
    try { s = (await chrome.storage.session.get('shareSnap')).shareSnap; } catch (e) {}
    if (s) useSnap(s);
    else render();
}
try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'session' && ch.shareSnap && ch.shareSnap.newValue) useSnap(ch.shareSnap.newValue); }); } catch (e) {}
(document.fonts ? document.fonts.ready : Promise.resolve()).then(load);

// for the tests and the screenshots: the page's state, read only
window.__share = () => ({ snap, P: JSON.parse(JSON.stringify(P)), RS: JSON.parse(JSON.stringify(RS)), mask: maskName, cal: { loaded: CAL.loaded, sample: CAL.sample, trades: CAL.trades.length, err: CAL.err }, video: videoMime(),
    preview: VID ? { open: !$('vm').hidden, seconds: VID.seconds, bytes: VID.blob.size, mime: VID.mime, changed: !$('vm-again').hidden } : null });
