// Better Vest by Astral - update page (update.html). Shows what's new on GitHub and updates the folder Chrome
// loaded this extension from, in one click. The checks and the writing live in core.js.
// 9.0.1: it also installs another public edition (Standard, Lite, No stats) when you pick one; by default a copy stays
// the edition it is (every copy before 9.0.1 is Standard).
import { compareVersions, fetchRelease, findFolder, planRemove, applyUpdate, parseList, notesHtml, PUBLIC_EDITIONS } from './core.js';
import { RELEASE_PUBLIC_KEY } from './key.js';

// false when the Node tests import the pure helpers below: nothing then touches the page or chrome.*
const IN_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const $ = (s) => document.querySelector(s);
const manifest = IN_EXT ? chrome.runtime.getManifest() : { name: 'Better Vest by Astral', version: '0.0.0' };
let release = null;   // { version, tag, notes, url } when newer than this copy
let current = null;   // the release the button is for: the newer one, else the latest when it is this version (an edition switch)
let target = 'standard'; // the edition to install (defaultEdition, or the one picked)
let runningCopy = null;
let folder = null;    // FileSystemDirectoryHandle, remembered in IndexedDB
let busy = false;

// ---- pure: the release notes, the progress bar, the ribbon, the theme pick (tests/update/page.test.mjs) ----

// The notes as text (core.js's notesHtml escapes everything). A line that is only bold ("**Fixed**") is a heading
// here, and the notes' "Install:" and "Updating:" paragraphs are left out: they are for the GitHub page, and this
// page does both. items: the number of bullet points.
export function notesView(md) {
    const html = notesHtml(md)
        .replace(/<p><b>(?:Install|Updating)(?::<\/b>|<\/b>:)[^]*?<\/p>/g, '')
        .replace(/<p><b>([^<]+)<\/b><\/p>/g, (m, t) => '<h4>' + t.replace(/:\s*$/, '') + '</h4>');
    return { html, items: (html.match(/<li>/g) || []).length };
}

// One bar over the whole update: finding the folder, then downloading and checking every file, then writing them.
export function progress(phase, i, n) {
    const f = n > 0 ? Math.min(1, Math.max(0, i / n)) : 0;
    const count = n > 0 ? i + ' / ' + n + ' files' : '';
    if (phase === 'folder') return { pct: 4, what: 'Finding your Better Vest folder', count: '' };
    if (phase === 'download') return { pct: 8 + 50 * f, what: 'Downloading and checking the files', count };
    if (phase === 'write') return { pct: 58 + 40 * f, what: 'Writing the new files', count };
    if (phase === 'restart') return { pct: 100, what: 'Restarting Better Vest', count: '' };
    return { pct: 0, what: '', count: '' };
}

// ts -> { time, day } for "Last checked", or null when there was no check yet.
export function whenText(ts, now = Date.now()) {
    if (!ts) return null;
    const d = new Date(ts);
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((start(new Date(now)) - start(d)) / 86400000);
    return {
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        day: days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    };
}

// The ribbon under the heading: { lab, v, s, cls } tiles, { arrow: true } between the two versions.
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

// 9.0.1: the public editions as the page offers them (the owner: "update to the normal standard but show option to install
// different variance"). Each comes from its own folder of the release (core.js EDITION_DIRS).
export const EDITION_INFO = Object.freeze({
    standard: { name: 'Standard', d: 'Everything, voice included. Counts installs and users.' },
    lite: { name: 'Lite', d: 'Everything but the voice, a smaller download. Counts installs and users.' },
    nostats: { name: 'No stats', d: 'Everything, voice included. Counts only the install.' }
});

// The edition picked for you: the one you have (an update never undoes your choice), Standard for anything else
export function defaultEdition(have) {
    return PUBLIC_EDITIONS.includes(have) ? have : 'standard';
}

// What the button does for a release and the edition picked: 'update' (a newer version), 'switch' (this version, another
// edition) or 'none' (the same version and edition, an older release, or no edition to install).
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

// The Calendar's theme: its own pick, else Better Vest's theme, else nothing (update.css is Astral).
export function pickTheme(themes, override, settingsTheme) {
    const known = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(themes, k);
    return known(override) ? override : known(settingsTheme) ? settingsTheme : '';
}

// ---- the folder handle survives restarts in IndexedDB (handles can't go in chrome.storage) ----
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
        if (r.ok) list = await r.text();
        edition = parseList(list).edition;
    } catch (e) {}
    return { name: manifest.name, version: manifest.version, list, edition };
}

// ---- theme: journal/theme-boot.js already replayed the Calendar's cached theme before the first paint; this also
// covers a theme changed since and people who never opened the Calendar. Loaded on demand, so a theme problem can
// never keep the updater from loading. ----
async function applyTheme() {
    try {
        const { THEMES, themeVarsCss } = await import('../journal/theme-tokens.js');
        const { settings } = await chrome.storage.local.get('settings');
        let override = '';
        try { override = localStorage.getItem('bv-journal-theme-override') || ''; } catch (e) {}
        const name = pickTheme(THEMES, override, settings && settings.theme);
        if (!name) return;
        let s = document.getElementById('theme-vars');
        if (!s) { s = document.createElement('style'); s.id = 'theme-vars'; document.head.appendChild(s); }
        s.textContent = themeVarsCss(THEMES[name]);
        document.documentElement.setAttribute('data-theme', name);
    } catch (e) { /* Astral, from update.css */ }
}

// ---- what the page shows ----
const EYEBROW = {
    checking: 'Checking', latest: 'Up to date', available: 'New version', updating: 'Updating', restarting: 'Updated',
    done: 'Updated', elsewhere: 'Not updated yet', unsupported: 'Updates', noanswer: 'No answer'
};
export function setState(name) {
    document.body.dataset.state = name;
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
// p: a progress() answer; tone: '', 'bad' (stopped where it was) or 'ok'
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
            el.appendChild(x);
        }
        return el;
    }));
    r.hidden = !tiles.length;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const leadAvailable = () => lead('<b>v' + esc(release.version) + '</b> is out. You have v' + esc(manifest.version) + '.');
const leadLatest = () => lead('You have the latest version, <b>v' + esc(manifest.version) + '</b>.');
const editionName = (ed) => (Object.prototype.hasOwnProperty.call(EDITION_INFO, ed) ? EDITION_INFO[ed].name : '');

// the edition list (9.0.1): only for a public copy and a release it can take; yours is marked, the picked one checked
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
// the one button: what goPlan says for the release and the edition picked
function paintGo() {
    const plan = goPlan(manifest.version, runningCopy && runningCopy.edition, current, target);
    $('#go').textContent = plan.label;
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
    $('#run').hidden = true; // a stopped attempt's bar; paint never runs during an update
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
    paintEditions();
    paintGo();
    say('');
}

// why the picked folder can't be updated; name = the folder picked
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

// back to the release waiting, after a refusal or an error
export function stopped() {
    setState(release ? 'available' : 'latest');
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
        // 1. the folder: asked first, while the click still counts as a user gesture
        step('folder', 'on');
        bar(progress('folder'));
        let dir = folder;
        if (dir) {
            let p = await dir.queryPermission({ mode: 'readwrite' });
            if (p !== 'granted') p = await dir.requestPermission({ mode: 'readwrite' });
            if (p !== 'granted') dir = null;
        }
        if (!dir) dir = await window.showDirectoryPicker({ id: 'better-vest', mode: 'readwrite', startIn: 'documents' });
        // the folder itself, or the one copy Chrome runs somewhere inside it
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
        dir = hit.dir; // the copy itself, when the folder picked was one above it
        folder = hit.dir;
        await kvSet('dir', hit.dir);

        // 2. everything downloaded and checked before anything is written
        step('download', 'on');
        bar(progress('download', 0, 0));
        // the edition picked (your own unless you picked another), from that edition's own folder of the release
        const { list, files } = await fetchRelease({
            fetchFn: (u) => fetch(u, { cache: 'no-cache' }),
            subtle: crypto.subtle,
            publicKey: RELEASE_PUBLIC_KEY,
            tag: rel.tag,
            expect: { edition, version: rel.version },
            onProgress: (i, n) => { step('download', 'on', i + ' / ' + n); bar(progress('download', i, n)); }
        });
        // a newer version, or this version as another edition; never older, never the same files again
        const cmp = compareVersions(list.version, runningCopy.version);
        if (cmp < 0 || (cmp === 0 && list.edition === runningCopy.edition)) throw new Error('not-newer');
        step('download', 'done');

        // 3. write (the old bytes go back on any error); the files the new edition does not list go (Lite has no voice clips)
        step('write', 'on');
        bar(progress('write', 0, 0));
        const remove = planRemove(runningCopy.list ? parseList(runningCopy.list) : null, list);
        await applyUpdate(dir, files, remove, (i, n) => { step('write', 'on', i + ' / ' + n); bar(progress('write', i, n)); });
        step('write', 'done');

        // 4. Chrome reads the folder again; the new service worker reloads the Vest tabs and opens the done page
        step('restart', 'on');
        bar(progress('restart'), 'ok');
        // reloadAt: until then the service worker knows the restart hasn't happened yet
        const at = Date.now();
        // fromName / toName: an edition switch keeps the version, so the worker also checks the name it runs under
        await chrome.storage.local.set({ bvUpdated: { from: runningCopy.version, to: list.version, fromName: runningCopy.name, toName: list.name, at, reloadAt: at + 700, reloadTabs: true } });
        setState('restarting');
        lead((plan.kind === 'switch' ? 'Switched to <b>' + esc(editionName(list.edition)) + '</b>' : 'Updated to <b>v' + esc(list.version) + '</b>') + '.');
        say('Restarting Better Vest and reloading your Vest tabs…', 'good');
        setTimeout(() => chrome.runtime.reload(), 700);
    } catch (e) {
        const [text, kind] = explain(e);
        document.querySelectorAll('#steps li.on').forEach((li) => { li.classList.remove('on'); li.classList.add('bad'); });
        bar(null, 'bad');
        say(text, kind);
        stopped();
    } finally {
        busy = false;
    }
}

async function load(fresh) {
    const done = location.hash === '#done';
    // the last update was written into a copy Chrome doesn't run (sw.js opens this after the restart)
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
        if (!release) ribbon([]); // not "the latest version": the update did not land
        lead('Chrome is still running v' + esc(manifest.version) + '.');
        say('The new files went into a folder Chrome doesn\'t run, or Chrome didn\'t restart Better Vest. First press the round arrow on Better Vest in chrome://extensions. If it still says ' +
            manifest.version + ', click Update here and pick the folder Chrome runs.' + WHERE, 'warn');
        $('#how').hidden = false;
    }
}

function boot() {
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
        // the ribbon shows whether checks are on
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
