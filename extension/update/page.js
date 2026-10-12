// Better Vest by Astral - update page (update.html). Shows what's new on GitHub and updates the folder Chrome
// loaded this extension from, in one click. The checks and the writing live in core.js.
import { compareVersions, fetchRelease, findFolder, planRemove, applyUpdate, parseList, notesHtml } from './core.js';
import { RELEASE_PUBLIC_KEY } from './key.js';

// false when the Node tests import the pure helpers below: nothing then touches the page or chrome.*
const IN_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const $ = (s) => document.querySelector(s);
const manifest = IN_EXT ? chrome.runtime.getManifest() : { name: 'Better Vest by Astral', version: '0.0.0' };
let release = null;   // { version, tag, notes, url } when newer than this copy
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

export function paint(state) {
    $('#auto').checked = !!(state && state.on);
    $('#go').hidden = true;
    $('#how').hidden = true;
    $('#news').hidden = true;
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
    if (!release) {
        setState('latest');
        lead('You have the latest version, <b>v' + esc(manifest.version) + '</b>.');
        ribbon(tilesFor('latest', { have: manifest.version, checkedAt: state.checkedAt, on: state.on, now: Date.now() }));
        say('');
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
    $('#go').textContent = 'Update to v' + release.version;
    $('#go').hidden = false;
    $('#go').disabled = false;
    $('#how').hidden = !!folder;
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
    if (/^download/.test(code) || e instanceof TypeError) return ['GitHub did not answer. Nothing was changed. Try again in a minute.', 'bad'];
    if (code === 'not-newer') return ['That release is not newer than this copy. Nothing was changed.', 'warn'];
    if (code === 'rolled-back') return ['Writing the new files failed, so the old ones were put back. Nothing changed. (' + (cause || 'write error') + ')', 'bad'];
    if (code === 'rollback-failed') return ['Writing failed and these files could not be put back: ' + (e.failed || []).join(', ') + '. Download the latest zip from GitHub and unzip it over the folder.', 'bad'];
    return ['Something went wrong: ' + code + '. Nothing was changed. Try again, or update from the GitHub zip by hand.', 'bad'];
}

// back to the release waiting, after a refusal or an error
export function stopped() {
    setState('available');
    leadAvailable();
    $('#go').hidden = false;
    $('#go').disabled = false;
}

async function update() {
    if (busy || !release) return;
    busy = true;
    $('#go').disabled = true;
    $('#go').hidden = true;
    document.querySelectorAll('#steps li').forEach((li) => step(li.dataset.step, '', ''));
    $('#run').hidden = false;
    setState('updating');
    lead('Updating to <b>v' + esc(release.version) + '</b>…');
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
        const { list, files } = await fetchRelease({
            fetchFn: (u) => fetch(u, { cache: 'no-cache' }),
            subtle: crypto.subtle,
            publicKey: RELEASE_PUBLIC_KEY,
            tag: release.tag,
            expect: { edition: runningCopy.edition, version: release.version },
            onProgress: (i, n) => { step('download', 'on', i + ' / ' + n); bar(progress('download', i, n)); }
        });
        if (compareVersions(list.version, runningCopy.version) <= 0) throw new Error('not-newer');
        step('download', 'done');

        // 3. write (the old bytes go back on any error)
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
        await chrome.storage.local.set({ bvUpdated: { from: runningCopy.version, to: list.version, at, reloadAt: at + 700, reloadTabs: true } });
        setState('restarting');
        lead('Updated to <b>v' + esc(list.version) + '</b>.');
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
        lead('Better Vest is now <b>v' + esc(manifest.version) + '</b>.');
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
        $('#how').hidden = !release;
    };
    (async () => {
        runningCopy = await running();
        folder = await kvGet('dir').catch(() => null);
        await load(false);
    })();
}

if (IN_EXT) boot();
