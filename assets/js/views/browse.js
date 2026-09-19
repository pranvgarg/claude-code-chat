(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Shared session store (Task 8) — replaces the old module-level cache */
  /* ------------------------------------------------------------------ */
  function cachedSessions() { return CCE.sessionStore.all(); }

  /* ------------------------------------------------------------------ */
  /* Helpers (Task 3 shared util)                                         */
  /* ------------------------------------------------------------------ */
  var esc = CCE.util.esc, money = CCE.util.money, relTime = CCE.util.relTime, modelClass = CCE.util.modelClass;

  function starSVG(on) {
    return '<span class="star' + (on ? ' on' : '') + '">' +
      '<svg viewBox="0 0 24 24" fill="' + (on ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2">' +
      '<path d="M12 2l3 6.9 7.6.6-5.8 5 1.8 7.5L12 18l-6.4 4 1.8-7.5-5.8-5 7.6-.6z"/>' +
      '</svg></span>';
  }

  function modelBadge(fullModel) {
    var cls = modelClass(fullModel);
    var label = fullModel || 'unknown';
    // Shorten long model IDs for display
    if (label.length > 22) label = label.slice(0, 22) + '…';
    return '<span class="badge-model ' + cls + '">' + esc(label) + '</span>';
  }

  function branchChip(b) {
    if (!b) return '';
    return '<span class="chip-branch">' +
      '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/>' +
      '<path d="M6 8.5v7M18 10.5c0 4-6 2-6 5"/>' +
      '</svg>' + esc(b) + '</span>';
  }

  function promptLabel(s) { return s.empty ? 'Empty session' : esc(s.prompt); }
  function costTitleAttr(s) { return s.unknownModel ? ' title="Estimated: unknown model rates"' : ''; }

  /* ------------------------------------------------------------------ */
  /* State (per-mount; reset on each mount so navigation is clean)       */
  /* ------------------------------------------------------------------ */
  var state = { view: 'list', sort: 'Recent', group: 'By project', filters: { project: '', model: '', branch: '', days: 0, starred: false } };

  /* ------------------------------------------------------------------ */
  /* Data filter / sort                                                   */
  /* ------------------------------------------------------------------ */
  function applyFilter(summaries) {
    var f = state.filters, d = summaries.slice();
    if (f.project) d = d.filter(function (s) { return s.projectFolder === f.project; });
    if (f.model) d = d.filter(function (s) { return modelClass(s.model) === f.model; });
    if (f.branch) d = d.filter(function (s) { return s.branch === f.branch; });
    if (f.days) { var cutoff = Date.now() - f.days * 86400000; d = d.filter(function (s) { return s.lastTs && Date.parse(s.lastTs) >= cutoff; }); }
    if (f.starred) d = d.filter(function (s) { return CCE.store.isFavorite(s.id); });
    if (state.sort === 'Cost') d.sort(function (a, b) { return (b.cost || 0) - (a.cost || 0); });
    else if (state.sort === 'Messages') d.sort(function (a, b) { return (b.msgs || 0) - (a.msgs || 0); });
    else if (state.sort === 'Project') d.sort(function (a, b) { return String(a.displayPath).localeCompare(String(b.displayPath)) || tsOf(b) - tsOf(a); });
    else d.sort(function (a, b) { return tsOf(b) - tsOf(a); });
    return d;
  }
  function tsOf(s) { return s.lastTs ? Date.parse(s.lastTs) : 0; }

  /* ------------------------------------------------------------------ */
  /* Renderers (ported from docs/mockups/sessions-v2.html)               */
  /* Each renderer is windowed: it renders d.slice(from, to) and only     */
  /* emits the wrapper element on the first page (from === 0); later      */
  /* pages return loose markup appended into the existing wrapper.        */
  /* ------------------------------------------------------------------ */
  function renderGrid(d, from, to) {
    var body = d.slice(from, to).map(function (s) {
      var cls = modelClass(s.model) === 'opus' ? ' op' : '';
      if (s.empty) cls += ' is-empty';
      var fav = CCE.store.isFavorite(s.id);
      return '<div class="card' + cls + '" data-id="' + esc(s.id) + '" tabindex="0" role="button">' +
        '<div class="top"><div class="prompt">' + promptLabel(s) + '</div>' + starSVG(fav) + '</div>' +
        '<div class="path">' + esc(s.displayPath || '') + '</div>' +
        '<div class="tags">' + modelBadge(s.model) + branchChip(s.branch) + '</div>' +
        '<div class="foot meta-row">' +
        '<span>' + (s.msgs || 0) + ' msgs</span>' +
        '<span class="sep">·</span>' +
        '<span>' + relTime(s.lastTs) + '</span>' +
        '<span class="cost"' + costTitleAttr(s) + '>' + money(s.cost) + '</span>' +
        '</div>' +
        '</div>';
    }).join('');
    return from === 0 ? '<div class="view-grid">' + body + '</div>' : body;
  }

  function rowHTML(s) {
    var fav = CCE.store.isFavorite(s.id);
    var proj = (s.displayPath || '').split('/').pop() || s.displayPath || '';
    var cls = s.empty ? ' is-empty' : '';
    return '<div class="lrow' + cls + '" data-id="' + esc(s.id) + '" tabindex="0" role="button">' +
      '<span class="l-prompt">' + promptLabel(s) + '</span>' +
      '<span class="path">' + esc(proj) + '</span>' +
      modelBadge(s.model) +
      '<span class="num">' + (s.msgs || 0) + '</span>' +
      '<span class="cost"' + costTitleAttr(s) + ' style="text-align:right">' + money(s.cost) + '</span>' +
      '<span class="mod">' + relTime(s.lastTs) + '</span>' +
      starSVG(fav) +
      '</div>';
  }

  /* Last group key rendered by the previous renderList page, so an           */
  /* appended page can tell whether it is continuing a group whose header     */
  /* already rendered on the prior page (see renderStage's paging loop).      */
  var _listLastGroupKey = null;

  function renderList(d, from, to, lastGroupKey) {
    var head = from === 0 ? '<div class="lhead">' +
      '<span>Prompt</span><span>Project</span><span>Model</span>' +
      '<span style="text-align:right">Msgs</span>' +
      '<span style="text-align:right">Cost</span>' +
      '<span style="text-align:right">Modified</span>' +
      '<span></span></div>' : '';

    var rows;
    if (state.group === 'By project') {
      /* Group the FULL array (not the page slice) so a project's count/cost  */
      /* totals are correct and its header renders exactly once, even when    */
      /* its sessions straddle a page boundary.                               */
      var groups = {};
      var order  = [];
      d.forEach(function (s) {
        var key = s.displayPath || s.projectFolder || '(unknown)';
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(s);
      });
      var flat = [];
      order.forEach(function (key) {
        groups[key].forEach(function (s) { flat.push({ key: key, session: s }); });
      });

      rows = '';
      var currentKey = from === 0 ? null : lastGroupKey;
      flat.slice(from, to).forEach(function (entry) {
        if (entry.key !== currentKey) {
          var items = groups[entry.key];
          var c = items.reduce(function (a, s) { return a + (s.cost || 0); }, 0);
          rows += '<div class="lgroup">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
            '</svg>' + esc(entry.key) +
            '<span class="g-count">' + items.length + ' session' + (items.length !== 1 ? 's' : '') + '</span>' +
            '<span class="g-cost cost">' + money(c) + '</span>' +
            '</div>';
          currentKey = entry.key;
        }
        rows += rowHTML(entry.session);
      });
      _listLastGroupKey = currentKey;
    } else {
      rows = d.slice(from, to).map(rowHTML).join('');
    }

    var body = head + rows;
    return from === 0 ? '<div class="view-list">' + body + '</div>' : body;
  }

  function renderTiles(d, from, to) {
    var body = d.slice(from, to).map(function (s) {
      var cls = modelClass(s.model) === 'opus' ? ' op' : '';
      if (s.empty) cls += ' is-empty';
      var proj = (s.displayPath || '').split('/').pop() || s.displayPath || '';
      return '<div class="tile' + cls + '" data-id="' + esc(s.id) + '" tabindex="0" role="button">' +
        '<span class="t-dot"></span>' +
        '<div class="t-title">' + promptLabel(s) + '</div>' +
        '<div class="t-foot">' +
        '<span class="t-proj">' + esc(proj) + '</span>' +
        '<span class="t-cost"' + costTitleAttr(s) + '>' + money(s.cost) + '</span>' +
        '</div>' +
        '</div>';
    }).join('');
    return from === 0 ? '<div class="view-tiles">' + body + '</div>' : body;
  }

  /* ------------------------------------------------------------------ */
  /* Skeleton loader                                                      */
  /* ------------------------------------------------------------------ */
  function skeletonHTML() {
    return '<div class="skeleton">' + Array(8).fill('<div class="sk"></div>').join('') + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Click / keyboard wiring — shared across renderers and pagination     */
  /* ------------------------------------------------------------------ */
  function wireItems(scope) {
    scope.querySelectorAll('[data-id]').forEach(function (el) {
      if (el.dataset.wired === '1') return;
      el.dataset.wired = '1';
      var id = el.dataset.id;
      function open() {
        recordOpen(id);
        CCE.router.go('#/viewer?id=' + encodeURIComponent(id));
      }
      el.addEventListener('click', function (e) {
        if (e.target.closest('.star')) return; // handled below
        open();
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
    scope.querySelectorAll('.star').forEach(function (el) {
      if (el.dataset.wired === '1') return;
      el.dataset.wired = '1';
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var row = el.closest('[data-id]');
        if (!row) return;
        var id = row.dataset.id;
        CCE.store.toggleFavorite(id);
        var on = CCE.store.isFavorite(id);
        el.classList.toggle('on', on);
        var svgEl = el.querySelector('svg');
        if (svgEl) svgEl.setAttribute('fill', on ? 'currentColor' : 'none');
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Render into stage element                                            */
  /* ------------------------------------------------------------------ */
  /* Windowed-render pagination observer — one at a time. renderStage may be  */
  /* re-invoked (filter/sort/group/view change) while a previous observer is  */
  /* still watching a now-discarded sentinel, so it must be disconnected      */
  /* before a new one is created.                                            */
  var _pageObserver = null;

  function renderStage(stage, totalEl, eyebrowEl, summaries) {
    if (_pageObserver) { _pageObserver.disconnect(); _pageObserver = null; }

    var d = applyFilter(summaries);

    var total = d.reduce(function (a, s) { return a + (s.cost || 0); }, 0);
    totalEl.textContent = d.length + ' session' + (d.length !== 1 ? 's' : '') + ' · est. ' + money(total);
    eyebrowEl.textContent = state.group === 'By project' ? 'Grouped by project' : 'All sessions';

    if (d.length === 0) {
      stage.innerHTML =
        '<div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>' +
        '</svg>' +
        '<h3>No sessions found</h3>' +
        '<p>Connect to a folder with Claude sessions.</p>' +
        '</div>';
      return;
    }

    var PAGE = 60;
    var renderer = state.view === 'grid' ? renderGrid : state.view === 'tiles' ? renderTiles : renderList;
    stage.innerHTML = renderer(d, 0, PAGE);
    var container = stage.firstElementChild || stage;
    var rendered = Math.min(PAGE, d.length);
    if (rendered < d.length) {
      var sentinel = document.createElement('div');
      sentinel.className = 'cce-sentinel'; sentinel.setAttribute('aria-hidden', 'true');
      stage.appendChild(sentinel);
      _pageObserver = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = renderer(d, rendered, rendered + PAGE, _listLastGroupKey);
        while (tmp.firstChild) container.appendChild(tmp.firstChild);
        rendered += PAGE;
        wireItems(container);
        if (rendered >= d.length) { _pageObserver.disconnect(); _pageObserver = null; sentinel.remove(); }
      }, { root: document.getElementById('view-root'), rootMargin: '600px' });
      _pageObserver.observe(sentinel);
    }
    wireItems(container);
  }

  /* ------------------------------------------------------------------ */
  /* Toolbar HTML                                                         */
  /* ------------------------------------------------------------------ */
  function toolbarHTML() {
    return '<div class="seg" id="cce-seg">' +
      '<button data-view="grid" title="Grid — rich cards">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
      '<rect x="14" y="14" width="7" height="7" rx="1"/>' +
      '</svg>Grid</button>' +
      '<button data-view="list" title="List — dense rows">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>' +
      '</svg>List</button>' +
      '<button data-view="tiles" title="Tiles — compact">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<rect x="3" y="3" width="6" height="6" rx="1"/>' +
      '<rect x="10.5" y="3" width="6" height="6" rx="1"/>' +
      '<rect x="18" y="3" width="3" height="6" rx="1"/>' +
      '<rect x="3" y="11" width="6" height="6" rx="1"/>' +
      '<rect x="10.5" y="11" width="6" height="6" rx="1"/>' +
      '<rect x="18" y="11" width="3" height="6" rx="1"/>' +
      '</svg>Tiles</button>' +
      '</div>';
  }

  function filterHTML() {
    return '<button class="tbtn" id="cce-sort-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M3 6h18M7 12h10M11 18h2"/>' +
      '</svg>Sort <span class="muted" id="cce-sort-label">Recent</span>' +
      '</button>' +
      '<select class="tbtn" id="cce-f-project" aria-label="Filter by project"><option value="">All projects</option></select>' +
      '<select class="tbtn" id="cce-f-model" aria-label="Filter by model"><option value="">Any model</option><option value="opus">Opus</option><option value="sonnet">Sonnet</option><option value="haiku">Haiku</option><option value="fable">Fable</option></select>' +
      '<select class="tbtn" id="cce-f-branch" aria-label="Filter by branch"><option value="">Any branch</option></select>' +
      '<select class="tbtn" id="cce-f-days" aria-label="Filter by date"><option value="0">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>' +
      '<button class="tbtn" id="cce-f-starred" aria-pressed="false">★ Starred</button>';
  }

  /* ------------------------------------------------------------------ */
  /* View registration                                                    */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/sessions', {
    title: 'Sessions',
    mount: function (root) {
      /* -------------------------------------------------------------- */
      /* 1. Populate the shell toolbar (sibling of view-root)            */
      /* -------------------------------------------------------------- */
      var shellToolbar = document.getElementById('toolbar-actions');
      if (shellToolbar) {
        shellToolbar.innerHTML = toolbarHTML();
      }

      /* -------------------------------------------------------------- */
      /* 2. Build scrollable content inside view-root                    */
      /* -------------------------------------------------------------- */
      root.innerHTML =
        '<div class="recent" id="cce-recent"></div>' +
        '<div class="content-head">' +
        '<span class="eyebrow" id="cce-eyebrow">All sessions</span>' +
        '<span class="total" id="cce-total"></span>' +
        '</div>' +
        '<div class="sessions-filter-row" id="cce-filters">' + filterHTML() + '</div>' +
        '<div id="cce-stage"></div>';

      /* Resolve toolbar element references (may be in shellToolbar or root) */
      var toolbarCtx = shellToolbar || root;
      var filterCtx = root.querySelector('#cce-filters') || toolbarCtx;
      var stage    = root.querySelector('#cce-stage');
      var totalEl  = root.querySelector('#cce-total');
      var eyebrowEl = root.querySelector('#cce-eyebrow');

      /* -------------------------------------------------------------- */
      /* 2. Restore persisted state                                       */
      /* -------------------------------------------------------------- */
      state.view  = CCE.store.get('view', 'list');
      state.sort  = 'Recent';
      state.group = 'By project';
      state.filters = { project: '', model: '', branch: '', days: 0, starred: false };

      /* Update seg toggle buttons */
      toolbarCtx.querySelectorAll('#cce-seg button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.view === state.view);
      });

      /* -------------------------------------------------------------- */
      /* 3. Wire controls                                                 */
      /* -------------------------------------------------------------- */
      /* View toggle */
      var segEl = toolbarCtx.querySelector('#cce-seg');
      if (segEl) segEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        toolbarCtx.querySelectorAll('#cce-seg button').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        state.view = btn.dataset.view;
        CCE.store.set('view', state.view);
        if (cachedSessions()) renderStage(stage, totalEl, eyebrowEl, cachedSessions());
      });

      /* Sort cycle: Recent → Cost → Messages → Project → Recent */
      var sortBtn = filterCtx.querySelector('#cce-sort-btn');
      if (sortBtn) sortBtn.addEventListener('click', function () {
        state.sort = state.sort === 'Recent' ? 'Cost' : state.sort === 'Cost' ? 'Messages' : state.sort === 'Messages' ? 'Project' : 'Recent';
        var lbl = filterCtx.querySelector('#cce-sort-label');
        if (lbl) lbl.textContent = state.sort;
        if (cachedSessions()) renderStage(stage, totalEl, eyebrowEl, cachedSessions());
      });

      /* Filter controls: project / model / branch / date / starred */
      function populateFilterOptions(summaries) {
        var projects = {}, branches = {};
        summaries.forEach(function (s) { projects[s.projectFolder] = s.displayPath; if (s.branch) branches[s.branch] = 1; });
        var pSel = filterCtx.querySelector('#cce-f-project'), bSel = filterCtx.querySelector('#cce-f-branch');
        if (pSel) Object.keys(projects).sort().forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = projects[k]; pSel.appendChild(o); });
        if (bSel) Object.keys(branches).sort().forEach(function (b) { var o = document.createElement('option'); o.value = b; o.textContent = b; bSel.appendChild(o); });
      }
      ['project', 'model', 'branch', 'days'].forEach(function (name) {
        var el = filterCtx.querySelector('#cce-f-' + name);
        if (el) el.addEventListener('change', function () {
          state.filters[name] = name === 'days' ? Number(el.value) : el.value;
          if (cachedSessions()) renderStage(stage, totalEl, eyebrowEl, cachedSessions());
        });
      });
      var starBtn = filterCtx.querySelector('#cce-f-starred');
      if (starBtn) starBtn.addEventListener('click', function () {
        state.filters.starred = !state.filters.starred;
        starBtn.setAttribute('aria-pressed', String(state.filters.starred));
        starBtn.classList.toggle('on', state.filters.starred);
        if (cachedSessions()) renderStage(stage, totalEl, eyebrowEl, cachedSessions());
      });

      /* -------------------------------------------------------------- */
      /* 4. Show skeleton while loading                                   */
      /* -------------------------------------------------------------- */
      if (cachedSessions()) {
        /* Already loaded — re-render immediately (user navigated back) */
        renderStage(stage, totalEl, eyebrowEl, cachedSessions());
        renderRecentStrip(root.querySelector('#cce-recent'), cachedSessions());
        populateFilterOptions(cachedSessions());
        return;
      }

      stage.innerHTML = skeletonHTML();

      /* -------------------------------------------------------------- */
      /* 5. Load and parse sessions                                       */
      /* -------------------------------------------------------------- */
      CCE.sessionStore.load({
        onProgress: function (p) {
          var skEl = stage.querySelector('.skeleton');
          if (skEl) skEl.setAttribute('aria-label', 'Loading ' + p.done + ' of ' + p.total + ' sessions');
        }
      }).then(function (results) {
        renderStage(stage, totalEl, eyebrowEl, results);
        renderRecentStrip(root.querySelector('#cce-recent'), results);
        populateFilterOptions(results);
      }).catch(function (err) {
        console.error('[CCE browse] load failed:', err);
        stage.innerHTML =
          '<div class="empty">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>' +
          '</svg>' +
          '<h3>Could not load sessions</h3>' +
          '<p>' + esc(err && err.message ? err.message : String(err)) + '</p>' +
          '</div>';
      });
    },
    unmount: function () {
      if (_pageObserver) { _pageObserver.disconnect(); _pageObserver = null; }
    }
  });

  /* ------------------------------------------------------------------ */
  /* Recently-opened strip (last 4 sessions actually opened)              */
  /* ------------------------------------------------------------------ */
  function recordOpen(id) {
    var list = (CCE.store.get('recentOpened', []) || []).filter(function (x) { return x !== id; });
    list.unshift(id);
    CCE.store.set('recentOpened', list.slice(0, 8));
  }

  function renderRecentStrip(container, summaries) {
    if (!container || !summaries) return;
    var byId = {}; summaries.forEach(function (s) { byId[s.id] = s; });
    var rec = (CCE.store.get('recentOpened', []) || []).map(function (id) { return byId[id]; }).filter(Boolean).slice(0, 4);
    if (!rec.length) { container.innerHTML = ''; return; }
    container.innerHTML = '<span class="rlabel">Recently opened</span>' + rec.map(function (s) {
      var colorVar = modelClass(s.model) === 'opus' ? 'var(--c-assistant)' : 'var(--c-user)';
      var label = (s.prompt || '').slice(0, 26) + ((s.prompt || '').length > 26 ? '…' : '');
      return '<div class="rpill" role="button" tabindex="0" data-id="' + esc(s.id) + '" title="' + esc(s.prompt || '') + '">' +
        '<span class="rdot" style="width:6px;height:6px;border-radius:50%;background:' + colorVar + '"></span>' + esc(label) + '</div>';
    }).join('');
    wireItems(container);
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
