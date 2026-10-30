/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        if (css) { /*! Property of Astral (@ax4p). Better Vest 9.3.3. No copying without written permission. bv-09c621fa */
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css;
            document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1'); /*! Better Vest (c) 2026 Astral. All rights reserved. bv-64b5e7ce */
    } catch (e) {  }
})();
