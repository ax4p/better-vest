// Better Vest journal: IndexedDB access. One database per Vest user (bv-journal-<userId>).
// Used by the service worker (writes) and the Calendar page (reads); no chrome.* APIs in here.

export const DB_PREFIX = 'bv-journal-';
export const DB_VERSION = 1;
export const STORES = ['accounts', 'trades', 'raw', 'payouts', 'symbols', 'notes', 'meta'];

const KEY_PATHS = {
    accounts: 'id', trades: 'id', raw: 'id', payouts: 'id', symbols: 'symbol', notes: 'key', meta: 'key'
};
const BLOCKED_MS = 8000;

function upgrade(db) {
    for (const name of STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: KEY_PATHS[name] });
        if (name === 'trades') {
            store.createIndex('accountId', 'accountId', { unique: false });
            store.createIndex('closeTs', 'closeTs', { unique: false });
        }
    }
}

export function openDb(userId) {
    return new Promise((resolve, reject) => {
        if (typeof userId !== 'string' || !userId) {
            reject(new TypeError('openDb: userId required'));
            return;
        }
        let settled = false;
        let blockedTimer = null;
        const req = indexedDB.open(DB_PREFIX + userId, DB_VERSION);
        const done = (fn, v) => {
            if (settled) return;
            settled = true;
            clearTimeout(blockedTimer);
            fn(v);
        };
        req.onupgradeneeded = () => upgrade(req.result);
        // Another connection that never closes would keep this request pending forever. Our own
        // connections close on versionchange, so a long block means a foreign or stuck tab.
        req.onblocked = () => {
            blockedTimer = setTimeout(() => done(reject, new Error('openDb: blocked by another connection')), BLOCKED_MS);
        };
        req.onerror = () => done(reject, req.error || new Error('openDb failed'));
        req.onsuccess = () => {
            const db = req.result;
            if (settled) { db.close(); return; }
            db.onversionchange = () => db.close();
            done(resolve, db);
        };
    });
}

function wrap(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function finish(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    });
}

export function getAll(db, store, opts) {
    const o = opts || {};
    const tx = db.transaction(store, 'readonly');
    let source = tx.objectStore(store);
    if (o.index) source = source.index(o.index);
    return wrap(o.range !== undefined && o.range !== null ? source.getAll(o.range) : source.getAll());
}

export function get(db, store, key) {
    return wrap(db.transaction(store, 'readonly').objectStore(store).get(key));
}

// A synchronous failure inside a write (bad key, closed handle) must abort the transaction, so a
// half-filled batch never commits, and surface as a rejection.
async function writeTx(db, names, fill) {
    const tx = db.transaction(names, 'readwrite');
    try {
        fill(tx);
    } catch (e) {
        try { tx.abort(); } catch (e2) {}
        throw e;
    }
    return finish(tx);
}

export function put(db, store, value) {
    return writeTx(db, store, (tx) => { tx.objectStore(store).put(value); });
}

export function putBatch(db, store, values) {
    if (!values || !values.length) return Promise.resolve();
    return writeTx(db, store, (tx) => {
        const os = tx.objectStore(store);
        for (const v of values) os.put(v);
    });
}

// One transaction across several stores: either every store gets its rows or none does.
export function putMany(db, byStore) {
    const names = Object.keys(byStore || {}).filter((n) => byStore[n] && byStore[n].length);
    if (!names.length) return Promise.resolve();
    return writeTx(db, names, (tx) => {
        for (const n of names) {
            const os = tx.objectStore(n);
            for (const v of byStore[n]) os.put(v);
        }
    });
}

export function del(db, store, key) {
    return writeTx(db, store, (tx) => { tx.objectStore(store).delete(key); });
}

export async function getMeta(db, key) {
    const row = await get(db, 'meta', key);
    return row ? row.value : undefined;
}

export function putMeta(db, key, value) {
    return put(db, 'meta', { key, value });
}

export async function listUserIds() {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return [];
    const list = await indexedDB.databases();
    const ids = [];
    for (const d of list) {
        if (d && typeof d.name === 'string' && d.name.startsWith(DB_PREFIX)) ids.push(d.name.slice(DB_PREFIX.length));
    }
    return ids;
}
