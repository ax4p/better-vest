/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

export const MV_STORE_ID = 'ilegencblfidpnobbgekejbphjkafobb';
export const MV_LISTING = 'https://chromewebstore.google.com/detail/better-vest-by-astral/' + MV_STORE_ID;
export const MOVED_KEY = 'bvMovedToStore';
const VEST_PAGE = /^https:\/\/next\.vestmarkets\.com\//;
const EXT_PAGE = 'chrome://extensions';


export async function movedToStore(storage) {
    try {
        const o = await storage.get(MOVED_KEY);
        return !!(o && o[MOVED_KEY]);
    } catch (e) { return false; }
}
export async function mvSawStore(env) {
    await env.storage.set({ [MOVED_KEY]: { at: Date.now() } });
    await env.runtime.setUninstallURL('');
    return true;
}
export async function mvOpenRemove(env, tab) {
    const o = { url: env.runtime.getURL('update.html#remove'), active: true };
    if (tab && Number.isInteger(tab.windowId)) o.windowId = tab.windowId;
    if (tab && Number.isInteger(tab.index)) o.index = tab.index + 1;
    await env.tabs.create(o);
    return true;
} /* This file is part of Better Vest by Astral and is protected by copyright. ref bv-68b78224 */
export function mvWorker(env) {
    env.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || typeof msg !== 'object' || msg.type !== 'mv') return;
        const vest = !!(sender && sender.id === env.runtime.id && sender.tab && VEST_PAGE.test(String(sender.url || sender.tab.url || '')));
        if (!vest || (msg.op !== 'store' && msg.op !== 'remove')) { sendResponse({ ok: false }); return false; }
        (msg.op === 'store' ? mvSawStore(env) : mvOpenRemove(env, sender.tab)).then((ok) => sendResponse({ ok: ok === true }), () => sendResponse({ ok: false }));
        return true;
    });
}


const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mvLast(ui) {
    const eb = ui.$('#eyebrow');
    if (eb) eb.textContent = 'Last GitHub version';
    ui.lead('This is the last GitHub version, <b>v' + esc(ui.version) + '</b>. Updates now come from the Chrome Web Store.');
    ui.ribbon([
        { lab: 'You have', v: 'v' + ui.version, s: 'The last GitHub version', cls: 'ok' },
        { lab: 'Updates', v: 'Chrome Web Store', s: 'Faster, and checked by Chrome' }
    ]);
}

export function mvPanelHtml(moved, id) {
    const idText = /^[a-p]{32}$/.test(String(id || '')) ? ' (ID&nbsp;' + id.slice(0, 8) + '…)' : '';
    if (moved) {
        return '<div class="lab">Chrome Web Store</div><h2 class="mv-h">Remove this GitHub copy</h2>'
            + '<p class="mv-p">The Chrome Web Store version is installed too. Until this copy goes, both act on Vest\'s page: the Calendar opens twice, for one.</p>'
            + '<button type="button" class="primary" id="mv-rm">Remove this GitHub copy</button>'
            + '<p class="go-note">Chrome asks you to confirm. Your settings stay: the Store version reads them.</p>'
            + '<p id="mv-msg" class="msg" role="status" hidden></p>'
            + '<p class="mv-alt" hidden>Or remove it in <code>' + EXT_PAGE + '</code>' + idText + '. <button type="button" class="btn" id="mv-copy">Copy ' + EXT_PAGE + '</button></p>';
    }
    return '<div class="lab">Chrome Web Store</div><h2 class="mv-h">Switch to the Chrome Web Store version</h2>'
        + '<p class="mv-p">Better Vest now updates only through the Chrome Web Store: faster for everyone, and checked by Chrome. This GitHub copy gets no more updates.</p>'
        + '<ol class="mv-steps">'
        + '<li><span>Add it from the Chrome Web Store.</span><a class="btn mv-add" href="' + MV_LISTING + '" target="_blank" rel="noopener noreferrer">Add to Chrome</a></li>' /*! Better Vest (c) 2026 Astral. All rights reserved. bv-6c3d839a */
        + '<li><span>Then remove this copy.</span><button type="button" class="btn" id="mv-rm">Remove this GitHub copy</button></li>'
        + '</ol>'
        + '<p class="mv-carry">Your settings, looks, limits and copy groups come with you, and the Calendar fills itself again from Vest. Calendar notes and the P&amp;L card\'s look and picture don\'t come along.</p>'
        + '<p id="mv-msg" class="msg" role="status" hidden></p>'
        + '<p class="mv-alt" hidden>Or remove it in <code>' + EXT_PAGE + '</code>' + idText + '. <button type="button" class="btn" id="mv-copy">Copy ' + EXT_PAGE + '</button></p>';
}
const PANEL_CSS = `
    #mv .mv-h { margin: 8px 0 0; font-size: 18px; font-weight: 600; letter-spacing: -.015em; line-height: 1.3; color: var(--u-t1); }
    #mv .mv-p { margin: 6px 0 0; font-size: 13px; line-height: 1.55; color: var(--u-t2); }
    #mv .mv-steps { list-style: none; counter-reset: mv; margin: 16px 0 0; padding: 0; display: grid; gap: 8px; }
    #mv .mv-steps li { counter-increment: mv; position: relative; display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 6px 8px 6px 40px;
        border-radius: 11px; background: var(--u-cell); box-shadow: inset 0 0 0 1px var(--u-hair); font-size: 13px; color: var(--u-t1); }
    #mv .mv-steps li::before { content: counter(mv); position: absolute; left: 10px; top: 50%; translate: 0 -50%; display: grid; place-items: center; width: 20px; height: 20px;
        border-radius: 7px; background: var(--u-hair); color: var(--u-t2); font-size: 11px; font-weight: 700; }
    #mv .mv-steps li > span { flex: 1; min-width: 0; }
    #mv .mv-add { border-color: color-mix(in srgb, var(--ax-accent) 60%, transparent); background: color-mix(in srgb, var(--ax-accent) 24%, var(--ax-btn)); }
    #mv .mv-carry { margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--u-hair); font-size: 12px; line-height: 1.55; color: var(--u-t2); }
    #mv #mv-rm.primary { margin-top: 16px; }
    #mv #mv-rm.primary::before { -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'/%3E%3C/svg%3E");
        mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'/%3E%3C/svg%3E"); }
    #mv .msg { margin-top: 12px; }
    #mv .mv-alt { margin: 10px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--u-t2); }
    #mv .mv-alt .btn { margin-left: 4px; vertical-align: middle; }
    #mv.mv-here { animation: mvHere 1.6s ease-out 1; }
    @keyframes mvHere { 0%, 30% { box-shadow: var(--u-lift), 0 0 0 2px var(--ax-accent), 0 0 40px -6px var(--ax-glow); } 100% { box-shadow: var(--u-lift); } }
    @media (prefers-reduced-motion: reduce) { #mv.mv-here { animation: none; } }`;

export function mvPanel(ui) {
    const doc = ui.doc || document;
    if (doc.getElementById('mv')) return null;
    const css = doc.createElement('style');
    css.id = 'mv-css';
    css.textContent = PANEL_CSS;
    doc.head.appendChild(css);
    const sec = doc.createElement('section');
    sec.id = 'mv';
    sec.className = 'card hero';
    sec.innerHTML = mvPanelHtml(ui.moved, ui.id);
    const card = ui.$('#card');
    if (card && card.after) card.after(sec); else (ui.$('.col') || doc.body).appendChild(sec);
    const rm = sec.querySelector('#mv-rm'), msg = sec.querySelector('#mv-msg'), alt = sec.querySelector('.mv-alt'), copy = sec.querySelector('#mv-copy');
    rm.onclick = async () => {
        rm.disabled = true;
        msg.hidden = true;
        try {
            await ui.chrome.management.uninstallSelf({ showConfirmDialog: true }); /* This file is part of Better Vest by Astral and is protected by copyright. ref bv-05c6504a */
        } catch (e) {
            msg.className = 'msg warn';
            msg.textContent = 'Not removed, Better Vest is still here. Press Remove again, or remove it yourself:';
            msg.hidden = false;
            alt.hidden = false;
        }
        rm.disabled = false;
    };
    copy.onclick = () => {
        const done = (t) => { copy.textContent = t; };
        let p = null;
        try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(EXT_PAGE) : null; } catch (e) { p = null; }
        if (!p) { done('Type it in the address bar'); return; }
        p.then(() => done('Copied: paste it in the address bar'), () => done('Type it in the address bar'));
    };
    if (ui.hash === '#remove') {
        try { sec.scrollIntoView({ block: 'center' }); } catch (e) {}
        sec.classList.add('mv-here');
        try { rm.focus({ preventScroll: true }); } catch (e) {}
    }
    return sec;
}
