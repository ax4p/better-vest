/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

export const VC_IDS = Object.freeze(['long', 'short', 'flat', 'half', 'rev', 'be', 'limitBuy', 'limitSell']);
export const VC_OPENS = Object.freeze(['long', 'short', 'rev', 'limitBuy', 'limitSell']);

const PHRASES = {
    long: ['long', 'go long', 'open long', 'buy', 'buy now', 'buy market', 'long now', 'enter long', 'get long'],
    short: ['short', 'go short', 'open short', 'sell', 'sell now', 'sell market', 'short now', 'enter short', 'get short'],
    flat: ['flat', 'go flat', 'flatten', 'close', 'close all', 'close everything', 'close out', 'get out', 'exit', 'exit all', 'out'],
    half: ['half', 'close half', 'fifty', 'fifty percent', 'close fifty', 'close fifty percent', 'take half', 'half off'],
    rev: ['reverse', 'flip', 'reverse that', 'flip that'],
    be: ['break even', 'be', 'stop to break even', 'move stop to break even', 'move to break even', 'stop break even'],
    limitBuy: ['buy limit', 'limit buy', 'buy at the bid', 'buy the bid', 'bid'],
    limitSell: ['sell limit', 'limit sell', 'sell at the ask', 'sell the ask', 'offer']
};
const WAKE = ['astral', 'astro', 'astra', 'austral', 'astrel', 'astrall', 'astrol', 'astrid', 'a stroll', 'astral\'s', 'astrals'];
const FILLER = new Set(['uh', 'um', 'er', 'erm', 'ah', 'please', 'now', 'the', 'a', 'an', 'it', 'my', 'position', 'trade', 'okay', 'ok', 'hey', 'yo', 'so', 'just']);

export const vcWords = (s) => String(s || '').toLowerCase()
    .replace(/(\d+)\s*%/g, '$1 percent')
    .replace(/\b50\b/g, 'fifty')
    .replace(/\bb\s*\.?\s*e\b\.?/g, 'be')
    .replace(/\bbreak-?even\b/g, 'break even')
    .replace(/\bbreakeven\b/g, 'break even')
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clean = (s) => vcWords(s).split(' ').filter((w) => w && !FILLER.has(w)).join(' ');

const TABLE = new Map();
/*! Owned by Astral (@ax4p): Better Vest nostats 9.3.1. Licence: LICENSE, not open source. bv-836970e6 */ for (const id of Object.keys(PHRASES)) for (const p of PHRASES[id]) { const c = clean(p); if (c) TABLE.set(c, id); }

const GROWS = new Set([...TABLE.keys()].filter((t) => [...TABLE.keys()].some((p) => p !== t && p.startsWith(t + ' ') && TABLE.get(p) !== TABLE.get(t))));
const STARTS = new Set();
for (const p of TABLE.keys()) { const w = p.split(' '); for (let i = 1; i < w.length; i++) STARTS.add(w.slice(0, i).join(' ')); }

export function vcAfterWake(text) {
    const s = vcWords(text);
    let at = -1, len = 0;
    for (const w of WAKE) {
        const re = new RegExp('(?:^| )' + w.replace(/'/g, "'") + '(?= |$)', 'g');
        let m;
        while ((m = re.exec(s))) { const i = m.index + (m[0].startsWith(' ') ? 1 : 0); if (i >= at) { at = i; len = w.length; } }
    }
    return at < 0 ? null : s.slice(at + len).trim();
}

export function vcParse(text, opts) {
    const wake = !!(opts && opts.wake);
    let rest = wake ? vcAfterWake(text) : (vcAfterWake(text) ?? vcWords(text));
    if (rest == null) return null;
    const said = clean(rest);
    if (!said) return null;
    const id = TABLE.get(said);
    if (!id) return null;
    return { id, said, grows: GROWS.has(said) };
} /* Property of Astral (@ax4p). Better Vest 9.3.1. No copying without written permission. bv-4aa72956 */

export function vcPending(text, opts) {
    const wake = !!(opts && opts.wake);
    const rest = wake ? vcAfterWake(text) : (vcAfterWake(text) ?? vcWords(text));
    if (rest == null) return false;
    const said = clean(rest);
    return !!said && (STARTS.has(said) || GROWS.has(said));
}

export function vcPhraseList() {
    return ['astral'].concat([...new Set(Object.values(PHRASES).flat())]);
}
