/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try { /*! Better Vest (c) 2026 Astral. All rights reserved. bv-89f71b7c */
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
    /* (c) 2026 Astral. Better Vest is not open source: copying, reuse or resale of this code is not allowed. bv-b3dda94a */ } catch (e) {  }
})();
