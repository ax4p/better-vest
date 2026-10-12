// Better Vest P&L card: a card on a page, shared by the share page (cert/share.html) and the card that pops up on Vest's page after a big close
// (cert/pop.html), so both make the same card and the same PNG.

import { cardToCanvas } from './raster.js';
import { bareCard, cardGeom, clipCard, bgStill } from './share-bg.js';

export const CARD_CSS = new URL('./share-card.css', import.meta.url).href;

// The most list rows that fit the card's panel without spilling, from all of them down. make(maxRows) -> { html, ... }; the card goes into
// `fit` and is measured there. Returns the last make()'s result.
export function fitCard(fit, make) {
    let out = null;
    for (let m = 60; m >= 1; m--) {
        out = make(m);
        fit.innerHTML = out.html;
        const panel = fit.querySelector('.panel');
        if (!panel || panel.scrollHeight <= panel.clientHeight + 1) break;
    }
    return out;
}

// The card on a canvas at `scale` times its size: through the certificate's pipeline as before, or, with your picture (o.img, o.bg), the
// card without its background drawn over the picture (the first frame of a GIF), the corners as the card's own. The PNG is this canvas, and
// so is a still card's GIF (9.0, cert/share-gif-make.js).
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
// The card as a PNG (cardCanvas)
export async function cardPng(card, o) {
    const cv = await cardCanvas(card, o);
    return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'));
}
