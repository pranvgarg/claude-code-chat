(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  var overlayEl = null;
  var inputEl = null;
  var resultsEl = null;
  var items = [];       /* current filtered result set, in display order */
  var selectedIdx = 0;
  var cachedIndex = []; /* built once per palette-open; filter() reads from this */

  /* Synchronous part of the index: session titles + static nav targets. */
  function buildSyncIndex() {
    var index = [];

    var sessions = (CCE.sessions && CCE.sessions.all && CCE.sessions.all()) || [];
    sessions.forEach(function (s) {
      index.push({
        type: 'session',
        label: s.prompt || '(untitled session)',
        sublabel: s.displayPath || '',
        hash: '#/viewer?id=' + encodeURIComponent(s.id)
      });
    });

    document.querySelectorAll('.nav-item[data-hash]').forEach(function (n) {
      index.push({
        type: 'nav',
        label: n.getAttribute('data-tooltip') || n.dataset.hash,
        sublabel: 'Go to view',
        hash: n.dataset.hash
      });
    });

    return index;
  }

  /* Async part: skills, commands, plans, memory files, hooks — all read via
   * fsaccess. Resolves to an array; individual source failures don't block
   * the others (each is caught to []/null). */
  function buildAsyncIndex() {
    var fsa = CCE.fsaccess;
    if (!fsa) return Promise.resolve([]);

    var plansP    = fsa.listPlans ? fsa.listPlans().catch(function () { return []; }) : Promise.resolve([]);
    var skillsP   = fsa.listSkills ? fsa.listSkills().catch(function () { return []; }) : Promise.resolve([]);
    var pskillsP  = fsa.listPluginSkills ? fsa.listPluginSkills().catch(function () { return []; }) : Promise.resolve([]);
    var cmdsP     = fsa.listCommands ? fsa.listCommands().catch(function () { return []; }) : Promise.resolve([]);
    var pcmdsP    = fsa.listPluginCommands ? fsa.listPluginCommands().catch(function () { return []; }) : Promise.resolve([]);
    var memoryP   = fsa.listMemory ? fsa.listMemory().catch(function () { return null; }) : Promise.resolve(null);
    var settingsP = fsa.readSettings ? fsa.readSettings().catch(function () { return null; }) : Promise.resolve(null);

    return Promise.all([plansP, skillsP, pskillsP, cmdsP, pcmdsP, memoryP, settingsP])
      .then(function (results) {
        var plans = results[0] || [];
        var skills = (results[1] || []).concat(results[2] || []);
        var cmds = (results[3] || []).concat(results[4] || []);
        var memory = results[5];
        var settings = results[6];
        var index = [];

        plans.forEach(function (p) {
          index.push({
            type: 'plan', label: p.name, sublabel: 'Plan',
            hash: '#/plans?open=' + encodeURIComponent(p.name)
          });
        });

        skills.forEach(function (s) {
          var key = s.namespace ? (s.namespace + ':' + s.name) : s.name;
          index.push({
            type: 'skill', label: key, sublabel: 'Skill',
            hash: '#/skills?open=' + encodeURIComponent(key)
          });
        });

        cmds.forEach(function (c) {
          index.push({
            type: 'command', label: '/' + c.name, sublabel: 'Command',
            hash: '#/commands?open=' + encodeURIComponent(c.name)
          });
        });

        if (memory) {
          (memory.global || []).forEach(function (f) {
            var key = 'global::' + f.name;
            index.push({
              type: 'memory', label: f.name, sublabel: 'Global memory',
              hash: '#/memory?open=' + encodeURIComponent(key)
            });
          });
          (memory.projects || []).forEach(function (proj) {
            (proj.files || []).forEach(function (f) {
              if (f.reconnectNeeded) return;
              var key = proj.projectFolder + '::' + f.name;
              index.push({
                type: 'memory', label: f.name, sublabel: proj.displayPath || proj.projectFolder,
                hash: '#/memory?open=' + encodeURIComponent(key)
              });
            });
          });
        }

        if (settings && settings.hooks && typeof settings.hooks === 'object') {
          Object.keys(settings.hooks).forEach(function (eventName) {
            var entries = Array.isArray(settings.hooks[eventName]) ? settings.hooks[eventName] : [];
            entries.forEach(function (entry) {
              var matcher = entry.matcher != null ? String(entry.matcher) : '*';
              var hookList = Array.isArray(entry.hooks) ? entry.hooks : [];
              (hookList.length ? hookList : [{ command: '' }]).forEach(function (hook) {
                index.push({
                  type: 'hook',
                  label: eventName + ' — ' + matcher,
                  sublabel: hook.command || '',
                  hash: '#/hooks'
                });
              });
            });
          });
        }

        return index;
      });
  }

  function render(list) {
    items = list;
    selectedIdx = 0;
    if (!list.length) {
      resultsEl.innerHTML = '<div class="pal-empty">No results</div>';
      return;
    }
    resultsEl.innerHTML = list.map(function (item, i) {
      return '<div class="pal-item' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span class="pal-item-label">' + CCE.markdown.esc(item.label) + '</span>' +
        (item.sublabel ? '<span class="pal-item-sub">' + CCE.markdown.esc(item.sublabel) + '</span>' : '') +
        '</div>';
    }).join('');
  }

  function setSelected(idx) {
    if (!items.length) return;
    selectedIdx = (idx + items.length) % items.length;
    resultsEl.querySelectorAll('.pal-item').forEach(function (el, i) {
      el.classList.toggle('active', i === selectedIdx);
    });
    var activeEl = resultsEl.querySelector('.pal-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function commit(item) {
    if (!item) return;
    close();
    CCE.router.go(item.hash);
  }

  function filter(query) {
    var index = cachedIndex;
    if (!query) { render(index.slice(0, 40)); return; }
    if (typeof Fuse !== 'undefined') {
      var fuse = new Fuse(index, { keys: ['label', 'sublabel'], threshold: 0.4 });
      render(fuse.search(query).slice(0, 40).map(function (r) { return r.item; }));
      return;
    }
    var q = query.toLowerCase();
    render(index.filter(function (item) {
      return (item.label + ' ' + item.sublabel).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 40));
  }

  function open() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'pal-overlay';
    overlayEl.innerHTML =
      '<div class="pal-panel">' +
      '<input type="text" class="pal-input" placeholder="Jump to a session or view…" autocomplete="off" />' +
      '<div class="pal-results"></div>' +
      '</div>';
    document.body.appendChild(overlayEl);

    inputEl = overlayEl.querySelector('.pal-input');
    resultsEl = overlayEl.querySelector('.pal-results');

    overlayEl.addEventListener('mousedown', function (e) {
      if (e.target === overlayEl) close();
    });
    resultsEl.addEventListener('click', function (e) {
      var el = e.target.closest('.pal-item');
      if (!el) return;
      commit(items[parseInt(el.getAttribute('data-idx'), 10)]);
    });
    inputEl.addEventListener('input', function () { filter(inputEl.value.trim()); });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(selectedIdx + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(selectedIdx - 1); return; }
      if (e.key === 'Enter') { e.preventDefault(); commit(items[selectedIdx]); return; }
    });

    /* Show sessions/nav immediately; merge in skills/commands/plans/memory/hooks
     * once read (avoids blocking the overlay open on file reads). */
    cachedIndex = buildSyncIndex();
    filter(inputEl.value.trim());
    inputEl.focus();

    buildAsyncIndex().then(function (asyncItems) {
      if (!overlayEl) return; /* closed before this resolved */
      cachedIndex = cachedIndex.concat(asyncItems);
      filter(inputEl.value.trim());
    });
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.remove();
    overlayEl = null; inputEl = null; resultsEl = null;
    items = []; selectedIdx = 0;
  }

  function toggle() { if (overlayEl) close(); else open(); }

  g.addEventListener('keydown', function (e) {
    var key = (e.key || '').toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === 'k') {
      e.preventDefault();
      toggle();
    }
  });

  CCE.palette = { open: open, close: close, toggle: toggle };

})(typeof globalThis !== 'undefined' ? globalThis : this);
