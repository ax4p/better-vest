// Better Vest Calendar - hand-rolled SVG charts. Colours come from CSS (classes below), never from data.
//
//   svg(tag, attrs, ...kids)         SVG element builder (attrs set with setAttribute)
//   scale(d0, d1, r0, r1)            linear scale function
//   sparkline({values, w, h, ...})   smooth line with area fill, optional markers/zero line
//   bars({values, w, h, ...})        signed bars around a zero line
//   stepCurve({points, start, end, ...})   cumulative step chart with shared crosshair (day drawer)
//
// CSS hooks (journal.css): .ch-line .ch-area .ch-zero .ch-grid .ch-axis .ch-dot.up/.dn .ch-cross .ch-band .ch-reset .ch-star

const NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const k of Object.keys(attrs)) if (attrs[k] != null && attrs[k] !== false) el.setAttribute(k, attrs[k]);
    for (const c of kids) if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
}

export function scale(d0, d1, r0, r1) {
    const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
    return (v) => r0 + (v - d0) * k;
}

const f = (n) => (Math.round(n * 10) / 10).toString();

// Smooth monotone-ish path through points [[x,y],...] (Catmull-Rom to Bezier, tension 0.5).
export function smoothPath(pts) {
    if (pts.length < 2) return pts.length ? `M${f(pts[0][0])} ${f(pts[0][1])}` : '';
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
}

let gradId = 0;

// values: numbers (cumulative series). markers: [{i, cls}] drawn as dots/stars on the line.
export function sparkline({ values, w = 240, h = 48, pad = 4, markers = [], cls = '', zero = true, smooth = true, area = true }) {
    const root = svg('svg', { class: 'spark ' + cls, width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' });
    if (!values.length) return root;
    const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
    const y = scale(lo, hi === lo ? lo + 1 : hi, h - pad, pad);
    const x = scale(0, Math.max(1, values.length - 1), pad, w - pad);
    const pts = values.map((v, i) => [x(i), y(v)]);
    const id = 'sg' + (++gradId);
    const up = values[values.length - 1] >= 0;
    root.appendChild(svg('defs', null,
        svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
            svg('stop', { offset: '0', 'stop-color': 'var(--ch-c)', 'stop-opacity': '.28' }),
            svg('stop', { offset: '1', 'stop-color': 'var(--ch-c)', 'stop-opacity': '0' }))));
    root.style.setProperty('--ch-c', up ? 'var(--ax-up)' : 'var(--ax-down)');
    const d = smooth ? smoothPath(pts) : 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L');
    if (zero && lo < 0) root.appendChild(svg('line', { class: 'ch-zero', x1: pad, x2: w - pad, y1: f(y(0)), y2: f(y(0)) }));
    if (area) root.appendChild(svg('path', { d: `${d}L${f(pts[pts.length - 1][0])} ${f(y(0))}L${f(pts[0][0])} ${f(y(0))}Z`, fill: `url(#${id})`, stroke: 'none' }));
    root.appendChild(svg('path', { class: 'ch-line', d }));
    for (const m of markers) if (pts[m.i]) root.appendChild(svg('circle', { class: 'ch-dot ' + (m.cls || ''), cx: f(pts[m.i][0]), cy: f(pts[m.i][1]), r: m.r || 2.6 }));
    root._x = x; root._y = y; root._pts = pts;
    return root;
}

// values: signed numbers. Positive up (green), negative down (red), zero line in the middle.
export function bars({ values, w = 240, h = 48, gap = 2, cls = '', pad = 2 }) {
    const root = svg('svg', { class: 'bars ' + cls, width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' });
    if (!values.length) return root;
    const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
    const y = scale(lo, hi === lo ? lo + 1 : hi, h - pad, pad);
    const bw = Math.max(2, (w - pad * 2 - gap * (values.length - 1)) / values.length);
    const y0 = y(0);
    values.forEach((v, i) => {
        const yy = y(v);
        root.appendChild(svg('rect', {
            class: v >= 0 ? 'ch-bar up' : 'ch-bar dn', x: f(pad + i * (bw + gap)), width: f(bw),
            y: f(Math.min(y0, yy)), height: f(Math.max(1, Math.abs(yy - y0))), rx: Math.min(2, bw / 2)
        }));
    });
    return root;
}

// points: [{ts, cum, net, id}] sorted by ts (cum = running net for the day, starting from the first trade).
// Returns {el, setActive(i|null), redraw()}. onHover(i|null, source) fires on pointer movement over the chart.
export function stepCurve({ points, start, end, height = 150, fmtMoney, fmtTime, resetTimes = [], resetLabel = '20:00 ET', session = null, onHover, onClick }) {
    const wrap = document.createElement('div');
    wrap.className = 'curve';
    const tip = document.createElement('div');
    tip.className = 'curve-tip';
    wrap.appendChild(tip);
    let svgEl = null, width = 0, geom = null, active = null;
    const M = { l: 8, r: 8, t: 14, b: 22 };

    const draw = () => {
        width = Math.max(120, wrap.clientWidth || 360);
        if (svgEl) svgEl.remove();
        svgEl = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Cumulative net by close time' });
        wrap.insertBefore(svgEl, tip);
        if (!points.length) { geom = null; return; }
        const first = points[0].ts, last = points[points.length - 1].ts;
        const span = Math.max(30 * 60e3, last - first);
        const t0 = Math.max(start, Math.floor((first - span * 0.12) / 36e5) * 36e5);
        const t1 = Math.min(end, Math.ceil((last + span * 0.12) / 36e5) * 36e5);
        const vals = points.map((p) => p.cum);
        const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
        const pad = (hi - lo || 1) * 0.12;
        const x = scale(t0, Math.max(t1, t0 + 1), M.l, width - M.r);
        const y = scale(lo - (lo < 0 ? pad : 0), hi + pad, height - M.b, M.t);
        geom = { x, y, t0, t1 };

        const g = svg('g');
        svgEl.appendChild(g);
        if (session && session.start >= t0 - 1 && session.end <= t1 + 1 || session && session.end > t0 && session.start < t1) {
            const a = Math.max(t0, session.start), b = Math.min(t1, session.end);
            g.appendChild(svg('rect', { class: 'ch-band', x: f(x(a)), width: f(x(b) - x(a)), y: M.t - 6, height: height - M.t - M.b + 6, rx: 4 }));
            g.appendChild(svg('text', { class: 'ch-axis', x: f(x(a) + 6), y: M.t + 6 }, session.label || 'RTH'));
        }
        // horizontal hairlines at 0 and the extremes
        g.appendChild(svg('line', { class: 'ch-zero', x1: M.l, x2: width - M.r, y1: f(y(0)), y2: f(y(0)) }));
        for (const rt of resetTimes) {
            if (rt <= t0 || rt >= t1) continue;
            g.appendChild(svg('line', { class: 'ch-reset', x1: f(x(rt)), x2: f(x(rt)), y1: M.t - 6, y2: height - M.b }));
            g.appendChild(svg('text', { class: 'ch-axis ch-reset-t', x: f(x(rt) + 4), y: M.t + 4 }, resetLabel));
        }
        // step path
        let d = `M${f(x(t0))} ${f(y(0))}`, px = x(t0), py = y(0);
        for (const p of points) {
            const xx = x(p.ts), yy = y(p.cum);
            d += `L${f(xx)} ${f(py)}L${f(xx)} ${f(yy)}`;
            px = xx; py = yy;
        }
        d += `L${f(x(t1))} ${f(py)}`;
        const gid = 'stp' + (++gradId);
        svgEl.appendChild(svg('defs', null, svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
            svg('stop', { offset: '0', 'stop-color': 'var(--ax-accent)', 'stop-opacity': '.22' }),
            svg('stop', { offset: '1', 'stop-color': 'var(--ax-accent)', 'stop-opacity': '0' }))));
        g.appendChild(svg('path', { d: `${d}L${f(x(t1))} ${f(y(0))}L${f(x(t0))} ${f(y(0))}Z`, fill: `url(#${gid})`, stroke: 'none' }));
        g.appendChild(svg('path', { class: 'ch-line glow', d }));
        g.appendChild(svg('path', { class: 'ch-line', d }));
        // trade dots (colour = sign of that trade's net)
        points.forEach((p, i) => {
            g.appendChild(svg('circle', { class: 'ch-dot ' + (p.net > 0 ? 'up' : p.net < 0 ? 'dn' : ''), 'data-i': i, cx: f(x(p.ts)), cy: f(y(p.cum)), r: 3 }));
        });
        // axis: start, end labels and extremes
        g.appendChild(svg('text', { class: 'ch-axis', x: M.l, y: height - 6 }, fmtTime(t0)));
        g.appendChild(svg('text', { class: 'ch-axis', x: width - M.r, y: height - 6, 'text-anchor': 'end' }, fmtTime(t1)));
        const mid = (t0 + t1) / 2;
        if (t1 - t0 > 3 * 36e5) g.appendChild(svg('text', { class: 'ch-axis', x: f(x(mid)), y: height - 6, 'text-anchor': 'middle' }, fmtTime(Math.round(mid / 36e5) * 36e5)));
        const peak = Math.max(...vals), trough = Math.min(...vals);
        if (peak > 0) g.appendChild(svg('text', { class: 'ch-axis ch-peak', x: width - M.r, y: f(y(peak) - 5), 'text-anchor': 'end' }, fmtMoney(peak)));
        if (trough < 0) g.appendChild(svg('text', { class: 'ch-axis ch-peak', x: width - M.r, y: f(y(trough) + 12 > height - M.b - 2 ? y(trough) - 7 : y(trough) + 12), 'text-anchor': 'end' }, fmtMoney(trough)));
        // crosshair (positioned by setActive)
        const cross = svg('g', { class: 'ch-cross', visibility: 'hidden' },
            svg('line', { y1: M.t - 6, y2: height - M.b }), svg('circle', { r: 5 }));
        svgEl.appendChild(cross);
        svgEl._cross = cross;
        setActive(active);
    };

    const nearest = (clientX) => {
        const r = svgEl.getBoundingClientRect();
        const ts = geom.t0 + ((clientX - r.left - M.l) / (width - M.l - M.r)) * (geom.t1 - geom.t0);
        let best = 0, bd = Infinity;
        for (let i = 0; i < points.length; i++) { const dd = Math.abs(points[i].ts - ts); if (dd < bd) { bd = dd; best = i; } }
        return best;
    };

    function setActive(i) {
        active = i;
        if (!svgEl || !svgEl._cross) return;
        const cross = svgEl._cross;
        svgEl.querySelectorAll('.ch-dot.hot').forEach((n) => n.classList.remove('hot'));
        if (i == null || !geom || !points[i]) { cross.setAttribute('visibility', 'hidden'); tip.classList.remove('on'); return; }
        const p = points[i];
        const cx = geom.x(p.ts), cy = geom.y(p.cum);
        cross.setAttribute('visibility', 'visible');
        cross.querySelector('line').setAttribute('x1', f(cx));
        cross.querySelector('line').setAttribute('x2', f(cx));
        cross.querySelector('circle').setAttribute('cx', f(cx));
        cross.querySelector('circle').setAttribute('cy', f(cy));
        const dot = svgEl.querySelector(`.ch-dot[data-i="${i}"]`);
        if (dot) dot.classList.add('hot');
        tip.textContent = `${fmtTime(p.ts, true)}  ${fmtMoney(p.net, true)}  ·  day ${fmtMoney(p.cum, true)}`;
        tip.classList.add('on');
        const tw = tip.offsetWidth;
        tip.style.left = Math.round(Math.min(width - tw - 4, Math.max(4, cx - tw / 2))) + 'px';
    }

    wrap.addEventListener('pointermove', (e) => { if (geom && points.length) { const i = nearest(e.clientX); setActive(i); onHover && onHover(i, 'chart'); } });
    wrap.addEventListener('pointerleave', () => { setActive(null); onHover && onHover(null, 'chart'); });
    wrap.addEventListener('click', (e) => { if (geom && points.length && onClick) onClick(nearest(e.clientX)); });

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (wrap.clientWidth && Math.abs(wrap.clientWidth - width) > 1) draw(); }) : null;
    ro && ro.observe(wrap);
    wrap.style.height = height + 'px';
    requestAnimationFrame(draw);
    draw();
    return { el: wrap, setActive, redraw: draw, destroy: () => ro && ro.disconnect() };
}
