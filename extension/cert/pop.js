// Better Vest P&L card, the pop-up (9.0). The owner: "when user close a trade and its 1% or more of the account pnl it auto generate a pnl
// card and it pops up for the user with a toggle to not show again". This page runs in a small frame at the bottom right of Vest's trade page
// (src/copy/35-share.js puts it there, the manifest lets only Vest's page frame it). Vest's page hands it the same snapshot the dock's P&L
// button sends, with postMessage; it is cleaned here with the share page's own cleanSnap and drawn with the share page's own card code in the
// look you chose there (cert/share-prefs.js, your picture from cert/share-bg.js). It answers only with what you pressed. Nothing here asks
// Vest for anything or sends anything anywhere; the PNG is made on this computer like the share page's.
// The frame never takes the keyboard from Vest: no button is in the tab order, and after every click Vest's page takes the focus back.

import { cleanSnap, money, SHARE_MAX_BYTES } from './share-model.js';
import { cardHtml, replayHtml, CARD_SIZES } from './share-card.js';
import { summaryModel, todayTrades } from './share-summary.js';
import { loadPrefs, snapPicks, popNeed } from './share-prefs.js';
import { bgLoad, bgPrepare } from './share-bg.js';
import { fitCard, cardPng } from './share-render.js';

const VEST = 'https://next.vestmarkets.com';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// your look, as the share page remembers it; a Payout card is the share page's own: after a close the card is the Summary
const P0 = loadPrefs(localStorage);
const KIND = P0.kind === 'replay' ? 'replay' : 'summary';
let snap = null;
let gain = null;
let BGI = null;
let P = null;
let lastCard = 0;
let busy = false;

const tell = (type, extra) => { try { parent.postMessage(Object.assign({ bvPop: 1, type }, extra || {}), VEST); } catch (e) {} };

// the close that made the card: one of the snapshot's accounts, its gain in $ and %
function cleanGain(g, s) {
    if (!g || typeof g !== 'object' || !s.accounts.some((a) => a.id === g.id)) return null;
    const usd = typeof g.usd === 'number' && Number.isFinite(g.usd) ? g.usd : null;
    const pct = typeof g.pct === 'number' && Number.isFinite(g.pct) ? g.pct : null;
    return { id: g.id, usd, pct };
}

// the card in the look you chose, today, for the account that closed (the copy group while copying)
function build() {
    const fit = $('pp-fit');
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
    // no Replay (no trades or candles read in time): the Summary; rows Vest's trades could not fill: the accounts
    if (!out) out = summary(P.rows);
    if (!out.n && P.rows !== 'accounts') out = summary('accounts');
    return out;
}
function show() {
    const out = build();
    const card = $('pp-fit').firstElementChild;
    if (!card || !out.n) { tell('close'); return; }
    // the card small: 268 px wide (16:9: 380), at most 330 px tall
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    const k = Math.min((P.format === 'wide' ? 380 : 268) / w, 330 / h);
    $('pp-fit').style.transform = `scale(${k})`;
    $('pp-stage').style.width = Math.round(w * k) + 'px';
    $('pp-stage').style.height = Math.round(h * k) + 'px';
    // the frame starts 0 px wide: the panel takes the card's width (and room for its buttons) itself
    $('pp').style.width = Math.max(292, Math.round(w * k) + 24) + 'px';
    const pct = gain && gain.pct != null ? ` (+${gain.pct.toFixed(2)}%)` : '';
    $('pp-t').innerHTML = gain && gain.usd != null ? `Green exit <b>${esc(money(gain.usd))}</b>${esc(pct)}` : 'Green exit';
    $('pp-note').textContent = snap.demo ? 'Sample numbers' : '';
    $('pp').hidden = false;
    const r = $('pp').getBoundingClientRect();
    tell('size', { w: Math.ceil(r.width), h: Math.ceil(r.height) });
}

function note(msg, bad) {
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

// a press must never leave the keyboard here: no focus on mouse down (Copy needs it: the clipboard takes only a focused page), the focus
// back to Vest after the click
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#pp-copy')) e.preventDefault(); }, true);
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

// the card from Vest's page: only from the page that framed this one, at most 256 KB and one a second (the P&L button's own limits); a
// newer card within the second waits for it, so the last big close is the one shown
let later = null;
function take(d) {
    const t = Date.now();
    if (t - lastCard < 1000) {
        if (!later) setTimeout(() => { const x = later; later = null; if (x) take(x); }, 1000 - (t - lastCard));
        later = d;
        return;
    }
    const s = cleanSnap(d.snap);
    if (!s) return;
    lastCard = t;
    snap = s;
    gain = cleanGain(d.gain, s);
    note('');
    show();
}
window.addEventListener('message', (ev) => {
    if (ev.source !== parent || ev.origin !== VEST) return;
    const d = ev.data;
    if (!d || typeof d !== 'object' || d.bvPop !== 1 || d.type !== 'card') return;
    let size = Infinity;
    try { size = JSON.stringify(d.snap).length; } catch (e) {}
    if (size > SHARE_MAX_BYTES) return;
    take(d);
});

// ready once the fonts and your picture are: then Vest's page sends the card
async function boot() {
    if (P0.bg.kind === 'image') {
        // the PNG takes the picture's first frame: its frame times are never read here (a big GIF costs the frame nothing)
        try { const rec = await bgLoad(); if (rec) BGI = await bgPrepare(rec, { times: false }); } catch (e) { BGI = null; }
    }
    try { await document.fonts.ready; } catch (e) {}
    tell('ready', { need: popNeed(P0) });
}
boot();

// for the screenshots and the live check: the frame's state, read only
window.__pop = () => ({ snap: !!snap, gain, kind: KIND, format: P ? P.format : P0.format, picture: !!BGI, shown: !$('pp').hidden, never: $('pp-never').getAttribute('aria-checked') === 'true' });
