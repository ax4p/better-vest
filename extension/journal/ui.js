// Better Vest Calendar - UI primitives shared by every view.
//
//   h(tag, attrs, ...children)   DOM builder. Strings become text nodes (never HTML), so API strings are safe.
//                                attrs: class, style (string|object), dataset, on<event>, aria-*, any attribute; false/null skip.
//   icon(name, size)             inline SVG icon (currentColor). ICONS lists the names. sparkle(size) is the four-point star.
//   seg({options,value,onChange})  segmented control; el.set(value) updates it without firing onChange.
//   chip / button / kbd          small builders (see below).
//   popover(anchor, build, opts) glass popover in the layer root. anchor: Element | {x,y,width,height}.
//   hoverCard(root, sel, build)  delegated hover/focus card (350 ms delay) for tiles and cells; read-only content.
//   menuPopover / sheet / toast  dropdown host, centred modal sheet, bottom toast.
//   closeTopLayer()              Esc handler: closes the newest popover/sheet, returns true if it closed one.
//   countUp / debounce / clamp / pctText  small helpers.
//
// Views never touch innerHTML. Add new icons to ICONS (24x24 viewBox, stroke paths).

const SVG = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const k of Object.keys(attrs)) {
            const v = attrs[k];
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
            else if (k === 'dataset') Object.assign(el.dataset, v);
            else if (k === 'text') el.textContent = v;
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (v === true) el.setAttribute(k, '');
            else el.setAttribute(k, v);
        }
    }
    append(el, kids);
    return el;
}

export function append(el, kids) {
    for (const c of kids) {
        if (c == null || c === false) continue;
        if (Array.isArray(c)) append(el, c);
        else if (c instanceof Node) el.appendChild(c);
        else el.appendChild(document.createTextNode(String(c)));
    }
    return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function debounce(fn, ms) {
    let t = 0;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.cancel = () => clearTimeout(t);
    return d;
}

// ---------- icons ----------

export const ICONS = {
    chevL: ['M15 6l-6 6 6 6'],
    chevR: ['M9 6l6 6-6 6'],
    chevD: ['M6 9l6 6 6-6'],
    close: ['M6 6l12 12M18 6L6 18'],
    check: ['M5 12.5l4.5 4.5L19 7'],
    eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    eyeOff: ['M3 3l18 18', 'M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.5 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
    sync: ['M20 11a8 8 0 0 0-14.7-3M4 4.5V8h3.5', 'M4 13a8 8 0 0 0 14.7 3M20 19.5V16h-3.5'],
    expand: ['M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7'],
    collapse: ['M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7'],
    external: ['M14 4h6v6M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
    palette: ['M12 3a9 9 0 1 0 0 18c1.3 0 1.9-.8 1.9-1.7 0-1-.7-1.3-.7-2.1 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4c0-4.5-4-8.7-9-8.7z', 'M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01'],
    sliders: ['M4 7h9M17 7h3M4 17h3M11 17h9', 'M15 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
    search: ['M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M20 20l-4.5-4.5'],
    note: ['M6 4h9l3 3v13H6z', 'M9 11h6M9 15h6'],
    info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5M12 8v.01'],
    calendar: ['M5 6h14v14H5z', 'M5 10h14M9 4v4M15 4v4'],
    plus: ['M12 5v14M5 12h14'],
    key: ['M4 7h16v10H4z', 'M7 11h.01M10 11h.01M13 11h.01M16 11h.01M8 14h8']
};

export function icon(name, size = 16, cls = '') {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    for (const d of ICONS[name] || []) {
        const p = document.createElementNS(SVG, 'path');
        p.setAttribute('d', d);
        svg.appendChild(p);
    }
    return svg;
}

export const SPARKLE_PATH = 'M12 2C12.8 7.5 16.5 11.2 22 12C16.5 12.8 12.8 16.5 12 22C11.2 16.5 7.5 12.8 2 12C7.5 11.2 11.2 7.5 12 2Z';
export function sparkle(size = 12, cls = '') {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', SPARKLE_PATH);
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
    return svg;
}

// ---------- small controls ----------

export function button(label, { cls = '', onClick, title, icon: ic, kbd: key, disabled } = {}) {
    const b = h('button', { class: 'btn ' + cls, type: 'button', title, disabled, onclick: onClick },
        ic ? icon(ic, 14) : null, label != null && label !== '' ? h('span', { class: 'btn-t' }, label) : null,
        key ? h('kbd', null, key) : null);
    return b;
}

export const kbd = (t) => h('kbd', null, t);

export function chip(label, { on = false, onClick, title, cls = '', dashed = false } = {}) {
    return h('button', {
        class: 'chip' + (on ? ' on' : '') + (dashed ? ' dashed' : '') + (cls ? ' ' + cls : ''), type: 'button', title,
        'aria-pressed': onClick ? String(!!on) : null, onclick: onClick
    }, label);
}

// Segmented control. options: [{k, label, title, disabled}]
export function seg({ options, value, onChange, label, cls = '' }) {
    const root = h('div', { class: 'seg ' + cls, role: 'group', 'aria-label': label });
    const btns = new Map();
    for (const o of options) {
        const b = h('button', {
            class: 'seg-b', type: 'button', title: o.title, disabled: o.disabled, 'data-k': o.k,
            onclick: () => { if (o.disabled) return; if (o.k !== root._v) { root.set(o.k); onChange && onChange(o.k); } }
        }, o.label);
        btns.set(o.k, b);
        root.appendChild(b);
    }
    root.set = (v) => {
        root._v = v;
        for (const [k, b] of btns) { b.classList.toggle('on', k === v); b.setAttribute('aria-pressed', String(k === v)); }
    };
    root.setDisabled = (k, dis, title) => { const b = btns.get(k); if (b) { b.disabled = !!dis; if (title !== undefined) b.title = title; } };
    root.set(value);
    return root;
}

export function toggle(on, onChange, label) {
    const b = h('button', { class: 'switch' + (on ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label },
        h('i'));
    b.onclick = () => { const v = b.getAttribute('aria-checked') !== 'true'; b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); onChange(v); };
    return b;
}

export function checkbox(checked, onChange, { indeterminate = false, label } = {}) {
    const el = h('button', {
        class: 'cbx' + (checked ? ' on' : '') + (indeterminate ? ' mix' : ''), type: 'button', role: 'checkbox',
        'aria-checked': indeterminate ? 'mixed' : String(!!checked), 'aria-label': label
    }, indeterminate ? h('i', { class: 'dash' }) : icon('check', 11));
    el.onclick = (e) => { e.stopPropagation(); onChange(!checked); };
    return el;
}

// ---------- layers: popovers, sheets, toasts ----------

let layerRoot = null;
const stack = [];

function root() {
    if (layerRoot && layerRoot.isConnected) return layerRoot;
    layerRoot = document.getElementById('layers') || document.body.appendChild(h('div', { id: 'layers' }));
    return layerRoot;
}

export function closeTopLayer() {
    const top = stack[stack.length - 1];
    if (!top || top.sticky) return false;
    top.close();
    return true;
}
export const hasLayer = () => stack.some((l) => !l.sticky);
export function closeAllLayers() { while (stack.length) { const t = stack[stack.length - 1]; t.close(); } }

function anchorRect(a) {
    if (a instanceof Element) return a.getBoundingClientRect();
    return { left: a.x, top: a.y, right: a.x + (a.width || 0), bottom: a.y + (a.height || 0), width: a.width || 0, height: a.height || 0 };
}

function place(el, anchor, placement, offset) {
    const r = anchorRect(anchor);
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    el.style.left = '0px'; el.style.top = '0px';
    const w = el.offsetWidth, hh = el.offsetHeight;
    let x, y;
    const side = placement.split('-')[0], align = placement.split('-')[1] || 'start';
    if (side === 'bottom' || side === 'top') {
        y = side === 'bottom' ? r.bottom + offset : r.top - hh - offset;
        if (side === 'bottom' && y + hh > vh - 8 && r.top - hh - offset > 8) y = r.top - hh - offset;
        if (side === 'top' && y < 8 && r.bottom + hh + offset < vh) y = r.bottom + offset;
        x = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
    } else {
        x = side === 'right' ? r.right + offset : r.left - w - offset;
        if (side === 'right' && x + w > vw - 8 && r.left - w - offset > 8) x = r.left - w - offset;
        if (side === 'left' && x < 8 && r.right + w + offset < vw) x = r.right + offset;
        y = align === 'end' ? r.bottom - hh : align === 'center' ? r.top + r.height / 2 - hh / 2 : r.top;
    }
    x = clamp(x, 8, Math.max(8, vw - w - 8));
    y = clamp(y, 8, Math.max(8, vh - hh - 8));
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
}

// build(el, api) fills el. api: {close, reposition}. Returns {el, close, reposition}.
export function popover(anchor, build, { placement = 'bottom-start', offset = 8, width, cls = '', modal = false, onClose, passive = false, role = 'dialog' } = {}) {
    const el = h('div', { class: 'pop ' + cls, role: passive ? 'tooltip' : role });
    if (width) el.style.width = typeof width === 'number' ? width + 'px' : width;
    if (passive) el.style.pointerEvents = 'none';
    let closed = false;
    const api = {
        el,
        reposition: () => place(el, anchor, placement, offset),
        close: () => {
            if (closed) return;
            closed = true;
            const i = stack.indexOf(entry);
            if (i >= 0) stack.splice(i, 1);
            document.removeEventListener('pointerdown', outside, true);
            window.removeEventListener('resize', api.close);
            el.classList.remove('in');
            el.classList.add('out');
            setTimeout(() => el.remove(), 120);
            if (onClose) onClose();
        }
    };
    const outside = (e) => {
        if (el.contains(e.target)) return;
        if (anchor instanceof Element && anchor.contains(e.target)) return;
        // clicks inside another popover (a nested menu) do not dismiss this one
        if (e.target.closest && e.target.closest('.pop') && stack[stack.length - 1] !== entry) return;
        api.close();
    };
    const entry = { close: api.close, sticky: passive };
    root().appendChild(el);
    build(el, api);
    place(el, anchor, placement, offset);
    requestAnimationFrame(() => el.classList.add('in'));
    if (!passive) {
        stack.push(entry);
        setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
        window.addEventListener('resize', api.close);
    }
    return api;
}

// Delegated hover/focus card. build(target, el) returns false to skip. Read-only content.
export function hoverCard(container, selector, build, { delay = 350, placement = 'bottom-start', cls = '', width } = {}) {
    let timer = 0, cur = null, active = null;
    const hide = () => { clearTimeout(timer); timer = 0; if (cur) { cur.close(); cur = null; } active = null; };
    const show = (target, instant) => {
        if (target === active) return;
        hide();
        active = target;
        const run = () => {
            if (!target.isConnected) return;
            let ok = true;
            const p = popover(target, (el, api) => { ok = build(target, el, api) !== false; }, { passive: true, placement, cls: 'hover ' + cls, width, offset: 6 });
            if (!ok) { p.el.remove(); return; }
            cur = p;
        };
        if (instant || document.querySelector('.pop.hover.in')) run();
        else timer = setTimeout(run, delay);
    };
    const onOver = (e) => {
        const t = e.target.closest && e.target.closest(selector);
        if (t && container.contains(t)) show(t); else if (active) hide();
    };
    const onFocus = (e) => { const t = e.target.closest && e.target.closest(selector); if (t) show(t, true); };
    container.addEventListener('pointerover', onOver);
    container.addEventListener('pointerleave', hide);
    container.addEventListener('focusin', onFocus);
    container.addEventListener('focusout', hide);
    container.addEventListener('pointerdown', hide);
    // views mount onto a shared root, so they must remove these on unmount
    const destroy = () => {
        hide();
        container.removeEventListener('pointerover', onOver);
        container.removeEventListener('pointerleave', hide);
        container.removeEventListener('focusin', onFocus);
        container.removeEventListener('focusout', hide);
        container.removeEventListener('pointerdown', hide);
    };
    return { hide, destroy };
}

// Centred modal with a scrim. build(body, api) fills the body.
export function sheet(build, { title, width = 560, onClose } = {}) {
    const scrim = h('div', { class: 'scrim' });
    const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { width: width + 'px' } });
    const body = h('div', { class: 'sheet-body' });
    let closed = false;
    const api = {
        close: () => {
            if (closed) return;
            closed = true;
            const i = stack.indexOf(entry);
            if (i >= 0) stack.splice(i, 1);
            scrim.classList.remove('in');
            setTimeout(() => scrim.remove(), 150);
            if (onClose) onClose();
        }
    };
    const entry = { close: api.close };
    box.append(
        h('div', { class: 'sheet-head' }, h('b', null, title || ''), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: api.close }, icon('close', 16))),
        body);
    scrim.appendChild(box);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) api.close(); });
    root().appendChild(scrim);
    build(body, api);
    stack.push(entry);
    requestAnimationFrame(() => scrim.classList.add('in'));
    return api;
}

let toastTimer = 0;
export function toast(message, { ms = 3800, tone = 'info' } = {}) {
    let t = document.getElementById('toast');
    if (!t) t = root().appendChild(h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }));
    t.className = 'toast ' + tone;
    t.textContent = message;
    requestAnimationFrame(() => t.classList.add('in'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('in'), ms);
}

// ---------- motion ----------

export const reducedMotion = () => document.documentElement.hasAttribute('data-reduce-motion') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Animates a number into el using fmt(v). Skips when motion is reduced or the change is trivial.
export function countUp(el, from, to, fmt, ms = 360) {
    if (reducedMotion() || from == null || to == null || Math.abs(to - from) < 0.01) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
