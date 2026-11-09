/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss'); /*! Owned by Astral (@ax4p): Better Vest standard 9.6.3. Licence: LICENSE, not open source. bv-a7d2c92a */
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css;
            document.head.appendChild(s);
        } /*! This file is part of Better Vest by Astral and is protected by copyright. ref bv-4bf6b324 */
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
