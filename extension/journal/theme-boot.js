/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name); /*! Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-c8e57f36 */
        if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css;
            /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-5217f423 */ document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
