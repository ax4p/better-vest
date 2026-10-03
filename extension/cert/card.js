// Better Vest certificate - the card (vertical poster, 415.5 x 587.25 CSS px).
// buildCard() returns a plain DOM element styled only by cert/card.css; fitCard() then sizes the amount and the name
// to the real font metrics. Both are used for the live preview and, cloned, for the PNG export.

import { barSeries } from './stats.js';
import { fmtDate } from '../journal/time.js';

export const CARD_W = 415.5;
export const CARD_H = 587.25;
export const PROVENANCE = 'Generated with Better Vest from your Vest payout history · Not an official Vest document';
export const DEFAULT_NAME = 'Trader';
export const NAME_MAX = 28;

const ASSET = new URL('./assets/', import.meta.url).href;
export const CARD_CSS = new URL('./card.css', import.meta.url).href;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

export function fmtMoneyParts(v) {
    const cents = Math.round(Math.abs(v) * 100);
    const whole = Math.floor(cents / 100);
    return {
        int: (v < 0 ? '-' : '') + '$' + whole.toLocaleString('en-US'),
        cents: String(cents % 100).padStart(2, '0')
    };
}
export const fmtMoney = (v) => { const p = fmtMoneyParts(v); return p.int + '.' + p.cents; };
export const fmtMilestone = (amount) => '$' + (amount >= 1000 ? amount / 1000 + 'K' : amount);
const dm = (key) => fmtDate(key, 'dm');

function bars(vals, w, h, gap, uid) {
    const n = vals.length;
    const bw = (w - gap * (n - 1)) / n;
    const f = Math.sqrt;
    const mx = Math.max(...vals.map(f), 1e-9);
    let out = '';
    vals.forEach((v, i) => {
        const x = i * (bw + gap);
        if (!(v > 0)) {
            out += `<rect x="${x.toFixed(2)}" y="${h - 1}" width="${bw.toFixed(2)}" height="1" rx=".5" fill="rgb(255 255 255 / .18)"/>`;
            return;
        }
        const bh = Math.max(1.5, (f(v) / mx) * (h - 2));
        out += `<rect x="${x.toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="${Math.min(1.5, bw / 2).toFixed(2)}" fill="url(#bvg-${uid})"/>`;
    });
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="bvg-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DF5AB"/><stop offset="1" stop-color="#00F15B" stop-opacity=".35"/></linearGradient></defs>${out}</svg>`;
}

function backdrop() {
    const A = ASSET;
    return `<div class="bvc-bg"><div class="bvc-a" style="top:-75px;left:50%;height:662.25px;width:498px;transform:translateX(-50%) scaleX(-1);overflow:hidden">
  <div class="bvc-a" style="top:-304.77px;left:-117px;height:463.813px;width:731.896px"><img src="${A}green-glow.svg" alt="" style="top:-80.85%;left:-35.15%;height:261.7%;width:170.16%"></div>
  <div class="bvc-a" style="top:32.467px;left:-716.046px;height:499.72px;width:1114.954px;transform:rotate(26.05deg)"><img src="${A}shadow.svg" alt="" style="top:-39.06%;left:-17.5%;height:178.12%;width:135%"></div>
  <div class="bvc-a" style="top:21.909px;left:111.934px;height:660.267px;width:468.986px;transform:rotate(26.05deg)"><img src="${A}edge-shadow.svg" alt="" style="top:-29.56%;left:-41.62%;height:159.12%;width:183.24%"></div></div>
  <img src="${A}bottom-glow.svg" alt="" style="top:105.75px;left:-267px;height:624px;width:948.75px">
  <div class="bvc-a" style="left:0;right:0;bottom:0;height:130px;background:linear-gradient(to top,#0F0F0F 15%,rgb(15 15 15 / 0))"></div>
  <div class="bvc-a" style="top:130px;left:-60px;width:540px;height:300px;background:radial-gradient(closest-side,rgb(0 241 91 / .22),rgb(0 241 91 / 0));filter:blur(8px)"></div></div>`;
}

// S: certStats() result. opts: { name, chart (bool), uid }.
export function buildCard(S, opts = {}) {
    const name = (opts.name || '').trim().slice(0, NAME_MAX) || DEFAULT_NAME;
    const chart = !!opts.chart;
    const uid = opts.uid || 'c';
    const money = fmtMoneyParts(S.total);
    // vertical positions: the strip takes the middle band; without it the blocks spread over the same height
    const Y = chart
        ? { hero: 84, strip: 292, stats: 382, div: 442, recip: 458 }
        : { hero: 112, stats: 346, div: 418, recip: 438 };
    const ms = S.reached;
    const pill = ms ? `<span class="bvc-pill"><b></b>${esc(fmtMilestone(ms.amount))} milestone &middot; ${esc(dm(ms.reachedKey))}</span>` : '';

    let strip = '';
    if (chart) {
        const series = barSeries(S, 40, 7);
        const n = series.bars.length;
        const gap = n > 24 ? 3 : n > 14 ? 4.5 : 6;
        const dayLabel = S.days === 1 ? '1 day' : S.days + ' days';
        strip = `<div class="bvc-a" style="left:46px;top:${Y.strip}px;width:323px">${bars(series.bars.map((b) => b.net), 323, 52, gap, uid)}
  <div style="display:flex;justify-content:space-between;margin-top:7px"><span class="bvc-lbl">${esc(dm(S.firstKey))}</span><span class="bvc-lbl" style="color:#fff">${dayLabel}</span><span class="bvc-lbl">${esc(dm(S.lastKey))}</span></div></div>`;
    }

    const cell = (label, value) => `<div class="bvc-stat"><dt class="bvc-lbl">${label}</dt><dd class="bvc-val">${esc(value)}</dd></div>`;
    const html = `${backdrop()}
 <div class="bvc-a bvc-vw" style="left:30px;top:30px">VEST</div>
 <div class="bvc-a" data-k="head" style="left:30px;top:${Y.hero}px;width:355.5px;text-align:center">
  <p class="bvc-kick">Total Payouts</p>
  <p class="bvc-hero" data-k="hero" style="font-size:82px;letter-spacing:-3px;margin-top:18px"><span data-k="hv">${esc(money.int)}<span class="bvc-c">.${money.cents}</span></span></p>
  <p class="bvc-sub" style="margin-top:3px">lifetime net paid out</p>
 </div>
 ${strip}
 <dl class="bvc-a" style="left:30px;top:${Y.stats}px;width:355.5px;display:flex;align-items:center">${cell('Payouts', String(S.count))}<div class="bvc-sep"></div>${cell(S.accounts === 1 ? 'Funded account' : 'Funded accounts', String(S.accounts))}<div class="bvc-sep"></div>${cell('Largest', fmtMoney(S.largest))}</dl>
 <div class="bvc-a bvc-div" style="left:32.25px;top:${Y.div}px;width:351px"></div>
 <div class="bvc-a bvc-recip" data-k="recip" style="left:121px;top:${Y.recip}px;width:173px">
  <img src="${ASSET}laurel-left.svg" alt="" style="top:7.34px;left:.69px;height:64px;width:23.65px;transform:scaleX(-1)"><img src="${ASSET}laurel-right.svg" alt="" style="top:7.34px;right:-.98px;height:64px;width:23.65px">
  <p class="bvc-lbl">To</p>
  <p class="bvc-sil" data-k="name"><span data-k="nm">${esc(name)}</span></p>
  ${pill ? `<div style="margin-top:2px">${pill}</div>` : ''}
 </div>
 <p class="bvc-a bvc-prov" style="left:20px;top:560px;width:375px">${esc(PROVENANCE)}</p>`;

    const el = document.createElement('div');
    el.className = 'bvc';
    el.setAttribute('data-bv-cert', '1');
    el.innerHTML = html;
    return el;
}

// Needs the card in the document (layout) and the Inter font loaded. Idempotent.
export function fitCard(card) {
    const q = (k) => card.querySelector(`[data-k="${k}"]`);
    // amount: shrink to the 355.5 px text column
    const hero = q('hero'), hv = q('hv');
    let size = 82;
    hero.style.fontSize = size + 'px';
    while (hv.offsetWidth > 352 && size > 30) { size -= 1; hero.style.fontSize = size + 'px'; }
    hero.style.letterSpacing = (-3 * size / 82).toFixed(2) + 'px';
    // name: the laurel frame grows with the name (173 px up to 330 px), then the type shrinks
    const recip = q('recip'), name = q('name'), nm = q('nm');
    let fs = 24;
    name.style.fontSize = fs + 'px';
    const room = 330 - 2 * 28;
    while (nm.offsetWidth > room && fs > 12) { fs -= 1; name.style.fontSize = fs + 'px'; }
    const w = Math.min(330, Math.max(173, Math.ceil(nm.offsetWidth) + 2 * 28));
    recip.style.width = w + 'px';
    recip.style.left = ((CARD_W - w) / 2).toFixed(2) + 'px';
    // pill sits below the frame; keep it inside the card
    return card;
}
