(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};
  var esc = CCE.util.esc, relTime = CCE.util.relTime, modelClass = CCE.util.modelClass;
  var ROLE_LABEL = { user: 'You', assistant: 'Claude', thinking: 'Thinking', tool_input: 'Tool', tool_result: 'Result' };
  var ROLE_COLOR = { user: 'var(--c-user)', assistant: 'var(--c-assistant)', thinking: 'var(--c-thinking)', tool_input: 'var(--c-tool)', tool_result: 'var(--c-tool)' };
  var SNIPPETS_PER_GROUP = 3, GROUPS_WITH_SNIPPETS = 10;
  var _mountToken = 0;

  function params() {
    var p = new URLSearchParams(location.hash.split('?')[1] || '');
    return { q: p.get('q') || '', scope: p.get('scope') || 'full' };
  }
  function summaryByKey() {
    var map = {};
    (CCE.sessionStore.all() || []).forEach(function (s) { map[s.projectFolder + '/' + s.id] = s; });
    return map;
  }
  function descByKey() {
    var map = {};
    (CCE.sessionStore.descriptors() || []).forEach(function (d) { map[d.projectFolder + '/' + d.id] = d; });
    return map;
  }
  function badge(model) {
    return '<span class="badge-model ' + modelClass(model) + '">' + esc(model || 'unknown') + '</span>';
  }
  function scopeToggle(scope) {
    return ['titles', 'full', 'tools'].map(function (s) {
      var label = s === 'titles' ? 'Titles' : s === 'full' ? 'Full text' : 'Tool calls';
      return '<button data-scope="' + s + '" class="' + (s === scope ? 'on' : '') + '">' + label + '</button>';
    }).join('');
  }
  function groupHTML(hit, s) {
    return '<section class="srch-group" data-key="' + esc(hit.key) + '">' +
      '<header class="srch-group-head" data-id="' + esc(s.id) + '">' +
        badge(s.model) +
        '<span class="srch-title">' + esc(s.prompt) + '</span>' +
        '<span class="srch-meta">' + esc(s.displayPath || '') + ' · ' + relTime(s.lastTs) + '</span>' +
        '<span class="srch-hits">' + hit.hits + ' hit' + (hit.hits === 1 ? '' : 's') + '</span>' +
      '</header>' +
      '<div class="srch-rows" data-loaded="0"><div class="srch-loading">Loading matches…</div></div>' +
    '</section>';
  }
  function rowHTML(sessionId, turn, html) {
    return '<a class="srch-row" href="#/viewer?id=' + encodeURIComponent(sessionId) + '&turn=' + encodeURIComponent(turn.uuid || '') + '">' +
      '<span class="srch-rail" style="background:' + ROLE_COLOR[turn.role] + '"></span>' +
      '<span class="srch-row-body"><span class="srch-role" style="color:' + ROLE_COLOR[turn.role] + '">' + ROLE_LABEL[turn.role] + '</span>' +
      '<span class="srch-snippet">' + html + '</span></span></a>';
  }
  function fillSnippets(section, hit, desc, terms, query) {
    var rows = section.querySelector('.srch-rows');
    if (!rows || rows.getAttribute('data-loaded') === '1') return Promise.resolve();
    rows.setAttribute('data-loaded', '1');
    return desc.read().then(function (text) {
      var turns = CCE.searchIndex.extractTurns(CCE.jsonl.parse(text));
      var shown = hit.turnIdxs.slice(0, SNIPPETS_PER_GROUP);
      rows.innerHTML = shown.map(function (i) {
        var t = turns[i]; if (!t) return '';
        return rowHTML(desc.id, t, CCE.searchIndex.snippet(t.text, terms).html);
      }).join('') + (hit.turnIdxs.length > shown.length
        // Pass the raw query (not the tokenized terms) so the viewer's
        // find= search box behaves the same as it would if the user had
        // typed the original query directly.
        ? '<a class="srch-more" href="#/viewer?id=' + encodeURIComponent(desc.id) + '&find=' + encodeURIComponent(query) + '">Show ' + (hit.turnIdxs.length - shown.length) + ' more in this session</a>'
        : '');
    }).catch(function () { rows.innerHTML = '<div class="srch-loading">Could not load this session.</div>'; });
  }

  CCE.router.register('#/search', {
    title: 'Search',
    mount: function (root) {
      var myToken = ++_mountToken;
      var p = params();
      if (CCE.app.syncSearchBox) CCE.app.syncSearchBox(p.q);
      var actions = document.getElementById('toolbar-actions');
      if (actions) actions.innerHTML = '<div class="seg" id="srch-scope">' + scopeToggle(p.scope) + '</div><div class="spacer"></div><span class="srch-index-status" id="srch-status"></span>';
      root.innerHTML = '<div class="srch-head"><span class="srch-count" id="srch-count">Searching…</span></div><div id="srch-results"></div>';
      var results = root.querySelector('#srch-results'), count = root.querySelector('#srch-count'), status = document.getElementById('srch-status');
      var scopeEl = document.getElementById('srch-scope');
      if (scopeEl) scopeEl.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-scope]'); if (!b) return;
        location.hash = '#/search?q=' + encodeURIComponent(p.q) + '&scope=' + b.dataset.scope;
      });
      if (!p.q) { count.textContent = 'Type to search titles, transcripts, thinking and tool calls.'; return; }
      var terms = CCE.searchIndex.tokenize(p.q);
      var t0 = performance.now();
      CCE.sessionStore.load().then(function () {
        return CCE.searchStore.ensureBuilt(function (pr) { if (status) status.textContent = 'Indexing ' + pr.done + ' / ' + pr.total; });
      }).then(function () {
        // A late resolution (e.g. the user navigated away and back, or to
        // another view, while indexing was in flight) must not build an
        // observer or touch a #view-root that this mount no longer owns.
        if (myToken !== _mountToken) return;
        if (status) status.textContent = 'Index: ' + CCE.searchStore.size() + ' sessions';
        var hits = CCE.searchStore.search(p.q, p.scope);
        var sums = summaryByKey(), descs = descByKey();
        var total = hits.reduce(function (a, h) { return a + h.hits; }, 0);
        count.innerHTML = '<strong>' + total + '</strong> match' + (total === 1 ? '' : 'es') + ' in <strong>' + hits.length + '</strong> session' + (hits.length === 1 ? '' : 's') + ' · ' + Math.round(performance.now() - t0) + ' ms';
        if (!hits.length) { results.innerHTML = '<div class="empty"><h3>No matches for “' + esc(p.q) + '”</h3><p>Try fewer or different words, or switch scope.</p></div>'; return; }
        results.innerHTML = hits.map(function (h) { return sums[h.key] ? groupHTML(h, sums[h.key]) : ''; }).join('');
        results.querySelectorAll('.srch-group-head').forEach(function (h) {
          h.addEventListener('click', function () { CCE.router.go('#/viewer?id=' + encodeURIComponent(h.dataset.id)); });
        });
        var chain = Promise.resolve();
        hits.slice(0, GROUPS_WITH_SNIPPETS).forEach(function (h) {
          var section = results.querySelector('.srch-group[data-key="' + CSS.escape(h.key) + '"]');
          if (section && descs[h.key]) chain = chain.then(function () { return fillSnippets(section, h, descs[h.key], terms, p.q); });
        });
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var key = en.target.getAttribute('data-key');
            var h = hits.find(function (x) { return x.key === key; });
            if (h && descs[key]) fillSnippets(en.target, h, descs[key], terms, p.q);
            io.unobserve(en.target);
          });
        }, { root: document.getElementById('view-root'), rootMargin: '400px' });
        results.querySelectorAll('.srch-group').forEach(function (s) { io.observe(s); });
        root._srchObserver = io;
      }).catch(function (err) {
        results.innerHTML = '<div class="empty"><h3>Search failed</h3><p>' + esc(err && err.message || err) + '</p></div>';
      });
    },
    unmount: function () {
      // Invalidate this mount's token so a late ensureBuilt() resolution
      // (e.g. the user navigated to a different view entirely, not back to
      // #/search) bails out instead of building an observer against a
      // #view-root this mount no longer owns.
      _mountToken++;
      var root = document.getElementById('view-root');
      if (root && root._srchObserver) { root._srchObserver.disconnect(); root._srchObserver = null; }
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
