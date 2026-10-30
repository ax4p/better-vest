/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

export const REPO = 'ax4p/better-vest';
export const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
export const LIST = 'files.json';
export const SIG = 'files.json.sig';
export const EDITION_DIRS = Object.freeze({ standard: 'extension', lite: 'extension-lite', nostats: 'extension-nostats' });
export const PUBLIC_EDITIONS = Object.freeze(Object.keys(EDITION_DIRS));

export function editionDir(edition) {
    if (typeof edition !== 'string' || !Object.prototype.hasOwnProperty.call(EDITION_DIRS, edition)) throw new Error('list-edition');
    return EDITION_DIRS[edition];
} /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.3. bv-9e34fd02 */

export function rawUrl(tag, path, edition = 'standard') {
    return `https://raw.githubusercontent.com/${REPO}/${encodeURIComponent(tag)}/${editionDir(edition)}/` + path.split('/').map(encodeURIComponent).join('/');
}

const TOP_FILES = new Set(['manifest.json', 'sw.js', 'bridge.js', 'popup.html', 'popup.js', 'popup.css',
    'journal.html', 'certificate.html', 'update.html', LIST, SIG]);
const TOP_DIRS = new Set(['page', 'journal', 'cert', 'icons', 'update']);
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const EDITION_RE = /^[a-z]{1,20}$/;

export function compareVersions(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
    const pb = String(b).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return 0;
}

export function parseLatest(json) {
    if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
    const tag = String(json.tag_name || '');
    const m = tag.match(/^v?(\d{1,4}\.\d{1,4}\.\d{1,4})$/);
    if (!m) return null;
    const url = String(json.html_url || '');
    return {
        version: m[1],
        tag,
        notes: String(json.body || '').slice(0, 20000),
        url: url.startsWith(`https://github.com/${REPO}/`) ? url : `https://github.com/${REPO}/releases`
    };
}

export function validPath(p) {
    if (typeof p !== 'string' || !p || p.length > 200 || p.includes('\\') || p.startsWith('/')) return false;
    const parts = p.split('/');
    if (parts.some((s) => !s || s.startsWith('.') || !/^[\w.@-]+$/.test(s))) return false;
    if (parts.length === 1) return TOP_FILES.has(p);
    return TOP_DIRS.has(parts[0]);
}

export function parseList(text) {
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('list-json'); }
    if (!j || typeof j !== 'object' || typeof j.edition !== 'string' || !EDITION_RE.test(j.edition) || typeof j.name !== 'string' ||
        typeof j.version !== 'string' || !VERSION_RE.test(j.version) ||
        !j.files || typeof j.files !== 'object' || Array.isArray(j.files)) throw new Error('list-shape');
    const files = {};
    for (const [p, h] of Object.entries(j.files)) {
        if (p === LIST || p === SIG || !validPath(p)) throw new Error('list-path:' + p);
        if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) throw new Error('list-hash:' + p);
        files[p] = h;
    }
    if (!files['manifest.json']) throw new Error('list-manifest');
    return { edition: j.edition, name: j.name, version: j.version, files };
}

export function b64ToBytes(s) {
    const bin = atob(String(s).trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export async function sha256Hex(subtle, bytes) {
    const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
    let s = '';
    for (const x of d) s += x.toString(16).padStart(2, '0');
    return s;
}

export async function verifyList(subtle, publicKeyB64, listBytes, sigText) {
    try {
        const key = await subtle.importKey('spki', b64ToBytes(publicKeyB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        const sig = b64ToBytes(sigText);
        if (sig.length !== 64) return false; /*! (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-b8f140f6 */
        return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, listBytes);
    } catch (e) {
        return false;
    }
}

export async function fetchRelease({ fetchFn, subtle, publicKey, tag, expect, onProgress }) {
    editionDir(expect && expect.edition);
    const get = async (path) => {
        const r = await fetchFn(rawUrl(tag, path, expect.edition));
        if (!r || !r.ok) throw new Error('download:' + path + ':' + (r ? r.status : 'none'));
        return new Uint8Array(await r.arrayBuffer());
    };
    const listBytes = await get(LIST);
    const sigBytes = await get(SIG);
    if (!(await verifyList(subtle, publicKey, listBytes, new TextDecoder().decode(sigBytes)))) throw new Error('signature');
    const list = parseList(new TextDecoder().decode(listBytes));
    if (list.edition !== expect.edition) throw new Error('list-edition');
    if (list.version !== expect.version) throw new Error('list-version');
    const paths = Object.keys(list.files).sort();
    const files = new Map();
    /* Copyright Astral 2026. From Better Vest 9.3.3 (lite), ref bv-6ffb58c2. Not licensed for reuse. */ let done = 0;
    const queue = paths.slice();
    const worker = async () => {
        while (queue.length) {
            const p = queue.shift();
            const bytes = await get(p);
            if ((await sha256Hex(subtle, bytes)) !== list.files[p]) throw new Error('hash:' + p);
            files.set(p, bytes);
            if (onProgress) onProgress(++done, paths.length);
        }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    let manifest;
    try { manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))); } catch (e) { throw new Error('manifest-json'); }
    if (manifest.version !== list.version || manifest.name !== list.name) throw new Error('manifest-mismatch');
    files.set(LIST, listBytes);
    files.set(SIG, sigBytes);
    return { list, files };
}

export function planRemove(oldList, newList) {
    if (!oldList) return [];
    return Object.keys(oldList.files).filter((p) => !(p in newList.files) && validPath(p)).sort();
}


async function parentOf(root, path, create) {
    const parts = path.split('/');
    let d = root;
    for (const s of parts.slice(0, -1)) d = await d.getDirectoryHandle(s, { create });
    return [d, parts[parts.length - 1]];
}

const missing = (e) => e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');

export async function readAt(root, path) {
    try {
        const [d, name] = await parentOf(root, path, false);
        const f = await (await d.getFileHandle(name)).getFile();
        return new Uint8Array(await f.arrayBuffer());
    } catch (e) {
        if (missing(e)) return null;
        throw e;
    }
}

export async function writeAt(root, path, bytes) {
    /* Copyright (c) 2026 Astral. Better Vest 9.3.3 is licensed to its users only to run it, never to copy it. bv-d8fcf168 */ const [d, name] = await parentOf(root, path, true);
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    try {
        await w.write(bytes);
        await w.close();
    } catch (e) {
        try { await w.abort(); } catch (x) {}
        throw e;
    }
}

export async function removeAt(root, path) {
    try {
        const [d, name] = await parentOf(root, path, false);
        await d.removeEntry(name);
    } catch (e) {
        if (missing(e)) return;
        throw e;
    }
}

export async function checkFolder(root, running) {
    const mf = await readAt(root, 'manifest.json');
    if (!mf) return 'no-manifest';
    let m;
    try { m = JSON.parse(new TextDecoder().decode(mf)); } catch (e) { return 'bad-manifest'; }
    if (m.name !== running.name) return 'other-extension';
    if (m.version !== running.version) return 'other-version';
    if (running.list != null) {
        const l = await readAt(root, LIST);
        if (!l || new TextDecoder().decode(l) !== running.list) return 'other-copy';
    }
    return null;
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.Trash', 'Library', 'Applications', 'System', 'Pictures', 'Movies', 'Music', 'AppData', '$RECYCLE.BIN']);
export async function findFolder(root, running, opts = {}) {
    const first = await checkFolder(root, running);
    if (!first) return { dir: root, path: '' };
    if (first !== 'no-manifest') return { why: first };
    const maxDepth = opts.maxDepth || 4, maxDirs = opts.maxDirs || 4000, timeoutMs = opts.timeoutMs || 15000;
    const clock = opts.now || (() => Date.now());
    /* This file is part of Better Vest by Astral and is protected by copyright. ref bv-ec701720 */ const t0 = clock();
    const found = [];
    let seen = 0, partial = false;
    let level = [{ dir: root, path: '' }];
    for (let depth = 1; depth <= maxDepth && level.length && !partial; depth++) {
        const next = [];
        for (const { dir, path } of level) {
            if (partial) break;
            try {
                for await (const h of dir.values()) {
                    if (h.kind !== 'directory' || SKIP_DIRS.has(h.name)) continue;
                    if (++seen > maxDirs || clock() - t0 > timeoutMs) { partial = true; break; }
                    const p = path ? path + '/' + h.name : h.name;
                    const why = await checkFolder(h, running);
                    if (!why) found.push({ dir: h, path: p });
                    else if (why === 'no-manifest') next.push({ dir: h, path: p });
                }
            } catch (e) {  }
        }
        level = next;
    }
    if (found.length === 1) return found[0];
    if (found.length > 1) return { why: 'several', paths: found.map((f) => f.path) };
    return { why: 'none', partial };
}

async function pruneDirs(root, removed) {
    const dirs = new Set();
    for (const p of removed) {
        const parts = p.split('/');
        for (let i = parts.length - 1; i > 0; i--) dirs.add(parts.slice(0, i).join('/'));
    }
    for (const d of [...dirs].sort((a, b) => b.split('/').length - a.split('/').length || (a < b ? -1 : 1))) {
        if (!TOP_DIRS.has(d.split('/')[0])) continue;
        try {
            const [parent, name] = await parentOf(root, d, false);
            const h = await parent.getDirectoryHandle(name);
            let empty = true;
            for await (const x of h.values()) { if (x) { empty = false; break; } }
            if (empty) await parent.removeEntry(name);
        } catch (e) {  }
    }
}

export async function applyUpdate(root, files, remove, onProgress) {
    const order = [...files.keys()].sort((a, b) => (a === 'manifest.json') - (b === 'manifest.json') || (a < b ? -1 : a > b ? 1 : 0));
    const backup = new Map();
    for (const p of [...order, ...remove]) {
        if (!validPath(p)) throw new Error('path:' + p);
        if (!backup.has(p)) backup.set(p, await readAt(root, p));
    }
    const touched = [];
    const total = order.length + remove.length; /*! All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-0229a86d */
    let n = 0;
    try {
        for (const p of order) {
            touched.push(p);
            await writeAt(root, p, files.get(p));
            if (onProgress) onProgress(++n, total);
        }
        for (const p of remove) {
            touched.push(p);
            await removeAt(root, p);
            if (onProgress) onProgress(++n, total);
        }
        await pruneDirs(root, remove);
        return { written: order.length, removed: remove.length };
    } catch (e) {
        const failed = [];
        for (const p of touched.reverse()) {
            try {
                const old = backup.get(p);
                if (old) await writeAt(root, p, old);
                else await removeAt(root, p);
            } catch (x) {
                failed.push(p);
            }
        }
        const err = new Error(failed.length ? 'rollback-failed' : 'rolled-back');
        err.cause = e;
        err.failed = failed;
        throw err;
    }
}

export function notesHtml(md) {
    const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const inline = (s) => esc(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const out = [];
    let list = false;
    for (const raw of String(md || '').replace(/\r/g, '').split('\n')) {
        const line = raw.trimEnd();
        const li = line.match(/^\s*[-*]\s+(.*)$/);
        if (li) {
            if (!list) { out.push('<ul>'); list = true; }
            out.push('<li>' + inline(li[1]) + '</li>');
            continue;
        }
        if (list) { out.push('</ul>'); list = false; }
        const h = line.match(/^#{1,6}\s+(.*)$/);
        if (h) out.push('<h4>' + inline(h[1]) + '</h4>');
        else if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    }
    if (list) out.push('</ul>');
    return out.join('');
}

export function whatsNew(md, max = 6) {
    const out = [];
    let inside = false;
    const plain = (t) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/[`*_<>]/g, '').replace(/\s+/g, ' ').trim().replace(/[,;:]+$/, '').trim();
    for (const raw of String(md || '').replace(/\r/g, '').split('\n')) {
        /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-90433db3 */ const line = raw.trim();
        const head = /^#{1,6}\s+(.+)$/.exec(line) || /^\*\*([^*]+)\*\*:?$/.exec(line);
        if (head) { inside = /^what'?s new:?$/i.test(plain(head[1]).replace(/\u2019/g, "'") + ''); continue; }
        if (!inside) continue;
        const li = /^[-*]\s+\*\*([^*]+)\*\*/.exec(line);
        const t = li ? plain(li[1]).slice(0, 80) : '';
        if (t) out.push(t);
        if (out.length >= max) break;
    }
    return out;
}
