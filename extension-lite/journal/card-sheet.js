/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { monthCard, dayCard, CARD_SIZES, CARD_FORMATS, FORMAT_LABEL, CARD_SECONDS, cardFileBase, cleanHandle } from './card-model.js';
import { drawCard, cardPalette, CARD_FONT, ANIM_END } from './card-draw.js';
import { THEMES } from './theme-tokens.js';

const LS_KEY = 'bv-journal-share';
const PREFS_KEY = 'bvSharePrefs';
const GIF_FPS = 20;

const KIT = () => Promise.all([import('../cert/share-video.js'), import('../cert/share-gif-make.js'), import('../cert/share-prefs.js')]);
let kitP = null;
function loadKit() {
    if (!kitP) {
        kitP = KIT().then((m) => {
            if (!m) return null;
            const [v, gm, pr] = m;
            return { recordCanvas: v && v.recordCanvas, videoMime: v && v.videoMime, videoExt: v && v.videoExt, makeGif: gm && gm.makeGif,
                loadPrefs: pr && pr.loadPrefs, savePrefs: pr && pr.savePrefs };
        }).catch(() => null);
    }
    return kitP;
}

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {  } };
function handleGet(kit) {
    try {
        if (kit && kit.loadPrefs) return kit.loadPrefs(localStorage).handle || '';
        const v = JSON.parse(lsGet(PREFS_KEY) || 'null');
        return v && typeof v.handle === 'string' ? v.handle.slice(0, 32) : '';
    } catch (e) { return ''; } /*! All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-250c90ef */
}
function handleSet(kit, s) {
    const v = String(s || '').slice(0, 32);
    try {
        if (kit && kit.loadPrefs && kit.savePrefs) { const P = kit.loadPrefs(localStorage); P.handle = v; kit.savePrefs(localStorage, P); return; }
        const o = JSON.parse(lsGet(PREFS_KEY) || 'null');
        lsSet(PREFS_KEY, JSON.stringify(Object.assign(o && typeof o === 'object' && !Array.isArray(o) ? o : {}, { handle: v })));
    } catch (e) {  }
}

function pageFont() {
    let f = '';
    try { f = getComputedStyle(document.documentElement).getPropertyValue('--font').trim(); } catch (e) {  }
    const g = document.createElement('canvas').getContext('2d');
    for (const c of [f, CARD_FONT]) {
        if (!c) continue;
        g.font = '600 17px sans-serif';
        g.font = '600 18px ' + c;
        if (/18px/.test(g.font)) return c;
    }
    return 'sans-serif';
}

let open = null;
export const isOpen = () => !!open;

function stage(card, pal, format, font, scale) {
    const [W, H] = CARD_SIZES[format];
    const c = document.createElement('canvas');
    c.width = Math.round(W * scale); /* This file is part of Better Vest by Astral and is protected by copyright. ref bv-1f41f3bf */
    c.height = Math.round(H * scale);
    const g = c.getContext('2d');
    return { canvas: c, draw: (t) => { g.setTransform(scale, 0, 0, scale, 0, 0); drawCard(g, card, pal, { format, t, font }); g.setTransform(1, 0, 0, 1, 0, 0); } };
}
const pngOf = (st) => new Promise((resolve, reject) => st.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the image could not be made'))), 'image/png'));

export function openShare(ctx, spec, opener) {
    if (open) open.close();
    const { h, ui } = ctx;
    const { icon } = ui;
    const phone = document.documentElement.classList.contains('jm');
    const st = ctx.state;
    let saved = {};
    try { saved = JSON.parse(lsGet(LS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    const S = { format: CARD_FORMATS.includes(saved.format) ? saved.format : phone ? 'story' : 'wide', theme: 'cal', hide: !!st.hide, handle: '' };
    let kit = null, card = null, pal = null, busy = '', gone = false, gifStop = false;
    const font = pageFont();
    const D = ctx.derived();
    const today = ctx.todayKey();

    const th = ctx.theme && ctx.theme.def ? ctx.theme : { name: 'astral', def: THEMES.astral, stars: false };
    const plain = th.name === 'dark' || th.name === 'light';
    S.theme = plain ? th.name : 'cal';
    const make = () => {
        const src = { state: st, D, today, accounts: ctx.data.accounts, hide: S.hide, handle: S.handle };
        card = spec.kind === 'day' ? dayCard(Object.assign(src, { key: spec.key })) : monthCard(Object.assign(src, { month: spec.month }));
        const own = S.theme === 'cal' || S.theme === th.name;
        pal = cardPalette(own ? th.def : THEMES[S.theme], { name: own ? th.name : S.theme, stars: own && !!th.stars });
    };
    make();

    const title = spec.kind === 'day' ? 'Share this day' : 'Share this month';
    const cv = h('canvas', { class: 'csh-cv', role: 'img', 'aria-label': '' });
    const frame = h('div', { class: 'csh-frame' }, cv);
    const playBtn = h('button', { class: 'btn ghost csh-play', type: 'button', title: 'Play the card as the video shows it' }, icon('play', 13), h('span', null, 'Play'));
    const note = h('span', { class: 'csh-note', role: 'status', 'aria-live': 'polite' });
    const stageEl = h('div', { class: 'csh-stage' }, frame, h('div', { class: 'csh-under' }, playBtn, note));
    const fmtSeg = ui.seg({ options: CARD_FORMATS.map((k) => ({ k, label: FORMAT_LABEL[k], title: { wide: 'Wide, for X and a screen', story: 'Tall, for a story', square: 'Square' }[k] })), value: S.format, label: 'Shape',
        onChange: (k) => { S.format = k; lsSet(LS_KEY, JSON.stringify({ format: k })); redraw(true); } });
    const themeSeg = ui.seg({ options: (plain ? [] : [{ k: 'cal', label: th.def.label || 'Calendar', title: 'The Calendar\'s theme' }]).concat([{ k: 'dark', label: 'Dark' }, { k: 'light', label: 'Light' }]),
        value: S.theme, label: 'Theme', onChange: (k) => { S.theme = k; redraw(false); } });
    const hideSw = ui.toggle(S.hide, (v) => { S.hide = v; redraw(false); }, 'Hide dollars');
    const nameIn = h('input', { class: 'field plain', type: 'text', maxlength: 32, placeholder: '@yourname', 'aria-label': 'Your name on the card', spellcheck: 'false', autocomplete: 'off' });
    const saveBtn = h('button', { class: 'btn primary', type: 'button' }, icon('download', 14), h('span', null, 'Save image'));
    const copyBtn = h('button', { class: 'btn', type: 'button' }, icon('copy', 14), h('span', null, 'Copy image'));
    const postBtn = h('button', { class: 'btn', type: 'button', title: 'Copies the image, then opens a new post on X to paste it into' }, h('span', null, 'Post on X'));
    const vidBtn = h('button', { class: 'btn', type: 'button', hidden: true, title: 'An MP4 of the card coming together, ' + CARD_SECONDS + ' seconds' }, icon('film', 14), h('span', null, 'Save video'));
    const gifBtn = h('button', { class: 'btn', type: 'button', hidden: true, title: 'The same as an animated GIF, half size' }, h('span', null, 'GIF'));
    const motionRow = h('div', { class: 'csh-two', hidden: true }, vidBtn, gifBtn);
    const canClip = typeof ClipboardItem === 'function' && !!(navigator.clipboard && navigator.clipboard.write);
    if (!canClip) { copyBtn.hidden = true; postBtn.hidden = true; }
    /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-40df0cae */ const side = h('div', { class: 'csh-side' },
        h('div', { class: 'csh-grp' }, h('span', { class: 'lab' }, 'Shape'), fmtSeg),
        h('div', { class: 'csh-grp' }, h('span', { class: 'lab' }, 'Theme'), themeSeg),
        h('div', { class: 'csh-grp' }, h('div', { class: 'set-row csh-hide' }, h('span', null, 'Hide dollars'), hideSw),
            h('div', { class: 'csh-fine' }, '%, R and points only: no dollar amount, no account size.')),
        h('div', { class: 'csh-grp' }, h('span', { class: 'lab' }, 'Your name'), nameIn),
        h('div', { class: 'csh-acts' }, saveBtn, h('div', { class: 'csh-two' }, copyBtn, postBtn), motionRow));

    let box = null;
    const sheet = ui.sheet((body, api) => {
        box = body.parentElement;
        box.classList.add('csh');
        box.setAttribute('aria-label', title);
        const head = box.querySelector('.sheet-head');
        if (head) head.insertBefore(h('span', { class: 'csh-sub' }, card.title + ' · ' + card.account), head.lastChild);
        body.classList.add('csh-body');
        body.append(stageEl, side);
        open = { close: api.close };
    }, { title, width: 1180, onClose });

    let raf = 0, t0 = 0, playing = false;
    function size() {
        const [W, H] = CARD_SIZES[S.format];
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        const sw = phone ? vw : Math.min(Math.max(640, Math.round(vw * 0.86)), 1320, vw - 32);
        if (box && !phone) box.style.width = sw + 'px';
        /*! Copyright (c) 2026 Astral. Better Vest 9.6.2 is licensed to its users only to run it, never to copy it. bv-5eade95b */ const narrow = phone || sw < 860;
        const availW = sw - 40 - (narrow ? 0 : 248 + 20) - 30;
        const availH = phone ? vh * 0.58 : narrow ? Math.min(vh * 0.5, 560) : vh * 0.86 - 52 - 28 - 40 - 30;
        const k = Math.max(0.1, Math.min(availW / W, availH / H));
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        cv.style.width = Math.round(W * k) + 'px';
        cv.style.height = Math.round(H * k) + 'px';
        const pw = Math.round(W * k * dpr), ph = Math.round(H * k * dpr);
        if (cv.width !== pw) cv.width = pw;
        if (cv.height !== ph) cv.height = ph;
        return pw / W;
    }
    let scale = 1;
    function paint(t) {
        const g = cv.getContext('2d');
        g.setTransform(scale, 0, 0, scale, 0, 0);
        drawCard(g, card, pal, { format: S.format, t, font });
        g.setTransform(1, 0, 0, 1, 0, 0);
    }
    const tick = () => {
        raf = 0;
        const t = (performance.now() - t0) / 1000;
        if (t >= ANIM_END + 0.4) { playing = false; paint(Infinity); playBtn.lastChild.textContent = 'Play again'; return; }
        paint(t);
        raf = requestAnimationFrame(tick);
    };
    function play() {
        if (raf) cancelAnimationFrame(raf);
        if (ui.reducedMotion()) { playing = false; paint(Infinity); return; }
        playing = true; t0 = performance.now(); playBtn.lastChild.textContent = 'Play';
        raf = requestAnimationFrame(tick);
    }
    function describe() {
        const [W, H] = CARD_SIZES[S.format];
        cv.setAttribute('aria-label', `${title}: ${card.title}, ${card.hero.parts ? card.hero.parts.sign + card.hero.parts.cur + card.hero.parts.int + card.hero.parts.cents : card.hero.text}, ${W * 2} by ${H * 2}`);
    }
    function redraw(restart) {
        make();
        scale = size();
        describe();
        if (restart) play();
        else if (!playing) paint(Infinity);
    }
    scale = size();
    describe();
    play(); /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-405baeb6 */
    const onResize = () => { scale = size(); if (!playing) paint(Infinity); };
    window.addEventListener('resize', onResize);
    playBtn.addEventListener('click', play);

    loadKit().then((k) => {
        if (gone) return;
        kit = k;
        S.handle = handleGet(kit);
        nameIn.value = S.handle;
        redraw(false);
        const mime = kit && kit.videoMime && kit.recordCanvas ? kit.videoMime() : '';
        vidBtn.hidden = !mime || (phone && !/mp4/.test(mime));
        gifBtn.hidden = !kit || !kit.makeGif || phone;
        motionRow.hidden = vidBtn.hidden && gifBtn.hidden;
    });
    let nameT = 0;
    nameIn.addEventListener('input', () => {
        clearTimeout(nameT);
        nameT = setTimeout(() => { S.handle = cleanHandle(nameIn.value) ? nameIn.value.trim() : ''; handleSet(kit, S.handle); redraw(false); }, 160);
    });

    const say = (s, tone) => { note.textContent = s || ''; note.classList.toggle('warn', tone === 'warn'); };
    const base = () => cardFileBase(card, S.format);
    function setBusy(what) {
        busy = what;
        for (const b of [saveBtn, copyBtn, postBtn, vidBtn, gifBtn]) b.disabled = !!what;
        fmtSeg.classList.toggle('dis', !!what);
    }
    function saveBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    async function deliver(blob, name) {
        if (phone && typeof File === 'function' && navigator.canShare && navigator.share) {
            const file = new File([blob], name, { type: blob.type });
            let can = false;
            try { can = navigator.canShare({ files: [file] }); } catch (e) { can = false; }
            if (can) { try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e && e.name === 'AbortError') return true; } }
        }
        saveBlob(blob, name);
        return false;
    }
    const png = () => { const s2 = stage(card, pal, S.format, font, 2); s2.draw(Infinity); return pngOf(s2); };
    saveBtn.addEventListener('click', async () => {
        if (busy) return;
        setBusy('png');
        try {
            const name = base() + '.png';
            const shared = await deliver(await png(), name);
            say(shared ? '' : 'Saved ' + name);
        /*! Copyright (c) 2026 Astral. Better Vest 9.6.2 is licensed to its users only to run it, never to copy it. bv-bcfd5ef6 */ } catch (e) { say('Could not make the image: ' + ((e && e.message) || e), 'warn'); }
        setBusy('');
    });
    async function copy() {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
    }
    copyBtn.addEventListener('click', async () => {
        if (busy) return;
        setBusy('copy');
        try { await copy(); say('Copied. Paste it into your post.'); } catch (e) { say('Could not copy the image (' + ((e && e.message) || e) + '). Save it instead.', 'warn'); }
        setBusy('');
    });
    postBtn.addEventListener('click', async () => {
        if (busy) return;
        setBusy('post');
        try {
            await copy();
            say('Copied. Paste the image into your post on X.');
            window.open('https://x.com/intent/post', '_blank', 'noopener');
        } catch (e) { say('Could not copy the image (' + ((e && e.message) || e) + '). Save it, then add it to your post.', 'warn'); }
        setBusy('');
    });
    /* @license Better Vest 9.6.2. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-866ad0df */ vidBtn.addEventListener('click', async () => {
        if (busy || !kit) return;
        setBusy('video');
        const label = vidBtn.lastChild;
        try {
            const s2 = stage(card, pal, S.format, font, 2);
            s2.draw(0);
            const fps = 30;
            const res = await kit.recordCanvas(s2.canvas, { fps, frames: CARD_SECONDS * fps }, (f) => s2.draw(f / fps), {
                mime: kit.videoMime(), last: () => s2.draw(Infinity),
                onProgress: (f) => { label.textContent = 'Recording ' + Math.round(f * 100) + '%'; say('Keep this tab in front while it records (' + CARD_SECONDS + ' s).'); }
            });
            if (!gone) {
                const name = base() + '.' + kit.videoExt(res.mime);
                const shared = await deliver(res.blob, name);
                say(shared ? '' : 'Saved ' + name);
            }
            window.__calShareLastVideo = { size: res.blob.size, mime: res.mime, seconds: res.seconds };
        } catch (e) { say('Could not record the video: ' + ((e && e.message) || e), 'warn'); }
        label.textContent = 'Save video';
        setBusy('');
    });
    gifBtn.addEventListener('click', async () => {
        if (busy || !kit) return;
        setBusy('gif');
        gifStop = false;
        const label = gifBtn.lastChild;
        try {
            const [W, H] = CARD_SIZES[S.format];
            const s1 = stage(card, pal, S.format, font, 1);
            const n = Math.ceil((ANIM_END + 0.4) * GIF_FPS);
            const frames = Array.from({ length: n + 1 }, (_, k) => ({ delay: k === n ? 250 : 100 / GIF_FPS }));
            const res = await kit.makeGif({ stage: { canvas: s1.canvas, draw: (k) => s1.draw(k === n ? Infinity : k / GIF_FPS), frames }, width: W, height: H, size: 'half',
                onProgress: (f) => { label.textContent = 'GIF ' + Math.round(f * 100) + '%'; }, cancelled: () => gifStop || gone });
            if (!gone) {
                const name = base() + '.gif';
                saveBlob(res.blob, name);
                say('Saved ' + name);
            }
        } catch (e) { if (!(e && e.cancelled)) say('Could not make the GIF: ' + ((e && e.message) || e), 'warn'); }
        label.textContent = 'GIF';
        setBusy('');
    });

    function onClose() {
        gone = true;
        gifStop = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        clearTimeout(nameT);
        window.removeEventListener('resize', onResize);
        open = null;
        const back = () => { if (opener && opener.isConnected && !open) { try { opener.focus({ preventScroll: true }); } catch (e) {  } } };
        back();
        setTimeout(back, 0);
    /*! Copyright (c) 2026 Astral. Better Vest 9.6.2 is licensed to its users only to run it, never to copy it. bv-8dc8c974 */ }
    setTimeout(() => { try { (fmtSeg.querySelector('.seg-b.on') || saveBtn).focus({ preventScroll: true }); } catch (e) {  } }, 30);
    window.__calShareEnd = () => { if (raf) cancelAnimationFrame(raf); raf = 0; playing = false; paint(Infinity); playBtn.lastChild.textContent = 'Play again'; };
    window.__calShare = () => ({ open: !!open, format: S.format, theme: S.theme, hide: S.hide, handle: S.handle, kit: !!kit, video: !vidBtn.hidden, gif: !gifBtn.hidden, card, busy });
    return sheet;
}
