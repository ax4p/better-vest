// Better Vest Calendar - helpers shared by the Stats, Trades, Payouts and Accounts views.
//
//   shortName(a, accountName)     'Funded 21 · cca3' style label for tables (full name goes in a title)
//   capitalBase(list, byId)       {total, avg, n}: capital of the distinct accounts behind a list of trades
//   median / pctOf                small maths
//   popBase / dl / foot           hover-card building blocks (same look as the Calendar's cards)
//   vgrid({...})                  virtualized grid: sticky header, pooled rows, optional expandable detail
//   chartBox({height, draw})      responsive chart host: draw(host, width, height) re-runs when the width changes
//   barChart / hbars              vertical SVG bars and horizontal HTML bars with hover-card hooks
//   goTab(ctx, id)                switch tab through the shell's own tab button so the top bar stays in sync
//
// Every API string reaches the DOM through h() (textContent), never innerHTML.

import { h, clear } from '../ui.js';
import { svg, scale } from '../charts.js';

export const median = (arr) => {
    const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export const pctOf = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
export const sideCls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');

export function shortName(a, accountName) {
    if (!a) return '?';
    if (a.kind === 'primary') return 'Primary';
    const parts = accountName(a).split(' · ');
    let head = parts[0] || '';
    const bar = head.indexOf('|');
    if (bar > -1) {
        // '500 Vest Capital Instant Funded | 500': the tier after the bar repeats the size, so drop it
        const size = head.split(/\s+/)[0], tier = head.slice(bar + 1).trim();
        const same = tier.replace(/[$,\s]/g, '').toUpperCase() === size.replace(/[$,\s]/g, '').toUpperCase();
        head = tier && !same ? size + ' ' + tier : size;
    }
    return [head, parts[1], parts[2]].filter(Boolean).join(' · ');
}

export function capitalBase(list, accountsById) {
    const seen = new Set();
    let total = 0;
    for (const t of list) {
        if (seen.has(t.accountId)) continue;
        seen.add(t.accountId);
        const a = accountsById.get(t.accountId);
        if (a && a.kind === 'capital' && a.initialCapital > 0) total += a.initialCapital;
    }
    return { total, n: seen.size, avg: seen.size && total ? total / seen.size : 0 };
}

export function goTab(ctx, id) {
    const i = ctx.TABS.findIndex((t) => t.id === id);
    const btn = document.querySelectorAll('.topbar .tab')[i];
    if (btn) btn.click(); else ctx.set({ tab: id });
}

export function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

// ---------- hover-card blocks ----------

export function popBase(el, title, sub, { low = false } = {}) {
    el.appendChild(h('h4', null, title, low ? h('span', { class: 'tag' }, 'low sample') : null));
    if (sub) el.appendChild(h('div', { class: 'sub' }, sub));
}
export function dl(el, rows) {
    const d = h('dl');
    for (const [k, v, cls] of rows) { if (v == null) continue; d.appendChild(h('dt', null, k)); d.appendChild(h('dd', { class: cls || '' }, v)); }
    el.appendChild(d);
}
export function foot(el, ...lines) {
    const l = lines.filter(Boolean);
    if (l.length) el.appendChild(h('div', { class: 'foot' }, l.map((x) => h('span', null, x))));
}

// Registry of hover-card builders keyed by a short id; views stamp data-vtip="id" on elements.
export function tipRegistry() {
    const map = new Map();
    let seq = 0;
    return {
        add(fn) { const id = 't' + (++seq); map.set(id, fn); return id; },
        build(id, el) { const fn = map.get(id); return fn ? fn(el) : false; },
        reset() { map.clear(); seq = 0; }
    };
}

// ---------- virtualized grid ----------
//
// head: [{key, label, cls, sortable, title}]   template: CSS grid-template-columns shared by header and rows
// renderRow(item, i) -> array of cell contents (Node | string), one per head entry
// detail(item, i) -> Node shown under an expanded row (fixed detailH); rowKey(item, i) keeps expansion across sorts
// virtual:false renders every row (small lists keep find-in-page and natural height)

export function vgrid({ template, head, rowH = 28, headH = 30, renderRow, rowKey, detail, detailH = 0, rowCls, onRow, onSort, virtual = true, label, empty, minWidth }) {
    const scroller = h('div', { class: 'vg', role: 'table', 'aria-label': label });
    const headEl = h('div', { class: 'vg-head', role: 'row', style: { gridTemplateColumns: template, height: headH + 'px' } });
    const body = h('div', { class: 'vg-body', role: 'rowgroup' });
    const inner = h('div', { class: 'vg-in', style: minWidth ? { minWidth: minWidth + 'px' } : null }, headEl, body);
    scroller.appendChild(inner);
    const heads = new Map();
    for (const c of head) {
        const cell = h('div', { class: 'vh ' + (c.cls || ''), role: 'columnheader', title: c.title });
        if (c.sortable && onSort) {
            const b = h('button', { class: 'vh-b', type: 'button', onclick: () => onSort(c.key) }, h('span', null, c.label), h('i', { class: 'arr', 'aria-hidden': 'true' }));
            cell.appendChild(b);
        } else cell.appendChild(h('span', null, c.label));
        heads.set(c.key, cell);
        headEl.appendChild(cell);
    }
    let rows = [], offs = new Float64Array(1), live = new Map(), expanded = new Set();
    let raf = 0;
    const keyOf = (i) => (rowKey ? rowKey(rows[i], i) : i);

    function layout() {
        const n = rows.length;
        offs = new Float64Array(n + 1);
        for (let i = 0; i < n; i++) offs[i + 1] = offs[i] + rowH + (detail && expanded.has(keyOf(i)) ? detailH : 0);
        body.style.height = offs[n] + 'px';
    }
    function find(y) {
        let lo = 0, hi = rows.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (offs[mid + 1] <= y) lo = mid + 1; else hi = mid; }
        return lo;
    }
    function buildRow(i) {
        const item = rows[i];
        const open = !!(detail && expanded.has(keyOf(i)));
        const cells = renderRow(item, i);
        const line = h('div', { class: 'vr-line', style: { gridTemplateColumns: template, height: rowH + 'px' } },
            cells.map((c, ci) => h('div', { class: 'vc ' + (head[ci].cls || ''), role: 'cell' }, c)));
        const extra = rowCls ? rowCls(item, i) : '';
        const el = h('div', {
            class: 'vr' + (i % 2 ? ' alt' : '') + (open ? ' open' : '') + (extra ? ' ' + extra : ''), role: 'row', tabindex: detail || onRow ? 0 : null,
            'aria-expanded': detail ? String(open) : null,
            style: { transform: `translateY(${offs[i]}px)`, height: (offs[i + 1] - offs[i]) + 'px' }
        }, line);
        if (open) el.appendChild(h('div', { class: 'vr-detail', style: { height: detailH + 'px', top: rowH + 'px' } }, detail(item, i)));
        el.addEventListener('click', (e) => {
            if (e.target.closest('button, a, input, select, textarea')) return;
            if (detail) toggle(i);
            if (onRow) onRow(item, i, e);
        });
        el.addEventListener('keydown', (e) => {
            if (e.target !== el) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (detail) toggle(i); if (onRow) onRow(item, i, e); }
        });
        return el;
    }
    function render() {
        raf = 0;
        const n = rows.length;
        const st = scroller.scrollTop, vh = scroller.clientHeight || 640;
        let i0 = 0, i1 = n;
        if (virtual) { i0 = Math.max(0, find(st) - 6); i1 = Math.min(n, find(st + vh) + 8); }
        for (const [i, el] of live) if (i < i0 || i >= i1) { el.remove(); live.delete(i); }
        for (let i = i0; i < i1; i++) if (!live.has(i)) { const el = buildRow(i); live.set(i, el); body.appendChild(el); }
    }
    function repaint() { for (const el of live.values()) el.remove(); live.clear(); render(); }
    function toggle(i) {
        const k = keyOf(i);
        if (expanded.has(k)) expanded.delete(k); else expanded.add(k);
        layout();
        repaint();
        const el = live.get(i);
        if (el) el.focus({ preventScroll: true });
    }
    let lastTop = 0;   // tracked from scroll events so resetting never forces a layout
    scroller.addEventListener('scroll', () => { lastTop = scroller.scrollTop; if (!raf) raf = requestAnimationFrame(render); }, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(render); }) : null;
    if (ro) ro.observe(scroller);
    const emptyEl = h('div', { class: 'vg-empty' }, empty || 'Nothing to show');
    return {
        el: scroller,
        setRows(next) {
            rows = next;
            layout();
            repaint();
            emptyEl.remove();
            if (!rows.length) body.appendChild(emptyEl);
            body.style.minHeight = rows.length ? '' : '96px';
        },
        refresh: repaint,
        setSort(key, dir) {
            for (const [k, cell] of heads) {
                cell.classList.toggle('sorted', k === key);
                cell.setAttribute('aria-sort', k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none');
                cell.dataset.dir = k === key ? (dir > 0 ? 'asc' : 'desc') : '';
            }
        },
        setHeight(px) { scroller.style.height = px == null ? '' : px + 'px'; if (!raf) raf = requestAnimationFrame(render); },
        totalHeight: () => offs[rows.length] + headH,
        scrollToTop() { if (lastTop) scroller.scrollTop = 0; },
        destroy() { if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); }
    };
}

// ---------- charts ----------

export function chartBox({ height = 180, draw }) {
    const el = h('div', { class: 'cbox', style: { height: height + 'px' } });
    let w = 0;
    const run = () => {
        const nw = el.clientWidth;
        if (!nw) return;
        w = nw;
        clear(el);
        draw(el, nw, height);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 1) run(); }) : null;
    if (ro) ro.observe(el);
    el.redraw = () => { w = 0; run(); };
    el.destroy = () => { if (ro) ro.disconnect(); };
    return el;
}

const f1 = (n) => (Math.round(n * 10) / 10).toString();

// Vertical signed bars. data: [{label, v, tip?(el), x?}] ; ctx-free: callers pass formatters.
//   yLabel(v) -> text or null (omit the axis labels, e.g. with Hide $)     tipId(d, i) -> data-vtip id or null
//   every: label stride (auto when omitted)    zeroLine always drawn when negatives exist
export function barChart({ data, height = 170, yLabel, tipId, every, pad = { l: 6, r: 6, t: 12, b: 22 }, cls = '', gapRatio = 0.28, vlines = [] }) {
    return chartBox({
        height,
        draw(host, W, H) {
            const hasY = !!yLabel;
            const M = { ...pad, l: hasY ? 46 : pad.l };
            const vals = data.map((d) => d.v || 0);
            const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
            const span = hi - lo || 1;
            const y = scale(lo - (lo < 0 ? span * 0.04 : 0), hi + span * 0.06, H - M.b, M.t);
            const n = data.length;
            const slot = (W - M.l - M.r) / Math.max(1, n);
            const bw = Math.max(2, Math.min(46, slot * (1 - gapRatio)));
            const root = svg('svg', { class: 'bchart ' + cls, width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
            const y0 = y(0);
            // light gridlines at the extremes
            if (hasY) {
                const ticks = hi > 0 && lo < 0 ? [0, hi, lo] : hi > 0 ? [0, hi, hi / 2] : [0, lo, lo / 2];
                const placed = [];
                for (const t of ticks) {
                    const ty = y(t);
                    root.appendChild(svg('line', { class: t === 0 ? 'ch-zero' : 'ch-grid', x1: M.l, x2: W - M.r, y1: f1(ty), y2: f1(ty) }));
                    const txt = yLabel(t);
                    // a label too close to one already drawn is skipped (a tiny loss next to $0 would overprint it)
                    if (txt != null && !placed.some((p) => Math.abs(p - ty) < 13)) { placed.push(ty); root.appendChild(svg('text', { class: 'ch-axis', x: M.l - 6, y: f1(ty + 3.5), 'text-anchor': 'end' }, txt)); }
                }
            } else root.appendChild(svg('line', { class: 'ch-zero', x1: M.l, x2: W - M.r, y1: f1(y0), y2: f1(y0) }));
            const stride = every || Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - M.l - M.r) / 46))));
            data.forEach((d, i) => {
                const cx = M.l + slot * i + slot / 2;
                const yy = y(d.v || 0);
                const hgt = Math.max(d.v ? 1.5 : 0, Math.abs(yy - y0));
                const attrs = {
                    class: 'cb ' + (d.cls || ((d.v || 0) >= 0 ? 'up' : 'dn')) + (d.v ? '' : ' nil'), x: f1(cx - bw / 2), width: f1(bw),
                    y: f1((d.v || 0) >= 0 ? y0 - hgt : y0), height: f1(hgt), rx: Math.min(3, bw / 2)
                };
                const id = tipId ? tipId(d, i) : null;
                if (id) { attrs['data-vtip'] = id; attrs.tabindex = 0; }
                root.appendChild(svg('rect', attrs));
                if (i % stride === 0) root.appendChild(svg('text', { class: 'ch-axis', x: f1(cx), y: H - 6, 'text-anchor': 'middle' }, d.label));
            });
            // vertical guides at fractional slot positions, e.g. zero and the median on a histogram
            for (const v of vlines) {
                const vx = M.l + slot * v.pos;
                root.appendChild(svg('line', { class: 'ch-guide' + (v.cls ? ' ' + v.cls : ''), x1: f1(vx), x2: f1(vx), y1: M.t - 4, y2: H - M.b }));
                if (v.label) root.appendChild(svg('text', { class: 'ch-axis ch-vl', x: f1(vx + (v.anchor === 'end' ? -4 : 4)), y: M.t + 6, 'text-anchor': v.anchor === 'end' ? 'end' : 'start' }, v.label));
            }
            host.appendChild(root);
        }
    });
}

// Horizontal bars as HTML rows. rows: [{label, title?, sub?, bars:[{v, cls}], right, tip}]
export function hbars({ rows, max, tipId }) {
    let mp = 0, mn = 0;
    for (const r of rows) for (const b of r.bars) { if (b.v > mp) mp = b.v; if (b.v < mn) mn = b.v; }
    if (max) { mp = Math.max(mp, max); }
    const span = mp - mn || 1;
    const zero = (-mn / span) * 100;
    const root = h('div', { class: 'hb' });
    for (const r of rows) {
        const id = tipId ? tipId(r) : null;
        const track = h('div', { class: 'hb-track' + (r.bars.length > 1 ? ' two' : '') }, h('i', { class: 'hb-zero', style: { left: zero + '%' } }));
        for (const b of r.bars) {
            const w = Math.abs(b.v) / span * 100;
            track.appendChild(h('i', { class: 'hb-bar ' + (b.v >= 0 ? 'up' : 'dn') + (b.cls ? ' ' + b.cls : ''), style: { left: (b.v >= 0 ? zero : zero - w) + '%', width: Math.max(b.v ? 0.6 : 0, w) + '%' } }));
        }
        root.appendChild(h('div', { class: 'hb-row', 'data-vtip': id, tabindex: id ? 0 : null },
            h('div', { class: 'hb-l', title: r.title || r.label }, r.label), track, h('div', { class: 'hb-r' }, r.right)));
    }
    return root;
}

// Ticks for a numeric axis: ~n values spanning [lo, hi] on round numbers.
export function niceTicks(lo, hi, n = 4) {
    if (!(hi > lo)) return [lo];
    const raw = (hi - lo) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
}
