// Better Vest by Astra - toolbar popup. Talks to the page through bridge.js.
const VEST = 'https://next.vestmarkets.com/';
const $ = (s) => document.querySelector(s);
let tabId = null;
let state = null;

document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version;

function send(cmd) {
    return chrome.tabs.sendMessage(tabId, { type: 'cmd', cmd }).then((r) => {
        if (r && r.state) render(r.state);
    }).catch(() => {});
}

function render(st) {
    if (!st) return;
    state = st;
    $('#dot').className = 'dot ' + (st.feed ? 'live' : 'bad');
    $('#status-text').textContent = `${st.symbol || '—'} · ${st.feed ? 'tape live' : 'tape reconnecting'} · v${st.version}`;
    document.querySelectorAll('[data-widget]').forEach((b) => {
        const k = b.dataset.widget;
        b.classList.toggle('on', k === 'settings' ? st.widgets.settings === true : st.widgets[k] !== false);
    });
    document.querySelectorAll('[data-hide]').forEach((b) => b.classList.toggle('on', !!st.hide[b.dataset.hide]));
    const box = $('#themes');
    if (!box.children.length && st.themes) {
        st.themes.forEach((t) => {
            const b = document.createElement('button');
            b.className = 'theme';
            b.dataset.theme = t.k;
            // page-supplied values go through style properties and textContent, never HTML
            b.style.background = t.page;
            b.style.borderColor = t.line;
            const dots = document.createElement('span');
            [t.accent, t.up, t.down].forEach((c) => {
                const i = document.createElement('i');
                i.style.background = c;
                dots.appendChild(i);
            });
            const name = document.createElement('b');
            name.style.color = t.text;
            name.textContent = t.label;
            b.append(dots, name);
            b.onclick = () => send({ cmd: 'theme', value: t.k });
            box.appendChild(b);
        });
    }
    box.querySelectorAll('.theme').forEach((b) => b.classList.toggle('on', b.dataset.theme === st.theme));
}

document.querySelectorAll('[data-widget]').forEach((b) => {
    b.onclick = () => send({ cmd: 'widget', key: b.dataset.widget });
});
document.querySelectorAll('[data-hide]').forEach((b) => {
    b.onclick = () => send({ cmd: 'hide', key: b.dataset.hide, value: !(state && state.hide[b.dataset.hide]) });
});
$('#focus-all').onclick = () => send({ cmd: 'focusAll' });
$('#open-vest').onclick = () => chrome.tabs.create({ url: VEST + 'trade/NQ-PERP' });
$('#open-cal').onclick = () => { chrome.runtime.sendMessage({ type: 'journal-open' }).catch(() => {}); window.close(); };

// Calendar summary from the service worker (works without a Vest tab, from the local history)
const MINUS = '\u2212';
function usd(v) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v), r = Math.round(a * 100) / 100;
    if (r === 0) return '$0';
    const body = a < 10 ? r.toFixed(2) : a < 9999.5 ? Math.round(a).toLocaleString('en-US') : (a / 1e3).toFixed(1) + 'k';
    return (v > 0 ? '+' : MINUS) + '$' + body;
}
function paintCal(sum) {
    const set = (id, nId, row, extra) => {
        const b = $(id);
        b.textContent = row ? usd(row.net) : '—';
        b.className = row && row.net > 0 ? 'up' : row && row.net < 0 ? 'down' : '';
        $(nId).textContent = row ? (row.n || 0) + ' trades' + (extra || '') : '';
    };
    if (!sum || !sum.userId) {
        $('#cal-sync').textContent = 'not built yet';
        return;
    }
    set('#cal-today', '#cal-today-n', sum.today);
    set('#cal-week', '#cal-week-n', sum.week);
    set('#cal-month', '#cal-month-n', sum.month, sum.month && sum.month.paid ? ' · paid ' + usd(sum.month.paid).replace('+', '') : '');
    const ago = sum.lastSync ? Math.max(0, Math.round((Date.now() - sum.lastSync) / 60000)) : null;
    $('#cal-sync').textContent = ago == null ? '' : ago < 1 ? 'synced just now' : ago < 60 ? 'synced ' + ago + 'm ago' : 'synced ' + Math.round(ago / 60) + 'h ago';
}
chrome.runtime.sendMessage({ type: 'journal-summary' }).then(paintCal).catch(() => paintCal(null));

chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (!tab || !tab.url || !tab.url.startsWith(VEST)) {
        $('#off').hidden = false;
        return;
    }
    tabId = tab.id;
    $('#on').hidden = false;
    const r = await chrome.tabs.sendMessage(tabId, { type: 'getState' }).catch(() => null);
    if (r && r.state) render(r.state);
    send({ cmd: 'ping' });
    // live while the popup is open
    setInterval(() => send({ cmd: 'ping' }), 1000);
});
