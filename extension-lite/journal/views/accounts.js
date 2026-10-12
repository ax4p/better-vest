// Better Vest Calendar - the Accounts tab: journeys as constellation rows, totals, health of active accounts, and a row per account.
// Constellation: node = one account (solid ring funded / instant, dashed ring + EVAL for evaluation, × failed, ✓ passed or
// claimed), edge = promotion to the next stage, gold star = executed payouts. Clicking an account scopes the shell to it and
// opens the Calendar. Health bars use the realized balance (closed trades), never live equity; reconciliation is only shown
// as a quiet 'reconciled' check on active evaluations where it holds, because the final-balance identity of closed funded
// accounts is not understood yet and a mismatch there must not look like an error.

import { vgrid, popBase, dl, foot, tipRegistry, goTab, lsGet, lsSet, sideCls, pctOf } from './shared.js';

const LS_FILTER = 'bv-journal-acc-filter';
const FILTERS = [{ k: 'all', label: 'All' }, { k: 'active', label: 'Active' }, { k: 'funded', label: 'Funded' }, { k: 'failed', label: 'Failed' }];
const PHASE_WORD = { eval: 'Evaluation', funded: 'Funded', instant: 'Instant', primary: 'Primary' };
const PHASE_CAPS = { eval: 'EVAL', funded: 'FUNDED', instant: 'INSTANT' };
const SCOPE_PHASES = { funded: ['funded', 'instant'], eval: ['eval'], primary: ['primary'] };
const frac = (v) => (v == null ? null : v >= 1 ? v / 100 : v);   // plan rules may arrive as 0.03 or 3
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function mount(root, ctx) {
    const { h, ui, time: T, stats, fmt, model } = ctx;
    const S = () => ctx.state;
    let filter = lsGet(LS_FILTER) || 'all';
    if (!FILTERS.some((f) => f.k === filter)) filter = 'all';
    let sort = { key: 'start', dir: -1 };
    let sig = '';
    let lastD = null;
    let grid = null;
    let A = null;
    const tips = tipRegistry();

    const head = h('div', { class: 'vh2' });
    const note = h('div');
    const ribbon = h('div', { class: 'ac-ribbon rbw', role: 'list', 'aria-label': 'Account totals' });
    const healthEl = h('div');
    const journeysEl = h('section', { class: 'pn' });
    const tableEl = h('section', { class: 'pn' });
    const wrap = h('div', { class: 'vw' }, head, note, ribbon, healthEl, journeysEl, tableEl);
    root.appendChild(wrap);
    const hover = ui.hoverCard(wrap, '[data-vtip]', (target, el) => tips.build(target.dataset.vtip, el), { delay: 130 });

    const money = (v, base, o) => fmt.usd(v, { ctx: 'table', base, ...o });
    const ts2key = (ts) => (ts ? T.etDateKey(ts) : null);
    const dayText = (ts) => (ts ? `${T.fmtDate(ts2key(ts), 'dm')} ${ts2key(ts).slice(2, 4)}` : '—');
    const daysAlive = (a) => {
        const s = a.activatedAt || a.createdAt, e = a.finalizedAt || a.blockedAt || ctx.now();
        return s ? Math.max(1, T.daysBetween(ts2key(s), ts2key(e)) + (a.isFinal ? 1 : 0)) : null;
    };

    // ---------- model ----------

    function compute() {
        const st = S();
        const D = ctx.derived();
        const phases = SCOPE_PHASES[st.scope];
        const accounts = ctx.data.accounts.filter((a) => !phases || phases.includes(a.phase));
        const opts = D.kpiOpts();
        const aStats = stats.accountStats(accounts, ctx.data.trades, ctx.data.payouts, { rule: opts.rule, symbolsMap: D.symbolsMap });
        const J = stats.journeys(accounts, ctx.data.trades, ctx.data.payouts, { rule: opts.rule, symbolsMap: D.symbolsMap });
        const byId = new Map(accounts.map((a) => [a.id, a]));
        const paidBy = new Map();
        for (const p of ctx.data.payouts) if (p.status === 'EXECUTED') { const e = paidBy.get(p.accountId) || { net: 0, n: 0 }; e.net += p.net; e.n++; paidBy.set(p.accountId, e); }
        const daysToPass = J.chains.map((c) => c.daysToPass).filter((v) => v != null);
        const active = accounts.filter((a) => a.kind === 'capital' && !a.isFinal);
        let paidTotal = 0;
        for (const c of J.chains) paidTotal += c.payoutsNet;
        return { D, accounts, aStats, J, byId, paidBy, active, paidTotal, avgDays: daysToPass.length ? daysToPass.reduce((s, v) => s + v, 0) / daysToPass.length : null, nPass: daysToPass.length };
    }

    function reconciled(a) {
        if (a.phase !== 'eval' || a.isFinal || a.kind !== 'capital') return false;
        const r = stats.reconcile(a, ctx.data.trades, ctx.data.payouts);
        return r.kind === 'eval-active' && r.ok === true;
    }
    const reconcileMark = (a) => (reconciled(a) ? h('span', { class: 'rec', title: 'Initial capital plus closed results equals the account balance Vest reports' }, ui.icon('check', 11), 'reconciled') : null);

    // balance for health: Vest's reported balance when we have it, else initial + closed results - payouts
    function health(a) {
        const as = A.aStats.get(a.id) || { net: 0 };
        const out = ctx.data.payouts.filter((p) => p.accountId === a.id && (p.status === 'EXECUTED' || p.status === 'PROCESSING')).reduce((s, p) => s + p.gross, 0);
        const bal = a.balance != null ? a.balance : a.initialCapital + as.net - out;
        const floor = a.ddFloor != null && a.ddFloor < a.initialCapital ? a.ddFloor : (frac(a.ddPct) != null ? a.initialCapital * (1 - frac(a.ddPct)) : null);
        const room = floor != null ? a.initialCapital - floor : null;
        const ddUsed = room > 0 ? clamp01((a.initialCapital - bal) / room) : null;
        const goal = a.targetEquity != null && a.targetEquity > a.initialCapital ? clamp01((bal - a.initialCapital) / (a.targetEquity - a.initialCapital)) : null;
        return { bal, floor, ddUsed, goal, source: a.balance != null ? 'reported by Vest' : 'computed from closed trades' };
    }

    // ---------- header and totals ----------

    function renderHead() {
        ui.clear(head);
        const seg = ui.seg({ options: FILTERS.map((f) => ({ k: f.k, label: f.label })), value: filter, label: 'Journey filter', onChange: (k) => { filter = k; lsSet(LS_FILTER, k); renderJourneys(); } });
        const nAcc = A.accounts.length, nCap = A.accounts.filter((a) => a.kind === 'capital').length;
        head.append(h('div', { class: 'vh2-t' }, h('h1', null, 'Accounts'), h('div', { class: 'sub' }, `${nCap} capital account${nCap === 1 ? '' : 's'}${nAcc > nCap ? ' + primary' : ''} · ${A.J.chains.length} journey${A.J.chains.length === 1 ? '' : 's'}`)), h('div', { class: 'grow' }), seg);
    }

    function tile(label, value, sub, { cls = '', tip } = {}) {
        const id = tip ? tips.add(tip) : null;
        const v = h('div', { class: 'v ' + cls });
        if (value instanceof Node) v.appendChild(value); else v.textContent = value;
        return h('div', { class: 'tile', role: 'listitem', tabindex: 0, 'data-vtip': id }, h('div', { class: 'lab' }, h('span', { class: 'lab' }, label)), v, h('div', { class: 's' }, sub || ' '));
    }

    function renderRibbon() {
        ui.clear(ribbon);
        const J = A.J;
        const resolved = J.passed + J.failedEval;
        const fails = J.failures.drawdown + J.failures.dailyLoss;
        const evalActive = J.activeChains.filter((c) => c.accounts[c.accounts.length - 1].phase === 'eval').length;
        const simple = (title, formula, rows, n) => (el) => { popBase(el, title, `n = ${n}`); el.appendChild(h('div', { class: 'formula' }, formula)); dl(el, rows); foot(el, 'Counted per journey: an evaluation chain and the funded account it earned.'); return true; };
        const pay = A.paidTotal;
        let base = 0;
        for (const c of J.chains) if (c.payoutsNet > 0) base += c.initialCapital || 0;
        ribbon.append(
            tile('Journeys', String(J.chains.length), `${A.accounts.filter((a) => a.kind === 'capital').length} accounts`, { tip: simple('Journeys', 'A journey is every account sharing one root: evaluation steps, then the funded account they unlock.', [['Journeys', String(J.chains.length)], ['Accounts', String(A.accounts.filter((a) => a.kind === 'capital').length)]], J.chains.length) }),
            tile('Pass rate', J.passRate == null ? '—' : pctOf(J.passRate), resolved ? `${J.passed} of ${resolved} resolved` : 'nothing resolved yet', { tip: simple('Pass rate', 'Passed evaluations ÷ evaluations that ended (passed or failed). Active evaluations are not counted.', [['Passed', String(J.passed)], ['Failed', String(J.failedEval)], ['Active', String(J.active)]], resolved) }),
            tile('Failures', String(fails), `${J.failures.drawdown} drawdown · ${J.failures.dailyLoss} daily loss`, { cls: fails ? 'dn' : '', tip: simple('Failures', 'Accounts closed by Vest for breaching the max drawdown or the daily loss limit, evaluations and funded accounts alike.', [['Max drawdown', String(J.failures.drawdown)], ['Daily loss', String(J.failures.dailyLoss)]], fails) }),
            tile('Active', String(J.active), J.active ? `${evalActive} evaluation · ${J.active - evalActive} funded` : 'none running', { tip: simple('Active journeys', 'Journeys whose latest account is still running.', [['Active', String(J.active)]], J.active) }),
            tile('Days to pass', A.avgDays == null ? '—' : String(+A.avgDays.toFixed(1)), A.nPass ? `average over ${A.nPass} passed` : 'no passes yet', { tip: simple('Days to pass', 'Calendar days from the first evaluation start to its pass date, averaged over passed journeys.', [['Passed journeys', String(A.nPass)]], A.nPass) }),
            tile('Paid out', pay > 0 ? money(pay, base, { sign: false }) : '—', pay > 0 ? 'net, executed payouts' : 'no executed payouts', { cls: 'gold', tip: simple('Paid out', 'Σ net of EXECUTED payouts from the accounts in scope.', [['Net', money(pay, base, { sign: false })]], A.J.chains.filter((c) => c.payoutsNet > 0).length) }));
    }

    // ---------- health of active accounts ----------

    function barOf(label, frac01, text, tone) {
        return h('div', { class: 'hl' },
            h('div', { class: 'hl-t' }, h('span', null, label), h('b', null, text)),
            h('div', { class: 'hl-bar ' + tone, role: 'progressbar', 'aria-label': label, 'aria-valuenow': frac01 == null ? null : Math.round(frac01 * 100) }, h('i', { style: { width: frac01 == null ? '0%' : (frac01 * 100).toFixed(1) + '%' } })));
    }

    function renderHealth() {
        ui.clear(healthEl);
        if (!A.active.length) return;
        const st = S();
        const cards = A.active.slice().sort((a, b) => (b.activatedAt || b.createdAt || 0) - (a.activatedAt || a.createdAt || 0)).map((a) => {
            const hl = health(a);
            const rel = (v) => (v == null ? '—' : T.fmtPct((v - a.initialCapital) / a.initialCapital));
            const hideV = (v) => (st.hide ? rel(v) : money(v, 0, { sign: false }));
            const dll = frac(a.maxDailyLossPct);
            const tone = hl.ddUsed == null ? 'ok' : hl.ddUsed >= 0.85 ? 'bad' : hl.ddUsed >= 0.6 ? 'warn' : 'ok';
            const rules = [
                ['Start', st.hide ? 'hidden' : money(a.initialCapital, 0, { sign: false })],
                a.targetEquity != null ? ['Goal', hideV(a.targetEquity)] : null,
                hl.floor != null ? ['Drawdown floor', hideV(hl.floor)] : null,
                dll != null ? ['Daily loss', `${+(dll * 100).toFixed(2)}%${st.hide ? '' : ' · ' + money(dll * a.initialCapital, 0, { sign: false })}`] : null,
                a.profitSplit != null ? ['Split', `${Math.round(frac(a.profitSplit) * 100)} / ${Math.round((1 - frac(a.profitSplit)) * 100)}`] : null
            ].filter(Boolean);
            const bid = tips.add((el) => {
                popBase(el, 'Realized balance', `${hl.source}`);
                el.appendChild(h('div', { class: 'formula' }, 'Realized balance counts closed trades only: open positions and live equity are not included. Drawdown used = (start − balance) ÷ (start − drawdown floor), measured against the static floor.'));
                dl(el, [['Balance', st.hide ? rel(hl.bal) : money(hl.bal, 0, { sign: false })], ['Start', st.hide ? 'hidden' : money(a.initialCapital, 0, { sign: false })]]);
                return true;
            });
            return h('article', { class: 'hc' + (st.accounts && st.accounts.includes(a.id) ? ' sel' : '') },
                h('div', { class: 'hc-h' },
                    h('button', { class: 'hc-n', type: 'button', title: model.accountName(a), onclick: () => openInCalendar(a) }, h('span', { class: 'ellip' }, model.accountName(a))),
                    h('span', { class: 'chip mini ' + (a.phase === 'eval' ? 'sim' : 'live') }, PHASE_WORD[a.phase]), reconcileMark(a)),
                h('div', { class: 'hc-bal', 'data-vtip': bid, tabindex: 0 }, h('span', { class: 'lab' }, 'Realized balance'), h('b', null, hideV(hl.bal)), h('span', { class: 'mut' }, st.hide ? '' : rel(hl.bal) + ' vs start')),
                barOf('Drawdown used', hl.ddUsed, hl.ddUsed == null ? '—' : Math.round(hl.ddUsed * 100) + '%', tone),
                hl.goal != null ? barOf('Goal progress', hl.goal, Math.round(hl.goal * 100) + '%', 'goal') : null,
                h('dl', { class: 'hc-rules' }, rules.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
        });
        healthEl.appendChild(h('section', { class: 'pn' }, h('div', { class: 'pn-h' }, h('b', null, 'Active accounts'), h('span', { class: 'sub' }, `${A.active.length} running · realized balance, closed trades only`)), h('div', { class: 'hc-grid' + (cards.length < 3 ? ' few' : '') }, cards)));
        healthEl.style.marginBottom = '10px';
    }

    // ---------- journeys ----------

    function chainKind(c) {
        if (c.outcome === 'active') return 'active';
        if (c.outcome === 'failed-drawdown' || c.outcome === 'failed-dailyloss' || c.outcome === 'blocked') return 'failed';
        return 'done';
    }
    const OUTCOME = {
        active: ['Active', 'live'], passed: ['Passed', 'ok'], claimed: ['Claimed', 'ok'], 'failed-drawdown': ['Failed · drawdown', 'bad'], 'failed-dailyloss': ['Failed · daily loss', 'bad'], blocked: ['Blocked', 'bad']
    };

    function nodeEl(a, c, idx, sizeN) {
        const as = A.aStats.get(a.id) || { net: 0, n: 0 };
        const paid = A.paidBy.get(a.id);
        const failed = a.status === 4 || a.status === 5 || a.status === 7;
        const done = a.status === 3 || a.status === 6;
        const live = !a.isFinal;
        const evalsInChain = c.accounts.filter((x) => x.phase === 'eval').length;
        const evalIdx = c.accounts.slice(0, idx + 1).filter((x) => x.phase === 'eval').length;
        const caps = (PHASE_CAPS[a.phase] || '') + (a.phase === 'eval' && evalsInChain > 1 ? ' ' + evalIdx : '');
        const tid = tips.add((el) => {
            popBase(el, model.accountName(a), `${PHASE_WORD[a.phase]} · ${a.statusName}`);
            dl(el, [['Trades', String(as.n)], ['Net', money(as.net, a.initialCapital)], ['Win rate', pctOf(as.winRate)], ['Payouts', paid ? `${paid.n} · ${money(paid.net, a.initialCapital, { sign: false })}` : null],
                ['Started', dayText(a.activatedAt || a.createdAt)], ['Ended', a.finalizedAt || a.blockedAt ? dayText(a.finalizedAt || a.blockedAt) : live ? 'running' : '—']]);
            foot(el, 'Click to open this account in the Calendar.');
            return true;
        });
        const days = daysAlive(a);
        const star = paid ? h('span', { class: 'cstar', title: `${paid.n} payout${paid.n > 1 ? 's' : ''}` }, ui.sparkle(14), paid.n > 1 ? h('i', null, '×' + paid.n) : null) : h('span', { class: 'cstar none' });
        return h('div', { class: 'cnode' },
            star,
            h('button', { class: `cn ${a.phase === 'eval' ? 'ev' : 'fu'} ${failed ? 'fail' : done ? 'ok' : 'live'} ${as.net > 0 ? 'pos' : as.net < 0 ? 'neg' : ''}${S().accounts && S().accounts.includes(a.id) ? ' sel' : ''}`, type: 'button', 'data-vtip': tid, 'aria-label': `${model.accountName(a)}, ${a.statusName}. Open in Calendar`, onclick: () => openInCalendar(a) },
                failed ? ui.icon('close', 13) : done ? ui.icon('check', 13) : h('i', { class: 'pulse' })),
            h('span', { class: 'cl' }, caps), h('span', { class: 'cs' }, days != null ? (live ? 'live ' : '') + days + 'd' : '·'));
    }

    function journeyRow(c) {
        const [oLabel, oTone] = OUTCOME[c.outcome] || ['—', ''];
        const last = c.accounts[c.accounts.length - 1];
        const first = c.accounts[0];
        const base = c.initialCapital || 0;
        const nodes = h('div', { class: 'cnodes' });
        c.accounts.forEach((a, i) => {
            if (i) nodes.appendChild(h('span', { class: 'cedge' + (c.accounts[i - 1].status === 3 || c.accounts[i - 1].status === 6 || c.accounts[i - 1].phase !== 'eval' ? ' on' : '') }));
            nodes.appendChild(nodeEl(a, c, i, c.accounts.length));
        });
        const size = base ? (base >= 1e3 ? +(base / 1e3).toFixed(1) + 'K' : String(base)) : '';
        const tier = ((last.planName || '').includes('|') ? last.planName.split('|').pop() : (last.planName || '').replace(/^\$?\d+(\.\d+)?\s*[kKmM]\b\s*/, '')).trim();
        // a tier that only repeats the size ('500 | 500') reads better as the account type ('500 Instant')
        const tierOk = tier && tier.replace(/[$,\s]/g, '').toUpperCase() !== String(size).toUpperCase() && tier.replace(/[$,\s]/g, '') !== String(base);
        const title = [size, tierOk ? tier : PHASE_WORD[last.phase]].filter(Boolean).join(' ') || model.accountName(last);
        const endTs = last.finalizedAt || last.blockedAt;
        const stages = c.accounts.map((a) => PHASE_WORD[a.phase]).join(' → ');
        return h('article', { class: 'jr ' + chainKind(c) },
            h('div', { class: 'jr-l' }, h('div', { class: 'jr-t', title: (last.planName || '') + ' · ' + stages }, h('span', { class: 'ellip' }, title)),
                h('div', { class: 'jr-s' }, h('span', { class: 'chip mini ' + (oTone === 'live' ? 'live' : oTone === 'ok' ? 'gold' : '') + (oTone === 'bad' ? ' bad' : '') }, oLabel), h('span', { class: 'mut' }, `${dayText(first.activatedAt || first.createdAt)} → ${last.isFinal && endTs ? dayText(endTs) : 'now'}`)),
                c.daysToPass != null ? h('div', { class: 'jr-s mut' }, `passed in ${c.daysToPass} day${c.daysToPass === 1 ? '' : 's'}`) : null),
            h('div', { class: 'jr-n' }, nodes),
            h('dl', { class: 'jr-f' },
                h('div', null, h('dt', null, 'Net'), h('dd', { class: sideCls(c.net) }, c.n ? money(c.net, base) : '—')),
                h('div', null, h('dt', null, 'Trades'), h('dd', null, String(c.n))),
                h('div', null, h('dt', null, 'Win rate'), h('dd', null, pctOf(c.winRate))),
                h('div', null, h('dt', null, 'Paid'), h('dd', { class: c.payoutsNet > 0 ? 'gold' : '' }, c.payoutsNet > 0 ? money(c.payoutsNet, base, { sign: false }) : '—'))));
    }

    function renderJourneys() {
        ui.clear(journeysEl);
        const chains = A.J.chains.filter((c) => {
            if (filter === 'active') return c.outcome === 'active';
            if (filter === 'funded') return c.accounts.some((a) => a.phase !== 'eval');
            if (filter === 'failed') return chainKind(c) === 'failed';
            return true;
        });
        journeysEl.appendChild(h('div', { class: 'pn-h' }, h('b', null, 'Journeys'), h('span', { class: 'sub' }, `${chains.length} shown · newest first`), h('div', { class: 'grow' }),
            h('span', { class: 'lg' }, h('i', { class: 'lg-ring' }), 'funded'), h('span', { class: 'lg' }, h('i', { class: 'lg-ring dashed' }), 'evaluation'),
            h('span', { class: 'lg gold' }, ui.sparkle(12), 'payouts')));
        if (!chains.length) { journeysEl.appendChild(h('div', { class: 'dshim' }, 'No journeys match this filter.')); return; }
        journeysEl.appendChild(h('div', { class: 'jr-list' }, chains.map(journeyRow)));
    }

    // ---------- accounts table ----------

    const cmp = {
        name: (a) => model.accountName(a).toLowerCase(), phase: (a) => a.phase, status: (a) => a.statusName, trades: (a) => (A.aStats.get(a.id) || {}).n,
        net: (a) => (A.aStats.get(a.id) || {}).net, wr: (a) => (A.aStats.get(a.id) || {}).winRate, paid: (a) => (A.paidBy.get(a.id) || {}).net, start: (a) => a.activatedAt || a.createdAt
    };

    function renderTable() {
        ui.clear(tableEl);
        if (grid) { grid.destroy(); grid = null; }
        const list = A.accounts.slice();
        const fn = cmp[sort.key];
        list.sort((a, b) => {
            const x = fn(a), y = fn(b);
            const nx = x == null || Number.isNaN(x), ny = y == null || Number.isNaN(y);
            if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
            return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || (a.id < b.id ? -1 : 1);
        });
        tableEl.appendChild(h('div', { class: 'pn-h' }, h('b', null, 'All accounts'), h('span', { class: 'sub' }, `${list.length} · click a row to open it in the Calendar`)));
        grid = vgrid({
            template: 'minmax(260px, 2.2fr) 104px 168px 64px 104px 56px 100px 150px', minWidth: 1020, rowH: 36, headH: 32, virtual: list.length > 200, label: 'Accounts', rowKey: (a) => a.id,
            head: [
                { key: 'name', label: 'Account', cls: 'l', sortable: true }, { key: 'phase', label: 'Phase', cls: 'l', sortable: true }, { key: 'status', label: 'Status', cls: 'l', sortable: true },
                { key: 'trades', label: 'Trades', sortable: true }, { key: 'net', label: 'Net', sortable: true }, { key: 'wr', label: 'WR', sortable: true }, { key: 'paid', label: 'Paid', sortable: true }, { key: 'start', label: 'Start → end', cls: 'l', sortable: true }
            ],
            onSort: (key) => { sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === 'name' || key === 'phase' || key === 'status' ? 1 : -1 }; renderTable(); },
            rowCls: (a) => (S().accounts && S().accounts.includes(a.id) ? 'is-sel' : ''),
            onRow: (a) => openInCalendar(a),
            renderRow(a) {
                const as = A.aStats.get(a.id) || { n: 0, net: 0, winRate: null };
                const paid = A.paidBy.get(a.id);
                const base = a.initialCapital > 0 ? a.initialCapital : 0;
                const failed = a.status === 4 || a.status === 5 || a.status === 7;
                const end = a.finalizedAt || a.blockedAt;
                return [
                    h('span', { class: 'ellip', title: model.accountName(a) }, model.accountName(a)),
                    h('span', { class: 'chip mini ' + (a.phase === 'eval' ? 'sim' : a.phase === 'primary' ? '' : 'live') }, PHASE_WORD[a.phase] || a.phase),
                    h('span', { class: 'stc' }, h('span', { class: 'chip mini ' + (failed ? 'bad' : a.status === 3 || a.status === 6 ? 'gold' : a.isFinal ? '' : 'live'), title: a.statusName }, a.statusName || '—'), reconcileMark(a)),
                    String(as.n),
                    h('span', { class: sideCls(as.net) }, as.n ? money(as.net, base) : '—'),
                    as.winRate == null ? '—' : pctOf(as.winRate),
                    paid ? h('span', { class: 'gold' }, money(paid.net, base, { sign: false })) : h('span', { class: 'mut' }, '—'),
                    h('span', { class: 'mut' }, `${dayText(a.activatedAt || a.createdAt)} → ${a.isFinal && end ? dayText(end) : a.kind === 'primary' ? '' : 'now'}`)
                ];
            },
            empty: 'No accounts in this scope.'
        });
        grid.setSort(sort.key, sort.dir);
        grid.setRows(list);
        if (list.length > 200) grid.setHeight(560);
        tableEl.appendChild(grid.el);
    }

    // ---------- navigation ----------

    function openInCalendar(a) {
        const st = S();
        const as = A.aStats.get(a.id);
        const phases = SCOPE_PHASES[st.scope];
        const patch = { accounts: [a.id], day: null, sel: null };
        if (phases && !phases.includes(a.phase)) patch.scope = 'all';
        if (as && as.lastTs) patch.month = T.monthKey(T.dayKey(as.lastTs, st.mode));
        ctx.set(patch);
        goTab(ctx, 'calendar');
    }

    // ---------- lifecycle ----------

    function update() {
        const st = S();
        const D = ctx.derived();
        const key = [st.hide, st.scope, st.mode, filter, st.accounts ? st.accounts.join(',') : '*'].join('|');
        if (D === lastD && key === sig) return;
        lastD = D; sig = key;
        tips.reset();
        hover.hide();
        A = compute();
        renderHead();
        ui.clear(note);
        if (!A.accounts.length) note.appendChild(h('div', { class: 'empty-note' }, h('b', null, 'No accounts in this scope.'), ' Switch the scope above, or sync from Vest.'));
        renderRibbon();
        renderHealth();
        renderJourneys();
        renderTable();
    }

    update();
    return { update, unmount() { hover.hide(); if (grid) grid.destroy(); ui.clear(root); } };
}
