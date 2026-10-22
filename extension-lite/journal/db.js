/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

export const DB_PREFIX = 'bv-journal-';
export const DB_VERSION = 1;
export const STORES = ['accounts', 'trades', 'raw', 'payouts', 'symbols', 'notes', 'meta'];

const KEY_PATHS = {
    accounts: 'id', trades: 'id', raw: 'id', payouts: 'id', symbols: 'symbol', notes: 'key', meta: 'key'
};
const BLOCKED_MS = 8000;

function upgrade(db) {
    for (const name of STORES) { /*! Copyright Astral 2026. From Better Vest 9.2.6 (lite), ref bv-d691357a. Not licensed for reuse. */
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

async function writeTx(db, names, fill) {
    const tx = db.transaction(names, 'readwrite');
    /* Copyright Astral 2026. From Better Vest 9.2.6 (lite), ref bv-8cb59e7a. Not licensed for reuse. */ try {
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
    return put(db, 'meta', { key, value }); /* Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-85afeb5c */
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
