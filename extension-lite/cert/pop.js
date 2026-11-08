/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { cleanSnap, money, SHARE_MAX_BYTES } from './share-model.js';
import { cardHtml, replayHtml, CARD_SIZES } from './share-card.js';
import { summaryModel, todayTrades } from './share-summary.js';
import { loadPrefs, snapPicks, popNeed, privateLook } from './share-prefs.js';
import { bgLoad, bgPrepare } from './share-bg.js';
import { fitCard, cardPng, CARD_CSS } from './share-render.js';
import { momentCheck, momentTitle, seenAdd, usdWord, calRead, seenLoad, seenSave } from './share-moment.js';
import { recordReplay, videoMime, videoExt } from './share-video.js'; /*! Better Vest (c) 2026 Astral. All rights reserved. bv-cab62b0d */
import { replayTrades, replayPick } from './share-replay.js';
import { sampleHistory, mktName } from './share-summary.js';
import { payoutModel, samplePayouts, samplePayNames } from './share-payout.js';
import { payoutHtml } from './share-card.js';
import { savePrefs as storePrefs } from './share-prefs.js';
import { dayKey } from '../journal/time.js';
import { accountName } from '../journal/model.js';

const VEST = 'https://next.vestmarkets.com';
const Q = new URLSearchParams(location.search);
const PLACE = Q.get('place') === 'column' ? 'column' : 'pop';
if (PLACE === 'column') { document.documentElement.classList.add('col'); if (Q.get('theme') === 'light') document.documentElement.classList.add('light'); }
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const P0 = loadPrefs(localStorage);
const KIND = P0.kind === 'replay' ? 'replay' : 'summary';
let snap = null;
let gain = null;
let BGI = null;
let P = null;
let lastCard = 0;
let busy = false;

const tell = (type, extra) => { try { parent.postMessage(Object.assign({ bvPop: 1, type }, extra || {}), VEST); } catch (e) {} };
const uiLight = (ui) => !!ui && typeof ui === 'object' && ui.theme !== 'oled' && (ui.light === true || ui.theme === 'light');

const FRAME_VARS = ['--f-panel', '--f-raised', '--f-raised-h', '--f-line', '--f-line2', '--f-text', '--f-title', '--f-muted', '--f-dim', '--f-sel', '--f-sel-text',
    '--f-link', '--f-track', '--f-knob', '--f-tile', '--f-tile-ink', '--f-bad'];
function frameTheme(ui) {
    const root = document.documentElement;
    for (const v of FRAME_VARS) root.style.removeProperty(v);
    const light = uiLight(ui);
    root.classList.toggle('lt', light);
    const t = ui && ui.t ? ui.t : null;
    if (!t) return;
    const set = (k, v) => { if (v) root.style.setProperty(k, v); };
    const panel = t.card || t.surface || '';
    const raised = t.raised || panel;
    set('--f-panel', panel);
    set('--f-raised', raised);
    if (raised && t.text) set('--f-raised-h', `color-mix(in srgb, ${raised} 90%, ${t.text})`);
    set('--f-line', t.line);
    if (t.line) set('--f-line2', `color-mix(in srgb, ${t.line} 60%, transparent)`);
    set('--f-text', t.text);
    set('--f-title', t.text);
    set('--f-muted', t.muted);
    set('--f-dim', t.dim);
    set('--f-sel', t.sel);
    if (t.sel) set('--f-sel-text', '#FFFFFF');
    set('--f-link', t.accentText || t.accent);
    if (t.line && panel) set('--f-track', `color-mix(in srgb, ${t.line} 70%, ${panel})`);
    set('--f-knob', light ? '#FFFFFF' : t.muted);
    set('--f-tile', light ? '#050506' : '#F5F5F7');
    set('--f-tile-ink', light ? '#F5F5F7' : '#050506');
    set('--f-bad', t.down);
}

function cleanGain(g, s) {
    if (!g || typeof g !== 'object' || !s.accounts.some((a) => a.id === g.id)) return null;
    const usd = typeof g.usd === 'number' && Number.isFinite(g.usd) ? g.usd : null;
    const pct = typeof g.pct === 'number' && Number.isFinite(g.pct) ? g.pct : null;
    return { id: g.id, usd, pct };
}

function build() {
    /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-93041a2a */ const fit = $('pp-fit');
    P = Object.assign({}, P0, snapPicks(snap, gain && gain.id), { period: 'today', pick: '', markets: null, rpAcc: '', rpMarket: '', bgImg: BGI });
    let out = null;
    if (KIND === 'replay') {
        out = replayHtml(snap, Object.assign({}, P, { rsel: { ids: null, from: null, to: null } }));
        if (out.html && out.n) fit.innerHTML = out.html; else out = null;
    }
    const summary = (rows) => {
        const M = summaryModel(snap, { rows, mode: P.mode, picked: P.picked, greenOnly: !!(P.list && P.list.green), period: { kind: 'today' }, markets: null, afterFees: P.afterFees },
            { today: todayTrades(snap), calendar: [] });
        return fitCard(fit, (m) => cardHtml(snap, P, m, M));
    };
    if (!out) out = summary(P.rows);
    if (!out.n && P.rows !== 'accounts') out = summary('accounts');
    return out;
}
function show() {
    const out = build();
    const card = $('pp-fit').firstElementChild;
    if (!card || !out.n) { tell('close'); return; }
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    const k = Math.min((P.format === 'wide' ? 380 : 268) / w, 330 / h);
    $('pp-fit').style.transform = `scale(${k})`;
    $('pp-stage').style.width = Math.round(w * k) + 'px';
    $('pp-stage').style.height = Math.round(h * k) + 'px';
    $('pp').style.width = Math.max(292, Math.round(w * k) + 24) + 'px';
    const pct = gain && gain.pct != null ? ` (+${gain.pct.toFixed(2)}%)` : '';
    $('pp-t').innerHTML = gain && gain.usd != null ? `Green exit <b>${esc(money(gain.usd))}</b>${esc(pct)}` : 'Green exit';
    $('pp-note').textContent = snap.demo ? 'Sample numbers' : '';
    $('pp').hidden = false;
    const r = $('pp').getBoundingClientRect();
    tell('size', { w: Math.ceil(r.width), h: Math.ceil(r.height) });
}

function note(msg, bad) { /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-e664b133 */
    const n = $('pp-note');
    n.textContent = msg || '';
    n.classList.toggle('pp-bad', !!bad);
}
function png() {
    const card = $('pp-fit').firstElementChild;
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    return cardPng(card, { width: w, height: h, scale: 2, img: P.bg.kind === 'image' && BGI ? BGI : null, bg: P.bg });
}
const fileName = () => 'better-vest-pnl-' + (snap && snap.day ? snap.day : 'today') + (P.mode === 'copy' ? '-copy' : '') + '.png';
async function onSave() {
    if (busy || !snap) return;
    busy = true;
    try {
        const url = URL.createObjectURL(await png());
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        note('Saved');
    } catch (e) { note('Could not make the image', true); }
    busy = false;
}
async function onCopy() {
    if (busy || !snap) return;
    busy = true;
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
        note('Copied: paste it into your post');
    } catch (e) { note('Could not copy: use Save', true); }
    busy = false;
}

document.addEventListener('mousedown', (e) => { if (!e.target.closest('#pp-copy, #pr-copy, #pr-post, #pc-copy, #pc-post')) e.preventDefault(); }, true);
const act = (id, fn) => $(id).addEventListener('click', async (e) => {
    e.preventDefault();
    try { await fn(); } finally { tell('blur'); }
});
act('pp-save', onSave);
act('pp-copy', onCopy);
act('pp-edit', () => tell('edit'));
act('pp-close', () => tell('close'));
act('pp-never', () => {
    const on = $('pp-never').getAttribute('aria-checked') !== 'true';
    $('pp-never').setAttribute('aria-checked', on ? 'true' : 'false');
    tell(on ? 'never' : 'again');
    note(on ? 'It will not pop up again (P&L in the dock still works)' : '');
});

let later = null;
function take(d) {
    const t = Date.now(); /* (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-bcc008e4 */
    if (t - lastCard < 1000) {
        if (!later) setTimeout(() => { const x = later; later = null; if (x) take(x); }, 1000 - (t - lastCard));
        later = d;
        return;
    }
    const s = cleanSnap(d.snap);
    if (!s) return;
    lastCard = t;
    if (d.type === 'column') { colTake(s, d); return; }
    MO.room = cleanRoom(d.room) || MO.room;
    if (d.type === 'run') { moment(s, s.moment || null, cleanGain(d.gain, s), null); return; }
    if (d.type === 'check') { check(s, cleanGain(d.gain, s)); return; }
    momentHide();
    snap = s;
    gain = cleanGain(d.gain, s);
    frameTheme(s.ui);
    note('');
    show();
/*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-c9c7ea31 */ }
window.addEventListener('message', (ev) => {
    if (ev.source !== parent || ev.origin !== VEST) return;
    const d = ev.data;
    if (!d || typeof d !== 'object' || d.bvPop !== 1 || !TYPES.includes(d.type)) return;
    let size = Infinity;
    try { size = JSON.stringify(d.snap).length; } catch (e) {}
    if (size > SHARE_MAX_BYTES) return;
    take(d);
});

async function boot() {
    if (P0.bg.kind === 'image') {
        try { const rec = await bgLoad(); if (rec) BGI = await bgPrepare(rec, { times: false }); } catch (e) { BGI = null; }
    }
    try { await document.fonts.ready; } catch (e) {}
    tell('ready', { need: PLACE === 'column' ? { replay: true, trades: true } : Object.assign(popNeed(P0), { trades: true }) });
}
boot();

window.__pop = () => ({ snap: !!snap, gain, kind: KIND, format: P ? P.format : P0.format, picture: !!BGI, shown: !$('pp').hidden, never: $('pp-never').getAttribute('aria-checked') === 'true',
    place: PLACE, moment: MO.m ? { shown: !$('pr').hidden, moment: MO.m, card: MO.kind, format: MO.P ? MO.P.format : '', theme: MO.P ? MO.P.theme : '', title: $('pr-t').textContent, sub: $('pr-s').textContent,
        video: !$('pr-video').hidden } : null,
    column: COL.snap ? { shown: !$('pc').hidden, tab: COL.tab, format: COL.format, hide: COL.hide, kind: COL.kind, tabs: [...$('pc-tabs').querySelectorAll('button')].map((b) => b.dataset.v + (b.disabled ? ':off' : '')) } : null });

const TYPES = PLACE === 'column' ? ['column'] : ['card', 'run', 'check'];
const MO = { gen: 0, snap: null, m: null, cal: null, P: null, kind: '', card: null, scene: null, room: null, busy: false };
const PR_W = 580;
const todayOf = (s) => (s && s.day) || dayKey(Date.now(), 'vest');
function cleanRoom(r) {
    const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 100 && v <= 4000 ? Math.round(v) : null);
    return r && typeof r === 'object' && n(r.w) && n(r.h) ? { w: n(r.w), h: n(r.h) } : null;
}
async function calFor(s) {
    if (s.demo) return { trades: sampleHistory(s, 45), payouts: samplePayouts(s.day), accounts: [], sample: true };
    const c = await calRead(s.accounts.map((a) => a.id));
    return { trades: c.trades, payouts: c.payouts, accounts: c.accounts, sample: false };
}
function momentHide() {
    $('pr').hidden = true;
}
function cardInstead(s, g) {
    momentHide();
    snap = s;
    gain = g;
    frameTheme(s.ui);
    note('');
    show();
}
async function check(s, g) {
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.6.2. bv-e4642654 */ const gen = ++MO.gen;
    const cal = await calFor(s).catch(() => ({ trades: [], payouts: [], accounts: [] }));
    if (gen !== MO.gen) return;
    const id = g ? g.id : s.activeId;
    const a = s.accounts.find((x) => x.id === id);
    const found = s.demo ? null : momentCheck(cal, { accountId: id, today: todayOf(s), now: Date.now(), seen: seenLoad(localStorage), snapList: todayTrades(s), dayPnl: a ? a.pnl : null });
    if (found) { moment(s, found, g, cal, gen); return; }
    if (g) { cardInstead(s, g); return; }
    tell('close');
}
async function moment(s, m, g, calIn, genIn) {
    const gen = genIn || ++MO.gen;
    if (!m) { if (g) cardInstead(s, g); else tell('close'); return; }
    const cal = calIn || (m.kind === 'payout' ? await calFor(s).catch(() => ({ trades: [], payouts: [], accounts: [] })) : null);
    if (gen !== MO.gen) return;
    Object.assign(MO, { snap: s, m, cal });
    frameTheme(s.ui);
    if (!paintMoment()) { MO.m = null; if (g) cardInstead(s, g); else tell('close'); return; }
    if (m.kind === 'payout' || m.kind === 'best') seenSave(localStorage, seenAdd(seenLoad(localStorage), m, todayOf(s)));
}
const ago = (ms) => { const m = Math.max(1, Math.round((Date.now() - ms) / 60000)); return m < 60 ? m + 'm ago' : Math.round(m / 60) + 'h ago'; };
function momentSub(s, m) {
    const a = s.accounts.find((x) => x.id === m.accountId) || null;
    const day = a && a.pnl != null ? usdWord(a.pnl) + ' today' : '';
    const n = todayTrades(s).filter((t) => t.accountId === m.accountId).length;
    const trades = n ? n + ' trade' + (n === 1 ? '' : 's') + ' today' : '';
    if (m.kind === 'passed') return [a ? a.name : '', day].filter(Boolean).join(' · ');
    if (m.kind === 'payout') return [payName(m.accountId), m.at ? 'paid ' + ago(m.at) : ''].filter(Boolean).join(' · ');
    if (m.kind === 'best') return [m.net != null ? usdWord(m.net) + ' today' : '', m.days ? 'beats ' + m.days + ' earlier days' : ''].filter(Boolean).join(' · ');
    return [a ? a.name : '', trades].filter(Boolean).join(' · ');
}
function payName(id) {
    const a = MO.snap && MO.snap.accounts.find((x) => x.id === id);
    if (a) return a.name;
    const r = MO.cal && (MO.cal.accounts || []).find((x) => x && String(x.id) === String(id));
    return r ? accountName(r) || '' : '';
}
function payNames() {
    const names = new Map();
    for (const r of (MO.cal && MO.cal.accounts) || []) if (r && r.id != null) names.set(String(r.id), accountName(r) || '');
    for (const a of MO.snap.accounts) names.set(a.id, a.name);
    return names;
}
function momentCard(fit) {
    const s = MO.snap, m = MO.m;
    const base = Object.assign({}, P0, { theme: uiLight(s.ui) ? 'light' : 'dark', period: 'today', pick: '', markets: null, rpAcc: '', rpMarket: '', bgImg: BGI });
    if (m.kind === 'payout') {
        const list = s.demo ? samplePayouts(todayOf(s)) : (MO.cal && MO.cal.payouts) || [];
        const PM = payoutModel(list, { kind: 'today', today: todayOf(s), names: s.demo ? samplePayNames() : payNames() });
        MO.P = Object.assign({}, base, { pay: 'today' });
        const out = fitCard(fit, (mx) => payoutHtml(PM, MO.P, mx, { sample: !!s.demo }));
        if (out.html && out.n) return { kind: 'payout', out };
    } /* @license Better Vest 9.6.2. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-120de1cd */
    const mine = s.accounts.some((a) => a.id === m.accountId) ? { mode: 'accounts', picked: [m.accountId] } : snapPicks(s, m.accountId);
    MO.P = Object.assign({}, base, mine);
    if (KIND === 'replay' && s.replay && s.replay.accountId === m.accountId) {
        const out = replayHtml(s, Object.assign({}, MO.P, { rsel: { ids: null, from: null, to: null } }));
        if (out.html && out.n) { fit.innerHTML = out.html; return { kind: 'replay', out }; }
    }
    const summary = (rows) => {
        const M = summaryModel(s, { rows, mode: MO.P.mode, picked: MO.P.picked, greenOnly: !!(MO.P.list && MO.P.list.green), period: { kind: 'today' }, markets: null, afterFees: MO.P.afterFees },
            { today: todayTrades(s), calendar: [] });
        return fitCard(fit, (mx) => cardHtml(s, MO.P, mx, M));
    };
    let out = summary(MO.P.rows);
    if (!out.n && MO.P.rows !== 'accounts') out = summary('accounts');
    return out.n ? { kind: 'summary', out } : null;
}
function paintMoment() {
    const s = MO.snap, m = MO.m;
    if (!s || !m) return false;
    const fit = $('pr-fit');
    fit.style.transform = 'none';
    const made = momentCard(fit);
    /*! Property of Astral (@ax4p). Better Vest 9.6.2. No copying without written permission. bv-0ceafcb3 */ if (!made) return false;
    MO.kind = made.kind;
    MO.card = fit.firstElementChild;
    MO.scene = made.out.scene || null;
    $('pp').hidden = true;
    const acct = s.accounts.find((x) => x.id === m.accountId) || null;
    $('pr-t').textContent = momentTitle(m, acct);
    $('pr-s').textContent = momentSub(s, m);
    const fw = window.innerWidth > 200 ? window.innerWidth : PR_W;
    const pw = Math.min(PR_W, fw);
    $('pr').style.width = pw + 'px';
    const [w, h] = CARD_SIZES[MO.P.format] || CARD_SIZES.feed;
    const maxH = Math.max(240, Math.min(480, (MO.room ? MO.room.h : 700) - 170));
    const k = Math.min((pw - 32) / w, maxH / h);
    fit.style.transform = `scale(${k})`;
    const box = $('pr-box');
    box.style.width = Math.round(w * k) + 'px';
    box.style.height = Math.round(h * k) + 'px';
    box.style.borderRadius = Math.round(22 * k) + 'px';
    $('pr-stage').style.height = Math.round(h * k) + 'px';
    $('pr-video').hidden = MO.kind !== 'replay';
    $('pr-video').disabled = !videoMime();
    moNote(s.demo ? 'Sample numbers' : '');
    $('pr').hidden = false;
    tell('size', { w: $('pr').offsetWidth, h: $('pr').offsetHeight });
    return true;
}
function moNote(msg, bad) {
    const n = $('pr-note');
    n.textContent = msg || '';
    n.classList.toggle('pp-bad', !!bad);
}
const moName = (ext) => 'better-vest-' + (MO.kind === 'payout' ? 'payout' : MO.kind === 'replay' ? 'replay' : 'pnl') + '-' + todayOf(MO.snap) + '.' + ext;
function moPng() {
    const [w, h] = CARD_SIZES[MO.P.format] || CARD_SIZES.feed;
    return cardPng(MO.card, { width: w, height: h, scale: 2, img: MO.P.bg.kind === 'image' && BGI ? BGI : null, bg: MO.P.bg });
}
function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function copyPng(make, say) {
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': make() })]);
        say('Copied: paste it into your post');
        /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-a35169a5 */ return true;
    } catch (e) { say('Could not copy: use Save', true); return false; }
}
async function moSave() {
    if (MO.busy || !MO.card) return;
    MO.busy = true;
    try { download(await moPng(), moName('png')); moNote('Saved'); } catch (e) { moNote('Could not make the image', true); }
    MO.busy = false;
}
async function moVideo() {
    if (MO.busy || MO.kind !== 'replay' || !MO.card) return;
    MO.busy = true;
    $('pr-video').disabled = true;
    try {
        const [w, h] = CARD_SIZES[MO.P.format] || CARD_SIZES.feed;
        const res = await recordReplay(MO.card, MO.scene, { cssUrl: CARD_CSS, width: w, height: h, scale: 2, onProgress: (f) => moNote('Recording ' + Math.round(f * 100) + '% · keep this tab in front') });
        download(res.blob, moName(videoExt(res.mime)));
        moNote('Saved');
    } catch (e) { moNote('Could not record the video', true); }
    $('pr-video').disabled = !videoMime();
    MO.busy = false;
}
act('pr-save', moSave);
act('pr-video', moVideo);
act('pr-copy', () => (MO.card ? copyPng(moPng, moNote) : null));
act('pr-post', async () => { if (MO.card && await copyPng(moPng, moNote)) window.open('https://x.com/intent/post', '_blank', 'noopener'); });
act('pr-not', () => tell('close'));
act('pr-close', () => tell('close'));
act('pr-never', () => {
    const on = $('pr-never').getAttribute('aria-checked') !== 'true';
    $('pr-never').setAttribute('aria-checked', on ? 'true' : 'false');
    tell(on ? 'never' : 'again');
    moNote(on ? 'It will not show again (P&L in the dock still works)' : '');
});

const COL = { snap: null, trade: null, tab: '', format: 'feed', hide: false, kind: '', card: null, scene: null, busy: false };
function cleanTrade(t) {
    const o = t && typeof t === 'object' && !Array.isArray(t) ? t : {};
    const n = (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e9 ? v : null);
    const sym = typeof o.symbol === 'string' ? o.symbol.toUpperCase().slice(0, 24) : '';
    return { symbol: /^[A-Z0-9-]{1,24}$/.test(sym) ? sym : '', market: /^[A-Z0-9-]{1,24}$/.test(sym) ? mktName(sym) : '', side: o.side === 'short' ? 'short' : 'long', pnl: n(o.pnl), roe: n(o.roe) };
}
function colTake(s, d) {
    COL.snap = s;
    COL.trade = cleanTrade(d.trade);
    if (d.theme === 'light' || d.theme === 'dark') document.documentElement.classList.toggle('light', d.theme === 'light');
    COL.format = CARD_SIZES[P0.format] ? P0.format : 'feed';
    COL.tab = '';
    colPaint();
}
function colReplayTrade() {
    /*! Owned by Astral (@ax4p): Better Vest lite 9.6.2. Licence: LICENSE, not open source. bv-a6ca0f27 */ const s = COL.snap;
    const r = s.replay && !s.replay.err ? replayPick(s.replay, '') : null;
    if (!r || !r.bars || !r.bars.length || (COL.trade.market && r.market && r.market !== COL.trade.market)) return null;
    const list = replayTrades(r).filter((t) => t.side === COL.trade.side);
    return list.find((t) => t.open) || list[list.length - 1] || null;
}
function colTradeRow() {
    const s = COL.snap, T = COL.trade;
    const id = s.activeId || (s.accounts[0] && s.accounts[0].id) || '';
    if (!id || !T.market) return null;
    const closed = todayTrades(s).filter((t) => t.accountId === id && mktName(t.symbol) === T.market && t.side === T.side);
    const near = (t) => Math.abs(t.net - T.pnl) <= Math.max(1, Math.abs(t.fee || 0) + 0.01, Math.abs(T.pnl) * 0.005);
    const hit = T.pnl == null ? closed[closed.length - 1] : closed.filter(near).pop();
    if (hit) return hit;
    if (T.pnl == null) return null;
    const day = todayOf(s), now = Date.now(), last = todayTrades(s).slice(-1)[0];
    const at = dayKey(now, 'vest') === day ? now : last ? last.closeTs : now;
    return { id: 'vest-share', accountId: id, symbol: T.symbol, side: T.side, open: false, openTs: at, closeTs: at, net: T.pnl, fee: 0, points: null, live: true };
}
function colPaint() {
    const s = COL.snap;
    if (!s) return;
    const P = Object.assign({}, P0, snapPicks(s), { format: COL.format, period: 'today', pick: '', markets: null, rpAcc: '', rpMarket: '', bgImg: BGI });
    const rt = COL.hide ? null : colReplayTrade();
    const row = colTradeRow();
    const card = { trade: null, today: null };
    if (row) {
        const PT = Object.assign({}, P, { mode: 'accounts', picked: [row.accountId], show: Object.assign({}, P.show, { pct: true }) });
        const M = summaryModel(s, { rows: 'trades', mode: 'accounts', picked: PT.picked, greenOnly: false, period: { kind: 'today' }, markets: null, afterFees: PT.afterFees }, { today: [row], calendar: [] });
        M.range = Object.assign({}, M.range, { heroLbl: 'Trade P&L' });
        const PP = COL.hide ? privateLook(PT, M) : PT;
        if (PP) card.trade = { P: PP, M };
    }
    const anyDay = s.accounts.some((a) => a.pnl != null);
    if (anyDay) {
        const M = summaryModel(s, { rows: 'accounts', mode: P.mode, picked: P.picked, greenOnly: false, period: { kind: 'today' }, markets: null, afterFees: P.afterFees }, { today: todayTrades(s), calendar: [] });
        const PP = COL.hide ? privateLook(P, M) : P;
        if (PP) card.today = { P: PP, M };
    /* Property of Astral (@ax4p). Better Vest 9.6.2. No copying without written permission. bv-57339fdc */ }
    const tabs = { trade: !!(rt || card.trade), today: !!card.today };
    if (!COL.tab || !tabs[COL.tab]) COL.tab = ['trade', 'today'].find((x) => tabs[x]) || '';
    $('pc-fmt').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === COL.format));
    $('pc-hide').setAttribute('aria-checked', COL.hide ? 'true' : 'false');
    const cw = Math.max(240, Math.floor(document.documentElement.clientWidth));
    const [w, h] = CARD_SIZES[COL.format];
    const k = Math.min(cw / w, Math.min(cw * 1.2, 420) / h);
    $('pc-stage').style.height = Math.round(h * k) + 'px';
    $('pc').classList.remove('fill');
    const fit = $('pc-fit');
    fit.style.transform = 'none';
    fit.innerHTML = '';
    COL.card = null; COL.scene = null; COL.kind = '';
    if (COL.tab === 'trade' && rt) {
        const out = replayHtml(s, Object.assign({}, P, { rsel: { ids: [rt.id], from: null, to: null } }));
        if (out.html && out.n) { COL.kind = 'replay'; fit.innerHTML = out.html; COL.scene = out.scene; }
    }
    if (!COL.kind && COL.tab === 'trade' && card.trade && fitCard(fit, (mx) => cardHtml(s, card.trade.P, mx, card.trade.M)).n) COL.kind = 'trade';
    if (!COL.kind && card.today) {
        if (COL.tab === 'trade') tabs.trade = false;
        COL.tab = 'today';
        if (fitCard(fit, (mx) => cardHtml(s, card.today.P, mx, card.today.M)).n) COL.kind = 'today';
    /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-0610c9c9 */ }
    $('pc-tabs').querySelectorAll('button').forEach((b) => { b.disabled = !tabs[b.dataset.v]; b.classList.toggle('on', b.dataset.v === COL.tab); });
    COL.card = fit.firstElementChild;
    colBox(w, h, k);
    $('pc-video').textContent = COL.kind === 'replay' ? 'Save video' : 'Save image';
    $('pc-video').disabled = !COL.card || (COL.kind === 'replay' && !videoMime());
    $('pc-copy').disabled = $('pc-post').disabled = !COL.card;
    const note = $('pc-note');
    note.style.color = '';
    const off = COL.hide ? [row && !card.trade ? 'This trade' : '', anyDay && !card.today ? 'Today' : ''].filter(Boolean) : [];
    note.textContent = s.demo ? 'Sample numbers.' : off.length ? 'With dollars hidden, ' + off.join(' and ') + ' has no % or points to show.' : '';
    $('pc').hidden = false;
    const need = $('pc').offsetHeight;
    tell('size', { w: $('pc').offsetWidth, h: need });
    colFill(need, w, h, k, cw);
}
function colFill(need, w, h, k, cw) {
    const extra = Math.floor(window.innerHeight) - need;
    if (extra < 1 || !COL.card) return;
    const sh = Math.round(h * k) + extra;
    $('pc-stage').style.height = sh + 'px';
    colBox(w, h, Math.min(cw / w, sh / h));
    $('pc').style.setProperty('--pc-fill', Math.floor(window.innerHeight) + 'px');
    $('pc').classList.add('fill');
}
function colBox(w, h, k) {
    const box = $('pc-box');
    box.style.width = Math.round(w * k) + 'px';
    box.style.height = Math.round(h * k) + 'px';
    box.style.borderRadius = Math.round(22 * k) + 'px';
    $('pc-fit').style.transform = `scale(${k})`;
}
function colNote(msg, bad) {
    const n = $('pc-note');
    n.textContent = msg || '';
    n.style.color = bad ? '#FF8DA1' : '';
}
function colPng() {
    const [w, h] = CARD_SIZES[COL.format];
    return cardPng(COL.card, { width: w, height: h, scale: 2, img: P0.bg.kind === 'image' && BGI ? BGI : null, bg: P0.bg }); /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-1a51d4eb */
}
async function colSave() {
    if (COL.busy || !COL.card) return;
    COL.busy = true;
    $('pc-video').disabled = true;
    const base = 'better-vest-' + (COL.kind === 'today' ? 'pnl' : 'trade') + '-' + todayOf(COL.snap);
    try {
        if (COL.kind === 'replay') {
            const [w, h] = CARD_SIZES[COL.format];
            const res = await recordReplay(COL.card, COL.scene, { cssUrl: CARD_CSS, width: w, height: h, scale: 2, onProgress: (f) => colNote('Recording ' + Math.round(f * 100) + '% · keep this tab in front') });
            download(res.blob, base + '.' + videoExt(res.mime));
        } else download(await colPng(), base + '.png');
        colNote('Saved');
    } catch (e) { colNote('Could not save it', true); }
    COL.busy = false;
    $('pc-video').disabled = COL.kind === 'replay' && !videoMime();
}
function keepFormat(f) {
    const cur = loadPrefs(localStorage);
    cur.format = f;
    storePrefs(localStorage, cur);
}
act('pc-video', colSave);
act('pc-copy', () => (COL.card ? copyPng(colPng, colNote) : null));
act('pc-post', async () => { if (COL.card && await copyPng(colPng, colNote)) window.open('https://x.com/intent/post', '_blank', 'noopener'); });
act('pc-hide', () => { COL.hide = !COL.hide; colPaint(); });
$('pc-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled || b.dataset.v === COL.tab) return; COL.tab = b.dataset.v; colPaint(); tell('blur'); });
$('pc-fmt').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !CARD_SIZES[b.dataset.v] || b.dataset.v === COL.format) return; COL.format = b.dataset.v; keepFormat(COL.format); colPaint(); tell('blur'); });
let prRaf = 0;
window.addEventListener('resize', () => { if (PLACE !== 'pop' || !MO.m || $('pr').hidden) return; cancelAnimationFrame(prRaf); prRaf = requestAnimationFrame(() => paintMoment()); });
let colRaf = 0;
window.addEventListener('resize', () => { if (!COL.snap) return; cancelAnimationFrame(colRaf); colRaf = requestAnimationFrame(colPaint); });
