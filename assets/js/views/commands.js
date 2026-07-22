(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* View registration                                                    */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/commands', {
    title: 'Commands',
    mount: function (root) {
      /* 1. Set shell toolbar title */
      var tb = document.querySelector('.toolbar');
      if (tb) tb.innerHTML = '<span class="doc-title">Commands</span><div class="spacer"></div>';

      /* 2. Build layout */
      root.innerHTML =
        '<div class="doc-view">' +
        '<aside class="doc-list" id="doc-list"></aside>' +
        '<div class="doc-body" id="doc-body"></div>' +
        '</div>';

      var listEl = root.querySelector('#doc-list');
      var bodyEl = root.querySelector('#doc-body');

      /*
       * openables[] is a flat array of { read: fn } entries keyed by
       * data-skill-idx on each .doc-item so clicks can delegate back here.
       */
      var openables = [];

      /* Render a command's markdown into #doc-body */
      function openEntry(idx) {
        var entry = openables[idx];
        if (!entry) return;
        bodyEl.innerHTML = 'Loading…';
        entry.read().then(function (text) {
          bodyEl.innerHTML =
            '<div class="vwr-md-content">' +
            CCE.markdown.render(CCE.markdown.stripFrontmatter(text)) +
            '</div>';
        }).catch(function (err) {
          bodyEl.innerHTML =
            '<div class="doc-empty"><h3>Error loading command</h3><p>' +
            CCE.markdown.esc(err && err.message ? err.message : String(err)) +
            '</p></div>';
        });
      }

      /* Move .active highlight to the clicked .doc-item */
      function setActive(itemEl) {
        listEl.querySelectorAll('.doc-item').forEach(function (el) {
          el.classList.remove('active');
        });
        itemEl.classList.add('active');
      }

      /* Single delegated listener for the entire sidebar */
      listEl.addEventListener('click', function (e) {
        /* --- collapsible group header toggle --- */
        var header = e.target.closest('.doc-group-header');
        if (header) {
          var group = header.closest('.doc-group');
          if (group) group.classList.toggle('open');
          return;
        }

        /* --- command item click --- */
        var item = e.target.closest('.doc-item');
        if (!item) return;
        setActive(item);
        var idx = parseInt(item.getAttribute('data-skill-idx'), 10);
        openEntry(idx);
      });

      /* ------------------------------------------------------------ */
      /* Load BOTH tiers concurrently; render sidebar when ready       */
      /* ------------------------------------------------------------ */
      var userCommandsPromise = CCE.fsaccess.listCommands().catch(function () { return []; });
      var pluginCommandsPromise = CCE.fsaccess.listPluginCommands().catch(function () { return []; });

      Promise.all([userCommandsPromise, pluginCommandsPromise]).then(function (results) {
        var userCommands   = results[0] || [];
        var pluginCommands = results[1] || [];

        /* Empty-state: nothing at all */
        if (userCommands.length === 0 && pluginCommands.length === 0) {
          bodyEl.innerHTML =
            '<div class="doc-empty">' +
            '<h3>No commands</h3>' +
            '<p>Commands in ~/.claude/commands and ~/.claude/plugins will appear here.</p>' +
            '</div>';
          return;
        }

        var html = '';

        /* ---- TIER 1: User Commands ---- */
        html += '<div class="doc-section-title">User Commands (' + userCommands.length + ')</div>';

        var firstUserIdx = -1;
        var firstUserRead = null;

        userCommands.forEach(function (cmd) {
          var entryIdx = openables.length;
          openables.push({ read: cmd.read.bind(cmd) });

          if (firstUserIdx === -1) {
            firstUserIdx = entryIdx;
            firstUserRead = cmd.read.bind(cmd);
          }

          html +=
            '<div class="doc-item" data-skill-idx="' + entryIdx + '">' +
            '<strong>' + CCE.markdown.esc('/' + cmd.name) + '</strong>' +
            '</div>';
        });

        if (userCommands.length === 0) {
          html +=
            '<div class="doc-item doc-item--hint" style="color:var(--text-muted,#888);font-style:italic;cursor:default;">' +
            'No user commands found' +
            '</div>';
        }

        /* ---- TIER 2: Plugin Commands ---- */
        html += '<div class="doc-section-title">Plugin Commands (' + pluginCommands.length + ')</div>';

        /* Group by publisher */
        var publisherMap = Object.create(null);
        pluginCommands.forEach(function (cmd) {
          var pub = cmd.publisher || 'unknown';
          if (!publisherMap[pub]) publisherMap[pub] = [];
          publisherMap[pub].push(cmd);
        });

        /* Sort publishers: descending count, then alpha */
        var publishers = Object.keys(publisherMap).sort(function (a, b) {
          var diff = publisherMap[b].length - publisherMap[a].length;
          return diff !== 0 ? diff : a.localeCompare(b);
        });

        publishers.forEach(function (pub, groupIdx) {
          var groupCmds = publisherMap[pub];
          html +=
            '<div class="doc-group">' +
            '<div class="doc-group-header" data-group="' + groupIdx + '">' +
            '<span class="doc-chevron">▸</span> ' +
            CCE.markdown.esc(pub) +
            ' <span class="doc-group-count">(' + groupCmds.length + ')</span>' +
            '</div>' +
            '<div class="doc-group-items">';

          groupCmds.forEach(function (cmd) {
            var entryIdx = openables.length;
            openables.push({ read: cmd.read.bind(cmd) });
            html +=
              '<div class="doc-item" data-skill-idx="' + entryIdx + '">' +
              CCE.markdown.esc('/' + cmd.name) +
              '</div>';
          });

          html += '</div></div>'; /* .doc-group-items + .doc-group */
        });

        listEl.innerHTML = html;

        /* Auto-open first user command if present; else show hint */
        if (firstUserIdx !== -1) {
          var firstItemEl = listEl.querySelector('[data-skill-idx="' + firstUserIdx + '"]');
          if (firstItemEl) firstItemEl.classList.add('active');

          bodyEl.innerHTML = 'Loading…';
          firstUserRead().then(function (text) {
            bodyEl.innerHTML =
              '<div class="vwr-md-content">' +
              CCE.markdown.render(CCE.markdown.stripFrontmatter(text)) +
              '</div>';
          }).catch(function (err) {
            bodyEl.innerHTML =
              '<div class="doc-empty"><h3>Error loading command</h3><p>' +
              CCE.markdown.esc(err && err.message ? err.message : String(err)) +
              '</p></div>';
          });
        } else if (pluginCommands.length > 0) {
          /* No user commands — show hint instead of auto-reading a plugin command */
          bodyEl.innerHTML =
            '<div class="doc-empty">' +
            '<h3>Select a command</h3>' +
            '<p>Click a command in the sidebar to view its documentation.</p>' +
            '</div>';
        }

      }).catch(function (err) {
        console.error('[CCE commands] load failed:', err);
        bodyEl.innerHTML =
          '<div class="doc-empty">' +
          '<h3>Could not load commands</h3>' +
          '<p>' + CCE.markdown.esc(err && err.message ? err.message : String(err)) + '</p>' +
          '</div>';
      });
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
