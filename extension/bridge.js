/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(() => {
    let lastState = null;

    const PAGE_OPS = new Set(['begin', 'symbols', 'accounts', 'positions', 'payouts', 'plans', 'progress', 'end', 'error', 'manifest?']);
    const SW_OPS = new Set(['ack', 'manifest']);
    const CMD_OPS = new Set(['sync', 'fullSync', 'abort']);
    let pagePort = null;
    let swPort = null;
    let swEverConnected = false;
    let lastAck = 0; /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-896bd537 */
    let lastOpen = 0;
    let tellTimer = 0;
    let remoteTimer = 0;
    let vcPort = null;
    let vcOpenAt = 0;
    const VC_PAGE_OPS = new Set(['open', 'cfg', 'ptt', 'done']);

    const COPY_PAGE_OPS = new Set(['tabs-open', 'tabs-close', 'tabs-exec', 'tabs-status', 'follower-ready', 'follower-snap', 'reply', 'log-save', 'log-load', 'lead-open', 'lead-show']);
    const COPY_SW_OPS = new Set(['exec', 'follower-ready', 'follower-lost', 'follower-failed', 'follower-snap', 'follower-result', 'announce']);
    const COPY_RID_RE = /^[\w.:-]{1,64}$/;
    const COPY_MAX_BYTES = 512 * 1024;
    const COPY_REPLY_MS = 65000;
    const copyPending = new Map();

    function copyToPage(fields) {
        try { window.postMessage(Object.assign({}, fields, { bv: 1, dir: 'toPage', type: 'copy' }), location.origin); } catch (e) {}
    }

    function copyBody(msg) {
        const out = {};
        for (const k of Object.keys(msg)) if (k !== 'bv' && k !== 'dir' && k !== 'type') out[k] = msg[k];
        return out;
    }

    function copyFromPage(d) {
        if (typeof d.op !== 'string' || !COPY_PAGE_OPS.has(d.op)) return;
        const hasRid = d.rid !== undefined && d.rid !== null;
        if (hasRid && !(typeof d.rid === 'string' && COPY_RID_RE.test(d.rid)) && !Number.isInteger(d.rid)) return;
        try { if (JSON.stringify(d).length > COPY_MAX_BYTES) return; } catch (e) { return; }
        if (d.op === 'reply') {
            const p = hasRid ? copyPending.get(String(d.rid)) : null;
            if (!p) return;
            copyPending.delete(String(d.rid));
            clearTimeout(p.timer);
            const body = copyBody(d);
            delete body.op;
            p.respond(body);
            return;
        }
        const body = Object.assign({ type: 'copy' }, copyBody(d));
        chrome.runtime.sendMessage(body).then((resp) => {
            if (d.op === 'log-load' && resp && Array.isArray(resp.entries)) copyToPage({ op: 'log-loaded', entries: resp.entries });
            if (hasRid) copyToPage(Object.assign({}, resp && typeof resp === 'object' ? resp : { ok: false, error: 'no-answer' }, { op: d.op, rid: d.rid, reply: true }));
        }).catch((e) => {
            if (hasRid) copyToPage({ op: d.op, rid: d.rid, reply: true, ok: false, error: 'sw-unreachable' });
        });
    }

    function copyFromSw(msg, sendResponse) {
        if (typeof msg.op !== 'string') { sendResponse({ ok: false, error: 'shape' }); return false; }
        if (msg.op === 'ping') { sendResponse({ ok: true }); return false; }
        if (!COPY_SW_OPS.has(msg.op)) { sendResponse({ ok: false, error: 'op' }); return false; }
        const body = copyBody(msg);
        const rid = body.rid;
        if (rid === undefined || rid === null) {
            copyToPage(body);
            sendResponse({ ok: true });
            return false;
        }
        const key = String(rid);
        if (!COPY_RID_RE.test(key) || copyPending.has(key)) { sendResponse({ ok: false, error: 'rid' }); return false; }
        const timer = setTimeout(() => {
            if (copyPending.delete(key)) sendResponse({ ok: false, error: 'timeout' });
        }, COPY_REPLY_MS);
        copyPending.set(key, { respond: sendResponse, timer });
        copyToPage(body); /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-3b205286 */
        return true;
    }

    function alive() {
        try { if (chrome.runtime && chrome.runtime.id) return true; } catch (e) {}
        window.removeEventListener('message', onWindowMessage);
        clearInterval(tellTimer);
        clearInterval(remoteTimer);
        return false;
    }

    function toPage(msg) {
        try { if (pagePort) pagePort.postMessage(msg); } catch (e) {}
    }

    function connectSw() {
        if (swPort) return swPort;
        let p;
        try { p = chrome.runtime.connect({ name: 'journal' }); } catch (e) { return null; }
        swPort = p;
        p.onMessage.addListener((m) => {
            if (!m || typeof m !== 'object' || !SW_OPS.has(m.op) || !Number.isInteger(m.seq)) return;
            if (m.op === 'ack' && m.seq > lastAck) lastAck = m.seq;
            toPage(m);
        });
        p.onDisconnect.addListener(() => {
            if (swPort === p) swPort = null;
            if (swEverConnected) toPage({ op: 'resume', lastAck });
        });
        if (swEverConnected) {
            try { p.postMessage({ v: 1, op: 'resume', lastAck }); } catch (e) {}
        }
        swEverConnected = true;
        return p;
    }

    function toSw(msg) {
        for (let i = 0; i < 2; i++) {
            const p = connectSw();
            if (!p) return false;
            try { p.postMessage(msg); return true; } catch (e) { if (swPort === p) swPort = null; }
        /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-917a5551 */ }
        return false;
    }

    function onPageMessage(ev) {
        const d = ev && ev.data;
        if (!d || typeof d !== 'object' || d.v !== 1 || typeof d.op !== 'string' || !PAGE_OPS.has(d.op)) return;
        if (!Number.isInteger(d.seq) || d.seq < 0) return;
        if (d.seq === 1) lastAck = 0;
        toSw(d);
    }

    function vcHello(d) {
        if (vcPort || typeof d.nonce !== 'string' || d.nonce.length < 8 || d.nonce.length > 64) return;
        const ch = new MessageChannel();
        vcPort = ch.port1;
        vcPort.onmessage = (ev) => {
            const m = ev && ev.data;
            if (!m || typeof m !== 'object' || !VC_PAGE_OPS.has(m.op) || !alive()) return;
            if (m.op === 'open') {
                const t = Date.now();
                if (t - vcOpenAt < 1000) return;
                vcOpenAt = t;
            }
            const out = { type: 'vc-page', op: m.op };
            if (m.op === 'cfg' && m.cfg && typeof m.cfg === 'object') out.cfg = { on: m.cfg.on === true, mode: m.cfg.mode === 'wake' ? 'wake' : 'ptt', open: m.cfg.open !== false };
            if (m.op === 'ptt') out.down = m.down === true;
            if (m.op === 'done') {
                out.id = typeof m.id === 'string' ? m.id.slice(0, 20) : '';
                out.ok = m.ok === true;
                out.why = typeof m.why === 'string' ? m.why.slice(0, 120) : '';
                out.text = typeof m.text === 'string' ? m.text.slice(0, 60) : '';
                out.level = m.level === 'warn' ? 'warn' : '';
                out.seq = Number.isInteger(m.seq) ? m.seq : null;
            }
            /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-bb7e68ff */ chrome.runtime.sendMessage(out).catch(() => {});
        };
        window.postMessage({ bv: 1, dir: 'toPage', type: 'vcport', nonce: d.nonce }, location.origin, [ch.port2]);
    }

    function answerHello(d) {
        if (pagePort || typeof d.nonce !== 'string' || d.nonce.length < 8 || d.nonce.length > 64) return;
        const ch = new MessageChannel();
        pagePort = ch.port1;
        pagePort.onmessage = onPageMessage;
        window.postMessage({ bv: 1, dir: 'toPage', type: 'jport', nonce: d.nonce }, location.origin, [ch.port2]);
    }

    const USE_NAME = /^[a-z][a-zA-Z0-9]{0,15}\.[a-zA-Z0-9]{1,24}$/;
    function usageNums(o, max, lo) {
        const out = {};
        if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
        for (const k of Object.keys(o).slice(0, max)) {
            const v = o[k];
            if (USE_NAME.test(k) && Number.isInteger(v) && v >= lo && v <= 100000) out[k] = v;
        }
        return out;
    }
    function usageFromPage(d) {
        if (d.op !== 'state' && d.op !== 'use' && d.op !== 'answer' && d.op !== 'set') return;
        const msg = { type: 'usage', op: d.op };
        if (d.op === 'use') { msg.n = usageNums(d.n, 200, 1); msg.a = usageNums(d.a, 40, 0); }
        if (d.op === 'answer' || d.op === 'set') msg.on = d.on === true;
        chrome.runtime.sendMessage(msg).then((s) => {
            if (!s || typeof s !== 'object' || s.can !== true) return;
            window.postMessage({ bv: 1, dir: 'toPage', cmd: 'usage', can: true, on: s.on === true, ack: s.ack === true, store: s.store === true }, location.origin);
        }).catch(() => {});
    /*! Owned by Astral (@ax4p): Better Vest standard 9.3.1. Licence: LICENSE, not open source. bv-24e96ca2 */ }

    function feedbackFromPage(d) {
        const id = typeof d.id === 'string' && /^[a-z0-9]{1,20}$/.test(d.id) ? d.id : '';
        if (!id || (d.op !== 'details' && d.op !== 'send')) return;
        const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');
        const msg = d.op === 'details' ? { type: 'feedback-details' }
            : { type: 'feedback-send', fbType: str(d.fbType, 10), text: str(d.text, 2000), contact: str(d.contact, 120), details: str(d.details, 6000), edition: str(d.edition, 10) };
        const answer = (r) => window.postMessage(Object.assign({ bv: 1, dir: 'toPage', cmd: 'feedback-answer', id, op: d.op }, r), location.origin);
        chrome.runtime.sendMessage(msg).then((r) => {
            const o = r && typeof r === 'object' ? r : {};
            answer({ ok: o.ok === true, error: str(o.error, 20), retry: Number.isFinite(o.retry) ? o.retry : undefined,
                lines: Array.isArray(o.lines) ? o.lines.filter((x) => typeof x === 'string').map((x) => x.slice(0, 400)).slice(-12) : undefined });
        }).catch(() => answer({ ok: false, error: 'ext' }));
    }

    function onWindowMessage(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.bv !== 1 || d.dir !== 'toExt') return;
        if (!alive()) return;
        if (d.type === 'settings') {
            chrome.storage.local.set({ settings: d.value, settingsAt: Date.now() }).catch(() => {});
        } else if (d.type === 'state') {
            lastState = d.state;
            chrome.runtime.sendMessage({ type: 'state', state: d.state }).catch(() => {});
        } else if (d.type === 'jhello') {
            answerHello(d);
        } else if (d.type === 'vchello') {
            vcHello(d);
        } else if (d.type === 'jopen') {
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'journal-open' }).catch(() => {});
        } else if (d.type === 'copen') {
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'cert-open' }).catch(() => {});
        } else if (d.type === 'sopen') {
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            let snap = null;
            try { snap = d.snap && typeof d.snap === 'object' && JSON.stringify(d.snap).length <= 256 * 1024 ? d.snap : null; } catch (e) {}
            if (!snap) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'share-open', snap }).catch(() => {});
        } else if (d.type === 'uopen') {
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'update-open' }).catch(() => {});
        } else if (d.type === 'mch') {
            if (d.op !== 'open' && d.op !== 'keep' && d.op !== 'close') return;
            const ok = (m) => typeof m === 'string' && /^[A-Z0-9][A-Z0-9-]{0,40}$/.test(m);
            chrome.runtime.sendMessage({ type: 'mch', op: d.op, market: ok(d.market) ? d.market : '', markets: Array.isArray(d.markets) ? d.markets.filter(ok).slice(0, 3) : [], reload: d.reload === true }).catch(() => {});
        } else if (d.type === 'tape') {
            const rows = d.rows;
            if (typeof d.sym !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{0,40}$/.test(d.sym) || !Array.isArray(rows) || !rows.length || rows.length > 5 * 3600 || rows.length % 5) return; /* Owned by Astral (@ax4p): Better Vest standard 9.3.1. Licence: LICENSE, not open source. bv-73f5ce27 */
            for (const v of rows) if (typeof v !== 'number' || !Number.isFinite(v)) return;
            chrome.runtime.sendMessage({ type: 'tape', sym: d.sym, rows }).catch(() => {});
        } else if (d.type === 'usage') {
            usageFromPage(d);
        } else if (d.type === 'feedback') {
            feedbackFromPage(d);
        } else if (d.type === 'onboard') {
            if (d.state === 'done' || d.state === 'skipped') chrome.storage.local.set({ bvOnboard: { state: d.state, at: Date.now() } }).catch(() => {});
        }
        if (d.type === 'copy') copyFromPage(d);
    }
    window.addEventListener('message', onWindowMessage);

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return;
        if (msg.type === 'copy') {
            if (sender && sender.id === chrome.runtime.id && !sender.tab) return copyFromSw(msg, sendResponse);
            sendResponse({ ok: false, error: 'sender' });
            return false;
        }
        if (msg.type === 'vc') {
            const ok = !!(sender && sender.id === chrome.runtime.id && !sender.tab && vcPort && typeof msg.id === 'string' && /^[a-zA-Z]{1,20}$/.test(msg.id));
            if (ok) vcPort.postMessage({ op: 'cmd', id: msg.id, said: typeof msg.said === 'string' ? msg.said.slice(0, 60) : '', seq: Number.isInteger(msg.seq) ? msg.seq : 0 });
            sendResponse({ ok });
            return false;
        /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.1. bv-bdb0ae50 */ }
        if (msg.type === 'getState') {
            sendResponse({ state: lastState });
            return;
        }
        if (msg.type === 'cmd' && msg.cmd && typeof msg.cmd.cmd === 'string') {
            window.postMessage(Object.assign({}, msg.cmd, { bv: 1, dir: 'toPage' }), location.origin);
            setTimeout(() => sendResponse({ ok: true, state: lastState }), 200);
            return true;
        }
        if (msg.type === 'journal-cmd') {
            if (sender && sender.id === chrome.runtime.id && !sender.tab && CMD_OPS.has(msg.op) && pagePort) {
                toPage({ op: msg.op });
                sendResponse({ ok: true });
            } else {
                sendResponse({ ok: false });
            }
            return true;
        }
    });

    chrome.storage.local.get('settings').then((r) => {
        try {
            if (r && r.settings && !localStorage.getItem('ax4p_settings')) {
                localStorage.setItem('ax4p_settings', JSON.stringify(r.settings));
            }
        } catch (e) {}
    }).catch(() => {});

    setTimeout(() => window.postMessage({ bv: 1, dir: 'toPage', cmd: 'ping' }, location.origin), 2500);

    function tellBase() {
        if (!alive()) return;
        try { window.postMessage({ bv: 1, dir: 'toPage', cmd: 'base', url: chrome.runtime.getURL('') }, location.origin); } catch (e) {}
    }
    setTimeout(tellBase, 1500);
    setTimeout(tellBase, 6000);

    function tellUpdate() {
        if (!alive()) return;
        chrome.runtime.sendMessage({ type: 'update-state' }).then((s) => {
            const v = s && s.available && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(String(s.available.version)) ? String(s.available.version) : '';
            const heads = v && Array.isArray(s.heads) ? s.heads.filter((h) => typeof h === 'string' && h.length <= 80).slice(0, 6) : []; /*! Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-e2966778 */
            window.postMessage({ bv: 1, dir: 'toPage', cmd: 'update', version: v, heads }, location.origin);
        }).catch(() => {});
    }
    setTimeout(tellUpdate, 3000);
    tellTimer = setInterval(tellUpdate, 5 * 60 * 1000);

    const REMOTE_NAMES = new Set(['all', 'copier', 'turbo', 'orders', 'close', 'stops', 'limits', 'tpsl', 'trail', 'autobe', 'accounts', 'lossclose', 'voicecmd', 'wickauto']);
    function tellRemote(off) {
        if (!alive()) return;
        const out = {};
        if (off && typeof off === 'object' && !Array.isArray(off)) {
            for (const k of Object.keys(off)) if (REMOTE_NAMES.has(k) && typeof off[k] === 'string') out[k] = off[k].slice(0, 200);
        }
        window.postMessage({ bv: 1, dir: 'toPage', cmd: 'remote', off: out }, location.origin);
    }
    function tellNews(n) {
        if (!alive()) return;
        const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');
        const ms = (x) => (typeof x === 'number' && Number.isInteger(x) && x > 0 && x < 1e14 ? x : null);
        let out = null;
        if (n && typeof n === 'object' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(n.id)) && str(n.title, 80) && ms(n.end)) {
            const link = n.link && typeof n.link === 'object' && /^\/(?!\/)[A-Za-z0-9\/_-]{0,60}$/.test(String(n.link.path)) && str(n.link.label, 24)
                ? { label: str(n.link.label, 24), path: String(n.link.path) } : null;
            out = { id: String(n.id), title: str(n.title, 80), text: str(n.text, 240), start: ms(n.start), end: ms(n.end), link };
        }
        window.postMessage({ bv: 1, dir: 'toPage', cmd: 'news', news: out }, location.origin);
    }
    function readRemote() {
        if (!alive()) return;
        try {
            chrome.storage.local.get(['bvRemoteOff', 'bvStorePending', 'bvStoreUpdated', 'bvNews']).then((o) => {
                tellRemote(o.bvRemoteOff);
                tellStore(o.bvStorePending, o.bvStoreUpdated);
                tellNews(o.bvNews);
            }).catch(() => {});
        } catch (e) {}
    }
    function tellStore(pending, updated) {
        const ok = (x) => x && typeof x === 'object' && /^\d{1,4}(\.\d{1,4}){1,3}$/.test(String(x.v));
        /*! Owned by Astral (@ax4p): Better Vest standard 9.3.1. Licence: LICENSE, not open source. bv-e73335ba */ if (ok(pending)) window.postMessage({ bv: 1, dir: 'toPage', cmd: 'store-ready', version: String(pending.v) }, location.origin);
        if (ok(updated) && Date.now() - (updated.at || 0) < 2 * 60 * 1000) window.postMessage({ bv: 1, dir: 'toPage', cmd: 'store-updated', version: String(updated.v) }, location.origin);
    }
    function tellOnboard() {
        if (!alive()) return;
        try {
            chrome.storage.local.get(['bvOnboard']).then((o) => {
                const s = o && o.bvOnboard;
                if (s && s.state === 'new') window.postMessage({ bv: 1, dir: 'toPage', cmd: 'onboard', fresh: true }, location.origin);
            }).catch(() => {});
        } catch (e) {}
    }
    setTimeout(tellOnboard, 1200);
    setTimeout(tellOnboard, 5000);
    setTimeout(readRemote, 500);
    setTimeout(readRemote, 2500);
    setTimeout(readRemote, 8000);
    remoteTimer = setInterval(readRemote, 60 * 1000);
    try {
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area !== 'local' || !alive()) return;
            if (ch.bvRemoteOff) tellRemote(ch.bvRemoteOff.newValue);
            if (ch.bvNews) tellNews(ch.bvNews.newValue);
            if (ch.bvStorePending && ch.bvStorePending.newValue) tellStore(ch.bvStorePending.newValue, null);
        });
    } catch (e) {}
})();
