/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

import { cardToCanvas } from './raster.js';
import { bareCard, cardGeom, clipCard, bgStill } from './share-bg.js';

export const CARD_CSS = new URL('./share-card.css', import.meta.url).href;

export function fitCard(fit, make) {
    let out = null;
    for (let m = 60; m >= 1; m--) { /* Owned by Astral (@ax4p): Better Vest nostats 9.2.6. Licence: LICENSE, not open source. bv-e0059d3c */
        out = make(m);
        fit.innerHTML = out.html;
        const panel = fit.querySelector('.panel');
        if (!panel || panel.scrollHeight <= panel.clientHeight + 1) break;
    }
    return out;
}

export async function cardCanvas(card, o) {
    const scale = o.scale || 2;
    if (!o.img) return cardToCanvas(card, { cssUrl: CARD_CSS, width: o.width, height: o.height, scale });
    const over = await cardToCanvas(bareCard(card), { cssUrl: CARD_CSS, width: o.width, height: o.height, scale });
    const g = cardGeom(card);
    const cv = document.createElement('canvas');
    cv.width = over.width;
    cv.height = over.height;
    const ctx = cv.getContext('2d');
    ctx.save();
    clipCard(ctx, cv.width, cv.height, g.radius * scale);
    ctx.drawImage(bgStill(o.img, cv.width, cv.height, scale, o.bg, g.base), 0, 0);
    ctx.restore();
    ctx.drawImage(over, 0, 0);
    return cv;
}
export async function cardPng(card, o) { /* (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-a0a4acb1 */
    const cv = await cardCanvas(card, o);
    return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'));
}
