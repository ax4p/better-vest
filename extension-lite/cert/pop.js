/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { cleanSnap, money, SHARE_MAX_BYTES } from './share-model.js';
import { cardHtml, replayHtml, CARD_SIZES } from './share-card.js';
import { summaryModel, todayTrades } from './share-summary.js';
import { loadPrefs, snapPicks, popNeed } from './share-prefs.js';
import { bgLoad, bgPrepare } from './share-bg.js';
import { fitCard, cardPng } from './share-render.js';

const VEST = 'https://next.vestmarkets.com';
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

function cleanGain(g, s) {
    if (!g || typeof g !== 'object' || !s.accounts.some((a) => a.id === g.id)) return null;
    /* Property of Astral (@ax4p). Better Vest 9.3.2. No copying without written permission. bv-16a6fb1f */ const usd = typeof g.usd === 'number' && Number.isFinite(g.usd) ? g.usd : null;
    const pct = typeof g.pct === 'number' && Number.isFinite(g.pct) ? g.pct : null;
    return { id: g.id, usd, pct };
}

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
    $('pp-stage').style.width = Math.round(w * k) + 'px'; /*! Better Vest (c) 2026 Astral. All rights reserved. bv-62b0c1ca */
    $('pp-stage').style.height = Math.round(h * k) + 'px';
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
    busy = false; /* @license Better Vest 9.3.2. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-e18473ac */
}

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
    /*! Copyright Astral 2026. From Better Vest 9.3.2 (lite), ref bv-6ae9a255. Not licensed for reuse. */ try { size = JSON.stringify(d.snap).length; } catch (e) {}
    if (size > SHARE_MAX_BYTES) return;
    take(d);
});

async function boot() {
    if (P0.bg.kind === 'image') {
        try { const rec = await bgLoad(); if (rec) BGI = await bgPrepare(rec, { times: false }); } catch (e) { BGI = null; }
    }
    try { await document.fonts.ready; } catch (e) {}
    tell('ready', { need: popNeed(P0) });
}
boot();

window.__pop = () => ({ snap: !!snap, gain, kind: KIND, format: P ? P.format : P0.format, picture: !!BGI, shown: !$('pp').hidden, never: $('pp-never').getAttribute('aria-checked') === 'true' });
