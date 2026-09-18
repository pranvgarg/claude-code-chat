(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};
  var esc = CCE.markdown.esc;
  var EVENT_ORDER = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'SessionEnd'];

  /* Extract a hooks/<name> script filename from a hook command string, e.g.
     "~/.claude/hooks/session-start.sh --flag" -> "session-start.sh". */
  function scriptNameFrom(command) {
    var m = /(?:^|[\s"'])(?:~\/\.claude|\$HOME\/\.claude|[^\s"']*\/\.claude)\/hooks\/([A-Za-z0-9._-]+)/.exec(command || '');
    return m ? m[1] : null;
  }

  /* Flatten settings.hooks (event -> [{matcher, hooks:[...]}]) into an
     ordered list of { name, rows: [{matcher, command, type, timeout}] }. */
  function flatten(hooks) {
    var events = Object.keys(hooks || {}).sort(function (a, b) {
      var ia = EVENT_ORDER.indexOf(a), ib = EVENT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    return events.map(function (name) {
      var entries = Array.isArray(hooks[name]) ? hooks[name] : [];
      var rows = [];
      entries.forEach(function (entry) {
        var matcher = entry.matcher != null ? String(entry.matcher) : '*';
        var list = Array.isArray(entry.hooks) && entry.hooks.length ? entry.hooks : [{}];
        list.forEach(function (h) { rows.push({ matcher: matcher, command: h.command != null ? String(h.command) : '', type: h.type || 'command', timeout: h.timeout }); });
      });
      return { name: name, rows: rows };
    });
  }

  /* Render one event's hook rows into the doc-body pane, wiring up the
     lazy script-preview <details> elements. */
  function renderEvent(bodyEl, ev) {
    var html = '<h2 class="hooks-event-name">' + esc(ev.name) + ' <span class="doc-group-count">(' + ev.rows.length + ')</span></h2>';
    if (!ev.rows.length) html += '<div class="doc-empty"><p>No hooks configured for this event.</p></div>';
    ev.rows.forEach(function (r, i) {
      var script = scriptNameFrom(r.command);
      html += '<div class="hooks-card">' +
        '<div class="hooks-matcher">matcher: <code>' + esc(r.matcher) + '</code>' + (r.timeout ? ' · timeout ' + esc(r.timeout) + 's' : '') + '</div>' +
        '<div class="hooks-cmd">' + esc(r.command) + '</div>' +
        (script ? '<details class="hooks-script" data-script="' + esc(script) + '" data-idx="' + i + '"><summary>Preview ~/.claude/hooks/' + esc(script) + '</summary><pre class="hooks-pre"><code>Loading…</code></pre></details>' : '') +
        '</div>';
    });
    html += '<p class="hooks-note">Project-level hooks in a repository’s <code>.claude/settings.json</code> are not shown here.</p>';
    bodyEl.innerHTML = html;
    bodyEl.querySelectorAll('details.hooks-script').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open || d.getAttribute('data-loaded')) return;
        d.setAttribute('data-loaded', '1');
        CCE.fsaccess.readHookScript(d.getAttribute('data-script')).then(function (text) {
          d.querySelector('code').textContent = text == null ? 'Script not found under ~/.claude/hooks/.' : text;
        });
      });
    });
  }

  CCE.router.register('#/hooks', {
    title: 'Hooks',
    mount: function (root) {
      var tb = document.getElementById('toolbar-actions');
      if (tb) tb.innerHTML = '<span class="doc-title">Hooks</span><div class="spacer"></div>';
      root.innerHTML = '<div class="doc-view"><aside class="doc-list" id="doc-list"></aside><div class="doc-body" id="doc-body"></div></div>';
      var listEl = root.querySelector('#doc-list'), bodyEl = root.querySelector('#doc-body');
      CCE.fsaccess.readSettings().then(function (settings) {
        if (!settings) { bodyEl.innerHTML = '<div class="doc-empty"><h3>No settings found</h3><p>~/.claude/settings.json is not readable.</p></div>'; return; }
        var events = flatten(settings.hooks);
        if (settings.statusLine && settings.statusLine.command) events.push({ name: 'Status line', rows: [{ matcher: '—', command: String(settings.statusLine.command) }] });
        if (!events.length) { bodyEl.innerHTML = '<div class="doc-empty"><h3>No hooks configured</h3><p>Add hooks to ~/.claude/settings.json to see them here.</p></div>'; return; }
        listEl.innerHTML = '<div class="doc-section-title">Events (' + events.length + ')</div>' + events.map(function (ev, i) {
          return '<div class="doc-item" role="button" tabindex="0" data-idx="' + i + '"><strong>' + esc(ev.name) + '</strong><div class="doc-item-desc">' + ev.rows.length + ' hook' + (ev.rows.length === 1 ? '' : 's') + '</div></div>';
        }).join('');
        function open(i) {
          listEl.querySelectorAll('.doc-item').forEach(function (el, j) { el.classList.toggle('active', j === i); });
          renderEvent(bodyEl, events[i]);
        }
        listEl.addEventListener('click', function (e) { var it = e.target.closest('.doc-item'); if (it) open(Number(it.dataset.idx)); });
        listEl.addEventListener('keydown', function (e) { var it = e.target.closest('.doc-item'); if (it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(Number(it.dataset.idx)); } });
        open(0);
      }).catch(function (err) {
        console.error('[CCE hooks] readSettings failed:', err);
        bodyEl.innerHTML = '<div class="doc-empty"><h3>No settings found</h3><p>' + esc(err && err.message || err) + '</p></div>';
      });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
