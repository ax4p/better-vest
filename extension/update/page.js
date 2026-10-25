/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
import { compareVersions, fetchRelease, findFolder, planRemove, applyUpdate, parseList, notesHtml, PUBLIC_EDITIONS } from './core.js';
import { RELEASE_PUBLIC_KEY } from './key.js';

const IN_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const $ = (s) => document.querySelector(s);
const manifest = IN_EXT ? chrome.runtime.getManifest() : { name: 'Better Vest by Astral', version: '0.0.0' };
let release = null;
let current = null;
let target = 'standard';
let runningCopy = null;
let folder = null;
let busy = false;


export function notesView(md) {
    const html = notesHtml(md)
        .replace(/<p><b>(?:Install|Updating)(?::<\/b>|<\/b>:)[^]*?<\/p>/g, '')
        .replace(/<p><b>([^<]+)<\/b><\/p>/g, (m, t) => '<h4>' + t.replace(/:\s*$/, '') + '</h4>');
    return { html, items: (html.match(/<li>/g) || []).length };
}

export function progress(phase, i, n) {
    const f = n > 0 ? Math.min(1, Math.max(0, i / n)) : 0;
    const count = n > 0 ? i + ' / ' + n + ' files' : '';
    if (phase === 'folder') return { pct: 4, what: 'Finding your Better Vest folder', count: '' };
    if (phase === 'download') return { pct: 8 + 50 * f, what: 'Downloading and checking the files', count };
    if (phase === 'write') return { pct: 58 + 40 * f, what: 'Writing the new files', count };
    if (phase === 'restart') return { pct: 100, what: 'Restarting Better Vest', count: '' };
    return { pct: 0, what: '', count: '' };
}

/* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.1. bv-2e2b4cbc */ export function whenText(ts, now = Date.now()) {
    if (!ts) return null;
    const d = new Date(ts);
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((start(new Date(now)) - start(d)) / 86400000);
    return {
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        day: days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    };
}

export function tilesFor(kind, d) {
    if (kind === 'available') {
        const t = [{ lab: 'You have', v: 'v' + d.have }, { arrow: true }, { lab: 'New version', v: 'v' + d.next, cls: 'new' }];
        if (d.items > 0) t.push({ lab: 'Changes', v: String(d.items), s: 'In the notes' });
        return t;
    }
    if (kind === 'latest') {
        const w = whenText(d.checkedAt, d.now);
        return [
            { lab: 'You have', v: 'v' + d.have, s: 'The latest version', cls: 'ok' },
            { lab: 'Last checked', v: w ? w.time : 'Not yet', s: w ? w.day : '' },
            { lab: 'Auto checks', v: d.on ? 'On' : 'Off', s: d.on ? 'Every 30 minutes' : 'Check now looks once' }
        ];
    }
    return [];
}

export const EDITION_INFO = Object.freeze({
    standard: { name: 'Standard', d: 'Everything, voice included. Sends anonymous usage stats.' },
    lite: { name: 'Lite', d: 'Everything but the voice, a smaller download. Sends anonymous usage stats.' },
    nostats: { name: 'No stats', d: 'Everything, voice included. Sends no stats at all.' }
});

export function defaultEdition(have) { /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-1888c597 */
    return PUBLIC_EDITIONS.includes(have) ? have : 'standard';
}

export function goPlan(have, haveEd, rel, edition) {
    const none = { kind: 'none', label: '' };
    if (!rel || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(String(rel.version)) || !PUBLIC_EDITIONS.includes(edition) || !PUBLIC_EDITIONS.includes(haveEd)) return none;
    const c = compareVersions(rel.version, have);
    const other = edition !== haveEd;
    if (c < 0 || (c === 0 && !other)) return none;
    const name = EDITION_INFO[edition].name;
    if (c === 0) return { kind: 'switch', label: 'Switch to ' + name + ' (v' + rel.version + ')' };
    return { kind: 'update', label: 'Update to v' + rel.version + (other ? ' (' + name + ')' : '') };
}

export function pickTheme(themes, override, settingsTheme) {
    const known = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(themes, k);
    return known(override) ? override : known(settingsTheme) ? settingsTheme : '';
}

function idb() {
    return new Promise((resolve, reject) => {
        const r = indexedDB.open('bv-update', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
async function kvGet(k) {
    const db = await idb();
    return new Promise((resolve) => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => resolve(null);
    });
}
async function kvSet(k, v) {
    const db = await idb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        if (v == null) tx.objectStore('kv').delete(k);
        else tx.objectStore('kv').put(v, k);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function running() {
    let list = null;
    let edition = null;
    try {
        const r = await fetch(chrome.runtime.getURL('files.json'));
        if (r.ok) list = await r.text(); /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-2a7c55d5 */
        edition = parseList(list).edition;
    } catch (e) {}
    return { name: manifest.name, version: manifest.version, list, edition };
}

async function applyTheme() {
    try {
        const { THEMES, themeVarsCss, customTheme } = await import('../journal/theme-tokens.js');
        const { settings } = await chrome.storage.local.get('settings');
        let override = '';
        try { override = localStorage.getItem('bv-journal-theme-override') || ''; } catch (e) {}
        const custom = !pickTheme(THEMES, override, '') && settings && settings.theme === 'custom' && typeof customTheme === 'function';
        const name = custom ? 'custom' : pickTheme(THEMES, override, settings && settings.theme);
        if (!name) return;
        let s = document.getElementById('theme-vars');
        if (!s) { s = document.createElement('style'); s.id = 'theme-vars'; document.head.appendChild(s); }
        s.textContent = themeVarsCss(custom ? customTheme(settings.custom) : THEMES[name]);
        document.documentElement.setAttribute('data-theme', name);
    } catch (e) {  }
}

const EYEBROW = {
    checking: 'Checking', latest: 'Up to date', available: 'New version', updating: 'Updating', restarting: 'Updated',
    done: 'Updated', elsewhere: 'Not updated yet', unsupported: 'Updates', noanswer: 'No answer'
};
export function setState(name) {
    document.body.dataset.state = name; /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-3cf40c9d */
    $('#eyebrow').textContent = EYEBROW[name] || '';
}
export function lead(html) { $('#lead').innerHTML = html; }
export function say(text, kind) {
    const m = $('#msg');
    m.hidden = !text;
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text || '';
}
export function step(name, state, n) {
    const li = document.querySelector(`#steps li[data-step="${name}"]`);
    if (!li) return;
    li.classList.remove('on', 'done', 'bad');
    if (state) li.classList.add(state);
    const count = li.querySelector('.n');
    if (count && n != null) count.textContent = n;
}
export function bar(p, tone) {
    if (p) {
        $('#bar-fill').style.width = p.pct.toFixed(1) + '%';
        $('#bar-what').textContent = p.what;
        $('#bar-n').textContent = p.count;
    }
    if (tone === 'bad') $('#bar-what').textContent = 'Stopped';
    $('#bar').className = 'bar' + (tone ? ' ' + tone : '');
}
export function ribbon(tiles) {
    const r = $('#ribbon');
    r.replaceChildren(...tiles.map((t) => {
        const el = document.createElement('div');
        if (t.arrow) { el.className = 'arrow'; el.setAttribute('aria-hidden', 'true'); return el; }
        el.className = 'tile' + (t.cls ? ' ' + t.cls : '');
        for (const [cls, text] of [['lab', t.lab], ['v', t.v], ['s', t.s]]) {
            if (!text) continue;
            const x = document.createElement('span');
            x.className = cls;
            x.textContent = text;
            /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-5567f37d */ el.appendChild(x);
        }
        return el;
    }));
    r.hidden = !tiles.length;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const leadAvailable = () => lead('<b>v' + esc(release.version) + '</b> is out. You have v' + esc(manifest.version) + '.');
const leadLatest = () => lead('You have the latest version, <b>v' + esc(manifest.version) + '</b>.');
const editionName = (ed) => (Object.prototype.hasOwnProperty.call(EDITION_INFO, ed) ? EDITION_INFO[ed].name : '');

function paintEditions() {
    const box = $('#eds');
    const have = runningCopy && runningCopy.edition;
    box.hidden = !current || !PUBLIC_EDITIONS.includes(have);
    if (box.hidden) return;
    $('#eds-list').replaceChildren(...PUBLIC_EDITIONS.map((ed) => {
        const row = document.createElement('label');
        row.className = 'ed';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'ed';
        input.value = ed;
        input.checked = ed === target;
        input.onchange = () => { if (input.checked) { target = ed; paintGo(); } };
        const t = document.createElement('span');
        t.className = 'ed-t';
        const b = document.createElement('b');
        b.textContent = EDITION_INFO[ed].name;
        const small = document.createElement('small');
        small.textContent = EDITION_INFO[ed].d;
        t.append(b, small);
        row.append(input, t);
        if (ed === have) {
            const you = document.createElement('span');
            you.className = 'ed-you';
            you.textContent = 'Yours';
            row.appendChild(you);
        }
        return row;
    }));
}
function paintGo() {
    const plan = goPlan(manifest.version, runningCopy && runningCopy.edition, current, target);
    $('#go').textContent = plan.label; /*! Copyright Astral 2026. From Better Vest 9.3.1 (standard), ref bv-db9bcfed. Not licensed for reuse. */
    $('#go').hidden = plan.kind === 'none';
    $('#go').disabled = false;
    $('#how').hidden = plan.kind === 'none' || !!folder;
    return plan;
}

export function paint(state) {
    $('#auto').checked = !!(state && state.on);
    $('#go').hidden = true;
    $('#how').hidden = true;
    $('#news').hidden = true;
    $('#eds').hidden = true;
    $('#run').hidden = true;
    ribbon([]);
    if (!state) {
        setState('noanswer');
        lead('Better Vest did not answer. Close this tab and open it again.');
        say('');
        return;
    }
    if (!state.supported) {
        setState('unsupported');
        lead('This copy updates another way.');
        say(/WICKED/.test(manifest.name)
            ? 'This is the WICKED build: it is rebuilt from its own source folder, never from GitHub.'
            : 'Copies from the Chrome Web Store update by themselves. One-click updates are for the copy loaded from the GitHub zip.');
        $('#auto').disabled = true;
        $('#check').disabled = true;
        return;
    }
    release = state.available;
    current = release || (state.latest && compareVersions(state.latest.version, manifest.version) === 0 ? state.latest : null);
    if (!release) {
        setState('latest');
        leadLatest();
        ribbon(tilesFor('latest', { have: manifest.version, checkedAt: state.checkedAt, on: state.on, now: Date.now() }));
        say('');
        paintEditions();
        paintGo();
        return;
    }
    setState('available');
    leadAvailable();
    const notes = notesView(release.notes);
    if (release.notes) {
        $('#notes').innerHTML = notes.html;
        $('#news-v').textContent = 'in v' + release.version;
        $('#news').hidden = false;
    }
    ribbon(tilesFor('available', { have: manifest.version, next: release.version, items: notes.items }));
    if (/^https:\/\/github\.com\/ax4p\/better-vest\//.test(release.url || '')) $('#rel').href = $('#news-gh').href = release.url;
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.1. bv-d4d0e4ae */ paintEditions();
    paintGo();
    say('');
}

export function reason(hit, name) {
    const q = '"' + name + '"';
    switch (hit.why) {
        case 'none': return 'There is no Better Vest folder in ' + q + (hit.partial ? ' (it is too big to look through completely).' : ' (looked four folders deep).');
        case 'several': return 'There is more than one copy of Better Vest in ' + q + ': ' + hit.paths.join(', ') + '. Pick the one Chrome runs.';
        case 'bad-manifest': return 'The manifest.json in ' + q + ' could not be read.';
        case 'other-extension': return q + ' holds a different extension.';
        case 'other-version': return q + ' holds Better Vest, but not v' + manifest.version + ', the one Chrome runs. If it is a new download, pick the folder Chrome runs instead.';
        default: return q + ' holds another copy of Better Vest, not the one Chrome runs.';
    }
}
const WHERE = ' To see which folder Chrome runs: on chrome://extensions, click Details on Better Vest; "Source" shows it.';

export function explain(e) {
    const code = String((e && e.message) || e);
    const cause = String((e && e.cause && e.cause.message) || '');
    if (e && e.name === 'AbortError') return ['No folder picked. Nothing changed.', 'warn'];
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) return ['Chrome did not allow editing that folder. Click Update again and allow it to edit files. Nothing changed.', 'warn'];
    if (code === 'no-list') return ['This copy has no file list, so it cannot check an update. Download the latest zip from GitHub once; after that, updates are one click.', 'warn'];
    if (code === 'signature' || /^(hash|list|manifest)/.test(code)) return ['The download did not pass the safety check, so nothing was changed. Try again later, or update from the GitHub zip by hand.', 'bad'];
    if (/^download:files\.json(\.sig)?:404$/.test(code)) return ['GitHub has no files of that edition in this release. Nothing was changed. Pick another edition, or try again later.', 'warn'];
    if (/^download/.test(code) || e instanceof TypeError) return ['GitHub did not answer. Nothing was changed. Try again in a minute.', 'bad'];
    if (code === 'not-newer') return ['That release is not newer than this copy. Nothing was changed.', 'warn'];
    if (code === 'rolled-back') return ['Writing the new files failed, so the old ones were put back. Nothing changed. (' + (cause || 'write error') + ')', 'bad'];
    if (code === 'rollback-failed') return ['Writing failed and these files could not be put back: ' + (e.failed || []).join(', ') + '. Download the latest zip from GitHub and unzip it over the folder.', 'bad'];
    return ['Something went wrong: ' + code + '. Nothing was changed. Try again, or update from the GitHub zip by hand.', 'bad'];
}

export function stopped() {
    /* Owned by Astral (@ax4p): Better Vest standard 9.3.1. Licence: LICENSE, not open source. bv-2df98aec */ setState(release ? 'available' : 'latest');
    if (release) leadAvailable();
    else leadLatest();
    const how = $('#how').hidden;
    paintGo();
    $('#how').hidden = how;
}

async function update() {
    const rel = current;
    const plan = goPlan(manifest.version, runningCopy && runningCopy.edition, rel, target);
    if (busy || plan.kind === 'none') return;
    const edition = target;
    busy = true;
    $('#go').disabled = true;
    $('#go').hidden = true;
    document.querySelectorAll('#steps li').forEach((li) => step(li.dataset.step, '', ''));
    $('#run').hidden = false;
    setState('updating');
    lead(plan.kind === 'switch' ? 'Switching to <b>' + esc(editionName(edition)) + '</b>…'
        : 'Updating to <b>v' + esc(rel.version) + '</b>' + (edition !== runningCopy.edition ? ' ' + esc(editionName(edition)) : '') + '…');
    say('');
    try {
        if (!runningCopy.edition) throw new Error('no-list');
        step('folder', 'on');
        bar(progress('folder'));
        let dir = folder;
        if (dir) {
            let p = await dir.queryPermission({ mode: 'readwrite' });
            if (p !== 'granted') p = await dir.requestPermission({ mode: 'readwrite' });
            if (p !== 'granted') dir = null;
        }
        if (!dir) dir = await window.showDirectoryPicker({ id: 'better-vest', mode: 'readwrite', startIn: 'documents' });
        step('folder', 'on', '· looking in ' + dir.name + '…');
        const hit = await findFolder(dir, runningCopy);
        if (!hit.dir) {
            folder = null;
            await kvSet('dir', null);
            step('folder', 'bad', '');
            bar(null, 'bad');
            say('Nothing changed. ' + reason(hit, dir.name) + WHERE, 'warn');
            stopped();
            $('#how').hidden = false;
            return;
        }
        step('folder', 'done', '· ' + (hit.path ? dir.name + '/' + hit.path : hit.dir.name));
        $('#how').hidden = true;
        dir = hit.dir;
        folder = hit.dir;
        await kvSet('dir', hit.dir); /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.1. bv-13808328 */

        step('download', 'on');
        bar(progress('download', 0, 0));
        const { list, files } = await fetchRelease({
            fetchFn: (u) => fetch(u, { cache: 'no-cache' }),
            subtle: crypto.subtle,
            publicKey: RELEASE_PUBLIC_KEY,
            tag: rel.tag,
            expect: { edition, version: rel.version },
            onProgress: (i, n) => { step('download', 'on', i + ' / ' + n); bar(progress('download', i, n)); }
        });
        const cmp = compareVersions(list.version, runningCopy.version);
        if (cmp < 0 || (cmp === 0 && list.edition === runningCopy.edition)) throw new Error('not-newer');
        step('download', 'done');

        step('write', 'on');
        bar(progress('write', 0, 0));
        const remove = planRemove(runningCopy.list ? parseList(runningCopy.list) : null, list);
        await applyUpdate(dir, files, remove, (i, n) => { step('write', 'on', i + ' / ' + n); bar(progress('write', i, n)); });
        step('write', 'done');

        step('restart', 'on');
        bar(progress('restart'), 'ok');
        const at = Date.now();
        await chrome.storage.local.set({ bvUpdated: { from: runningCopy.version, to: list.version, fromName: runningCopy.name, toName: list.name, at, reloadAt: at + 700, reloadTabs: true } });
        setState('restarting');
        lead((plan.kind === 'switch' ? 'Switched to <b>' + esc(editionName(list.edition)) + '</b>' : 'Updated to <b>v' + esc(list.version) + '</b>') + '.');
        say('Restarting Better Vest and reloading your Vest tabs…', 'good');
        setTimeout(() => chrome.runtime.reload(), 700);
    } catch (e) {
        const [text, kind] = explain(e);
        document.querySelectorAll('#steps li.on').forEach((li) => { li.classList.remove('on'); li.classList.add('bad'); });
        bar(null, 'bad');
        /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-2cd925de */ say(text, kind);
        stopped();
    } finally {
        busy = false;
    }
}

async function load(fresh) {
    const done = location.hash === '#done';
    const elsewhere = location.hash === '#elsewhere';
    if (elsewhere) {
        folder = null;
        await kvSet('dir', null).catch(() => {});
        history.replaceState(null, '', location.pathname);
    }
    if (done) {
        setState('done');
        const ed = runningCopy && runningCopy.edition !== 'standard' ? editionName(runningCopy.edition) : '';
        lead('Better Vest is now <b>v' + esc(manifest.version) + (ed ? ' ' + esc(ed) : '') + '</b>.');
        say('Your Vest tabs were reloaded, so they run the new version. Settings and Calendar are as you left them.', 'good');
    }
    const state = await chrome.runtime.sendMessage({ type: fresh ? 'update-check' : 'update-state' }).catch(() => null);
    if (done) {
        $('#auto').checked = !!(state && state.on);
        return;
    }
    paint(state);
    if (elsewhere) {
        setState('elsewhere');
        if (!release) ribbon([]);
        lead('Chrome is still running v' + esc(manifest.version) + '.');
        say('The new files went into a folder Chrome doesn\'t run, or Chrome didn\'t restart Better Vest. First press the round arrow on Better Vest in chrome://extensions. If it still says ' +
            manifest.version + ', click Update here and pick the folder Chrome runs.' + WHERE, 'warn');
        $('#how').hidden = false;
    }
}

/* Better Vest (c) 2026 Astral. All rights reserved. bv-40fbbc65 */ function boot() {
    $('#cur').textContent = 'v' + manifest.version;
    applyTheme();
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.settings) applyTheme(); });
    $('#go').onclick = update;
    $('#check').onclick = async () => {
        if (busy) return;
        $('#check').disabled = true;
        setState('checking');
        lead('Checking GitHub…');
        if (location.hash) history.replaceState(null, '', location.pathname);
        await load(true);
        $('#check').disabled = false;
    };
    $('#auto').onchange = async (e) => {
        const s = await chrome.runtime.sendMessage({ type: 'update-auto', on: e.target.checked }).catch(() => null);
        if (s) $('#auto').checked = !!s.on;
        if (s && document.body.dataset.state === 'latest') ribbon(tilesFor('latest', { have: manifest.version, checkedAt: s.checkedAt, on: s.on, now: Date.now() }));
    };
    $('#forget').onclick = async () => {
        folder = null;
        await kvSet('dir', null).catch(() => {});
        say('Folder forgotten. The next update asks for it again.');
        $('#how').hidden = goPlan(manifest.version, runningCopy && runningCopy.edition, current, target).kind === 'none';
    };
    (async () => {
        runningCopy = await running();
        target = defaultEdition(runningCopy.edition);
        folder = await kvGet('dir').catch(() => null);
        await load(false);
    })();
}

if (IN_EXT) boot();
