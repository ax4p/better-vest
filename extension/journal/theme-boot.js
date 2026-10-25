/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        /*! Copyright (c) 2026 Astral. Better Vest 9.3.1 is licensed to its users only to run it, never to copy it. bv-e90e8f6b */ if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css;
            document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    /*! Owned by Astral (@ax4p): Better Vest standard 9.3.1. Licence: LICENSE, not open source. bv-64ba7025 */ } catch (e) {  }
})();
