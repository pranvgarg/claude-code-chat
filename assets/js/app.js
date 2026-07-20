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
    document.querySelectorAll('.nav-item[data-hash]').forEach(n =>
      n.classList.toggle('active', n.dataset.hash === hash));
    main.innerHTML = '';
    view.mount(main);
  }
  CCE.router = router;
  CCE.state = { connected: false };
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
    }
  };
  function showApp() {
    document.getElementById('connect').style.display = 'none';
    document.getElementById('app').style.display = '';
  }
  g.addEventListener('DOMContentLoaded', function () { CCE.app.boot(); });

  // Temporary CCE.connect stub — replaced by fsaccess.js in Task 6.
  // Wires btn-connect to the callback so the shell is navigable during development.
  CCE.connect = CCE.connect || {
    init: function (cb) {
      var btn = document.getElementById('btn-connect');
      if (btn) { btn.onclick = cb; }
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
