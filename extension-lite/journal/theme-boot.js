/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        if (css) { /*! Astral / Better Vest. Copying this file, in whole or in part, is prohibited. ref bv-1c996e15 */
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css;
            /* Copyright (c) 2026 Astral. Better Vest 9.3.1 is licensed to its users only to run it, never to copy it. bv-07017804 */ document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
