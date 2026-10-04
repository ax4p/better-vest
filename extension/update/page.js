// Better Vest by Astral - update page (update.html). Shows what's new on GitHub and updates the folder Chrome
// loaded this extension from, in one click. The checks and the writing live in core.js.
import { compareVersions, fetchRelease, checkFolder, planRemove, applyUpdate, parseList, notesHtml } from './core.js';
import { RELEASE_PUBLIC_KEY } from './key.js';

const $ = (s) => document.querySelector(s);
const manifest = chrome.runtime.getManifest();
let release = null;   // { version, tag, notes, url } when newer than this copy
let runningCopy = null;
let folder = null;    // FileSystemDirectoryHandle, remembered in IndexedDB
let busy = false;

$('#cur').textContent = 'v' + manifest.version;

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

function lead(html) { $('#lead').innerHTML = html; }
function say(text, kind) {
    const m = $('#msg');
    m.hidden = !text;
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text || '';
}
function step(name, state, n) {
    const li = document.querySelector(`#steps li[data-step="${name}"]`);
    if (!li) return;
    li.classList.remove('on', 'done', 'bad');
    if (state) li.classList.add(state);
    const count = li.querySelector('.n');
    if (count && n != null) count.textContent = n;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function paint(state) {
    $('#auto').checked = !!(state && state.on);
    $('#go').hidden = true;
    $('#how').hidden = true;
    $('#notes').hidden = true;
    if (!state) { lead('Better Vest did not answer. Close this tab and open it again.'); return; }
    if (!state.supported) {
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
        lead('You have the latest version, <b>v' + esc(manifest.version) + '</b>.');
        say(!state.on ? 'Automatic checks are off. Check now looks once.'
            : state.checkedAt ? 'Last checked ' + new Date(state.checkedAt).toLocaleString() + '.' : '');
        return;
    }
    lead('<b>v' + esc(release.version) + '</b> is out. You have v' + esc(manifest.version) + '.');
    if (release.notes) { $('#notes').innerHTML = notesHtml(release.notes); $('#notes').hidden = false; }
    if (/^https:\/\/github\.com\/ax4p\/better-vest\//.test(release.url || '')) $('#rel').href = release.url;
    $('#go').textContent = 'Update to v' + release.version;
    $('#go').hidden = false;
    $('#go').disabled = false;
    $('#how').hidden = !!folder;
    say('');
}

const REASONS = {
    'no-manifest': 'That folder has no manifest.json, so it is not the Better Vest folder.',
    'bad-manifest': 'That folder\'s manifest.json could not be read.',
    'other-extension': 'That folder holds a different extension.',
    'other-version': 'That folder holds a different version of Better Vest than the one Chrome is running.',
    'other-copy': 'That folder holds another copy of Better Vest, not the one Chrome is running.'
};
const WHERE = ' Open chrome://extensions, find Better Vest, and pick the folder it was loaded from.';

function explain(e) {
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
    return ['Something went wrong: ' + code + '. Nothing was changed.', 'bad'];
}

async function update() {
    if (busy || !release) return;
    busy = true;
    $('#go').disabled = true;
    $('#steps').hidden = false;
    say('');
    try {
        if (!runningCopy.edition) throw new Error('no-list');
        // 1. the folder: asked first, while the click still counts as a user gesture
        step('folder', 'on');
        let dir = folder;
        if (dir) {
            let p = await dir.queryPermission({ mode: 'readwrite' });
            if (p !== 'granted') p = await dir.requestPermission({ mode: 'readwrite' });
            if (p !== 'granted') dir = null;
        }
        if (!dir) dir = await window.showDirectoryPicker({ id: 'better-vest', mode: 'readwrite' });
        const bad = await checkFolder(dir, runningCopy);
        if (bad) {
            folder = null;
            await kvSet('dir', null);
            step('folder', 'bad');
            say((REASONS[bad] || bad) + WHERE, 'warn');
            $('#go').disabled = false;
            return;
        }
        folder = dir;
        await kvSet('dir', dir);
        step('folder', 'done');

        // 2. everything downloaded and checked before anything is written
        step('download', 'on');
        const { list, files } = await fetchRelease({
            fetchFn: (u) => fetch(u, { cache: 'no-cache' }),
            subtle: crypto.subtle,
            publicKey: RELEASE_PUBLIC_KEY,
            tag: release.tag,
            expect: { edition: runningCopy.edition, version: release.version },
            onProgress: (i, n) => step('download', 'on', i + ' / ' + n)
        });
        if (compareVersions(list.version, runningCopy.version) <= 0) throw new Error('not-newer');
        step('download', 'done');

        // 3. write (the old bytes go back on any error)
        step('write', 'on');
        const remove = planRemove(runningCopy.list ? parseList(runningCopy.list) : null, list);
        await applyUpdate(dir, files, remove, (i, n) => step('write', 'on', i + ' / ' + n));
        step('write', 'done');

        // 4. Chrome reads the folder again; the new service worker reloads the Vest tabs and opens the done page
        step('restart', 'on');
        await chrome.storage.local.set({ bvUpdated: { from: runningCopy.version, to: list.version, at: Date.now(), reloadTabs: true } });
        say('Updated to v' + list.version + '. Restarting Better Vest…', 'good');
        setTimeout(() => chrome.runtime.reload(), 700);
    } catch (e) {
        const [text, kind] = explain(e);
        document.querySelectorAll('#steps li.on').forEach((li) => { li.classList.remove('on'); li.classList.add('bad'); });
        say(text, kind);
        $('#go').disabled = false;
    } finally {
        busy = false;
    }
}

async function load(fresh) {
    const done = location.hash === '#done';
    if (done) {
        lead('Better Vest is now <b>v' + esc(manifest.version) + '</b>.');
        say('Your Vest tabs were reloaded, so they run the new version. Settings and Calendar are as you left them.', 'good');
    }
    const state = await chrome.runtime.sendMessage({ type: fresh ? 'update-check' : 'update-state' }).catch(() => null);
    if (done) {
        $('#auto').checked = !!(state && state.on);
        return;
    }
    paint(state);
}

$('#go').onclick = update;
$('#check').onclick = async () => {
    if (busy) return;
    $('#check').disabled = true;
    lead('Checking GitHub…');
    if (location.hash) history.replaceState(null, '', location.pathname);
    await load(true);
    $('#check').disabled = false;
};
$('#auto').onchange = async (e) => {
    const s = await chrome.runtime.sendMessage({ type: 'update-auto', on: e.target.checked }).catch(() => null);
    if (s) $('#auto').checked = !!s.on;
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
