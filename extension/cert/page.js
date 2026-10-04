// Better Vest certificate page: loads the executed payouts the Calendar synced, shows the live certificate, exports it.
//   certificate.html            real data (IndexedDB bv-journal-<userId>, same user the Calendar opens)
//   certificate.html#fixture    journal/fixture.js data (dev builds only; the shipped build has no fixture.js)
//   certificate.html#fixture&state=empty   forces the empty state

import * as DB from '../journal/db.js';
import { fmtDate } from '../journal/time.js';
import { certStats } from './stats.js';
import { buildCard, fitCard, fmtMoney, fmtMilestone, CARD_W, CARD_H, CARD_CSS, DEFAULT_NAME, NAME_MAX } from './card.js';
import { cardToPngBlob } from './raster.js';

const HAS_CHROME = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const DEV = location.hash.includes('fixture') || !HAS_CHROME;
const FORCE_EMPTY = /state=empty/.test(location.hash);
const LS_NAME = 'bv-cert-name';
const LS_CHART = 'bv-cert-chart';
const EXPORT_SCALE = 3;

const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: the setting just does not persist */ } }
};

const root = document.getElementById('cp-root');

function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
}

// ---------- data ----------

async function loadPayouts() {
    if (DEV) {
        try {
            const { buildFixture } = await import('../journal/fixture.js');
            return { payouts: FORCE_EMPTY ? [] : buildFixture().payouts, source: 'fixture' };
        } catch (e) {
            if (location.hash.includes('fixture')) console.warn('certificate: no fixture in this build', e);
        }
    }
    if (!HAS_CHROME) return { payouts: [], source: 'none' };
    // same user the Calendar opens: the last user the sync saw, else the first Better Vest database
    const got = await chrome.storage.local.get(['journalLastUser']).catch(() => ({}));
    let id = got.journalLastUser;
    if (!id) { const ids = await DB.listUserIds().catch(() => []); id = ids[0]; }
    if (!id) return { payouts: [], source: 'none' };
    const db = await DB.openDb(String(id));
    try {
        const payouts = await DB.getAll(db, 'payouts');
        const lastSync = await DB.getMeta(db, 'lastSync').catch(() => null);
        return { payouts, source: 'db', lastSync: lastSync || null };
    } finally {
        db.close();
    }
}

// ---------- theme: follow the Calendar (it writes the active theme's variables to localStorage) ----------

function syncTheme() {
    const name = ls.get('bv-journal-theme');
    const css = ls.get('bv-journal-themecss');
    if (name) document.documentElement.setAttribute('data-theme', name);
    if (css) {
        let s = document.getElementById('theme-vars');
        if (!s) { s = document.createElement('style'); s.id = 'theme-vars'; document.head.appendChild(s); }
        s.textContent = css;
    }
}
window.addEventListener('storage', (e) => { if (e.key === 'bv-journal-theme' || e.key === 'bv-journal-themecss') syncTheme(); });

// ---------- shell ----------

function openCalendar() {
    if (HAS_CHROME) chrome.runtime.sendMessage({ type: 'journal-open' }).catch(() => { location.href = 'journal.html'; });
    else location.href = 'journal.html' + (DEV ? '#fixture' : '');
}

function topbar() {
    return h('header', { class: 'cp-top' },
        h('b', null, 'Better Vest'), h('small', null, 'by Astral · Total payouts certificate'), h('div', { class: 'grow' }),
        h('button', { class: 'cp-btn', type: 'button', onclick: openCalendar, style: 'height:30px;padding:0 12px' }, 'Open Calendar'));
}

function renderEmpty(note) {
    root.replaceChildren(h('div', { class: 'cp-app' }, topbar(),
        h('div', { class: 'cp-empty', 'data-state': 'empty' }, h('div', null,
            h('h1', null, 'No payouts to show yet'),
            h('p', null, note || 'Open the Calendar and sync your history first. The certificate is built from your executed payouts.'),
            h('button', { class: 'cp-btn pri', type: 'button', onclick: openCalendar }, 'Open the Calendar')))));
}

function stamp(key) {
    return key ? `${fmtDate(key, 'dm')} ${key.slice(0, 4)}` : '—';
}

function fileStamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function renderPage(S) {
    const state = { name: (ls.get(LS_NAME) || '').slice(0, NAME_MAX), chart: ls.get(LS_CHART) === '1' };
    let card = null;
    let seq = 0;

    const stage = h('div', { class: 'cp-stage', 'data-state': 'ready' });
    const frame = h('div', { class: 'cp-card' });
    stage.append(frame);
    const status = h('div', { class: 'cp-status', role: 'status', 'aria-live': 'polite' });
    const say = (text, kind) => { status.textContent = text || ''; status.className = 'cp-status' + (kind ? ' ' + kind : ''); };

    function layout() {
        const w = stage.clientWidth - 24, hgt = Math.max(420, window.innerHeight - 150);
        const k = Math.max(0.3, Math.min(w / CARD_W, hgt / CARD_H, 1.5));
        frame.style.width = (CARD_W * k).toFixed(2) + 'px';
        frame.style.height = (CARD_H * k).toFixed(2) + 'px';
        if (card) card.style.transform = `scale(${k.toFixed(4)})`;
    }

    async function draw() {
        const mine = ++seq;
        const next = buildCard(S, { name: state.name, chart: state.chart, uid: 'p' });
        frame.replaceChildren(next);
        card = next;
        layout();
        try { await document.fonts.load('600 56px Inter'); await document.fonts.load('700 11px Inter'); } catch (e) { /* fall back to the system font */ }
        if (mine !== seq) return;
        fitCard(next);
        layout();
    }

    async function makePng() {
        say('Rendering…');
        await document.fonts.ready;
        return cardToPngBlob(card, { cssUrl: CARD_CSS, width: CARD_W, height: CARD_H, scale: EXPORT_SCALE });
    }

    const busy = (btns, on) => btns.forEach((b) => { b.disabled = on; });
    const download = h('button', { class: 'cp-btn pri', type: 'button', id: 'cp-download' }, 'Download PNG');
    const copy = h('button', { class: 'cp-btn', type: 'button', id: 'cp-copy' }, 'Copy image');
    download.addEventListener('click', async () => {
        busy([download, copy], true);
        try {
            const blob = await makePng();
            const url = URL.createObjectURL(blob);
            const a = h('a', { href: url, download: `better-vest-total-payouts-${fileStamp()}.png` });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            say(`Saved ${Math.round(CARD_W * EXPORT_SCALE)} × ${Math.round(CARD_H * EXPORT_SCALE)} PNG.`, 'ok');
        } catch (e) {
            console.warn('certificate: export failed', e);
            say('Could not render the image: ' + (e && e.message ? e.message : e), 'err');
        } finally { busy([download, copy], false); }
    });
    copy.addEventListener('click', async () => {
        busy([download, copy], true);
        try {
            if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('this browser cannot copy images');
            // the blob is handed over as a promise so the click keeps its user activation while the card renders
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': makePng() })]);
            say('Image copied to the clipboard.', 'ok');
        } catch (e) {
            console.warn('certificate: copy failed', e);
            say('Could not copy the image: ' + (e && e.message ? e.message : e) + '. Use Download PNG instead.', 'err');
        } finally { busy([download, copy], false); }
    });

    const input = h('input', { class: 'cp-input', id: 'cp-name', type: 'text', maxlength: NAME_MAX, placeholder: DEFAULT_NAME, autocomplete: 'off', spellcheck: 'false', value: state.name });
    input.addEventListener('input', () => { state.name = input.value; ls.set(LS_NAME, state.name); draw(); });

    const chartBox = h('input', { type: 'checkbox', id: 'cp-chart', checked: state.chart });
    chartBox.checked = state.chart;
    chartBox.addEventListener('change', () => { state.chart = chartBox.checked; ls.set(LS_CHART, state.chart ? '1' : '0'); draw(); });

    const ms = S.reached;
    const facts = h('dl', { class: 'cp-facts' },
        h('dt', null, 'Net paid out'), h('dd', { class: 'gold' }, fmtMoney(S.total)),
        h('dt', null, 'Executed payouts'), h('dd', null, S.count),
        h('dt', null, 'Funded accounts paid'), h('dd', null, S.accounts),
        h('dt', null, 'Largest'), h('dd', null, fmtMoney(S.largest) + (S.largestCount > 1 ? ` × ${S.largestCount}` : '')),
        h('dt', null, 'First → latest'), h('dd', null, `${stamp(S.firstKey)} → ${stamp(S.lastKey)}`),
        h('dt', null, 'Milestone'), h('dd', null, ms ? `${fmtMilestone(ms.amount)} · ${stamp(ms.reachedKey)}` : (S.next ? `next ${fmtMilestone(S.next.amount)}` : '—')));

    const side = h('aside', { class: 'cp-side' },
        h('div', null, h('h1', null, 'Total payouts certificate'),
            h('p', { class: 'cp-lead' }, 'A shareable card of everything you have been paid out, from your synced Vest history.')),
        h('div', { class: 'cp-box' },
            h('label', { class: 'cp-field' }, h('span', null, 'Name on certificate'), input,
                h('span', { class: 'cp-hint', style: 'text-transform:none;letter-spacing:0;font-weight:400' }, `Shown as "${DEFAULT_NAME}" when empty. Saved on this device.`)),
            h('label', { class: 'cp-toggle', for: 'cp-chart' }, chartBox, h('span', { class: 'cp-switch' }), h('span', null, 'Show daily chart')),
            h('div', { class: 'cp-actions' }, download, copy),
            status),
        h('div', { class: 'cp-box' }, h('div', { class: 'cp-label' }, 'Based on your Calendar data'), facts,
            h('div', { class: 'cp-hint' }, 'Executed payouts only, trader net amount: the same total as the Payouts tab.')));

    root.replaceChildren(h('div', { class: 'cp-app' }, topbar(), h('main', { class: 'cp-main' }, stage, side)));
    window.addEventListener('resize', layout);
    draw();
    // exposed for dev tooling and tests
    window.__cert = { S, state, draw, makePng };
}

// ---------- boot ----------

(async function boot() {
    syncTheme();
    try {
        const { payouts } = await loadPayouts();
        const S = certStats(payouts);
        if (!S) { renderEmpty(); return; }
        renderPage(S);
    } catch (e) {
        console.warn('certificate: load failed', e);
        renderEmpty('The Calendar data could not be read (' + (e && e.message ? e.message : e) + '). Open the Calendar and sync your history first.');
    }
})();
