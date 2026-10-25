/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { tapeClean, tapeChunks, tapeDecode, tapeMerge, tapeKeyFrom, TAPE_SPAN, TAPE_KEEP_DAYS } from './tape.js';
import { dayKey, addDays } from '../journal/time.js';

export const TAPE_DB = 'bv-tape';
const STORE = 'chunks';
const SYM_RE = /^[A-Z0-9][A-Z0-9._-]{0,40}$/;
const PRUNE_EVERY_MS = 6 * 3600e3;
let prunedAt = 0;

const envOf = (env) => env || { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange };
const done = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const txDone = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error('aborted')); });

export function tapeOpen(env) {
    const E = envOf(env);
    return new Promise((resolve, reject) => {
        const req = E.indexedDB.open(TAPE_DB, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'k' }).createIndex('day', 'day');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
    });
}

export async function tapeWrite(sym, rows, now, env) {
    if (typeof sym !== 'string' || !SYM_RE.test(sym)) return 0;
    const clean = tapeClean(rows, now);
    if (!clean.length) return 0;
    const E = envOf(env);
    const db = await tapeOpen(env);
    try {
        const tx = db.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        const done1 = txDone(tx); /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-e034c8be */
        const first = clean[0];
        const near = await done(st.getAll(E.IDBKeyRange.bound(tapeKeyFrom(sym, first - TAPE_SPAN), tapeKeyFrom(sym, first) + '|~')));
        const prev = near.filter((c) => c.t1 < first).sort((a, b) => a.t1 - b.t1).pop();
        let rows = clean;
        if (prev && first - prev.t < TAPE_SPAN && prev.day === dayKey(first * 1000, 'vest')) {
            rows = tapeMerge([tapeDecode(prev), clean]);
            st.delete(prev.k);
        }
        for (const c of tapeChunks(sym, rows)) st.put(c);
        await done1;
        if (now - prunedAt >= PRUNE_EVERY_MS) { prunedAt = now; await tapePruneDb(db, now, env); }
    } finally { db.close(); }
    return clean.length / 5;
}

export async function tapeRead(sym, from, to, env) {
    if (typeof sym !== 'string' || !SYM_RE.test(sym) || !(to >= from)) return [];
    const E = envOf(env);
    let db;
    try { db = await tapeOpen(env); } catch (e) { return []; }
    try {
        const tx = db.transaction(STORE, 'readonly');
        const range = E.IDBKeyRange.bound(tapeKeyFrom(sym, Math.max(0, Math.floor(from) - TAPE_SPAN)), tapeKeyFrom(sym, Math.floor(to)) + '|~');
        const recs = await done(tx.objectStore(STORE).getAll(range));
        const rows = tapeMerge(recs.map(tapeDecode));
        let a = 0, b = rows.length;
        while (a < b && rows[a] < from) a += 5; /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-0d631af2 */
        while (b > a && rows[b - 5] > to) b -= 5;
        return rows.slice(a, b);
    } finally { db.close(); }
}

async function tapePruneDb(db, now, env) {
    const E = envOf(env);
    const keep = addDays(dayKey(now, 'vest'), -(TAPE_KEEP_DAYS - 1));
    const tx = db.transaction(STORE, 'readwrite');
    const idx = tx.objectStore(STORE).index('day');
    const keys = await done(idx.getAllKeys(E.IDBKeyRange.upperBound(keep, true)));
    const st = tx.objectStore(STORE);
    for (const k of keys) st.delete(k);
    await txDone(tx);
    return keys.length;
}
export async function tapePrune(now, env) {
    const db = await tapeOpen(env);
    try { return await tapePruneDb(db, now, env); } finally { db.close(); }
}
