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
  let current = null;
  function render() {
    const hash = (location.hash || '#/sessions').split('?')[0]; // strip query (e.g. #/viewer?id=x)
    const view = views[hash] || views['#/sessions'];
    const main = document.getElementById('view-root');
    if (!view || !CCE.state.connected) return;
    if (current && typeof current.unmount === 'function') {
      try { current.unmount(); } catch (e) { console.error(e); }
    }
    current = view;
    var globalSearch = document.getElementById('global-q');
    var isSearch = hash === '#/search';
    if (globalSearch && !isSearch) {
      globalSearch.value = '';
      globalSearch.placeholder = 'Search sessions, projects, branches…';
      globalSearch.setAttribute('aria-label', 'Search all sessions, projects, and branches');
    }
    document.querySelectorAll('.nav-item[data-hash]').forEach(n => {
      const isActive = n.dataset.hash === hash;
      n.classList.toggle('active', isActive);
      // Reflect active state for assistive tech (mirrors the .active class).
      if (isActive) n.setAttribute('aria-current', 'page');
      else n.removeAttribute('aria-current');
    });
    // Clear the project-context chip on every navigation; views that are
    // project-scoped (viewer, memory) re-set it once their own data loads.
    if (CCE.app && typeof CCE.app.clearActiveProject === 'function') {
      CCE.app.clearActiveProject();
    }
    const actions = document.getElementById('toolbar-actions');
    if (actions) actions.innerHTML = '';
    main.innerHTML = '';
    view.mount(main);
    // Fade the freshly mounted view in (CSS handles the reduced-motion guard).
    main.classList.remove('cce-view-in');
    // Force reflow so the animation restarts on each navigation.
    void main.offsetWidth;
    main.classList.add('cce-view-in');
  }
  CCE.router = router;
  CCE.state = { connected: false, activeProject: null };

  CCE.app = CCE.app || {};

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

  // Project-context chip: shows which project the current session/memory
  // group belongs to. Set by viewer.js (session opened) and memory.js
  // (project group expanded); cleared on navigation to a project-agnostic view.
  CCE.app.setActiveProject = function (projectFolder) {
    CCE.state.activeProject = projectFolder;
    var chip = document.getElementById('brand-project-chip');
    if (!chip) return;
    if (!projectFolder) {
      chip.style.display = 'none';
      chip.textContent = '';
      chip.title = '';
      return;
    }
    var displayPath = (CCE.sessionIndex && CCE.sessionIndex.projectDisplayPath)
      ? CCE.sessionIndex.projectDisplayPath(projectFolder)
      : projectFolder;
    chip.textContent = displayPath;
    chip.title = displayPath;
    chip.style.display = '';
  };
  CCE.app.clearActiveProject = function () { CCE.app.setActiveProject(null); };

  // Keep the global toolbar search box in sync with the current #/search
  // query (e.g. on load, back/forward nav, or when the search view mounts).
  CCE.app.syncSearchBox = function (term) {
    var q = document.getElementById('global-q');
    if (q) {
      if (q.value !== term) q.value = term;
      q.placeholder = 'Search all sessions, projects, branches…';
      q.setAttribute('aria-label', 'Search all sessions, projects, and branches');
    }
  };

  CCE.app.initResizable = function (handle, target, options) {
    if (!handle || !target) return;
    var min = options.min || 180, max = options.max || 420, key = options.key;
    var saved = key && CCE.store.get(key, null);
    function setSize(width) {
      var value = Math.max(min, Math.min(max, Number(width))) + 'px';
      if (options.property) target.style.setProperty(options.property, value);
      else target.style.width = value;
    }
    if (saved) setSize(saved);
    function stop() {
      document.body.classList.remove('is-resizing');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
    }
    function move(e) {
      var rect = target.getBoundingClientRect();
      var width = Math.max(min, Math.min(max, e.clientX - rect.left));
      setSize(width);
      if (key) CCE.store.set(key, width);
    }
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      document.body.classList.add('is-resizing');
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop, { once: true });
    });
  };

  // All sidebar tabs now have real views (registered by their own view files
  // which load after app.js). No placeholder routes remain.

  CCE.app.boot = function () {
      // Theme: read from CCE.store if available, else fall back to localStorage
      var savedTheme;
      if (typeof CCE.store.get === 'function') {
        savedTheme = CCE.store.get('theme', 'dark');
      } else {
        savedTheme = localStorage.getItem('cce-theme') || 'dark';
      }
      document.documentElement.dataset.theme = savedTheme;

      var appShell = document.getElementById('app');
      var sidebarToggle = document.getElementById('btn-sidebar-toggle');
      var collapsed = CCE.store.get('sidebar-collapsed', false) === true;
      function setSidebarCollapsed(next) {
        collapsed = !!next;
        appShell.classList.toggle('sidebar-collapsed', collapsed);
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
        sidebarToggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        sidebarToggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
        CCE.store.set('sidebar-collapsed', collapsed);
      }
      setSidebarCollapsed(collapsed);
      sidebarToggle.addEventListener('click', function () { setSidebarCollapsed(!collapsed); });
      CCE.app.initResizable(document.getElementById('sidebar-resizer'), appShell, { min: 200, max: 360, key: 'sidebar-width', property: '--sidebar-width' });

      var preferences = document.getElementById('btn-preferences');
      var preferencesMenu = document.getElementById('prefs-menu');
      function closePreferences() {
        preferencesMenu.hidden = true;
        preferences.setAttribute('aria-expanded', 'false');
      }
      preferences.addEventListener('click', function (e) {
        e.stopPropagation();
        preferencesMenu.hidden = !preferencesMenu.hidden;
        preferences.setAttribute('aria-expanded', String(!preferencesMenu.hidden));
      });
      document.addEventListener('click', closePreferences);

      var q = document.getElementById('global-q');
      if (q) {
        var go = CCE.util.debounce(function () {
          var term = q.value.trim();
          var onSearch = location.hash.indexOf('#/search') === 0;
          if (!term) { if (onSearch) CCE.router.go('#/sessions'); return; }
          var scope = new URLSearchParams(location.hash.split('?')[1] || '').get('scope') || 'full';
          var target = '#/search?q=' + encodeURIComponent(term) + '&scope=' + scope;
          if (onSearch) { history.replaceState(null, '', target); render(); } else location.hash = target;
        }, 250);
        q.addEventListener('input', go);
        q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; go(); } });
      }

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
        closePreferences();
      });

      document.getElementById('btn-export-prefs')?.addEventListener('click', () => {
        const blob = new Blob([CCE.store.exportPrefs()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'explorer-prefs.json'; a.click();
        closePreferences();
      });
      const pf = document.getElementById('prefs-file');
      document.getElementById('btn-import-prefs')?.addEventListener('click', () => { closePreferences(); pf.click(); });
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
