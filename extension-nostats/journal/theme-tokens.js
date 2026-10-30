/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */

export const THEMES = {
    astral: {
        label: 'Astral', tv: 'dark', base: '#070a13', card: '#0d1527',
        page: 'radial-gradient(circle at 50% 0%, #0e172a 0%, #070a13 55%, #05070d 100%)',
        chrome: 'rgba(7, 10, 19, 0.92)', chromeLine: 'rgba(56, 189, 248, 0.12)', surface: 'rgba(13, 21, 39, 0.88)',
        field: '#0b1220', fieldText: '#e2e8f0', fieldLine: '#334155',
        raised: 'rgba(15, 23, 42, 0.96)', inset: '#0b1220', btn: '#1e293b', line: '#334155',
        text: '#e2e8f0', muted: '#94a3b8', dim: '#64748b', accent: '#38bdf8', accentText: '#7dd3fc', sel: '#2563eb',
        up: '#34d399', down: '#f87171', upBtn: '#047857', downBtn: '#b91c1c', warn: '#f59e0b', big: '#fde68a',
        glow: 'rgba(56, 189, 248, 0.35)', shadow: 'rgba(0, 0, 0, 0.65)',
        chart: {
            bg: '#000000', grid: 'rgba(51, 65, 85, 0.28)', text: '#ffffff', line: '#ffffff', crosshair: '#ffffff', prevClose: true,
            up: '#b8b8b8', down: '#4a4a4a', borderUp: '#4a4a4a', borderDown: '#4a4a4a', wickUp: '#4a4a4a', wickDown: '#4a4a4a'
        }
    },
    dark: {
        label: 'Dark', tv: 'dark', tokens: true, base: '#0c0c0e', card: '#141417',
        page: '#0c0c0e',
        chrome: 'rgba(12, 12, 14, 0.96)', chromeLine: 'rgba(255, 255, 255, 0.06)', surface: 'rgba(20, 20, 23, 0.96)',
        field: '#0f0f12', fieldText: '#e4e4e7', fieldLine: '#2e2e33',
        raised: 'rgba(24, 24, 27, 0.97)', inset: '#0f0f12', btn: '#27272a', line: '#34343a',
        text: '#e4e4e7', muted: '#a1a1aa', dim: '#71717a', accent: '#60a5fa', accentText: '#93c5fd', sel: '#3b82f6',
        up: '#22c55e', down: '#ef4444', upBtn: '#15803d', downBtn: '#b91c1c', warn: '#f59e0b', big: '#fcd34d',
        glow: 'rgba(96, 165, 250, 0.28)', shadow: 'rgba(0, 0, 0, 0.6)',
        /*! Copyright Astral 2026. From Better Vest 9.3.3 (nostats), ref bv-75bb0c36. Not licensed for reuse. */ chart: {
            bg: '#0f0f11', grid: 'rgba(63, 63, 70, 0.32)', text: '#a1a1aa', up: '#00d68f', down: '#ff3b5c',
            borderUp: '#00d68f', borderDown: '#ff3b5c', wickUp: '#00d68f', wickDown: '#ff3b5c'
        }
    },
    oled: {
        label: 'OLED', tv: 'dark', tokens: true, base: '#000000', card: '#000000',
        page: '#000000',
        chrome: '#000000', chromeLine: 'rgba(255, 255, 255, 0.07)', surface: '#000000',
        field: '#000000', fieldText: '#f5f5f5', fieldLine: '#262626',
        raised: 'rgba(0, 0, 0, 0.97)', inset: '#000000', btn: '#111111', line: '#262626',
        text: '#f5f5f5', muted: '#a3a3a3', dim: '#737373', accent: '#ffffff', accentText: '#ffffff', sel: '#2a2a2a',
        up: '#00d68f', down: '#ff3b5c', upBtn: '#00995f', downBtn: '#c8102e', warn: '#ffb020', big: '#ffe08a',
        glow: 'rgba(255, 255, 255, 0.18)', shadow: 'rgba(0, 0, 0, 0.9)',
        chart: { bg: '#000000', grid: 'rgba(255, 255, 255, 0.04)', text: '#8a8a8a', up: '#00d68f', down: '#ff3b5c' }
    },
    light: {
        label: 'Light', tv: 'light', tokens: true, light: true, base: '#f3f5f9', card: '#ffffff',
        page: '#f3f5f9',
        chrome: 'rgba(255, 255, 255, 0.97)', chromeLine: '#e2e8f0', surface: '#ffffff',
        field: '#f8fafc', fieldText: '#0f172a', fieldLine: '#cbd5e1',
        raised: 'rgba(255, 255, 255, 0.98)', inset: '#f1f5f9', btn: '#e8edf4', line: '#d5dde8',
        text: '#0f172a', muted: '#475569', dim: '#64748b', accent: '#2563eb', accentText: '#1d4ed8', sel: '#2563eb',
        up: '#059669', down: '#dc2626', upBtn: '#059669', downBtn: '#dc2626', warn: '#d97706', big: '#b45309',
        glow: 'rgba(37, 99, 235, 0.25)', shadow: 'rgba(15, 23, 42, 0.18)',
        chart: { bg: '#ffffff', grid: 'rgba(15, 23, 42, 0.06)', text: '#475569', up: '#059669', down: '#dc2626' }
    },
    nebula: {
        label: 'Nebula', tv: 'dark', tokens: true, base: '#0a0612', card: '#160c28',
        page: 'radial-gradient(ellipse at 20% 0%, #2a1050 0%, #120822 45%, #07040f 100%)',
        chrome: 'rgba(14, 7, 26, 0.92)', chromeLine: 'rgba(192, 132, 252, 0.16)', surface: 'rgba(22, 12, 40, 0.88)',
        field: '#120a22', fieldText: '#f3e8ff', fieldLine: '#3b2a5c',
        raised: 'rgba(24, 13, 44, 0.96)', inset: '#120a22', btn: '#2a1a48', line: '#3d2b62',
        text: '#f3e8ff', muted: '#c4b5fd', dim: '#8b7bb8', accent: '#c084fc', accentText: '#e9d5ff', sel: '#9333ea',
        up: '#34d399', down: '#fb7185', upBtn: '#047857', downBtn: '#be123c', warn: '#f0abfc', big: '#fde68a',
        glow: 'rgba(192, 132, 252, 0.35)', shadow: 'rgba(0, 0, 0, 0.7)',
        chart: { bg: '#0b0616', grid: 'rgba(139, 92, 246, 0.12)', text: '#a78bfa', up: '#34d399', down: '#fb7185' }
    },
    starfield: {
        label: 'Starfield', tv: 'dark', tokens: true, stars: true, base: 'transparent', card: '#060608',
        page: '#000000', pageInner: 'transparent',
        chrome: 'rgba(0, 0, 0, 0.78)', chromeLine: 'rgba(255, 255, 255, 0.08)', surface: 'rgba(4, 4, 6, 0.72)',
        field: 'rgba(10, 10, 12, 0.9)', fieldText: '#f4f4f5', fieldLine: '#27272a',
        raised: 'rgba(6, 6, 8, 0.9)', inset: '#050506', btn: '#16161a', line: '#2a2a30',
        /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-62d6c331 */ text: '#f4f4f5', muted: '#a1a1aa', dim: '#6b6b74', accent: '#e4e4e7', accentText: '#ffffff', sel: '#3f3f46',
        up: '#86efac', down: '#fca5a5', upBtn: '#15803d', downBtn: '#b91c1c', warn: '#fde68a', big: '#fef3c7',
        glow: 'rgba(255, 255, 255, 0.22)', shadow: 'rgba(0, 0, 0, 0.85)',
        chart: { bg: '#000000', grid: 'rgba(255, 255, 255, 0.035)', text: '#9ca3af', up: '#f4f4f5', down: '#000000', borderDown: '#d4d4d8', wickDown: '#d4d4d8' }
    },
    midnight: {
        label: 'Midnight', tv: 'dark', tokens: true, base: '#070b16', card: '#0d1424',
        page: 'radial-gradient(circle at 50% 0%, #111a33 0%, #080d1a 55%, #05080f 100%)',
        chrome: 'rgba(7, 11, 22, 0.94)', chromeLine: 'rgba(212, 175, 95, 0.14)', surface: 'rgba(13, 20, 36, 0.9)',
        field: '#0a101e', fieldText: '#ece6d6', fieldLine: '#283350',
        raised: 'rgba(12, 18, 34, 0.96)', inset: '#0a101e', btn: '#18223b', line: '#26304b',
        text: '#ece6d6', muted: '#aaa392', dim: '#757062', accent: '#d4af5f', accentText: '#e8c97f', sel: '#8a6b2a',
        up: '#4fd1a1', down: '#ef6f6c', upBtn: '#167a57', downBtn: '#b3363a', warn: '#f2a03d', big: '#f3d999',
        glow: 'rgba(212, 175, 95, 0.3)', shadow: 'rgba(0, 0, 0, 0.7)',
        chart: { bg: '#060a14', grid: 'rgba(212, 175, 95, 0.06)', text: '#aaa392', up: '#4fd1a1', down: '#ef6f6c' }
    },
    native: {
        label: 'Native', tv: 'dark', tokens: true, base: '#0f0f0f', card: '#121714',
        page: '#0f0f0f',
        chrome: 'rgba(15, 15, 15, 0.97)', chromeLine: '#292929', surface: '#121714',
        field: '#1a1a1a', fieldText: '#f2f2f2', fieldLine: '#292929',
        raised: 'rgba(21, 24, 22, 0.97)', inset: '#0f0f0f', btn: '#262626', line: '#292929',
        text: '#f2f2f2', muted: '#a3a3a3', dim: '#717171', accent: '#57bc8a', accentText: '#88d8ae', sel: '#3b805e',
        up: '#00d98e', down: '#de1c4e', upBtn: '#008758', downBtn: '#de1c4e', warn: '#f2b200', big: '#fde68a',
        glow: 'rgba(87, 188, 138, 0.28)', shadow: 'rgba(0, 0, 0, 0.6)',
        chart: { bg: '#0f0f0f', grid: 'rgba(41, 41, 41, 0.45)', text: '#a3a3a3', up: '#00d98e', down: '#de1c4e' }
    },
    dracula: {
        label: 'Dracula', tv: 'dark', tokens: true, base: '#21222c', card: '#282a36',
        page: '#21222c',
        chrome: 'rgba(33, 34, 44, 0.97)', chromeLine: 'rgba(98, 114, 164, 0.28)', surface: '#282a36',
        field: '#21222c', fieldText: '#f8f8f2', fieldLine: '#44475a',
        raised: 'rgba(40, 42, 54, 0.97)', inset: '#21222c', btn: '#343746', line: '#44475a',
        text: '#f8f8f2', muted: '#bcc2d3', dim: '#6272a4', accent: '#bd93f9', accentText: '#d6bcfa', sel: '#8467ae',
        up: '#50fa7b', down: '#ff5555', upBtn: '#2b8742', downBtn: '#cc4444', warn: '#ffb86c', big: '#f1fa8c',
        glow: 'rgba(189, 147, 249, 0.3)', shadow: 'rgba(0, 0, 0, 0.6)',
        chart: { bg: '#282a36', grid: 'rgba(98, 114, 164, 0.16)', text: '#a6aec7', up: '#50fa7b', down: '#ff5555' }
    },
    catppuccin: {
        label: 'Catppuccin', tv: 'dark', tokens: true, base: '#181825', card: '#1e1e2e',
        /*! Copyright (c) 2026 Astral. Better Vest 9.3.3 is licensed to its users only to run it, never to copy it. bv-e7030d7d */ page: '#181825',
        chrome: 'rgba(17, 17, 27, 0.97)', chromeLine: '#313244', surface: '#1e1e2e',
        field: '#181825', fieldText: '#cdd6f4', fieldLine: '#45475a',
        raised: 'rgba(30, 30, 46, 0.97)', inset: '#181825', btn: '#313244', line: '#45475a',
        text: '#cdd6f4', muted: '#a6adc8', dim: '#6c7086', accent: '#cba6f7', accentText: '#b4befe', sel: '#826a9e',
        up: '#a6e3a1', down: '#f38ba8', upBtn: '#5d7f5a', downBtn: '#a55f72', warn: '#fab387', big: '#f9e2af',
        glow: 'rgba(203, 166, 247, 0.3)', shadow: 'rgba(0, 0, 0, 0.6)',
        chart: { bg: '#1e1e2e', grid: 'rgba(108, 112, 134, 0.16)', text: '#a6adc8', up: '#a6e3a1', down: '#f38ba8' }
    }
};

export function themeVarsCss(t) {
    return `
        :root {
            --ax-base: ${t.base}; --ax-page: ${t.page}; --ax-page-inner: ${t.pageInner || t.page};
            --ax-chrome: ${t.chrome}; --ax-chrome-line: ${t.chromeLine}; --ax-surface: ${t.surface};
            --ax-field: ${t.field}; --ax-field-text: ${t.fieldText}; --ax-field-line: ${t.fieldLine};
            --ax-raised: ${t.raised}; --ax-inset: ${t.inset}; --ax-btn: ${t.btn}; --ax-line: ${t.line};
            --ax-text: ${t.text}; --ax-muted: ${t.muted}; --ax-dim: ${t.dim};
            --ax-accent: ${t.accent}; --ax-accent-text: ${t.accentText}; --ax-sel: ${t.sel};
            --ax-up: ${t.up}; --ax-down: ${t.down}; --ax-up-btn: ${t.upBtn}; --ax-down-btn: ${t.downBtn};
            --ax-warn: ${t.warn}; --ax-big: ${t.big}; --ax-glow: ${t.glow}; --ax-shadow: ${t.shadow};
        }
    `;
}
export function themeKnown(k) {
    return k === 'custom' || (typeof k === 'string' && Object.prototype.hasOwnProperty.call(THEMES, k));
}
function thIsHex(c) { return /^#[0-9a-f]{6}$/i.test(String(c || '')); }
function thRgb(hex) { const n = parseInt(String(hex).slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function thHex(rgb) { return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join(''); }
function thMix(a, b, t) { const x = thRgb(a), y = thRgb(b); return thHex(x.map((v, i) => v + (y[i] - v) * t)); }
function thRgba(hex, a) { return 'rgba(' + thRgb(hex).join(', ') + ', ' + a + ')'; }
function thLum(hex) {
    const c = thRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function thContrast(a, b) { const x = thLum(a), y = thLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function thBtn(hex) {
    let c = hex;
    for (let t = 0; t <= 0.9 && thContrast(c, '#ffffff') < 4.5; t += 0.02) c = thMix(hex, '#000000', t);
    return c;
}
export function customTheme(c) {
    const d = { bg: '#0c0c0e', panel: '#141417', text: '#e4e4e7', accent: '#60a5fa', up: '#22c55e', down: '#ef4444' };
    const k = {};
    Object.keys(d).forEach((n) => { k[n] = c && thIsHex(c[n]) ? String(c[n]).toLowerCase() : d[n]; });
    const light = thLum(k.bg) > 0.4;
    const ink = light ? '#000000' : '#ffffff';
    const inset = thMix(k.bg, k.panel, 0.35);
    let mt = 0.32;
    while (mt > 0 && thContrast(thMix(k.text, k.panel, mt), inset) < 4.5) mt = Math.max(0, mt - 0.04);
    return {
        label: 'Custom', tv: light ? 'light' : 'dark', tokens: true, light, base: k.bg, card: k.panel, page: k.bg,
        chrome: thRgba(k.bg, 0.96), chromeLine: thRgba(thMix(k.bg, k.text, 0.5), 0.18), surface: k.panel,
        field: thMix(k.bg, k.panel, 0.5), fieldText: k.text, fieldLine: thMix(k.panel, k.text, 0.18),
        raised: thRgba(thMix(k.panel, ink, 0.03), 0.97), inset, btn: thMix(k.panel, k.text, 0.09), line: thMix(k.panel, k.text, 0.16),
        text: k.text, muted: thMix(k.text, k.panel, mt), dim: thMix(k.text, k.panel, Math.min(0.52, mt + 0.2)),
        /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.3. bv-34b62f37 */ accent: k.accent, accentText: thMix(k.accent, k.text, 0.3), sel: thBtn(k.accent),
        up: k.up, down: k.down, upBtn: thBtn(k.up), downBtn: thBtn(k.down), warn: '#f59e0b', big: '#fcd34d',
        glow: thRgba(k.accent, 0.3), shadow: light ? 'rgba(15, 23, 42, 0.18)' : 'rgba(0, 0, 0, 0.55)',
        chart: { bg: thMix(k.bg, k.panel, 0.25), grid: thRgba(k.text, 0.06), text: thMix(k.text, k.panel, 0.35), up: k.up, down: k.down }
    };
}
