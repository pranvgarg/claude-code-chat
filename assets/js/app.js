(function (g) {
  const CCE = g.CCE = g.CCE || {};
  const views = {};
  const router = {
    register(hash, view) { views[hash] = view; },
    go(hash) {
      if (location.hash !== hash) { location.hash = hash; return; }
      render();
    }
  };
  function render() {
    const hash = (location.hash || '#/sessions').split('?')[0]; // strip query (e.g. #/viewer?id=x)
    const view = views[hash] || views['#/sessions'];
    const main = document.getElementById('view-root');
    if (!view || !CCE.state.connected) return;
    document.querySelectorAll('.nav-item[data-hash]').forEach(n => {
      const isActive = n.dataset.hash === hash;
      n.classList.toggle('active', isActive);
      // Reflect active state for assistive tech (mirrors the .active class).
      if (isActive) n.setAttribute('aria-current', 'page');
      else n.removeAttribute('aria-current');
    });
    main.innerHTML = '';
    view.mount(main);
    // Fade the freshly mounted view in (CSS handles the reduced-motion guard).
    main.classList.remove('cce-view-in');
    // Force reflow so the animation restarts on each navigation.
    void main.offsetWidth;
    main.classList.add('cce-view-in');
  }
  CCE.router = router;
  CCE.state = { connected: false };

  // Populate the sidebar's Sessions count badge once sessions are loaded.
  // Reads CCE.sessions.all() exposed by browse.js — safe to call anytime.
  CCE.app = CCE.app || {};
  CCE.app.updateNavCounts = function () {
    var sessions = (CCE.sessions && CCE.sessions.all && CCE.sessions.all()) || null;
    var badge = document.querySelector('.nav-item[data-hash="#/sessions"] .count');
    if (badge && sessions) badge.textContent = String(sessions.length);
  };

  // Refresh the sidebar's connected-path text from fsaccess.
  CCE.app.updateBrandPath = function () {
    var el = document.getElementById('brand-path-text');
    if (!el) return;
    var path = (CCE.connect && typeof CCE.connect.getPath === 'function')
      ? CCE.connect.getPath()
      : '~/.claude';
    el.textContent = path;
    el.setAttribute('title', path);
  };

  // All sidebar tabs now have real views (registered by their own view files
  // which load after app.js). No placeholder routes remain.

  CCE.app = {
    boot() {
      // Theme: read from CCE.store if available, else fall back to localStorage
      var savedTheme;
      if (typeof CCE.store.get === 'function') {
        savedTheme = CCE.store.get('theme', 'dark');
      } else {
        savedTheme = localStorage.getItem('cce-theme') || 'dark';
      }
      document.documentElement.dataset.theme = savedTheme;

      window.addEventListener('hashchange', render);

      // Wire sidebar nav clicks -> navigate (the items only had data-hash before)
      document.querySelectorAll('.nav-item[data-hash]').forEach(function (n) {
        n.addEventListener('click', function () { CCE.router.go(n.dataset.hash); });
      });

      document.getElementById('btn-theme') && document.getElementById('btn-theme').addEventListener('click', function () {
        var nt = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = nt;
        if (typeof CCE.store.set === 'function') {
          CCE.store.set('theme', nt);
        } else {
          localStorage.setItem('cce-theme', nt);
        }
      });

      document.getElementById('btn-export-prefs')?.addEventListener('click', () => {
        const blob = new Blob([CCE.store.exportPrefs()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'explorer-prefs.json'; a.click();
      });
      const pf = document.getElementById('prefs-file');
      document.getElementById('btn-import-prefs')?.addEventListener('click', () => pf.click());
      pf?.addEventListener('change', async () => {
        if (!pf.files[0]) return;
        const ok = CCE.store.importPrefs(await pf.files[0].text());
        if (ok) location.reload();
      });
      if (!CCE.store.available) {
        // one-time, non-nagging notice that prefs won't persist for double-clicked files
        console.warn('[CCE] Preferences will not persist in this browser for file:// — use Export prefs, or the launcher.');
      }

      CCE.connect.init(function () { CCE.state.connected = true; showApp(); render(); });

      // Listen for the sessions-loaded event (dispatched by browse.js) to
      // populate the Sessions nav badge without coupling to browse internals.
      window.addEventListener('cce:sessions-loaded', function (e) {
        var badge = document.querySelector('.nav-item[data-hash="#/sessions"] .count');
        if (badge && e.detail && typeof e.detail.count === 'number') {
          badge.textContent = String(e.detail.count);
        }
      });
    }
  };
  function showApp() {
    document.getElementById('connect').style.display = 'none';
    document.getElementById('app').style.display = '';
    // Now that we're connected, refresh the sidebar's path label.
    if (CCE.app && typeof CCE.app.updateBrandPath === 'function') {
      CCE.app.updateBrandPath();
    }
  }
  g.addEventListener('DOMContentLoaded', function () { CCE.app.boot(); });

})(typeof globalThis !== 'undefined' ? globalThis : this);
