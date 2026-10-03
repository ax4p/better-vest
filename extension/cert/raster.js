// Better Vest certificate - DOM to PNG with no library.
// The card is cloned into an SVG <foreignObject>; its CSS, the Inter font and every <img> are inlined as data: URIs
// (an SVG drawn as an image may not load anything else), the SVG is drawn on a canvas at 3x and exported.

const NS_XHTML = 'http://www.w3.org/1999/xhtml';
const NS_SVG = 'http://www.w3.org/2000/svg';

const cache = new Map();

function blobToDataUri(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error || new Error('read failed'));
        r.readAsDataURL(blob);
    });
}

async function dataUriOf(url) {
    if (url.startsWith('data:')) return url;
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then((r) => {
        if (!r.ok) throw new Error('asset ' + url + ': HTTP ' + r.status);
        return r.blob();
    }).then(blobToDataUri);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
}

async function cssWithInlinedUrls(cssUrl) {
    const res = await fetch(cssUrl);
    if (!res.ok) throw new Error('stylesheet: HTTP ' + res.status);
    let css = await res.text();
    const base = new URL(cssUrl, document.baseURI);
    const urls = [...new Set([...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => m[2]))];
    for (const u of urls) {
        if (u.startsWith('data:')) continue;
        const data = await dataUriOf(new URL(u, base).href);
        css = css.split(u).join(data);
    }
    return css;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('The card could not be drawn (SVG image failed to load)'));
        img.src = src;
    });
}

// Builds the standalone SVG markup for a card element at its CSS size.
export async function cardToSvg(card, { cssUrl, width, height }) {
    const css = await cssWithInlinedUrls(cssUrl);
    const clone = card.cloneNode(true);
    // the preview may scale / shadow the card from outside; nothing on the card itself is changed
    clone.style.transform = 'none';
    clone.style.margin = '0';
    for (const img of clone.querySelectorAll('img')) {
        const abs = new URL(img.getAttribute('src'), document.baseURI).href;
        img.setAttribute('src', await dataUriOf(abs));
    }
    const wrap = document.createElementNS(NS_XHTML, 'div');
    wrap.setAttribute('xmlns', NS_XHTML);
    wrap.setAttribute('style', `width:${width}px;height:${height}px;margin:0;padding:0;background:transparent`);
    const style = document.createElementNS(NS_XHTML, 'style');
    style.textContent = css;
    wrap.append(style, clone);
    const inner = new XMLSerializer().serializeToString(wrap);
    return `<svg xmlns="${NS_SVG}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${inner}</foreignObject></svg>`;
}

// scale 3 => a 415.5 x 587.25 card exports as 1247 x 1762 (rounded, like Vest's own 3x export)
export async function cardToCanvas(card, { cssUrl, width, height, scale = 3 }) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const svg = await cardToSvg(card, { cssUrl, width, height });
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
}

export async function cardToPngBlob(card, opts) {
    const canvas = await cardToCanvas(card, opts);
    return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
    });
}
