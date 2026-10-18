/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
import { vcParse, vcPending, vcPhraseList } from './listen-cmd.js';

const $ = (id) => document.getElementById(id);
const REC = globalThis.__bvVcRec || globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const LABEL = { long: 'Long', short: 'Short', flat: 'Flat', half: '50%', rev: 'Reverse', be: 'Breakeven', limitBuy: 'Limit buy', limitSell: 'Limit sell' };
const WAIT_MS = 350;
const USE = { n: {}, timer: 0 };
function use(name, k) {
    USE.n[name] = (USE.n[name] || 0) + (k || 1);
    /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-2cd52fb4 */ if (!USE.timer) USE.timer = setTimeout(useFlush, 60000);
}
function useFlush() {
    clearTimeout(USE.timer);
    USE.timer = 0;
    const n = USE.n;
    USE.n = {};
    if (!Object.keys(n).length) return;
    try { chrome.runtime.sendMessage({ type: 'usage', op: 'use', n }).catch(() => {}); } catch (e) {}
}
const RELEASE_MS = 700;

const st = {
    cfg: { on: false, mode: 'ptt', open: true }, rec: null, running: false, want: false, sess: 0, backoff: 300,
    texts: new Map(),
    fired: new Map(),
    wait: null,
    span: null,
    seq: 0, lastKey: '', heardTimer: 0, phrases: true, offTold: false
};
setInterval(() => { if (st.running && st.cfg.on) use(st.cfg.mode === 'wake' ? 'vc.listenWake' : 'vc.listenPtt'); }, 60000);

function show(state, text, why) {
    if (why && !st.offTold) { st.offTold = true; use(why); useFlush(); }
    document.body.dataset.state = state;
    if ($('state').textContent !== text) $('state').textContent = text;
}
function heard(text) {
    $('heard').textContent = text ? '“' + text.trim() + '”' : '';
    document.body.dataset.heard = text ? '1' : '';
    clearTimeout(st.heardTimer);
    st.heardTimer = setTimeout(() => { document.body.dataset.heard = ''; }, 900);
}
function did(text, level) {
    const d = $('did');
    d.textContent = text || '';
    d.dataset.level = level || '';
}
function idleText() {
    if (!st.cfg.on) return 'Voice commands are off';
    return st.cfg.mode === 'wake' ? 'Say “Astral” then a command' : 'Hold your talk key, then speak';
}
function paintIdle() {
    $('mode').textContent = st.cfg.mode === 'wake' ? 'Say Astral' : 'Push to talk';
    document.body.dataset.mode = st.cfg.mode;
    if (!st.cfg.on) { show('off', idleText()); return; }
    if (st.running) show(st.span && !st.span.up ? 'talk' : 'idle', st.span && !st.span.up ? 'Listening…' : idleText());
}

function setCfg(c) {
    const o = c && typeof c === 'object' ? c : {};
    st.cfg = { on: o.on === true, mode: o.mode === 'wake' ? 'wake' : 'ptt', open: o.open !== false };
    if (st.cfg.on && !st.want && st.ready) { st.want = true; start(); }
    if (!st.cfg.on && st.want) { st.want = false; try { st.rec && st.rec.abort(); } catch (e) {} }
    paintIdle();
}


function start() {
    if (st.running || st.rec || !st.want) return;
    let r;
    try { r = new REC(); } catch (e) { show('off', 'Chrome could not start its speech engine.'); return; } /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-fd04e8ac */
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    try { r.processLocally = true; } catch (e) {}
    if (st.phrases && typeof globalThis.SpeechRecognitionPhrase === 'function') {
        try { r.phrases = vcPhraseList().map((p) => new globalThis.SpeechRecognitionPhrase(p, p === 'astral' ? 8 : 3)); } catch (e) {}
    }
    st.sess++;
    r.onstart = () => { st.running = true; st.backoff = 300; paintIdle(); };
    r.onresult = onResult;
    r.onerror = (e) => {
        const err = e && e.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') { st.want = false; show('off', 'Allow the microphone for Better Vest, then open this window again.', 'vc.micBlocked'); }
        else if (err === 'phrases-not-supported') st.phrases = false;
        else if (err === 'language-not-supported') { st.want = false; show('off', 'Chrome has no English speech model on this computer.', 'vc.noEngine'); }
        else if (err === 'audio-capture') show('off', 'No microphone found.');
    };
    r.onend = () => {
        st.running = false;
        st.rec = null;
        st.texts.clear();
        st.fired.clear();
        if (!st.want) { paintIdle(); return; }
        setTimeout(start, st.backoff);
        st.backoff = Math.min(st.backoff * 2, 4000);
    };
    st.rec = r;
    try { r.start(); } catch (e) { st.rec = null; setTimeout(start, 1000); }
}

function onResult(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = String(res[0] && res[0].transcript || '');
        const key = st.sess + ':' + i;
        st.texts.set(key, { text, fin: !!res.isFinal });
        st.lastKey = key;
        if (text.trim()) heard(text);
        if (st.cfg.mode === 'ptt') { if (st.span) { st.span.keys.add(key); if (st.span.up) pttCheck(false); } } /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-03fe2d6d */
        else wakeCheck(key, text, !!res.isFinal);
    }
}


function wakeCheck(key, text, fin) {
    if (!st.cfg.on) return;
    const used = st.fired.get(key) || 0;
    const part = text.slice(used);
    if (st.wait && st.wait.key === key) { clearTimeout(st.wait.timer); st.wait = null; }
    const c = vcParse(part, { wake: true });
    if (!c) return;
    if (!c.grows || fin) { st.fired.set(key, text.length); send(c); return; }
    st.wait = { key, timer: setTimeout(() => {
        st.wait = null;
        const now = st.texts.get(key);
        if (!now || now.text !== text || (st.fired.get(key) || 0) >= text.length) return;
        st.fired.set(key, text.length);
        send(c);
    }, WAIT_MS) };
}


function pttDown() {
    if (!st.cfg.on || st.cfg.mode !== 'ptt') return;
    if (st.span && !st.span.up) return;
    if (st.span) { clearTimeout(st.span.timer); st.span = null; }
    const cur = st.lastKey && st.texts.get(st.lastKey);
    st.span = { keys: new Set(), base: cur && !cur.fin ? { key: st.lastKey, text: cur.text } : null, up: 0, timer: 0, at: performance.now() };
    if (!st.running) start();
    paintIdle();
}
function pttUp() {
    const sp = st.span;
    if (!sp || sp.up) return;
    sp.up = performance.now();
    use('vc.talkSec', Math.max(1, Math.round((sp.up - sp.at) / 1000)));
    sp.timer = setTimeout(() => pttCheck(true), RELEASE_MS);
    pttCheck(false);
    paintIdle();
}
/*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-d708552e */ function spanText(sp) {
    const parts = [];
    for (const k of sp.keys) {
        const t = (st.texts.get(k) || {}).text || '';
        parts.push(sp.base && sp.base.key === k && t.startsWith(sp.base.text) ? t.slice(sp.base.text.length) : t);
    }
    return parts.join(' ').trim();
}
function pttCheck(last) {
    const sp = st.span;
    if (!sp || !sp.up) return;
    const text = spanText(sp);
    const c = vcParse(text, { wake: false });
    const fin = [...sp.keys].every((k) => (st.texts.get(k) || {}).fin);
    if (c && (!c.grows || fin || last)) return pttEnd(c);
    if (!last && (c || vcPending(text, { wake: false }) || !text)) return;
    pttEnd(null, text);
}
function pttEnd(c, text) {
    const sp = st.span;
    if (sp) clearTimeout(sp.timer);
    st.span = null;
    paintIdle(); /*! Copyright (c) 2026 Astral. Better Vest 9.2.5 is licensed to its users only to run it, never to copy it. bv-2fb83016 */
    if (c) send(c);
    else { use('vc.miss'); did(text ? 'Didn’t catch that' : 'Heard nothing', 'warn'); }
}


async function send(c) {
    const seq = ++st.seq;
    use('vc.heard');
    did(LABEL[c.id] + '…', '');
    let r = null;
    try { r = await chrome.runtime.sendMessage({ type: 'vc-cmd', id: c.id, said: c.said, seq }); } catch (e) {}
    if (seq !== st.seq) return;
    if (!r || !r.sent) did(r && r.why ? r.why : 'No Vest tab answered.', 'bad');
}
function onDone(m) {
    if (m.seq != null && m.seq !== st.seq) return;
    if (m.ok) did(LABEL[m.id] ? LABEL[m.id] + (m.text ? ': ' + m.text : '') : 'Done', 'ok');
    else did(m.why || 'Not sent.', m.level === 'warn' ? 'warn' : 'bad');
}


async function boot() {
    chrome.runtime.onMessage.addListener((m, sender) => {
        if (!m || sender.id !== chrome.runtime.id || sender.tab) return;
        if (m.type === 'vc-ptt') { if (m.down) pttDown(); else pttUp(); }
        else if (m.type === 'vc-done') onDone(m);
    });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'session' && ch.vcCfg) setCfg(ch.vcCfg.newValue); });
    const talk = $('talk');
    talk.addEventListener('pointerdown', (e) => { if (e.button === 0) { talk.setPointerCapture(e.pointerId); pttDown(); } });
    const up = () => pttUp();
    talk.addEventListener('pointerup', up);
    talk.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); pttDown(); } });
    addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') pttUp(); });
    addEventListener('pagehide', () => { try { chrome.storage.local.set({ vcWin: { left: screenX, top: screenY } }); } catch (e) {} useFlush(); });
    use('vc.window');
    let s = {};
    try { s = await chrome.storage.session.get('vcCfg'); } catch (e) {}
    st.cfg = { on: false, mode: 'ptt', open: true };
    if (!REC) { show('off', 'This Chrome has no speech engine.', 'vc.noEngine'); return; }
    if (typeof REC.available === 'function' && !globalThis.__bvVcRec) {
        let a = 'unavailable';
        try { a = await REC.available({ langs: ['en-US'], processLocally: true }); } catch (e) {}
        if (a === 'unavailable') { show('off', 'Chrome cannot recognize speech on this computer.', 'vc.noEngine'); return; }
        if (a !== 'available') {
            show('load', 'Getting Chrome’s speech model ready…');
            let ok = false;
            try { ok = await REC.install({ langs: ['en-US'], processLocally: true }); } catch (e) {}
            try { a = await REC.available({ langs: ['en-US'], processLocally: true }); } catch (e) {}
            if (!ok && a !== 'available') { show('off', 'Chrome could not get its speech model. Open this window again later.', 'vc.noEngine'); return; }
        }
    /* Property of Astral (@ax4p). Better Vest 9.2.5. No copying without written permission. bv-d032b714 */ } else if (!globalThis.__bvVcRec) {
        show('off', 'This Chrome is too old for voice commands on this computer.', 'vc.noEngine');
        return;
    }
    st.ready = true;
    setCfg(s && s.vcCfg);
    if (st.cfg.on) { st.want = true; start(); }
}
boot();
