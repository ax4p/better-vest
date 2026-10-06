// Better Vest share poster: the page (cert/share.html; in cert/ so the 8.0.5 self-updater, whose file list allows only known folders, can install it). The dock's P&L button on Vest's trade page sends a snapshot of today's P&L per account
// (src/copy/35-share.js -> bridge.js -> sw.js, cleaned by cert/share-model.js and kept in chrome.storage.session); this page builds the card
// from it (cert/share-card.js) and saves or copies it as a PNG through the certificate's pipeline (cert/raster.js). No request of ours.
// The controls sit in two bars on top (the owner, 2026-10-06): what the card is about and the two actions, then how it looks.

import { cleanSnap, copyGroup, maskName, money, dayLong } from './share-model.js';
import { cardHtml, replayHtml, CARD_SIZES } from './share-card.js';
import { replayTrades, replayModel, replayFit, hhmm, tzShort } from './share-replay.js';
import { cardToPngBlob } from './raster.js';

const CARD_CSS = new URL('./share-card.css', import.meta.url).href;
const PREFS_KEY = 'bvSharePrefs';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// the look you chose is remembered on this computer (this page's own storage); which accounts are on the card comes from each snapshot
const DEFAULT_PREFS = { kind: 'summary', style: 'vest', theme: 'dark', format: 'feed', hero: 'usd', handle: '',
    list: { on: true, green: false, mask: true }, show: { date: true, accounts: true, pct: false, market: true, handle: true, credit: true } };
function loadPrefs() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (e) {}
    const o = p && typeof p === 'object' ? p : {};
    return Object.assign({}, DEFAULT_PREFS, o, { list: Object.assign({}, DEFAULT_PREFS.list, o.list), show: Object.assign({}, DEFAULT_PREFS.show, o.show) });
}
function savePrefs() {
    const { kind, style, theme, format, hero, handle, list, show } = P;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ kind, style, theme, format, hero, handle, list, show })); } catch (e) {}
}

const P = Object.assign(loadPrefs(), { mode: 'accounts', picked: [] });
let snap = null;
// the Replay's selection: which trades (null: all) and which time (null: the whole session). It belongs to one snapshot, so it is not kept.
let RS = { ids: null, from: null, to: null };

// a new snapshot: copy trading when the copier is copying, else the account you trade on
function useSnap(s) {
    snap = cleanSnap(s);
    if (!snap) return;
    RS = { ids: null, from: null, to: null };
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
    paintControls();
    render();
}

const LIST = [['on', 'List'], ['green', 'Only green'], ['mask', 'Hide names']];
const LIST_TIP = { on: 'One row per account under the total', green: 'Only the accounts in profit: the total and the count then cover those', mask: 'Names show as EVAL***' };
const SHOW = [['date', 'Date'], ['accounts', '"Across N accounts" line'], ['pct', '% return (or $ when the big number is %)'], ['market', 'Market'], ['handle', 'Your name'], ['credit', 'Better Vest credit']];

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

function paintSettings() {
    const replay = P.kind === 'replay';
    // the Replay is the account on your chart: its own controls (which trades, which time) stand where the Summary's account controls are
    $('mode').hidden = $('pick-pop').hidden = replay;
    $('rpt-pop').hidden = $('rpr-pop').hidden = !replay;
    $('mode').querySelectorAll('button').forEach((b) => { b.disabled = b.dataset.v === 'copy' && !(snap && copyGroup(snap).length > 1); });
    $('pick-btn').disabled = !snap;
    $('listopts').querySelectorAll('.chip').forEach((c) => { c.disabled = replay && c.dataset.k !== 'mask'; });
    $('hero').querySelector('[data-v="pct"]').disabled = replay;
    ['kind', 'mode', 'hero', 'style', 'theme', 'format'].forEach((k) => $(k).querySelectorAll('button').forEach((b) => {
        const on = b.dataset.v === P[k];
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }));
    $('listopts').querySelectorAll('.chip').forEach((c) => {
        const on = !!P.list[c.dataset.k];
        c.classList.toggle('on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
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
        return;
    }
    empty.hidden = true;
    $('sub').textContent = (snap.day ? dayLong(snap.day) : 'Today') + (snap.demo ? ' · sample numbers' : ', from Vest');
    if (P.kind === 'replay') { renderReplay(); return; }
    // the most account rows that fit the panel without spilling, from all of them down
    fit.style.transform = 'none';
    let out = null;
    for (let m = 60; m >= 1; m--) {
        out = cardHtml(snap, P, m);
        fit.innerHTML = out.html;
        const panel = fit.querySelector('.panel');
        if (!panel || panel.scrollHeight <= panel.clientHeight + 1) break;
    }
    scaleCard();
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    $('cap').textContent = out && out.n ? 'Saves at ' + w * 2 + ' × ' + h * 2 + ' px' + (snap.demo ? ' · sample numbers, marked on the card' : '') : 'No account on the card: pick one in ' + (P.mode === 'copy' ? 'Copy group' : 'Accounts') + (P.list.green ? ', or turn off Only green' : '') + '.';
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
    paintReplayControls();
    const out = replayHtml(snap, Object.assign({}, P, { rsel: RS }));
    if (!out.html) {
        fit.innerHTML = '';
        $('empty').hidden = false;
        $('empty').textContent = REPLAY_WHY[out.err] || REPLAY_WHY['read-failed'];
        $('cap').textContent = '';
        $('save').disabled = $('copy').disabled = true;
        return;
    }
    fit.innerHTML = out.html;
    scaleCard();
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    const r = snap.replay || {};
    const past = r.day && snap.day && r.day !== snap.day;
    if (!out.n) {
        $('cap').textContent = 'No trade on the card: tick one in Trades' + (RS.from != null ? ', or widen the time' : '') + '.';
        $('save').disabled = $('copy').disabled = true;
        return;
    }
    $('cap').textContent = (past ? 'No trades today on ' + (r.market || 'this market') + ': your latest session, ' + dayLong(r.day) + ' · ' : '') + 'Saves at ' + w * 2 + ' × ' + h * 2 + ' px · Vest\'s own candles' + (snap.demo ? ' · sample trades, marked on the card' : '');
    $('save').disabled = $('copy').disabled = !out.n;
}
// as big as the stage allows, with room around it and for the caption (the card is HTML, so it stays sharp when scaled up)
function scaleCard() {
    const fit = $('fit');
    const card = fit.firstElementChild;
    const stage = $('stage').getBoundingClientRect();
    const k = Math.max(0.2, Math.min(1.35, (stage.width - 96) / card.offsetWidth, (stage.height - 100) / card.offsetHeight));
    fit.style.transform = `scale(${k})`;
}

function pngName() {
    return 'better-vest-pnl-' + (snap && snap.day ? snap.day : 'today') + (P.kind === 'replay' ? '-replay' : P.mode === 'copy' ? '-copy' : '') + '.png';
}
async function pngBlob() {
    const card = $('fit').firstElementChild;
    const [w, h] = CARD_SIZES[P.format] || CARD_SIZES.feed;
    return cardToPngBlob(card, { cssUrl: CARD_CSS, width: w, height: h, scale: 2 });
}

// a short note at the bottom of the page after an action
let toastTimer = 0;
function say(msg, bad) {
    const t = $('toast');
    t.textContent = msg || '';
    t.classList.toggle('bad', !!bad);
    t.classList.toggle('on', !!msg);
    clearTimeout(toastTimer);
    if (msg) toastTimer = setTimeout(() => t.classList.remove('on'), bad ? 6000 : 2600);
}

let busy = false;
async function onSave() {
    if (busy || $('save').disabled) return;
    busy = true;
    try {
        const blob = await pngBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pngName();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
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

// ---------- Replay: which trades, which time ----------
const rpReplay = () => (snap && snap.replay && !snap.replay.err && snap.replay.bars.length ? snap.replay : null);
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
    $('rpr-len').textContent = (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60 ? (mins % 60) + ' min' : '') : mins + ' min').trim() + ' · ' + (b - a + 1) + ' candles of ' + r.res + 'm';
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
const POPS = [['pick-btn', 'pick-panel'], ['show-btn', 'show-panel'], ['rpt-btn', 'rpt-panel'], ['rpr-btn', 'rpr-panel']];
function closePops(except) {
    POPS.forEach(([b, p]) => { if (p !== except) { $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); } });
}
POPS.forEach(([b, p]) => $(b).addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $(p).hidden;
    closePops(p);
    $(p).hidden = !open;
    $(b).setAttribute('aria-expanded', open ? 'true' : 'false');
}));
document.addEventListener('click', (e) => { if (!e.target.closest('.pop')) closePops(); });

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
['kind', 'hero', 'style', 'theme', 'format'].forEach((k) => seg(k, (v) => { P[k] = v; savePrefs(); }));
$('listopts').innerHTML = LIST.map(([k, l]) => `<button type="button" class="chip" data-k="${k}" title="${esc(LIST_TIP[k])}"><i></i>${l}</button>`).join('');
$('show').innerHTML = SHOW.map(([k, l]) => `<label class="row"><input type="checkbox" data-k="${k}"><span class="nm">${l}</span></label>`).join('');
$('listopts').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    P.list[c.dataset.k] = !P.list[c.dataset.k];
    savePrefs();
    render();
});
$('show').addEventListener('change', (e) => { P.show[e.target.dataset.k] = e.target.checked; savePrefs(); render(); });
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
$('handle').addEventListener('input', (e) => { P.handle = e.target.value.slice(0, 32); savePrefs(); render(); });
$('save').addEventListener('click', onSave);
$('copy').addEventListener('click', onCopy);
// Cmd/Ctrl+S saves, Cmd/Ctrl+C copies the image (not while typing your name or with text selected), Esc closes a drop-down
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePops(); return; }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); onSave(); return; }
    const typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
    if (k === 'c' && !typing && !String(window.getSelection() || '')) { e.preventDefault(); onCopy(); }
});
let resizeRaf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(render); });

// the snapshot: now, and again whenever P&L is pressed in the dock while this page is open
async function load() {
    let s = null;
    try { s = (await chrome.storage.session.get('shareSnap')).shareSnap; } catch (e) {}
    if (s) useSnap(s); else render();
}
try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'session' && ch.shareSnap && ch.shareSnap.newValue) useSnap(ch.shareSnap.newValue); }); } catch (e) {}
(document.fonts ? document.fonts.ready : Promise.resolve()).then(load);

// for the tests and the screenshots: the page's state, read only
window.__share = () => ({ snap, P: JSON.parse(JSON.stringify(P)), RS: JSON.parse(JSON.stringify(RS)), mask: maskName });
