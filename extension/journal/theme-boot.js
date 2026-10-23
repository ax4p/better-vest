/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-55e5caeb */ if (name) root.setAttribute('data-theme', name);
        if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css;
            document.head.appendChild(s);
        } /* @preserve Copyright (c) 2026 Astral (@ax4p). Better Vest 9.3.0. bv-0877ba06 */
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
