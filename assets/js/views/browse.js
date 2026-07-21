(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Module-level cache + public accessor for Task 9 (dashboard)         */
  /* ------------------------------------------------------------------ */
  var _cached = null; // Array of session summaries once loaded
  CCE.sessions = { all: function () { return _cached; } };

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function money(n) { return '$' + (n || 0).toFixed(2); }

  function relTime(ts) {
    if (!ts) return '';
    var now = Date.now();
    var ms = now - new Date(ts).getTime();
    if (ms < 0) ms = 0;
    var mins = Math.floor(ms / 60000);
    var hrs  = Math.floor(ms / 3600000);
    var days = Math.floor(ms / 86400000);
    if (mins < 60)  return mins + 'm';
    if (hrs  < 24)  return hrs  + 'h';
    if (days < 7)   return days + 'd';
    if (days < 14)  return '1w';
    return Math.round(days / 7) + 'w';
  }

  /* Detect short model name ("opus" or "sonnet") from a full model id */
  function modelClass(fullModel) {
    if (!fullModel) return 'sonnet';
    var m = String(fullModel).toLowerCase();
    if (m.indexOf('opus') !== -1) return 'opus';
    return 'sonnet';
  }

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

  /* ------------------------------------------------------------------ */
  /* State (per-mount; reset on each mount so navigation is clean)       */
  /* ------------------------------------------------------------------ */
  var state = {
    view: 'list',
    sort: 'Recent',
    group: 'By project',
    q: ''
  };

  /* ------------------------------------------------------------------ */
  /* Data filter / sort                                                   */
  /* ------------------------------------------------------------------ */
  function applyFilter(summaries) {
    var q = state.q.toLowerCase();
    var d;
    if (q) {
      if (typeof Fuse !== 'undefined') {
        var fuse = new Fuse(summaries, { keys: ['prompt', 'displayPath'], threshold: 0.4 });
        d = fuse.search(state.q).map(function (r) { return r.item; });
      } else {
        d = summaries.filter(function (s) {
          return (s.prompt + ' ' + (s.displayPath || '')).toLowerCase().indexOf(q) !== -1;
        });
      }
    } else {
      d = summaries.slice();
    }

    if (state.sort === 'Cost') {
      d.sort(function (a, b) { return (b.cost || 0) - (a.cost || 0); });
    } else if (state.sort === 'Messages') {
      d.sort(function (a, b) { return (b.msgs || 0) - (a.msgs || 0); });
    } else {
      // Recent — newest lastTs first
      d.sort(function (a, b) {
        var ta = a.lastTs ? new Date(a.lastTs).getTime() : 0;
        var tb = b.lastTs ? new Date(b.lastTs).getTime() : 0;
        return tb - ta;
      });
    }
    return d;
  }

  /* ------------------------------------------------------------------ */
  /* Renderers (ported from docs/mockups/sessions-v2.html)               */
  /* ------------------------------------------------------------------ */
  function renderGrid(d) {
    return '<div class="view-grid">' +
      d.map(function (s) {
        var cls = modelClass(s.model) === 'opus' ? ' op' : '';
        var fav = CCE.store.isFavorite(s.id);
        return '<div class="card' + cls + '" data-id="' + esc(s.id) + '">' +
          '<div class="top"><div class="prompt">' + esc(s.prompt) + '</div>' + starSVG(fav) + '</div>' +
          '<div class="path">' + esc(s.displayPath || '') + '</div>' +
          '<div class="tags">' + modelBadge(s.model) + branchChip(s.branch) + '</div>' +
          '<div class="foot meta-row">' +
          '<span>' + (s.msgs || 0) + ' msgs</span>' +
          '<span class="sep">·</span>' +
          '<span>' + relTime(s.lastTs) + '</span>' +
          '<span class="cost">' + money(s.cost) + '</span>' +
          '</div>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  function rowHTML(s) {
    var fav = CCE.store.isFavorite(s.id);
    var proj = (s.displayPath || '').split('/').pop() || s.displayPath || '';
    return '<div class="lrow" data-id="' + esc(s.id) + '">' +
      '<span class="l-prompt">' + esc(s.prompt) + '</span>' +
      '<span class="path">' + esc(proj) + '</span>' +
      modelBadge(s.model) +
      '<span class="num">' + (s.msgs || 0) + '</span>' +
      '<span class="cost" style="text-align:right">' + money(s.cost) + '</span>' +
      '<span class="mod">' + relTime(s.lastTs) + '</span>' +
      starSVG(fav) +
      '</div>';
  }

  function renderList(d) {
    var head = '<div class="lhead">' +
      '<span>Prompt</span><span>Project</span><span>Model</span>' +
      '<span style="text-align:right">Msgs</span>' +
      '<span style="text-align:right">Cost</span>' +
      '<span style="text-align:right">Modified</span>' +
      '<span></span></div>';

    var rows;
    if (state.group === 'By project') {
      var groups = {};
      var order  = [];
      d.forEach(function (s) {
        var key = s.displayPath || s.projectFolder || '(unknown)';
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(s);
      });
      rows = '';
      order.forEach(function (proj) {
        var items = groups[proj];
        var c = items.reduce(function (a, s) { return a + (s.cost || 0); }, 0);
        rows += '<div class="lgroup">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
          '</svg>' + esc(proj) +
          '<span class="g-count">' + items.length + ' session' + (items.length !== 1 ? 's' : '') + '</span>' +
          '<span class="g-cost cost">' + money(c) + '</span>' +
          '</div>';
        rows += items.map(rowHTML).join('');
      });
    } else {
      rows = d.map(rowHTML).join('');
    }

    return '<div class="view-list">' + head + rows + '</div>';
  }

  function renderTiles(d) {
    return '<div class="view-tiles">' +
      d.map(function (s) {
        var cls = modelClass(s.model) === 'opus' ? ' op' : '';
        var proj = (s.displayPath || '').split('/').pop() || s.displayPath || '';
        return '<div class="tile' + cls + '" data-id="' + esc(s.id) + '">' +
          '<span class="t-dot"></span>' +
          '<div class="t-title">' + esc(s.prompt) + '</div>' +
          '<div class="t-foot">' +
          '<span class="t-proj">' + esc(proj) + '</span>' +
          '<span class="t-cost">' + money(s.cost) + '</span>' +
          '</div>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Skeleton loader                                                      */
  /* ------------------------------------------------------------------ */
  function skeletonHTML() {
    return '<div class="skeleton">' + Array(8).fill('<div class="sk"></div>').join('') + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Render into stage element                                            */
  /* ------------------------------------------------------------------ */
  function renderStage(stage, totalEl, eyebrowEl, summaries) {
    var d = applyFilter(summaries);

    var total = d.reduce(function (a, s) { return a + (s.cost || 0); }, 0);
    totalEl.textContent = d.length + ' session' + (d.length !== 1 ? 's' : '') + ' · est. ' + money(total);
    eyebrowEl.textContent = state.group === 'By project' ? 'Grouped by project' : 'All sessions';

    if (d.length === 0) {
      var msg = state.q
        ? 'Nothing matches “' + state.q + '”'
        : 'No sessions found';
      var sub = state.q
        ? 'Try a different search, or clear the filter.'
        : 'Connect to a folder with Claude sessions.';
      stage.innerHTML =
        '<div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>' +
        '</svg>' +
        '<h3>' + esc(msg) + '</h3>' +
        '<p>' + esc(sub) + '</p>' +
        '</div>';
      return;
    }

    if (state.view === 'grid') {
      stage.innerHTML = renderGrid(d);
    } else if (state.view === 'tiles') {
      stage.innerHTML = renderTiles(d);
    } else {
      stage.innerHTML = renderList(d);
    }

    /* Wire click events: session click → navigate; star click → toggle */
    stage.querySelectorAll('[data-id]').forEach(function (el) {
      var id = el.dataset.id;
      el.addEventListener('click', function (e) {
        if (e.target.closest('.star')) return; // handled below
        CCE.router.go('#/viewer?id=' + encodeURIComponent(id));
      });
    });
    stage.querySelectorAll('.star').forEach(function (el) {
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
  /* Toolbar HTML                                                         */
  /* ------------------------------------------------------------------ */
  function toolbarHTML() {
    return '<div class="search" id="cce-search">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>' +
      '</svg>' +
      '<input id="cce-q" type="text" placeholder="Search all sessions…">' +
      '</div>' +

      '<div class="seg" id="cce-seg">' +
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
      '</div>' +

      '<button class="tbtn" id="cce-sort-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M3 6h18M7 12h10M11 18h2"/>' +
      '</svg>Sort <span class="muted" id="cce-sort-label">Recent</span>' +
      '</button>' +

      '<div class="spacer"></div>' +

      '<button class="tbtn" id="cce-group-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M3 7h18M3 12h18M3 17h18"/>' +
      '</svg><span id="cce-group-label">Recent</span>' +
      '</button>';
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
      var shellToolbar = document.querySelector('.toolbar');
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
        '<div id="cce-stage"></div>';

      /* Resolve toolbar element references (may be in shellToolbar or root) */
      var ctxEl   = shellToolbar || root;
      var stage    = root.querySelector('#cce-stage');
      var totalEl  = root.querySelector('#cce-total');
      var eyebrowEl = root.querySelector('#cce-eyebrow');

      /* -------------------------------------------------------------- */
      /* 2. Restore persisted state                                       */
      /* -------------------------------------------------------------- */
      state.view  = CCE.store.get('view', 'list');
      state.sort  = 'Recent';
      state.group = CCE.store.get('group', 'By project');
      state.q     = '';

      /* Update seg toggle buttons */
      ctxEl.querySelectorAll('#cce-seg button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.view === state.view);
      });

      /* Update group label to reflect current state */
      var groupLabel = ctxEl.querySelector('#cce-group-label');
      if (groupLabel) groupLabel.textContent = state.group;

      /* -------------------------------------------------------------- */
      /* 3. Wire controls                                                 */
      /* -------------------------------------------------------------- */
      /* Search */
      var qInput = ctxEl.querySelector('#cce-q');
      if (qInput) qInput.addEventListener('input', function (e) {
        state.q = e.target.value;
        if (_cached) renderStage(stage, totalEl, eyebrowEl, _cached);
      });

      /* View toggle */
      var segEl = ctxEl.querySelector('#cce-seg');
      if (segEl) segEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        ctxEl.querySelectorAll('#cce-seg button').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        state.view = btn.dataset.view;
        CCE.store.set('view', state.view);
        if (_cached) renderStage(stage, totalEl, eyebrowEl, _cached);
      });

      /* Sort cycle: Recent → Cost → Messages → Recent */
      var sortBtn = ctxEl.querySelector('#cce-sort-btn');
      if (sortBtn) sortBtn.addEventListener('click', function () {
        state.sort = state.sort === 'Recent' ? 'Cost' : state.sort === 'Cost' ? 'Messages' : 'Recent';
        var lbl = ctxEl.querySelector('#cce-sort-label');
        if (lbl) lbl.textContent = state.sort;
        if (_cached) renderStage(stage, totalEl, eyebrowEl, _cached);
      });

      /* Group toggle: Recent ↔ By project */
      var groupBtn = ctxEl.querySelector('#cce-group-btn');
      if (groupBtn) groupBtn.addEventListener('click', function () {
        state.group = state.group === 'Recent' ? 'By project' : 'Recent';
        var lbl = ctxEl.querySelector('#cce-group-label');
        if (lbl) lbl.textContent = state.group;
        CCE.store.set('group', state.group);
        if (_cached) renderStage(stage, totalEl, eyebrowEl, _cached);
      });

      /* -------------------------------------------------------------- */
      /* 4. Show skeleton while loading                                   */
      /* -------------------------------------------------------------- */
      if (_cached) {
        /* Already loaded — re-render immediately (user navigated back) */
        renderStage(stage, totalEl, eyebrowEl, _cached);
        renderRecentStrip(root.querySelector('#cce-recent'), _cached);
        return;
      }

      stage.innerHTML = skeletonHTML();

      /* -------------------------------------------------------------- */
      /* 5. Load and parse sessions                                       */
      /* -------------------------------------------------------------- */
      CCE.fsaccess.listSessions().then(function (descriptors) {
        /* Parse in batches to avoid blocking the main thread */
        var BATCH = 8;
        var results = [];
        var i = 0;

        function nextBatch() {
          var batch = descriptors.slice(i, i + BATCH);
          if (batch.length === 0) { return Promise.resolve(); }
          i += BATCH;
          return Promise.all(
            batch.map(function (desc) {
              return desc.read()
                .then(function (text) {
                  var entries = CCE.jsonl.parse(text);
                  var summary = CCE.sessionIndex.summarize(entries, {
                    id: desc.id,
                    projectFolder: desc.projectFolder
                  });
                  summary.displayPath = CCE.sessionIndex.projectDisplayPath(desc.projectFolder);
                  return summary;
                })
                .catch(function () { return null; }); // skip unreadable files
            })
          ).then(function (batch_results) {
            batch_results.forEach(function (s) { if (s) results.push(s); });
            return nextBatch();
          });
        }

        return nextBatch().then(function () {
          /* Sort by lastTs descending (recent-first default) */
          results.sort(function (a, b) {
            var ta = a.lastTs ? new Date(a.lastTs).getTime() : 0;
            var tb = b.lastTs ? new Date(b.lastTs).getTime() : 0;
            return tb - ta;
          });
          _cached = results;
          renderStage(stage, totalEl, eyebrowEl, _cached);
          renderRecentStrip(root.querySelector('#cce-recent'), _cached);
          // Notify other modules (sidebar nav badges) that sessions are loaded.
          if (typeof g.dispatchEvent === 'function') {
            g.dispatchEvent(new CustomEvent('cce:sessions-loaded', { detail: { count: results.length } }));
          }
        });
      }).catch(function (err) {
        console.error('[CCE browse] listSessions failed:', err);
        stage.innerHTML =
          '<div class="empty">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>' +
          '</svg>' +
          '<h3>Could not load sessions</h3>' +
          '<p>' + esc(err && err.message ? err.message : String(err)) + '</p>' +
          '</div>';
      });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Recently-viewed strip (last 5 recent sessions)                      */
  /* ------------------------------------------------------------------ */
  function renderRecentStrip(container, summaries) {
    if (!container || !summaries || summaries.length === 0) return;
    var rec = summaries.slice(0, 5);
    container.innerHTML =
      '<span class="rlabel">Recently viewed</span>' +
      rec.map(function (s) {
        var isOpus = modelClass(s.model) === 'opus';
        var colorVar = isOpus ? 'var(--c-assistant)' : 'var(--c-user)';
        var label = (s.prompt || '').slice(0, 26);
        if (s.prompt && s.prompt.length > 26) label += '…';
        return '<div class="rpill" data-id="' + esc(s.id) + '" style="cursor:pointer">' +
          '<span class="rdot" style="width:6px;height:6px;border-radius:50%;background:' + colorVar + '"></span>' +
          esc(label) +
          '</div>';
      }).join('');

    container.querySelectorAll('.rpill[data-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        CCE.router.go('#/viewer?id=' + encodeURIComponent(el.dataset.id));
      });
    });
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
