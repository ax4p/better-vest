/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-4811fa86 */ var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css;
            document.head.appendChild(s); /* Better Vest by Astral (@ax4p). Copyright (c) 2026 Astral. All rights reserved. ref bv-d5e05398 */
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
