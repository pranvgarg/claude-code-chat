(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* View registration                                                    */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/memory', {
    title: 'Memory',
    mount: function (root) {
      /* 1. Set shell toolbar title */
      var tb = document.querySelector('.toolbar');
      if (tb) tb.innerHTML = '<span class="doc-title">Memory</span><div class="spacer"></div>';

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

      /* Render a memory file's content into #doc-body */
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
            '<div class="doc-empty"><h3>Error loading file</h3><p>' +
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

        /* --- memory item click --- */
        var item = e.target.closest('.doc-item');
        if (!item) return;
        setActive(item);
        var idx = parseInt(item.getAttribute('data-skill-idx'), 10);
        openEntry(idx);
      });

      /* ------------------------------------------------------------ */
      /* Load memory listing; render sidebar when ready               */
      /* ------------------------------------------------------------ */
      CCE.fsaccess.listMemory().then(function (data) {
        var globalFiles = (data && data.global) ? data.global : [];
        var projects    = (data && data.projects) ? data.projects : [];

        /* Empty-state: nothing at all */
        if (globalFiles.length === 0 && projects.length === 0) {
          bodyEl.innerHTML =
            '<div class="doc-empty">' +
            '<h3>No memory files</h3>' +
            '<p>Global memory files (~/.claude/) and project CLAUDE.md files will appear here.</p>' +
            '</div>';
          return;
        }

        /*
         * Pre-read global files (typically few: CLAUDE.md, RTK.md, etc.)
         * to show description via parseFrontmatter. Project files are lazy.
         */
        var globalReads = globalFiles.map(function (file) {
          return file.read()
            .then(function (text) {
              var fm = CCE.markdown.parseFrontmatter(text, file.name);
              return { file: file, text: text, fm: fm };
            })
            .catch(function () {
              return { file: file, text: '', fm: { name: file.name, description: '' } };
            });
        });

        Promise.all(globalReads).then(function (globalItems) {
          var html = '';

          /* ---- SECTION 1: Global Memory ---- */
          html += '<div class="doc-section-title">Global Memory (' + globalItems.length + ')</div>';

          var firstGlobalIdx = -1;
          globalItems.forEach(function (item) {
            var entryIdx = openables.length;
            openables.push({ read: item.file.read.bind(item.file) });

            var desc = item.fm.description || '';
            var descTrunc = desc.length > 90 ? desc.slice(0, 90) + '…' : desc;

            if (firstGlobalIdx === -1) firstGlobalIdx = entryIdx;

            html +=
              '<div class="doc-item" data-skill-idx="' + entryIdx + '">' +
              '<strong>' + CCE.markdown.esc(item.fm.name || item.file.name) + '</strong>' +
              (descTrunc
                ? '<div class="doc-item-desc">' + CCE.markdown.esc(descTrunc) + '</div>'
                : '') +
              '</div>';
          });

          /* ---- SECTION 2: Projects ---- */
          html += '<div class="doc-section-title">Projects (' + projects.length + ')</div>';

          projects.forEach(function (project, groupIdx) {
            var files = project.files || [];
            html +=
              '<div class="doc-group">' +
              '<div class="doc-group-header" data-group="' + groupIdx + '">' +
              '<span class="doc-chevron">▸</span> ' +
              CCE.markdown.esc(project.displayPath || project.projectFolder) +
              ' <span class="doc-group-count">(' + files.length + ')</span>' +
              '</div>' +
              '<div class="doc-group-items">';

            files.forEach(function (file) {
              var entryIdx = openables.length;
              openables.push({ read: file.read.bind(file) });
              html +=
                '<div class="doc-item" data-skill-idx="' + entryIdx + '">' +
                CCE.markdown.esc(file.name) +
                '</div>';
            });

            html += '</div></div>'; /* .doc-group-items + .doc-group */
          });

          listEl.innerHTML = html;

          /* Auto-open the first global file (we already have the text) */
          if (firstGlobalIdx !== -1) {
            var firstItemEl = listEl.querySelector('[data-skill-idx="' + firstGlobalIdx + '"]');
            if (firstItemEl) firstItemEl.classList.add('active');

            var firstGlobalItem = globalItems[0];
            if (firstGlobalItem && firstGlobalItem.text) {
              bodyEl.innerHTML =
                '<div class="vwr-md-content">' +
                CCE.markdown.render(CCE.markdown.stripFrontmatter(firstGlobalItem.text)) +
                '</div>';
            }
          } else if (projects.length > 0) {
            /* No global files — show hint */
            bodyEl.innerHTML =
              '<div class="doc-empty">' +
              '<h3>Select a file</h3>' +
              '<p>Click a memory file in the sidebar to view its contents.</p>' +
              '</div>';
          }

        }); /* end Promise.all(globalReads) */

      }).catch(function (err) {
        console.error('[CCE memory] load failed:', err);
        bodyEl.innerHTML =
          '<div class="doc-empty">' +
          '<h3>Could not load memory files</h3>' +
          '<p>' + CCE.markdown.esc(err && err.message ? err.message : String(err)) + '</p>' +
          '</div>';
      });
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
