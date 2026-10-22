/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { cleanSnap, copyGroup, maskName, money, dayLong } from './share-model.js';
import { cardHtml, replayHtml, payoutHtml, CARD_SIZES, chartOpts, CHART_DEFAULTS, CHART_PRESETS } from './share-card.js';
import { replayTrades, replayModel, replayFit, replayPick, videoPlan, hhmm, tzShort, replayTf, replayTfs, tfLabel } from './share-replay.js';
import { summaryModel, todayTrades, sampleHistory, snapGroups, periodRange, ROWS } from './share-summary.js';
import { recordReplay, recordCard, videoMime, videoExt } from './share-video.js';
import { loadPrefs, savePrefs as storePrefs, snapPicks } from './share-prefs.js';
import { payoutModel, samplePayouts, samplePayNames } from './share-payout.js';
import { bgOpts, accentOpt, bgFramePlan, bgFileWhy, BG_DIM_MAX, BG_BLUR_MAX } from './share-look.js';
import { bgSave, bgLoad, bgClear, bgPrepare, bgRelease, bgStill, bgFrames, cardGeom } from './share-bg.js';
import { CARD_CSS, fitCard, cardPng } from './share-render.js';
import { makeGif, gifFrames, gifSpeedPlan, gifTradeWindows, GIF_SIZES, GIF_SPEEDS, GIF_MAX_S } from './share-gif-make.js';
import { GIF_FPS } from './share-gif.js';
import { tapeBars, tapeFormAt, tapeSampleBars } from './tape.js';
import { tapeRead } from './tape-db.js';
import { accountName } from '../journal/model.js'; /*! All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-6831bf73 */
import { dayKey } from '../journal/time.js';
import * as DB from '../journal/db.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const HAS_CHROME = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);

const savePrefs = () => storePrefs(localStorage, P);

const P = Object.assign(loadPrefs(localStorage), { mode: 'accounts', picked: [], markets: null, pick: '', rpAcc: '', rpMarket: '' });
let snap = null;
let TT = [];
const CAL = { gen: 0, loadingGen: -1, loaded: false, loading: null, trades: [], payouts: [], names: new Map(), lastSync: null, err: '', sample: false };
let BGI = null;
const cardP = (extra) => Object.assign({}, P, { bgImg: BGI }, extra || {});
const pictureOn = () => P.bg.kind === 'image' && !!BGI;
let RS = { ids: null, from: null, to: null };
let lastOut = null;

function useSnap(s) {
    snap = cleanSnap(s);
    if (!snap) return;
    TT = todayTrades(snap);
    RS = { ids: null, from: null, to: null };
    P.markets = null;
    P.rpAcc = '';
    P.rpMarket = '';
    if (P.period === 'day') P.period = 'today';
    Object.assign(P, snapPicks(snap));
    CAL.loaded = false;
    CAL.gen = (CAL.gen || 0) + 1;
    loadCal().then(() => { if (CAL.loaded) { paintControls(); render(); } });
    paintControls();
    render();
}

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
const calThenRender = () => loadCal().then(() => { if (CAL.loaded) render(); });
async function readCal() {
    try {
        if (snap && snap.demo) { /* Better Vest (c) 2026 Astral. All rights reserved. bv-bdfd28ca */
            return { trades: sampleHistory(snap, 45), payouts: samplePayouts(snap.day), names: samplePayNames(), lastSync: Date.now(), err: '', sample: true };
        }
        const none = { trades: [], payouts: [], names: new Map(), err: 'none', sample: false };
        if (!HAS_CHROME) return none;
        const got = await chrome.storage.local.get(['journalLastUser']).catch(() => ({}));
        let id = got.journalLastUser;
        if (!id) { const ids = await DB.listUserIds().catch(() => []); id = ids[0]; }
        if (!id) return none;
        const db = await DB.openDb(String(id));
        try {
            const [trades, lastSync, payouts, accounts] = await Promise.all([DB.getAll(db, 'trades'), DB.getMeta(db, 'lastSync').catch(() => null),
                DB.getAll(db, 'payouts').catch(() => []), DB.getAll(db, 'accounts').catch(() => [])]);
            const names = new Map((accounts || []).filter((a) => a && a.id != null).map((a) => [String(a.id), accountName(a)]));
            return { trades: trades || [], payouts: payouts || [], names, lastSync: lastSync || null, err: '', sample: false };
        } finally { db.close(); }
    } catch (e) {
        return { trades: [], payouts: [], names: new Map(), err: 'read-failed', sample: false };
    }
}

const LIST = [['on', 'List'], ['green', 'Only green'], ['mask', 'Hide names']];
const LIST_TIP = { on: 'One row per account under the total', green: 'Only the accounts in profit: the total and the count then cover those', mask: 'Names show as EVAL***' };
const SHOW = {
    summary: [['date', 'Date'], ['accounts', '"Across N accounts" line'], ['pct', '% return (or $ when the big number is %)'], ['market', 'Market'],
        ['trades', 'Trades column'], ['winrate', 'Win rate'], ['best', 'Best trade'], ['worst', 'Biggest loss'], ['fees', 'Fees paid'], ['handle', 'Your name'], ['credit', 'Better Vest credit']],
    replay: [['date', 'Date'], ['accounts', 'Account name'], ['pct', '% return (or $ when the big number is not)'], ['market', 'Market'], ['handle', 'Your name'], ['credit', 'Better Vest credit']],
    payout: [['date', 'Date'], ['accounts', 'Account names'], ['paytotal', 'Today: your payout count and lifetime total'], ['paybest', 'Lifetime: the biggest and the first'], ['handle', 'Your name'], ['credit', 'Better Vest credit']]
};
const ROW_NAMES = { accounts: 'Accounts', markets: 'Markets', groups: 'Copy groups', trades: 'Trades', sessions: 'Sessions' };
const ROW_TIP = { accounts: 'One row per account: today it is Vest\'s own day P&L', markets: 'One row per market you traded', groups: 'One row per copy group: its leader and followers together',
    /* Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-e4940c4e */ trades: 'One row per trade, in time order', sessions: 'Asia, London and New York, in New York time, by when the trade opened' };
const PERIOD_NAMES = { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month' };
const RP_CHIPS = [['prices', 'Prices', 'The entry and exit price beside each trade'], ['pnl', 'Running P&L', 'A line under the candles: the day\'s P&L as each trade closed'],
    ['sessions', 'Sessions', 'Asia, London and New York in New York time, shaded behind the candles'], ['best', 'Best trade', 'The day\'s best trade, marked']];

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

function paintPick() {
    if (!snap) return;
    const list = pickList();
    const on = list.filter((a) => P.picked.includes(a.id));
    $('pick-t').textContent = P.mode === 'copy' ? 'Copy group' : on.length === 1 ? on[0].name : 'Accounts';
    $('pick-count').textContent = P.mode === 'copy' || on.length !== 1 ? on.length + ' / ' + list.length : '';
    $('pick-count').hidden = !$('pick-count').textContent;
}

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
    $('mkts-t').textContent = !P.markets ? 'All' : P.markets.length === 1 ? P.markets[0] : P.markets.length + ' markets'; /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.2.6. bv-57edd9bb */
    $('mkts-count').textContent = P.markets && all.length ? P.markets.length + ' / ' + all.length : '';
    $('mkts-count').hidden = !$('mkts-count').textContent;
    $('fees-chip').classList.toggle('on', P.afterFees !== false);
    $('fees-chip').setAttribute('aria-pressed', P.afterFees !== false ? 'true' : 'false');
}

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
    /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-72a33f38 */ $('rpm').innerHTML = mk.map((m, i) => `<label class="row"><input type="radio" name="rpm" data-v="${esc(i ? m : '')}"${(P.rpMarket || '') === (i ? m : '') ? ' checked' : ''}><span class="nm">${esc(m)}</span><span class="hint">${i ? 'traded today' : 'your chart'}</span></label>`).join('');
    $('rpm-t').textContent = P.rpMarket || (r && r.market) || '';
}

let shownFor = '';
function paintShow() {
    if (shownFor === P.kind) return;
    shownFor = P.kind;
    $('show').innerHTML = SHOW[P.kind].map(([k, l]) => `<label class="row"><input type="checkbox" data-k="${k}"><span class="nm">${l}</span></label>`).join('');
}

function paintSettings() {
    const replay = P.kind === 'replay', sum = P.kind === 'summary', pay = P.kind === 'payout';
    $('mode').hidden = $('pick-pop').hidden = !sum;
    $('rows-pop').hidden = $('per-pop').hidden = $('mkts-pop').hidden = !sum;
    $('rpt-pop').hidden = $('rpr-pop').hidden = $('rpa-pop').hidden = $('cx-pop').hidden = !replay;
    if (!replay) $('rpm-pop').hidden = true;
    $('payk').hidden = !pay;
    $('sumopts').hidden = !sum;
    $('rplab-g').hidden = $('rpopts').hidden = !replay;
    $('video').hidden = !replay && !(pictureOn() && BGI.animated);
    $('mode').querySelectorAll('button').forEach((b) => { b.disabled = b.dataset.v === 'copy' && !(snap && copyGroup(snap).length > 1); });
    $('pick-btn').disabled = !snap;
    $('listopts').querySelectorAll('.chip').forEach((c) => { c.disabled = (replay && c.dataset.k !== 'mask') || (pay && c.dataset.k === 'green'); });
    $('hero').querySelectorAll('button').forEach((b) => { b.disabled = (replay && (b.dataset.v === 'pct' || b.dataset.v === 'both')) || (pay && b.dataset.v !== 'usd'); });
    ['kind', 'mode', 'hero', 'theme', 'format', 'style', 'payk'].forEach((k) => $(k).querySelectorAll('button').forEach((b) => {
        const on = b.dataset.v === (k === 'hero' && pay ? 'usd' : k === 'payk' ? P.pay : P[k]);
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

function render() { /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-7e46e331 */
    renderCard();
    paintGifBtn();
}
function renderCard() {
    paintSettings();
    paintLook();
    const fit = $('fit');
    const empty = $('empty');
    if (P.kind === 'payout') { renderPayout(); return; }
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
    fit.style.transform = 'none';
    const pp = cardP();
    const out = fitCard(fit, (m) => cardHtml(snap, pp, m, M));
    lastOut = { kind: 'summary', el: fit.firstElementChild, html: out.html, format: P.format };
    scaleCard();
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    const what = { accounts: P.mode === 'copy' ? 'Copy group' : 'Accounts', markets: 'Markets', groups: 'Rows', trades: 'Period', sessions: 'Period' }[P.rows];
    const why = P.period !== 'today' && !CAL.sample && CAL.loaded && CAL.err ? 'Other days come from your Calendar: open it and sync your history first.'
        : P.rows !== 'accounts' && P.period === 'today' && !snap.demo && !TT.length ? 'No closed trades read for today' + (snap.tradesErr ? ': press P&L in the dock again.' : ' yet.')
        : 'Nothing on the card: pick one in ' + what + (P.list.green ? ', or turn off Only green' : '') + '.';
    $('cap').textContent = out && out.n ? 'Saves at ' + w * 2 + ' × ' + h * 2 + ' px' + (snap.demo ? ' · sample numbers, marked on the card' : '') + (M.live ? '' : ' · from your Calendar') + bgCap() : why;
    $('save').disabled = $('copy').disabled = !out || !out.n;
    paintVideoBtn(!!(out && out.n));
}

const PAY_WHY = {
    none: 'No payouts in your Calendar yet: open the Calendar and sync it once. Until then the card shows sample numbers, marked on it.',
    'read-failed': 'Your Calendar could not be read: open it once, then come back. Until then the card shows sample numbers, marked on it.'
};
function renderPayout() {
    const fit = $('fit');
    const empty = $('empty');
    if (!CAL.loaded) { calThenRender(); }
    const today = (snap && snap.day) || dayKey(Date.now(), 'vest');
    const real = !CAL.sample && CAL.loaded && !CAL.err && CAL.payouts.some((x) => x && x.status === 'EXECUTED');
    const sample = !real;
    const list = real ? CAL.payouts : samplePayouts(today);
    const PM = payoutModel(list, { kind: P.pay, today, names: real ? CAL.names : samplePayNames() });
    $('sub').textContent = P.pay === 'lifetime' ? 'Every payout Vest has paid you' : 'Today\'s payout' + (sample ? ' · sample numbers' : ', from your Calendar'); /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-f9bb2389 */
    fit.style.transform = 'none';
    empty.hidden = true;
    const pp = cardP();
    const out = fitCard(fit, (m) => payoutHtml(PM, pp, m, { sample }));
    lastOut = out.html ? { kind: 'payout', el: fit.firstElementChild, html: out.html, format: P.format } : null;
    if (!out.html) { $('cap').textContent = ''; $('save').disabled = $('copy').disabled = true; paintVideoBtn(false); return; }
    scaleCard();
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    const synced = CAL.lastSync ? ', synced ' + new Date(CAL.lastSync).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const why = snap && snap.demo ? 'Sample payouts (the demo), marked on the card.' : !CAL.loaded ? 'Reading your Calendar…' : sample ? PAY_WHY[CAL.err] || PAY_WHY.none : '';
    const latest = !sample && PM.latest ? 'No payout yet on Vest\'s day today (it ends at 8 pm New York): this is your latest, ' + dayLong(PM.day) + '. ' : '';
    $('cap').textContent = why || (latest + 'Saves at ' + w * 2 + ' × ' + h * 2 + ' px · from your Calendar' + synced + ' · EXECUTED payouts only, the amount you received' + bgCap());
    const can = !!out.n && (real || !!(snap && snap.demo));
    $('save').disabled = $('copy').disabled = !can;
    paintVideoBtn(can);
}

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
/*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-6362e67c */ };
function renderReplay() {
    const fit = $('fit');
    fit.style.transform = 'none';
    paintReplayAccounts();
    paintReplayControls();
    paintChart();
    const out = replayHtml(snap, cardP({ rsel: RS }));
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
    lastOut = { kind: 'replay', el: fit.firstElementChild, scene: out.scene, html: out.html, format: P.format, M: out.M, sym: (rpReplay() || {}).sym || '',
        sample: !!(snap.demo || (out.M && out.M.sample)) };
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
    $('video').title = videoMime() ? 'The day plays out' + (pictureOn() && BGI.animated ? ' over your moving picture' : '') + ': a ' + Math.round(videoPlan(out.scene.n).total) + '-second video of this card (' + videoExt(videoMime()).toUpperCase() + '). It plays here first; nothing is saved until you press Save' : 'This browser cannot record video';
    if (pictureOn()) $('cap').textContent += bgCap();
}

function paintVideoBtn(can) {
    if (P.kind === 'replay') return;
    const v = $('video');
    v.hidden = !(pictureOn() && BGI.animated);
    if (v.hidden) return;
    v.disabled = !can || !videoMime();
    v.title = videoMime() ? 'Your picture moves: a ' + Math.round(bgFramePlan(BGI.durations).seconds) + '-second video of this card (' + videoExt(videoMime()).toUpperCase() + '). It plays here first; nothing is saved until you press Save' : 'This browser cannot record video';
} /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-a06f3055 */
function bgCap() {
    if (!pictureOn()) return '';
    return BGI.animated ? ' · your GIF moves in the video and the GIF; the PNG takes its first frame' : ' · your picture stays on this computer';
}

function scaleCard() {
    const fit = $('fit');
    const card = fit.firstElementChild;
    if (!card) return;
    const stage = $('stage').getBoundingClientRect();
    const k = Math.max(0.2, Math.min(1.35, (stage.width - 96) / card.offsetWidth, (stage.height - 100) / card.offsetHeight));
    fit.style.transform = `scale(${k})`;
}

function fileBase() {
    if (P.kind === 'payout') return 'better-vest-payout-' + (P.pay === 'lifetime' ? 'lifetime' : (snap && snap.day) || dayKey(Date.now(), 'vest'));
    return 'better-vest-pnl-' + (snap && snap.day ? snap.day : 'today') + (P.kind === 'replay' ? '-replay' : P.mode === 'copy' ? '-copy' : '');
}
function pngName() { return fileBase() + '.png'; }
async function pngBlob() {
    const card = $('fit').firstElementChild;
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    return cardPng(card, { width: w, height: h, scale: 2, img: pictureOn() ? BGI : null, bg: P.bg });
}

let toastTimer = 0;
function say(msg, bad, keep) {
    const t = $('toast');
    t.textContent = msg || '';
    t.classList.toggle('bad', !!bad);
    t.classList.toggle('on', !!msg);
    clearTimeout(toastTimer);
    if (msg && !keep) toastTimer = setTimeout(() => t.classList.remove('on'), bad ? 6000 : 2600);
}

function shareUse(name) {
    try { if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) chrome.runtime.sendMessage({ type: 'usage', op: 'use', n: { [name]: 1 } }).catch(() => {}); } catch (e) {}
}

function saveBlob(blob, name) {
    shareUse(/\.gif$/i.test(name) ? 'pnl.gif' : /\.png$/i.test(name) ? 'pnl.png' : 'pnl.video');
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
} /*! Copyright Astral 2026. From Better Vest 9.2.6 (nostats), ref bv-2915a45e. Not licensed for reuse. */
async function onCopy() {
    if (busy || $('copy').disabled) return;
    busy = true;
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
        say('Copied. Paste it into your post.');
    } catch (e) { say('Could not copy the image (' + (e && e.message || e) + '). Download it instead.', true); }
    busy = false;
}
let VID = null;
const canVideo = () => !!lastOut && (lastOut.kind === 'replay' ? !!lastOut.scene : pictureOn() && BGI.animated);
async function recordVideo() {
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    const { html, format, kind, el, scene } = lastOut;
    const onProgress = (f) => say('Recording ' + Math.round(f * 100) + '% · keep this page in front', false, true);
    let bg = null, frames = null, plan = null;
    if (pictureOn()) {
        const g = cardGeom(el);
        if (BGI.animated) {
            plan = kind === 'replay' ? bgFramePlan(BGI.durations, { frames: videoPlan(scene.n).frames }) : bgFramePlan(BGI.durations);
            frames = await bgFrames(BGI, plan, w * 2, h * 2, 2, P.bg, g.base, (f) => say('Preparing your picture ' + Math.round(f * 100) + '%', false, true));
            bg = { at: frames.at };
        } else bg = { still: bgStill(BGI, w * 2, h * 2, 2, P.bg, g.base) };
    }
    let res;
    try {
        res = kind === 'replay' ? await recordReplay(el, scene, { cssUrl: CARD_CSS, width: w, height: h, scale: 2, onProgress, bg })
            : await recordCard(el, { cssUrl: CARD_CSS, width: w, height: h, scale: 2, onProgress, plan, bg });
    } finally { if (frames) frames.close(); }
    if (VID) URL.revokeObjectURL(VID.url);
    VID = { url: URL.createObjectURL(res.blob), blob: res.blob, mime: res.mime, seconds: res.seconds, w: w * 2, h: h * 2, html, format };
    window.__shareLastVideo = res;
    say('');
}
async function onVideo() {
    if (busy || $('video').disabled || !canVideo()) return;
    if (VID) { openPreview(); return; }
    busy = true;
    const btn = $('video');
    btn.classList.add('rec');
    try { await recordVideo(); openPreview(); } catch (e) { say('Could not record the video: ' + (e && e.message || e), true); }
    btn.classList.remove('rec');
    busy = false;
/*! All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-b17be3b9 */ }
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
        v.addEventListener('loadedmetadata', function fix() {
            v.removeEventListener('loadedmetadata', fix);
            if (Number.isFinite(v.duration)) return;
            v.addEventListener('timeupdate', function back() { v.removeEventListener('timeupdate', back); v.currentTime = 0; v.play().catch(() => {}); }); /* Property of Astral (@ax4p). Better Vest 9.2.6. No copying without written permission. bv-531bb943 */
            v.currentTime = 1e9;
        });
    }
    v.loop = $('vm-loop').classList.contains('on');
    const kb = VID.blob.size / 1024;
    $('vm-info').textContent = mmss(VID.seconds) + ' · ' + videoExt(VID.mime).toUpperCase() + ' · ' + VID.w + ' × ' + VID.h + ' · ' + (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB');
    const changed = !lastOut || lastOut.html !== VID.html;
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
    if (busy || !canVideo()) return;
    busy = true;
    closePreview();
    $('video').classList.add('rec');
    try { await recordVideo(); openPreview(); } catch (e) { say('Could not record the video: ' + (e && e.message || e), true); }
    $('video').classList.remove('rec');
    /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-43ece762 */ busy = false;
});

const GIF = { key: '', size: '', mode: 'replay', speed: '', picked: false, res: {}, job: null };
const gifReplayOn = () => !!lastOut && lastOut.kind === 'replay' && !!lastOut.scene;
const gifMode = () => (gifReplayOn() ? GIF.mode : 'still');
const gifSpeedOn = () => gifReplayOn() && GIF.mode === 'replay';
const gifSlot = (size) => gifMode() + (gifSpeedOn() ? ':' + (GIF.speed || 'fit') : '') + '|' + (size || GIF.size);
const gifRes = (size) => GIF.res[gifSlot(size)] || null;
const gifMoving = () => !!lastOut && ((gifReplayOn() && GIF.mode === 'replay') || (pictureOn() && BGI.animated));
const gifKey = () => (lastOut ? lastOut.html : '') + '|' + (pictureOn() ? BGI.src + (BGI.animated ? ':a' : '') : '') + '|' + P.format;
const gifDefault = () => (pictureOn() && BGI.animated && lastOut && gifFrames(lastOut.kind, lastOut.scene, BGI, gifMode(), gifSpeedOn() ? gifPlans()[GIF.speed] : null).length > 48 ? 'half' : 'full');

const TP = { key: '', got: null, job: null };
const tapeSyms = (o) => (o.sym ? [o.sym] : { NQ: ['NDX-USD-PERP'], MNQ: ['NDX-USD-PERP'], ES: ['SPX-USD-PERP'] }[o.M.market]
    || (o.M.market ? [o.M.market + '-PERP', o.M.market + '-USD-PERP'] : []));
function gifTape() {
    const key = gifKey();
    if (TP.key === key && TP.got) return Promise.resolve(TP.got);
    if (TP.key === key && TP.job) return TP.job;
    TP.key = key;
    TP.got = null;
    const out = lastOut;
    const job = (async () => {
        const M = out && out.M;
        if (!M || !M.bars.length) return { how: 'none', n: 0, of: 0, resS: 60, tape: null, win: null };
        const resS = Number(M.res) * 60;
        let paths, how = 'real';
        if (out.sample) { paths = tapeSampleBars(M.bars, resS); how = 'sample'; }
        /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.2.6. bv-3fc62634 */ else {
            const from = M.bars[0][0], to = M.bars[M.bars.length - 1][0] + resS - 1;
            let rows = [];
            for (const sym of tapeSyms(out)) { rows = HAS_CHROME ? await tapeRead(sym, from, to).catch(() => []) : []; if (rows.length) break; }
            paths = tapeBars(M.bars, resS, rows);
        }
        const n = paths.filter(Boolean).length;
        if (!n) how = 'none';
        const tape = n ? { form: (i, f) => (paths[i] ? tapeFormAt(M.bars[i], paths[i], f, resS) : null), at: (i, f) => (M.bars[i][0] + f * resS) * 1000 } : null;
        return { how, n, of: M.bars.length, resS, tape, win: gifTradeWindows(M.bars, resS, M.trades), bars: M.bars, tz: M.tz };
    })();
    TP.job = job;
    job.then((got) => { if (TP.job === job) { TP.job = null; TP.got = got; } }, () => { if (TP.job === job) TP.job = null; });
    return job;
}
const SPEED_NAME = { fit: 'Fit', 10: '10×', 30: '30×', 60: '60×' };
function gifPlans() {
    const out = {};
    const t = TP.got;
    if (!gifReplayOn() || !t || TP.key !== gifKey()) return out;
    for (const sp of GIF_SPEEDS) {
        const pl = gifSpeedPlan(lastOut.scene.n, t.resS, sp, GIF_FPS, t.win);
        if (sp !== 'fit' && !t.n) { pl.ok = false; pl.need = 0; }
        out[sp] = pl;
    }
    return out;
}
const gifSpeedDefault = (plans) => ['10', '30', '60'].find((sp) => plans[sp] && plans[sp].ok) || 'fit';
async function gifPrepare() {
    await gifTape();
    const plans = gifPlans();
    if (!GIF.picked || !plans[GIF.speed] || !plans[GIF.speed].ok) GIF.speed = gifSpeedDefault(plans);
}
function gifTapeLine(plan) {
    const t = TP.got;
    if (!t) return 'Reading the seconds…';
    if (t.how === 'none') return 'Second data starts once you trade with this version.';
    let win = '';
    if (plan && plan.ok && plan.window && t.bars.length) {
        const at = (p) => { const i = Math.min(t.bars.length - 1, Math.floor(p)); return (t.bars[i][0] + (p - i) * t.resS) * 1000; };
        win = ' Plays ' + (plan.window === 'last' ? 'your last trade, ' : 'your trades, ') + hhmm(at(plan.a), t.tz) + ' to ' + hhmm(at(plan.b), t.tz) + '.';
    }
    if (t.how === 'sample') return 'Sample: made-up seconds inside Vest\'s candles.' + win;
    return (t.n < t.of ? 'Recorded seconds in ' + t.n + ' of ' + t.of + ' bars; the rest grow evenly.' : 'Real prices inside every bar, from your recorded seconds.') + win;
}
const fmtBytes = (n) => (n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'); /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.2.6. bv-81fdb27d */
function paintGifBtn() {
    const g = $('gif');
    g.disabled = $('save').disabled || !lastOut;
    if (!$('gm').hidden && GIF.key && gifKey() !== GIF.key && !GIF.job) { $('gm-note').textContent = 'The card changed since this GIF was made: close and press GIF again.'; $('gm-note').classList.add('warn'); }
    if (!lastOut) return;
    g.title = gifReplayOn() ? 'Save the card as a GIF: the bars play out, or the whole chart. It is made here first; nothing is saved until you press Save GIF'
        : gifMoving() ? 'Save the card as a moving GIF: your picture moves under it. It is made here first; nothing is saved until you press Save GIF'
            : 'Save the card as a GIF: one frame, the same pixels as the PNG (a GIF has 256 colors). Nothing is saved until you press Save GIF';
}
function gifResetIfChanged() {
    const key = gifKey();
    if (key === GIF.key) return;
    gifCancel();
    for (const k of Object.keys(GIF.res)) { if (GIF.res[k]) URL.revokeObjectURL(GIF.res[k].url); }
    GIF.res = {};
    GIF.key = key;
    GIF.size = '';
}
function paintGif() {
    const size = GIF.size;
    const r = gifRes(size);
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    $('gm-mode').hidden = $('gm-mode-k').hidden = !gifReplayOn();
    $('gm-mode').querySelectorAll('button').forEach((b) => {
        const on = b.dataset.v === GIF.mode;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const spOn = gifSpeedOn();
    $('gm-spd-bar').hidden = !spOn;
    if (spOn) {
        const plans = gifPlans();
        $('gm-speed').querySelectorAll('button').forEach((b) => {
            const k = b.dataset.v, pl = plans[k], ok = !!(pl && pl.ok), on = k === GIF.speed;
            b.disabled = !ok;
            b.innerHTML = SPEED_NAME[k] + (pl ? '<span>' + (ok ? Math.round(pl.total) + ' s' : pl.need ? 'over ' + GIF_MAX_S + ' s' : 'no data') + '</span>' : '');
            b.title = !pl ? '' : k === 'fit' ? 'The whole time on the card in about 10 seconds' + (TP.got && TP.got.n ? ', the seconds inside each bar as they happened' : '')
                : ok ? SPEED_NAME[k] + ' real time: ' + k + ' seconds of the market each second of the GIF' + (pl.window === 'last' ? ', your last trade' : pl.window ? ', your trades\' window' : '')
                    : pl.need ? 'At ' + SPEED_NAME[k] + ' even your ' + (pl.window === 'last' ? 'last trade' : 'trades\' window') + ' takes ' + Math.round(pl.need) + ' s; a GIF stops at ' + GIF_MAX_S + ' s' : 'Needs the seconds recorded inside these bars';
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        $('gm-tape').textContent = gifTapeLine(plans[GIF.speed]);
    }
    $('gm-size').querySelectorAll('button').forEach((b) => {
        const k = b.dataset.v, s = GIF_SIZES[k], got = gifRes(k);
        b.innerHTML = (k === 'full' ? 'Full' : 'Half') + '<span>' + w * s + ' × ' + h * s + (got ? ' · ' + fmtBytes(got.blob.size) : '') + '</span>';
        b.classList.toggle('on', k === size);
        b.setAttribute('aria-pressed', k === size ? 'true' : 'false');
    });
    /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-f1fadf4f */ const working = !!GIF.job;
    $('gm-work').hidden = !working;
    $('gm-img').hidden = working || !r;
    if (r && $('gm-img').src !== r.url) $('gm-img').src = r.url;
    $('gm-save').disabled = working || !r;
    $('gm-info').textContent = r ? (r.frames > 1 ? (r.ms / 1000).toFixed(1) + ' s · 50 fps · loops · ' : '1 frame · ') + r.w + ' × ' + r.h + ' · ' + fmtBytes(r.blob.size) : '';
    $('gm-hint').textContent = r && r.blob.size > 15 * 1048576 ? 'Over 15 MB: some sites refuse a GIF that big. ' + (size === 'full' ? 'Half is about a quarter of the size.' : 'A shorter or calmer picture makes a smaller one.')
        : !gifMoving() ? 'This card does not move: one frame.' : '';
}
function gifProgress(f, what) {
    $('gm-bar').style.width = Math.round(f * 100) + '%';
    $('gm-pct').textContent = Math.round(f * 100) + '%';
    $('gm-what').textContent = what === 'picture' ? 'Reading your picture\'s frames' : what === 'colors' || what === 'colours' ? 'Picking the colors' : 'Making the GIF';
}
function gifCancel() {
    if (!GIF.job) return;
    GIF.job.cancelled = true;
    GIF.job = null;
}
let gifSeq = 0;
async function gifRun(size) {
    gifCancel();
    GIF.size = size;
    const seq = ++gifSeq;
    const job = { cancelled: false }; /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-65807a31 */
    if (gifReplayOn()) {
        const reading = !TP.got || TP.key !== gifKey();
        if (reading) { GIF.job = job; gifProgress(0, ''); paintGif(); }
        await gifPrepare().catch(() => {});
        if (seq !== gifSeq || job.cancelled) return;
        if (reading) GIF.job = null;
    }
    const mode = gifMode(), slot = gifSlot(size);
    if (gifRes(size)) { $('gm-note').textContent = 'Not saved yet.'; paintGif(); return; }
    const card = lastOut && lastOut.el;
    if (!card) return;
    GIF.job = job;
    gifProgress(0, '');
    $('gm-note').textContent = gifMoving() ? 'Keep this page open while it is made.' : '';
    paintGif();
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    try {
        const plan = gifSpeedOn() ? gifPlans()[GIF.speed] || null : null;
        const res = await makeGif({ kind: lastOut.kind, mode, card, scene: lastOut.scene, width: w, height: h, size, img: pictureOn() ? BGI : null, bg: P.bg,
            plan: plan && plan.ok ? plan : null, tape: gifSpeedOn() && TP.got ? TP.got.tape : null,
            dither: true, onProgress: (f, what) => { if (GIF.job === job) gifProgress(f, what); }, cancelled: () => job.cancelled });
        if (job.cancelled) return;
        res.url = URL.createObjectURL(res.blob);
        GIF.res[slot] = res;
        GIF.job = null;
        window.__shareLastGif = res;
        $('gm-note').textContent = 'Made in ' + (res.took / 1000).toFixed(1) + ' s. Not saved yet.';
    } catch (e) {
        if (GIF.job === job) GIF.job = null;
        if (e && e.cancelled) { if (GIF.size === size && !GIF.job) $('gm-note').textContent = 'Stopped. Pick a size to make it again.'; }
        else $('gm-note').textContent = 'Could not make the GIF: ' + ((e && e.message) || e);
    }
    if (!$('gm').hidden) paintGif();
}
function openGif() {
    if ($('gif').disabled || !lastOut || busy) return;
    closePops();
    gifResetIfChanged();
    $('gm-note').classList.remove('warn');
    $('gm').hidden = false;
    if (!GIF.size) gifRun(gifDefault());
    else paintGif();
    $('gm-save').focus();
}
function closeGif() {
    if (GIF.job) { gifCancel(); $('gm-note').textContent = 'Stopped.'; }
    $('gm').hidden = true;
}
$('gm-size').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || (b.dataset.v === GIF.size && (GIF.job || gifRes()))) return;
    gifRun(b.dataset.v);
});
$('gm-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.v === GIF.mode) return;
    /* Property of Astral (@ax4p). Better Vest 9.2.6. No copying without written permission. bv-d1ffffea */ GIF.mode = b.dataset.v === 'still' ? 'still' : 'replay';
    gifRun(GIF.size || gifDefault());
});
$('gm-speed').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || b.dataset.v === GIF.speed) return;
    GIF.speed = b.dataset.v;
    GIF.picked = true;
    gifRun(GIF.size || gifDefault());
});
$('gm-cancel').addEventListener('click', () => { gifCancel(); $('gm-note').textContent = 'Stopped. Pick a size to make it again.'; GIF.size = ''; paintGif(); });
$('gm-save').addEventListener('click', () => {
    const r = gifRes();
    if (!r || GIF.job) return;
    const name = fileBase() + (gifReplayOn() && GIF.mode === 'still' ? '-chart' : '') + (gifSpeedOn() && GIF.speed && GIF.speed !== 'fit' ? '-' + GIF.speed + 'x' : '') + (GIF.size === 'half' ? '-half' : '') + '.gif';
    saveBlob(r.blob, name);
    say('Saved ' + name + ' (' + fmtBytes(r.blob.size) + ')');
    $('gm-note').textContent = 'Saved as ' + name + ', ' + fmtBytes(r.blob.size) + '.';
});
$('gm-close').addEventListener('click', closeGif);
$('gm-x').addEventListener('click', closeGif);
$('gm').addEventListener('click', (e) => { if (e.target === $('gm')) closeGif(); });

const CX_COLORS = [['vest', 'Vest'], ['classic', 'Classic'], ['mono', 'Mono'], ['neon', 'Neon'], ['bo', 'Blue / orange'], ['mine', 'My chart'], ['custom', 'Custom']];
const CX_SHOW = [['grid', 'Grid', 'The price and time lines behind the candles'], ['price', 'Price axis', 'The prices on the right, and the last price'], ['time', 'Time axis', 'The times under the chart'],
    ['zones', 'Trade boxes', 'The shaded box from each entry to its exit'], ['lines', 'Lines', 'The dashed line from each entry to its exit'], ['volume', 'Volume', 'Vest\'s volume under the candles']];
const CX_NOVOL = 'No volume came with these candles. To get it, turn off Remove volume indicator in Better Vest\'s chart settings, then press P&L in the dock again.';
const cxVest = (light) => (light ? ['#16a34a', '#e11d48'] : ['#00d68f', '#ff3b5c']);
const cxDark = (c) => (/^var\(/.test(c) ? (c.includes('text') ? '#fafafa' : '#737373') : c);
function cxSwatch(id) {
    const light = P.theme === 'light'; /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.2.6. bv-cb52d232 */
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
    $('cx-dot').hidden = JSON.stringify(chartOpts(c)) === JSON.stringify(CHART_DEFAULTS);
}
const cxSet = (patch) => { P.chart = chartOpts(Object.assign({}, P.chart, patch)); savePrefs(); render(); };
$('cx-colors').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const v = b.dataset.v;
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
    /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-d127d652 */ const r = rpRaw();
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
    const n = r.bars.length;
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
function sparkSvg(r, list, a, b) {
    const n = r.bars.length, W = 400, H = 60;
    let lo = Infinity, hi = -Infinity;
    for (const x of r.bars) { if (x[3] < lo) lo = x[3]; if (x[2] > hi) hi = x[2]; }
    const X = (i) => ((i + 0.5) / n) * W, Y = (p) => 4 + (1 - (p - lo) / ((hi - lo) || 1)) * (H - 8); /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-ad3da24c */
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
    /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-66f59db2 */ const cur = RS.ids ? RS.ids.slice() : replayTrades(r).map((t) => t.id);
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

const POPS = [['pick-btn', 'pick-panel'], ['show-btn', 'show-panel'], ['rpt-btn', 'rpt-panel'], ['rpr-btn', 'rpr-panel'],
    ['rows-btn', 'rows-panel'], ['per-btn', 'per-panel'], ['mkts-btn', 'mkts-panel'], ['rpa-btn', 'rpa-panel'], ['rpm-btn', 'rpm-panel'], ['cx-btn', 'cx-panel'], ['bg-btn', 'bg-panel']];
function closePops(except) {
    POPS.forEach(([b, p]) => { if (p !== except) { $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); } });
}
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
    $(b).setAttribute('aria-expanded', open ? 'true' : 'false'); /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-91d402aa */
    if (open) keepInside($(p));
}));
document.addEventListener('click', (e) => { if (!e.composedPath().some((n) => n.classList && n.classList.contains('pop'))) closePops(); });

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
seg('payk', (v) => { P.pay = v === 'lifetime' ? 'lifetime' : 'today'; savePrefs(); });
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
}); /* Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-40ad60c0 */
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
$('rpa').addEventListener('change', (e) => { const v = e.target.dataset.v; if (v == null) return; P.rpAcc = v; render(); });
$('rpm').addEventListener('change', (e) => { const v = e.target.dataset.v; if (v == null) return; P.rpMarket = v; RS = { ids: null, from: null, to: null }; render(); });
$('handle').addEventListener('input', (e) => { P.handle = e.target.value.slice(0, 32); savePrefs(); render(); });
$('save').addEventListener('click', onSave);
$('copy').addEventListener('click', onCopy);
$('video').addEventListener('click', onVideo);
$('gif').addEventListener('click', openGif);
document.addEventListener('keydown', (e) => {
    if (!$('gm').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeGif(); }
        return;
    }
    /*! Better Vest (c) 2026 Astral. All rights reserved. bv-befb43b7 */ if (!$('vm').hidden) {
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

let lookRaf = 0;
const lookSet = (patch) => { P.bg = bgOpts(Object.assign({}, P.bg, patch)); savePrefs(); cancelAnimationFrame(lookRaf); lookRaf = requestAnimationFrame(render); };
function paintLook() {
    const bg = P.bg;
    /* Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-118a8969 */ $('bg-kind').querySelectorAll('button').forEach((b) => { const on = b.dataset.v === bg.kind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('bg-fit').querySelectorAll('button').forEach((b) => { const on = b.dataset.v === bg.fit; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('bg-solid').hidden = bg.kind !== 'solid';
    $('bg-grad').hidden = bg.kind !== 'gradient';
    $('bg-img').hidden = bg.kind !== 'image';
    const val = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
    val('bg-color', bg.color); val('bg-c1', bg.c1); val('bg-c2', bg.c2);
    val('bg-angle', bg.angle); val('bg-dim', bg.dim); val('bg-blur', bg.blur);
    $('bg-dim').max = BG_DIM_MAX; $('bg-blur').max = BG_BLUR_MAX;
    $('bg-angle-t').textContent = bg.angle + '°';
    $('bg-dim-t').textContent = bg.dim + '%';
    $('bg-blur-t').textContent = bg.blur + ' px';
    $('bg-kind-note').textContent = bg.kind === 'image' && !BGI ? 'Choose a picture: until then the card keeps the style\'s own background.'
        : bg.kind === 'style' ? 'The style\'s own background (Vest, Silver, OLED or Neon).' : '';
    $('bg-meta').textContent = BGI ? (BGI.name || 'Your picture') + ' · ' + BGI.w + ' × ' + BGI.h + ' · ' + (BGI.size / 1048576).toFixed(BGI.size < 1048576 ? 2 : 1) + ' MB'
        + (BGI.animated ? ' · moves (' + BGI.durations.length + ' frames)' : '') : 'No picture yet.';
    $('bg-remove').disabled = !BGI;
    $('bg-file-btn').textContent = BGI ? 'Choose another' : 'Choose a picture or GIF';
    val('bg-accent', P.accent || '#00f15b');
    $('bg-accent-t').textContent = P.accent ? P.accent.toUpperCase() : 'The style\'s own';
    $('bg-accent-off').disabled = !P.accent;
    const sw = $('bg-sw');
    const none = bg.kind === 'style' || (bg.kind === 'image' && !BGI);
    sw.style.background = none ? '' : bg.kind === 'solid' ? bg.color : bg.kind === 'gradient' ? `linear-gradient(${bg.angle}deg, ${bg.c1}, ${bg.c2})` : `center / cover no-repeat url("${BGI.src}")`;
    sw.classList.toggle('lk-none', none);
    $('bg-dot').hidden = bg.kind === 'style' && !P.accent;
}
async function useBg(rec) {
    const img = rec ? await bgPrepare(rec) : null;
    const old = BGI;
    BGI = img;
    bgRelease(old);
}
$('bg-kind').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const v = b.dataset.v;
    P.bg = bgOpts(Object.assign({}, P.bg, { kind: v }));
    savePrefs();
    render();
    if (v === 'image' && !BGI) $('bg-file').click();
});
seg('bg-fit', (v) => { P.bg = bgOpts(Object.assign({}, P.bg, { fit: v })); savePrefs(); });
$('bg-color').addEventListener('input', (e) => lookSet({ color: e.target.value }));
$('bg-c1').addEventListener('input', (e) => lookSet({ c1: e.target.value }));
/*! Better Vest (c) 2026 Astral. All rights reserved. bv-96c7dcf3 */ $('bg-c2').addEventListener('input', (e) => lookSet({ c2: e.target.value }));
$('bg-swap').addEventListener('click', () => lookSet({ c1: P.bg.c2, c2: P.bg.c1 }));
$('bg-angle').addEventListener('input', (e) => lookSet({ angle: e.target.value }));
$('bg-dim').addEventListener('input', (e) => lookSet({ dim: e.target.value }));
$('bg-blur').addEventListener('input', (e) => lookSet({ blur: e.target.value }));
$('bg-file-btn').addEventListener('click', () => $('bg-file').click());
$('bg-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const why = bgFileWhy(f);
    if (why) { say(why, true); return; }
    try {
        say('Reading your picture…', false, true);
        const rec = await bgSave(f);
        try { await useBg(rec); } catch (err) { await bgClear().catch(() => {}); throw err; }
        P.bg = bgOpts(Object.assign({}, P.bg, { kind: 'image' }));
        savePrefs();
        render();
        say((BGI.animated ? 'Your GIF is on the card.' : 'Your picture is on the card.') + ' It stays on this computer.');
    } catch (err) { say('Could not use that picture: ' + (err && err.message || err), true); }
});
$('bg-remove').addEventListener('click', async () => {
    await bgClear().catch(() => {});
    await useBg(null);
    if (P.bg.kind === 'image') P.bg = bgOpts(Object.assign({}, P.bg, { kind: 'style' }));
    savePrefs();
    render();
    say('Your picture is removed from this computer.');
});
$('bg-accent').addEventListener('input', (e) => { P.accent = accentOpt(e.target.value); savePrefs(); cancelAnimationFrame(lookRaf); lookRaf = requestAnimationFrame(render); });
$('bg-accent-off').addEventListener('click', () => { P.accent = ''; savePrefs(); render(); });
$('bg-reset').addEventListener('click', () => { P.bg = bgOpts({}); P.accent = ''; savePrefs(); render(); });
async function bgBoot() {
    let rec = null;
    try { rec = await bgLoad(); if (rec) await useBg(rec); } catch (e) { BGI = null; if (rec) await bgClear().catch(() => {}); }
}

const calKey = () => CAL.payouts.length + ':' + CAL.payouts.reduce((m, x) => Math.max(m, (x && (x.updatedAt || x.executedAt)) || 0), 0) + ':' + (CAL.lastSync || 0);
async function calRefresh() {
    /*! Property of Astral (@ax4p). Better Vest 9.2.6. No copying without written permission. bv-1ed0a8ef */ if (P.kind !== 'payout' || document.visibilityState !== 'visible' || !CAL.loaded || CAL.sample) return;
    const gen = CAL.gen || 0;
    const data = await readCal();
    if ((CAL.gen || 0) !== gen || data.err) return;
    const before = calKey();
    Object.assign(CAL, data, { loaded: true });
    if (calKey() !== before) render();
}
document.addEventListener('visibilitychange', calRefresh);
window.addEventListener('focus', calRefresh);
setInterval(calRefresh, 60000);

async function load() {
    let s = null;
    try { s = (await chrome.storage.session.get('shareSnap')).shareSnap; } catch (e) {}
    if (s) useSnap(s);
    else render();
}
try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'session' && ch.shareSnap && ch.shareSnap.newValue) useSnap(ch.shareSnap.newValue); }); } catch (e) {}
Promise.all([document.fonts ? document.fonts.ready : null, bgBoot()]).then(load);

window.__share = () => ({ snap, P: JSON.parse(JSON.stringify(P)), RS: JSON.parse(JSON.stringify(RS)), mask: maskName,
    cal: { loaded: CAL.loaded, sample: CAL.sample, trades: CAL.trades.length, payouts: CAL.payouts.length, err: CAL.err }, video: videoMime(),
    picture: BGI ? { animated: BGI.animated, w: BGI.w, h: BGI.h, frames: BGI.durations.length, type: BGI.type, size: BGI.size } : null,
    preview: VID ? { open: !$('vm').hidden, seconds: VID.seconds, bytes: VID.blob.size, mime: VID.mime, changed: !$('vm-again').hidden } : null,
    gif: { open: !$('gm').hidden, size: GIF.size, mode: lastOut ? gifMode() : null, slot: lastOut ? gifSlot() : null, busy: !!GIF.job, note: $('gm-note').textContent, moving: lastOut ? gifMoving() : null,
        speed: GIF.speed, tape: TP.got ? { how: TP.got.how, n: TP.got.n, of: TP.got.of, line: $('gm-tape').textContent } : null,
        plans: Object.fromEntries(Object.entries(gifPlans()).map(([k, p]) => [k, { ok: !!p.ok, total: p.total, need: p.need, window: p.window, a: p.a, b: p.b }])),
        res: Object.fromEntries(Object.entries(GIF.res).filter(([, r]) => r).map(([k, r]) => [k, { bytes: r.blob.size, w: r.w, h: r.h, frames: r.frames, ms: r.ms, colors: r.colors, took: r.took }])) } });
