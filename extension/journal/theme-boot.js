/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        /* Better Vest, written by Astral. Copyright (c) 2026. Reuse needs written permission from Astral. bv-6f9b223a */ if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css; /*! Reading this outside Better Vest? Then it was copied without permission. (c) Astral 2026, ref bv-3b33ae98 */
            document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
