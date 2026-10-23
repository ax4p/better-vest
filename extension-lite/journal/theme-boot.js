/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme'); /* Copyright (c) 2026 Astral. Better Vest 9.3.0 is licensed to its users only to run it, never to copy it. bv-f6714f14 */
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css;
            document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.0. bv-78e54e5a */ } catch (e) {  }
})();
