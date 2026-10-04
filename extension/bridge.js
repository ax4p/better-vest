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

    window.addEventListener('message', (ev) => {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.bv !== 1 || d.dir !== 'toExt') return;
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
        } else if (d.type === 'uopen') {
            // the dock's Update button; same once-a-second limit
            const t = Date.now();
            if (t - lastOpen < 1000) return;
            lastOpen = t;
            chrome.runtime.sendMessage({ type: 'update-open' }).catch(() => {});
        }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return;
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
        chrome.runtime.sendMessage({ type: 'update-state' }).then((s) => {
            const v = s && s.available && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(String(s.available.version)) ? String(s.available.version) : '';
            window.postMessage({ bv: 1, dir: 'toPage', cmd: 'update', version: v }, location.origin);
        }).catch(() => {});
    }
    setTimeout(tellUpdate, 3000);
    setInterval(tellUpdate, 15 * 60 * 1000);
})();
