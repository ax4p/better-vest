/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme'); /* (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-25b1f16a */
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css; /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.5.1. bv-a6872c3b */
            document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
