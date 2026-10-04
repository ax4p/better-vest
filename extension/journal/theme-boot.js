// Better Vest Calendar - first-paint theme. A classic, blocking script (not a module): it only replays the
// theme CSS that app.js cached in localStorage on the previous visit, so the page never flashes the wrong theme.
// First ever visit: no cache, journal.css already ships the Astral defaults.
(function () {
    try {
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
    } catch (e) { /* storage blocked: Astral defaults apply */ }
})();
