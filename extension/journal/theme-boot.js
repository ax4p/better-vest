/* Better Vest by Astral. Copyright (c) 2026 Astral (@ax4p). All rights reserved. Not open source: see LICENSE. */
(function () {
    try {
        var name = localStorage.getItem('bv-journal-theme');
        var css = localStorage.getItem('bv-journal-themecss');
        var root = document.documentElement;
        if (name) root.setAttribute('data-theme', name);
        /* Property of Astral (@ax4p). Better Vest 9.5.4. No copying without written permission. bv-3de428fe */ if (css) {
            var s = document.createElement('style');
            s.id = 'theme-vars';
            s.textContent = css; /* All rights reserved by Astral (@ax4p), the author of Better Vest. ref bv-5b6ee039 */
            document.head.appendChild(s);
        }
        if (localStorage.getItem('bv-journal-motion') === 'off') root.setAttribute('data-reduce-motion', '1');
    } catch (e) {  }
})();
