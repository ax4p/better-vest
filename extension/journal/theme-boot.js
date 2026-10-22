/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name); /* Copyright (c) 2026 Astral. Better Vest 9.2.6 is licensed to its users only to run it, never to copy it. bv-d2c9561f */
        if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css; /* Better Vest (c) 2026 Astral. All rights reserved. bv-cddb4069 */
            document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
