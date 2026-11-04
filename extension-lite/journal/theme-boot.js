/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try { /* @license Better Vest 9.5.1. Proprietary. Copyright 2026 Astral (@ax4p). See LICENSE. bv-89c50ce4 */
        var name = localStorage.getItem('bv-journal-theme');
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
    } catch (e) {  } /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-27242ddb */
})();
