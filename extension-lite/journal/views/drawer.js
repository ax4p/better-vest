// Better Vest Calendar - the day drawer, docked on the right of any view (420 px, `e` widens to 720, Esc closes).
// mount(root, ctx) -> {update(ctx), unmount()}; it opens when ctx.state.day is set. Any view can call
// ctx.openDrawer(dayKey). Content: Vest-day window, tiles, cumulative step curve (shared crosshair with the table),
// trades table with expandable rows, events, and the day note (text, tags, mood, plan followed).

import { stepCurve } from '../charts.js';

const MOODS = [{ k: '-1', label: '−', title: 'Bad day' }, { k: '0', label: '0', title: 'Neutral' }, { k: '1', label: '+', title: 'Good day' }];
const PLAN = [{ k: '', label: '—', title: 'Not rated' }, { k: 'y', label: 'Yes' }, { k: 'n', label: 'No' }];
const EXIT_SHORT = { 'Take Profit': 'TP', 'Stop Loss': 'SL', 'Self-requested': 'Manual', Liquidation: 'Liq', 'Corporate Action': 'Corp', 'Auto Deleverage': 'ADL' };

export function mount(root, ctx) {
    const { h, ui, time: T, stats, fmt, model } = ctx;
    const { icon } = ui;
    const inner = h('div', { class: 'drawer-in' });
    root.appendChild(inner);
    let sig = '';
    let curve = null;
    let rows = [];     // [{tr, i}] for the crosshair link
    let clearTimer = 0;

    root.addEventListener('keydown', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
        if (e.key === 'ArrowLeft') { step(-1, e.shiftKey); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { step(1, e.shiftKey); e.preventDefault(); }
    });

    function step(dir, every) {
        const st = ctx.state;
        const D = ctx.derived();
        let key = null;
        if (every) {
            key = T.addDays(st.day, dir);
            if (key > ctx.todayKey()) key = null;
        } else {
            const keys = [...D.days.keys()].filter((k) => k <= ctx.todayKey()).sort();
            key = dir < 0 ? keys.filter((k) => k < st.day).pop() : keys.find((k) => k > st.day);
        }
        if (key) {
            if (!key.startsWith(st.month)) ctx.set({ day: key, month: key.slice(0, 7), sel: null }); else ctx.openDrawer(key);
        }
    }

    const shortAcct = (a) => {
        if (!a) return '?';
        if (a.kind === 'primary') return 'Primary';
        const parts = model.accountName(a).split(' · ');
        const num = (parts[1] || '').match(/\d+/);
        return (a.phase === 'eval' ? 'E' : a.phase === 'funded' ? 'F' : a.phase === 'instant' ? 'I' : 'P') + (num ? num[0] : '') + ' ' + (parts[2] || '');
    };
    const side = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
    const money = (v, o) => fmt.usd(v, { ctx: 'table', ...o });
    const pctOf = (x) => (x == null ? '—' : Math.round(x * 100) + '%');

    function windowLines(key) {
        const st = ctx.state;
        const w = T.dayWindow(key, st.mode);
        const loc = (ts) => { const d = new Date(ts); return `${T.fmtDate(T.keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate()), 'short')} ${T.fmtTimeLocal(ts)}`; };
        const tz = (ts) => new Date(ts).toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
        const label = st.mode === 'vest' ? 'Vest day' : st.mode === 'cme' ? 'CME day' : st.mode === 'et' ? 'ET day' : 'Local day';
        if (st.mode === 'local') {
            // a local day is shown on the local clock, with its time zone
            return { lines: [h('div', null, label + ' · ', h('b', null, `${loc(w.start)} → ${loc(w.end)}`), ' ' + tz(w.end))], hours: w.hours, w };
        }
        const etA = `${T.fmtDate(T.etDateKey(w.start), 'short')} ${T.fmtTimeET(w.start, { seconds: false })}`;
        const etB = `${T.fmtDate(T.etDateKey(w.end), 'short')} ${T.fmtTimeET(w.end, { seconds: false })}`;
        const lines = [h('div', null, label + ' · ', h('b', null, `${etA} → ${etB}`), ' ET')];
        if (Intl.DateTimeFormat().resolvedOptions().timeZone !== T.ET) {
            lines.push(h('div', null, 'your time · ' + loc(w.start) + ' → ' + loc(w.end) + ' ' + tz(w.end)));
        }
        return { lines, hours: w.hours, w };
    }

    function tile(label, value, sub, cls = '', wideOnly = false) {
        return h('div', { class: wideOnly ? 'x-tile' : null, style: wideOnly && !ctx.state.wide ? 'display:none' : null },
            h('div', { class: 'lab' }, label), h('div', { class: 'v ' + cls }, value), h('div', { class: 's' }, sub || ' '));
    }

    function eventsFor(key, D) {
        const st = ctx.state;
        const out = [];
        const pay = D.payDays.get(key);
        if (pay) {
            for (const p of pay.items) {
                const a = D.accountsById.get(p.accountId);
                const verb = p.status === 'EXECUTED' ? 'Payout executed' : p.status === 'PROCESSING' ? 'Payout requested · processing' : p.status === 'REFUNDED' ? 'Payout refunded' : 'Payout failed';
                out.push({ gold: p.status === 'EXECUTED' || p.status === 'PROCESSING', icon: 'sparkle', text: `${verb} · ${money(p.net, { sign: false })} net`, sub: shortAcct(a) });
            }
        }
        const phases = { funded: ['funded', 'instant'], eval: ['eval'], primary: ['primary'] }[st.scope];
        for (const a of ctx.data.accounts) {
            if (a.kind === 'primary') continue;
            if (phases && !phases.includes(a.phase)) continue;
            if (st.accounts && !st.accounts.includes(a.id)) continue;
            if (a.createdAt && T.dayKey(a.createdAt, st.mode) === key) out.push({ icon: 'plus', text: `Started ${a.phase === 'eval' ? 'evaluation' : a.phase === 'instant' ? 'instant account' : 'funded account'}`, sub: shortAcct(a) });
            const end = a.finalizedAt || a.blockedAt;
            if (end && T.dayKey(end, st.mode) === key) {
                const txt = a.status === 3 ? 'Passed evaluation' : a.status === 6 ? 'Claimed' : a.status === 7 ? 'Blocked' : a.status === 4 || a.status === 5 ? 'Closed · ' + a.statusName.replace(/^Failed:?\s*/, '').replace(/[()]/g, '') : 'Closed';
                out.push({ icon: 'info', text: txt, sub: shortAcct(a) });
            }
        }
        return out;
    }

    function noteBox(noteKey, { rich = true, placeholder }) {
        const note = ctx.noteFor(noteKey) || { key: noteKey, text: '', tags: [], mood: undefined, planFollowed: undefined };
        const state = { text: note.text || '', tags: [...(note.tags || [])], mood: note.mood, plan: note.planFollowed };
        const saved = h('span', { class: 'saved' }, 'Saved');
        const flash = () => { saved.classList.add('on'); setTimeout(() => saved.classList.remove('on'), 1200); };
        const persist = async () => {
            await ctx.saveNote(noteKey, { text: state.text.trim(), tags: state.tags, mood: state.mood, planFollowed: state.plan });
            flash();
        };
        const ta = h('textarea', { class: rich ? '' : 'sm', placeholder, 'aria-label': 'Note', spellcheck: 'true' });
        ta.value = state.text;
        ta.addEventListener('input', () => { state.text = ta.value; });
        ta.addEventListener('blur', () => { if (ta.value.trim() !== (note.text || '')) persist(); });
        const tagsEl = h('div', { class: 'tags', role: 'group', 'aria-label': 'Tags' });
        const drawTags = () => {
            ui.clear(tagsEl);
            const all = [...new Set([...model.DEFAULT_TAGS, ...state.tags])];
            for (const t of all) tagsEl.appendChild(ui.chip(t, { on: state.tags.some((x) => x.toLowerCase() === t.toLowerCase()), onClick: () => { const has = state.tags.some((x) => x.toLowerCase() === t.toLowerCase()); state.tags = has ? state.tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...state.tags, t]; drawTags(); persist(); } }));
            const add = h('input', { class: 'field', style: 'width:96px;height:22px;padding:0 9px;font-size:11px;border-radius:999px', placeholder: '+ tag', 'aria-label': 'Add a custom tag', maxlength: 24 });
            add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { const t = add.value.trim().replace(/^#/, ''); if (!state.tags.some((x) => x.toLowerCase() === t.toLowerCase())) state.tags.push(t); drawTags(); persist(); } e.stopPropagation(); });
            tagsEl.appendChild(add);
        };
        drawTags();
        const out = h('div', { class: 'note-box' }, ta, tagsEl);
        if (rich) {
            const mood = ui.seg({ options: MOODS, value: state.mood == null ? '' : String(state.mood), label: 'Mood', onChange: (k) => { state.mood = +k; persist(); } });
            if (state.mood == null) mood.set('');
            const plan = ui.seg({ options: PLAN, value: state.plan == null ? '' : state.plan ? 'y' : 'n', label: 'Plan followed', onChange: (k) => { state.plan = k === '' ? undefined : k === 'y'; persist(); } });
            out.appendChild(h('div', { class: 'note-row' }, h('span', null, 'Mood'), mood, h('span', null, 'Plan followed'), plan, saved));
        } else out.appendChild(h('div', { class: 'note-row' }, saved));
        return out;
    }

    function tradeDetail(t, D, dp) {
        const a = D.accountsById.get(t.accountId);
        const f = t.fills || {};
        const g = (k, v) => h('div', null, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
        const px = (v) => T.fmtPrice(v, dp);
        const slText = t.initialSL != null ? `${px(t.initialSL)} · ${T.fmtPts(t.riskPts, { dp: 2, sign: false })} away` : ({ late: 'set over 2 min after entry, ignored', 'wrong-side': 'on the profit side, ignored', tiny: 'closer than 2 ticks, ignored', far: 'over 10% away, ignored', none: 'none at entry' }[t.slFlag] || 'none at entry');
        const tpText = t.initialTP != null ? `${px(t.initialTP)} · ${T.fmtPts(t.rewardPts, { dp: 2, sign: false })} away` : 'none at entry';
        const grid = h('div', { class: 'det-grid' },
            g('Entry (avg)', px(t.entryPx)), g('Exit (avg)', px(t.exitPx)), g('Opened', T.fmtTimeET(t.openTs) + ' ET'), g('Closed', T.fmtTimeET(t.closeTs) + ' ET'),
            g('Size', `${t.qty}${f.peakQty && f.peakQty !== t.qty ? ' (peak ' + f.peakQty + ')' : ''}${t.leverage ? ' · ' + t.leverage + 'x' : ''}`),
            g('Fills', f.n ? `${f.entries} in · ${f.exits} out${f.scaleIns ? ' · ' + f.scaleIns + ' scale-in' : ''}${f.scaleOuts ? ' · ' + f.scaleOuts + ' scale-out' : ''}` : '—'),
            g('Initial stop', slText), g('Initial target', tpText),
            g('Planned RR', t.plannedRR != null ? T.fmtR(t.plannedRR, { sign: false }) : '—'), g('Realized R', t.rMult != null ? T.fmtR(t.rMult) : '—'),
            g('Gross', money(t.gross)), g('Fee', money(-t.fee)), g('Funding', money(t.funding)), g('Net', money(t.net)),
            g('Exit reason', model.exitLabel(t.exit)), g('Account', a ? model.accountName(a) : t.accountId));
        const warns = h('div', { class: 'flags' });
        if (t.flags && t.flags.feeMatch === false) warns.appendChild(h('span', { class: 'warnline' }, 'Fee differs from the sum of its fills.'));
        if (t.flags && t.flags.pnlMatch === false) warns.appendChild(h('span', { class: 'warnline' }, 'P&L differs from (exit − entry) × size.'));
        return h('div', { class: 'det-in' }, grid, warns, noteBox('trade:' + t.id, { rich: false, placeholder: 'Note on this trade…' }));
    }

    function build(key, D) {
        const st = ctx.state;
        ui.clear(inner);
        if (curve) { curve.destroy(); curve = null; }
        rows = [];
        const day = D.days.get(key);
        const list = day ? day.tradeIds.map((id) => D.tradesById.get(id)).sort((a, b) => a.closeTs - b.closeTs || (a.id < b.id ? -1 : 1)) : [];
        const k = list.length ? stats.kpis(list, D.kpiOpts({ days: new Map([[key, day]]) })) : null;
        const { lines, hours, w } = windowLines(key);
        const gross = st.basis === 'gross';
        const nav = (dir) => h('button', { class: 'icon-btn', type: 'button', title: (dir < 0 ? 'Previous' : 'Next') + ' trading day (←/→; Shift for any day)', 'aria-label': dir < 0 ? 'Previous trading day' : 'Next trading day', onclick: (e) => step(dir, e.shiftKey) }, icon(dir < 0 ? 'chevL' : 'chevR', 16));
        const head = h('div', { class: 'dh' },
            h('div', { class: 'dh-top' }, nav(-1), h('h2', { id: 'drawer-title', tabindex: -1 }, T.fmtDate(key, 'short')), nav(1),
                h('button', { class: 'icon-btn', type: 'button', title: st.wide ? 'Narrow (E)' : 'Widen (E)', 'aria-label': 'Toggle width', onclick: () => ctx.set({ wide: !ctx.state.wide }) }, icon(st.wide ? 'collapse' : 'expand', 15)),
                h('button', { class: 'icon-btn', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => ctx.closeDrawer() }, icon('close', 16))),
            h('div', { class: 'win' }, lines, hours !== 24 ? h('div', null, h('span', { class: 'badge' }, hours + 'h day'), ' ' + (hours === 25 ? 'clocks go back: this Vest day has an extra hour' : 'clocks go forward: this Vest day is an hour short')) : null));
        const body = h('div', { class: 'db' });
        inner.append(head, body);

        if (!day) {
            body.appendChild(h('div', { class: 'dshim' }, 'No trades closed in this Vest day.'));
        } else {
            const netV = gross ? day.gross : day.net;
            const u = st.hide ? money(netV, { base: day.capitalBase }) : null;
            const hp = T.heroParts(netV);
            const big = h('div', { class: 'big ' + (netV > 0 ? 'pos' : netV < 0 ? 'neg' : '') });
            if (u) big.textContent = u; else big.append(hp.sign, h('span', { style: 'font-size:.55em;opacity:.7' }, '$'), hp.int, h('small', null, hp.cents));
            body.appendChild(h('div', { class: 'dnet' }, big, h('div', { class: 'sub' }, `${gross ? 'Gross' : 'Net'} · ${day.n} trade${day.n === 1 ? '' : 's'}${day.accounts.size > 1 ? ' · ' + day.accounts.size + ' accounts' : ''}`)));
            const risk = k.avgRisk;
            const rr = k.plannedRR.value, ar = k.avgR.value;
            const tiles = h('div', { class: 'dt' },
                tile('Gross', money(day.gross), '', side(day.gross)), tile('Fees', money(-day.fees), '', ''), tile('Funding', money(day.funding), '', side(day.funding)),
                tile('W / L', `${day.wins} / ${day.losses}`, `WR ${pctOf(k.winRate.value)}${day.scratch ? ' · ' + day.scratch + ' scratch' : ''}`),
                tile('Profit factor', k.profitFactor.value == null ? '—' : T.fmtNum(k.profitFactor.value), k.profitFactor.value == null && day.n < 5 ? 'needs 5+ trades' : ''),
                tile('Avg risk', risk.value != null ? T.fmtPts(risk.value, { dp: 1, sign: false }) : '—', risk.value != null ? `${risk.known}/${day.n} with SL${risk.symbol ? '' : ''}` : (day.symbols.size > 1 ? 'mixed symbols' : 'no stops')),
                tile('Planned RR', rr == null ? '—' : T.fmtR(rr, { sign: false }), ar == null ? 'no realized R' : `avg ${T.fmtR(ar)}`),
                tile('Best', money(day.best), '', 'up'), tile('Worst', money(day.worst), '', 'dn'),
                tile('Trades', String(day.n), `${k.long.value.n}L · ${k.short.value.n}S`, '', true));
            body.appendChild(tiles);

            // step curve
            const pts = stats.equityCurve(list, st.basis);
            const dk = key.split('-').map(Number);
            const rth = { start: T.etWallToUtc(dk[0], dk[1], dk[2], 9, 30), end: T.etWallToUtc(dk[0], dk[1], dk[2], 16, 0), label: 'RTH' };
            const hot = (i) => { rows.forEach((r, j) => r.tr.classList.toggle('hot', j === i)); };
            curve = stepCurve({
                points: pts, start: w.start, end: w.end, height: st.wide ? 168 : 132, session: rth, resetTimes: [w.start, w.end],
                resetLabel: { vest: '20:00 ET', cme: '18:00 ET', et: '00:00 ET', local: 'midnight' }[st.mode] || '20:00 ET',
                fmtMoney: (v) => money(v), fmtTime: (ts, sec) => T.fmtTimeET(ts, { seconds: !!sec }),
                onHover: (i) => hot(i), onClick: (i) => { if (i != null && rows[i]) rows[i].tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
            });
            body.appendChild(h('div', { class: 'dsec' }, h('div', { class: 'lab' }, h('span', null, 'Cumulative ' + (gross ? 'gross' : 'net') + ' · by close time'), h('span', { style: 'font-weight:500;letter-spacing:0;text-transform:none' }, 'ET')), curve.el));

            // events
            const ev = eventsFor(key, D);
            if (ev.length) {
                body.appendChild(h('div', { class: 'dsec' }, h('div', { class: 'lab' }, 'Events'),
                    h('div', { class: 'ev' }, ev.map((e) => h('div', { class: 'ev-row' + (e.gold ? ' gold' : '') }, e.icon === 'sparkle' ? ui.sparkle(14) : icon(e.icon, 14), h('span', { class: 'grow' }, e.text), h('span', { class: 'mut' }, e.sub))))));
            }

            // trades table
            const tbl = h('table', { class: 'tbl' });
            tbl.appendChild(h('thead', null, h('tr', null,
                h('th', { class: 'l' }, 'Time'), h('th', { class: 'l x' }, 'Acct'), h('th', { class: 'l x' }, 'Sym'), h('th', { class: 'l' }, 'Side'),
                h('th', { class: 'x' }, 'Entry → exit'), h('th', null, 'Pts'), h('th', null, 'Net'), h('th', { class: 'x' }, 'Fee'), h('th', { class: 'x' }, 'Risk'), h('th', null, 'R'), h('th', { class: 'x' }, 'Hold'), h('th', { class: 'x' }, 'Exit'), h('th', { style: 'width:10px;padding:0' }))));
            const tb = h('tbody');
            list.forEach((t, i) => {
                const a = D.accountsById.get(t.accountId);
                const sym = D.symbolsMap.get(t.symbol);
                const dp = sym && sym.priceDecimals != null ? sym.priceDecimals : 2;
                const note = D.notesByKey.get('trade:' + t.id);
                const label = model.exitLabel(t.exit);
                const tr = h('tr', { class: 'tr', tabindex: 0, 'aria-expanded': 'false', 'data-i': i },
                    h('td', { class: 'l' }, T.fmtTimeET(t.closeTs)),
                    h('td', { class: 'l x', title: a ? model.accountName(a) : '' }, shortAcct(a)),
                    h('td', { class: 'l x' }, (t.display || t.symbol).replace('-PERP', '')),
                    h('td', { class: 'l' }, h('span', { class: 'side ' + t.side }, t.side === 'long' ? 'L' : 'S'), ' ' + t.qty, h('span', { class: 'mut nx' }, ' ' + (t.display || '').replace('-PERP', '')), note && note.tags && note.tags[0] ? h('span', { class: 'tag-chip' }, note.tags[0]) : null),
                    h('td', { class: 'x mut' }, `${T.fmtPrice(t.entryPx, dp)} → ${T.fmtPrice(t.exitPx, dp)}`),
                    h('td', { class: side(t.points) }, t.points == null ? '—' : T.fmtPts(t.points, { dp: 2, unit: false })),
                    h('td', { class: side(gross ? t.gross : t.net), style: 'font-weight:600' }, money(gross ? t.gross : t.net)),
                    h('td', { class: 'x mut' }, money(-t.fee)),
                    h('td', { class: 'x mut' }, t.riskPts == null ? '—' : T.fmtNum(t.riskPts, 1)),
                    h('td', { class: side(t.rMult) }, t.rMult == null ? '—' : T.fmtR(t.rMult)),
                    h('td', { class: 'x mut' }, T.fmtDur(t.heldMs)),
                    h('td', { class: 'x mut', title: label }, EXIT_SHORT[label] || label),
                    h('td', { style: 'padding:0 4px 0 0;color:var(--j-t3)' }, icon('chevD', 12)));
                const span = h('td', { colspan: 13 });
                const det = h('tr', { class: 'det', hidden: true }, span);
                tr.addEventListener('click', () => {
                    const open = det.hidden;
                    if (open && !span.firstChild) span.appendChild(tradeDetail(t, D, dp));
                    det.hidden = !open;
                    tr.classList.toggle('open', open);
                    tr.setAttribute('aria-expanded', String(open));
                });
                tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tr.click(); } });
                tr.addEventListener('pointerenter', () => curve && curve.setActive(i));
                tr.addEventListener('pointerleave', () => curve && curve.setActive(null));
                tb.append(tr, det);
                rows.push({ tr });
            });
            tbl.appendChild(tb);
            body.appendChild(h('div', { class: 'dsec' }, h('div', { class: 'lab' }, h('span', null, 'Trades'), h('span', { style: 'font-weight:500;letter-spacing:0;text-transform:none' }, 'click a row for fills and stops')), h('div', { style: 'overflow-x:auto;margin:0 -4px' }, tbl)));
        }

        // events when there are no trades
        if (!day) {
            const ev = eventsFor(key, D);
            if (ev.length) body.appendChild(h('div', { class: 'dsec' }, h('div', { class: 'lab' }, 'Events'), h('div', { class: 'ev' }, ev.map((e) => h('div', { class: 'ev-row' + (e.gold ? ' gold' : '') }, e.icon === 'sparkle' ? ui.sparkle(14) : icon(e.icon, 14), h('span', { class: 'grow' }, e.text), h('span', { class: 'mut' }, e.sub))))));
        }
        // day note
        body.appendChild(h('div', { class: 'dsec' }, h('div', { class: 'lab' }, h('span', null, 'Note')), noteBox('day:' + key, { rich: true, placeholder: 'What happened today? What did you do well, what would you change?' })));
    }

    function update() {
        const st = ctx.state;
        const open = !!st.day;
        root.classList.toggle('open', open);
        root.style.setProperty('--dw', open ? (st.wide ? '720px' : '420px') : '0px');
        root.style.setProperty('--dwi', st.wide ? '720px' : '420px');
        inner.classList.toggle('dwide', !!st.wide);
        root.setAttribute('aria-hidden', String(!open));
        if (!open) {
            sig = '';
            clearTimeout(clearTimer);
            clearTimer = setTimeout(() => { if (!ctx.state.day) { ui.clear(inner); if (curve) { curve.destroy(); curve = null; } } }, 420);
            return;
        }
        clearTimeout(clearTimer);
        const D = ctx.derived();
        const key = [st.day, st.wide, st.hide, st.mode, st.basis].join('|');
        if (key === sig && D === lastD) return;
        // never rebuild under the user's cursor while they type a note
        if (document.activeElement && inner.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA' && sig.startsWith(st.day + '|')) return;
        lastD = D;
        const sameDay = sig.startsWith(st.day + '|');
        sig = key;
        build(st.day, D);
        const body = inner.querySelector('.db');
        if (body && !sameDay) body.scrollTop = 0;
    }
    let lastD = null;
    update();
    return { update, unmount() { ui.clear(inner); } };
}
