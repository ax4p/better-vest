// Better Vest by Astral - bridge (isolated world).
// The suite runs in the page's MAIN world so it can reach React, TradingView and the page's
// WebSockets; this script connects it to the extension (storage, popup, service worker).
(() => {
    let lastState = null;

    // ---- journal relay: page (private MessageChannel) <-> service worker (runtime port) ----
    // The page streams trade history to the service worker. This script only forwards well-formed
    // messages; the service worker validates them again.
    const PAGE_OPS = new Set(['begin', 'symbols', 'accounts', 'positions', 'payouts', 'plans', 'progress', 'end', 'error', 'manifest?']);
    const SW_OPS = new Set(['ack', 'manifest']);
    const CMD_OPS = new Set(['sync', 'fullSync', 'abort']);
    let pagePort = null; // our end of the channel; the page holds the other end
    let swPort = null;
    let swEverConnected = false;
    let lastAck = 0;
    let lastOpen = 0;
    let tellTimer = 0;

    // ---- copy trader relay: page <-> service worker (WICKED and Standard) ----
    // The page asks the service worker to open and drive the follower tabs; the service worker drives this tab's page when it is a
    // follower. Requests carry an `rid`: the answer goes back to whoever asked (the page gets {op, rid, reply: true, ...}; the
    // service worker's sendResponse gets the page's {op: 'reply', rid, ...}). The copy log rides the same way.
    const COPY_PAGE_OPS = new Set(['tabs-open', 'tabs-close', 'tabs-exec', 'tabs-status', 'follower-ready', 'follower-snap', 'reply', 'log-save', 'log-load', 'lead-open', 'lead-show']); // 8.2: lead-*: a copy group's leader tab
    const COPY_SW_OPS = new Set(['exec', 'follower-ready', 'follower-lost', 'follower-failed', 'follower-snap', 'follower-result', 'announce']);
    const COPY_RID_RE = /^[\w.:-]{1,64}$/;
    const COPY_MAX_BYTES = 512 * 1024;
    const COPY_REPLY_MS = 65000; // the worker gives up on a page before this (its own limit scales with the actions); this only frees the entry
    const copyPending = new Map(); // rid -> { respond, timer } for requests from the service worker waiting on the page

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
            // the page answering a request that came from the service worker
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
            // the copy log comes back as its own message (the page asks once at load, without an rid)
            if (d.op === 'log-load' && resp && Array.isArray(resp.entries)) copyToPage({ op: 'log-loaded', entries: resp.entries });
            if (hasRid) copyToPage(Object.assign({}, resp && typeof resp === 'object' ? resp : { ok: false, error: 'no-answer' }, { op: d.op, rid: d.rid, reply: true }));
        }).catch((e) => {
            if (hasRid) copyToPage({ op: d.op, rid: d.rid, reply: true, ok: false, error: 'sw-unreachable' });
        });
    }

    // returns true when sendResponse will be called later
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
        copyToPage(body);
        return true;
    }

    // After the extension reloads (an update or a manual reload), this copy keeps running in tabs that were already
    // open, but it is cut off: chrome.runtime and chrome.storage are gone and every call throws. Go quiet instead.
    function alive() {
        try { if (chrome.runtime && chrome.runtime.id) return true; } catch (e) {}
        window.removeEventListener('message', onWindowMessage);
        clearInterval(tellTimer);
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
            // the service worker went away: tell the page what was acked so it resends the rest
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
        }
        return false;
    }

    function onPageMessage(ev) {
        const d = ev && ev.data;
        if (!d || typeof d !== 'object' || d.v !== 1 || typeof d.op !== 'string' || !PAGE_OPS.has(d.op)) return;
        if (!Number.isInteger(d.seq) || d.seq < 0) return;
        if (d.seq === 1) lastAck = 0; // first message of a new run
        toSw(d);
    }

    function answerHello(d) {
        if (pagePort || typeof d.nonce !== 'string' || d.nonce.length < 8 || d.nonce.length > 64) return;
        const ch = new MessageChannel();
        pagePort = ch.port1;
        pagePort.onmessage = onPageMessage;
        window.postMessage({ bv: 1, dir: 'toPage', type: 'jport', nonce: d.nonce }, location.origin, [ch.port2]);
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
        } else if (d.type === 'jopen') {
            // the dock button; at most once per second
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'journal-open' }).catch(() => {});
        } else if (d.type === 'copen') {
            // the "Total payouts certificate" button on the portfolio page; same once-a-second limit
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'cert-open' }).catch(() => {});
        } else if (d.type === 'sopen') {
            // the dock's P&L button: today's P&L per account, for the P&L card (cert/share.html); same once-a-second limit. The worker
            // cleans the snapshot (cert/share-model.js); here only its size is bounded (256 KB: the Replay's candles and today's fills fit).
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            let snap = null;
            try { snap = d.snap && typeof d.snap === 'object' && JSON.stringify(d.snap).length <= 256 * 1024 ? d.snap : null; } catch (e) {}
            if (!snap) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'share-open', snap }).catch(() => {});
        } else if (d.type === 'uopen') {
            // the dock's Update button; same once-a-second limit
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'update-open' }).catch(() => {});
        }
        if (d.type === 'copy') copyFromPage(d);
    }
    window.addEventListener('message', onWindowMessage);

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return;
        if (msg.type === 'copy') {
            // only the service worker (no tab) drives this page
            if (sender && sender.id === chrome.runtime.id && !sender.tab) return copyFromSw(msg, sendResponse);
            sendResponse({ ok: false, error: 'sender' });
            return false;
        }
        if (msg.type === 'getState') {
            sendResponse({ state: lastState });
            return;
        }
        if (msg.type === 'cmd' && msg.cmd && typeof msg.cmd.cmd === 'string') {
            window.postMessage(Object.assign({}, msg.cmd, { bv: 1, dir: 'toPage' }), location.origin);
            // the page answers with a fresh state message
            setTimeout(() => sendResponse({ ok: true, state: lastState }), 200);
            return true;
        }
        if (msg.type === 'journal-cmd') {
            // only the service worker (no tab) sends these
            if (sender && sender.id === chrome.runtime.id && !sender.tab && CMD_OPS.has(msg.op) && pagePort) {
                toPage({ op: msg.op });
                sendResponse({ ok: true });
            } else {
                sendResponse({ ok: false });
            }
            return true;
        }
    });

    // Site data cleared but extension storage still has the settings: put them back for the next load.
    chrome.storage.local.get('settings').then((r) => {
        try {
            if (r && r.settings && !localStorage.getItem('ax4p_settings')) {
                localStorage.setItem('ax4p_settings', JSON.stringify(r.settings));
            }
        } catch (e) {}
    }).catch(() => {});

    // first state once the page has booted
    setTimeout(() => window.postMessage({ bv: 1, dir: 'toPage', cmd: 'ping' }, location.origin), 2500);

    // a newer release waiting on GitHub: the dock shows an Update button (only the version number goes to the page)
    function tellUpdate() {
        if (!alive()) return;
        chrome.runtime.sendMessage({ type: 'update-state' }).then((s) => {
            const v = s && s.available && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(String(s.available.version)) ? String(s.available.version) : '';
            window.postMessage({ bv: 1, dir: 'toPage', cmd: 'update', version: v }, location.origin);
        }).catch(() => {});
    }
    setTimeout(tellUpdate, 3000);
    tellTimer = setInterval(tellUpdate, 5 * 60 * 1000);
})();
