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
      var lastProjects = [];

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

      /* ------------------------------------------------------------ */
      /* Attach / reconnect flow                                       */
      /* ------------------------------------------------------------ */

      /* Render the confirm-step panel into #doc-body after a folder is picked.
       * FileSystemDirectoryHandle only exposes the leaf folder name (browser
       * security constraint — no full path available), so the user must
       * confirm which project group the picked folder actually belongs to. */
      function renderConfirmPanel(picked, preselectedFolder) {
        var options = lastProjects.map(function (p) {
          var selected = p.projectFolder === preselectedFolder ? ' selected' : '';
          return '<option value="' + CCE.markdown.esc(p.projectFolder) + '"' + selected + '>' +
            CCE.markdown.esc(p.displayPath || p.projectFolder) + '</option>';
        }).join('');

        bodyEl.innerHTML =
          '<div class="doc-confirm-attach">' +
          '<h3>Confirm project match</h3>' +
          '<p>You picked the folder <strong>' + CCE.markdown.esc(picked.handle.name) + '</strong>. ' +
          'A folder name alone can’t be matched to a project with certainty — ' +
          'pick which project this belongs to.</p>' +
          '<label class="doc-confirm-label" for="mem-attach-select">Project</label>' +
          '<select id="mem-attach-select" class="doc-confirm-select">' +
          '<option value="">Select project…</option>' +
          options +
          '<option value="__other__">Other (enter path manually)</option>' +
          '</select>' +
          '<div id="mem-attach-manual" class="doc-confirm-manual" style="display:none;">' +
          '<label class="doc-confirm-label" for="mem-attach-manual-input">Project folder slug</label>' +
          '<input type="text" id="mem-attach-manual-input" class="doc-confirm-input" ' +
          'placeholder="e.g. -Users-me-Developer-my-app" />' +
          '</div>' +
          '<div class="doc-confirm-actions">' +
          '<button class="doc-attach-btn" id="mem-attach-confirm">Attach</button>' +
          '<button class="doc-attach-btn doc-attach-btn-secondary" id="mem-attach-cancel">Cancel</button>' +
          '</div>' +
          '</div>';

        var selectEl = bodyEl.querySelector('#mem-attach-select');
        var manualWrap = bodyEl.querySelector('#mem-attach-manual');
        var manualInput = bodyEl.querySelector('#mem-attach-manual-input');

        selectEl.addEventListener('change', function () {
          manualWrap.style.display = selectEl.value === '__other__' ? '' : 'none';
        });
        if (preselectedFolder) selectEl.value = preselectedFolder;

        bodyEl.querySelector('#mem-attach-cancel').addEventListener('click', function () {
          load();
        });

        bodyEl.querySelector('#mem-attach-confirm').addEventListener('click', function () {
          var chosen = selectEl.value === '__other__'
            ? manualInput.value.trim()
            : selectEl.value;
          if (!chosen) return;
          CCE.fsaccess.attachProjectFolder(chosen, picked.handle).then(function () {
            load();
          }).catch(function (err) {
            bodyEl.innerHTML =
              '<div class="doc-empty"><h3>Could not attach folder</h3><p>' +
              CCE.markdown.esc(err && err.message ? err.message : String(err)) +
              '</p></div>';
          });
        });
      }

      function handleAttachClick(preselectedFolder) {
        bodyEl.innerHTML = 'Waiting for folder selection…';
        CCE.fsaccess.pickProjectFolder().then(function (picked) {
          renderConfirmPanel(picked, preselectedFolder === '__new__' ? null : preselectedFolder);
        }).catch(function (err) {
          if (err && err.name === 'AbortError') { load(); return; }
          bodyEl.innerHTML =
            '<div class="doc-empty"><h3>Could not open folder picker</h3><p>' +
            CCE.markdown.esc(err && err.message ? err.message : String(err)) +
            '</p></div>';
        });
      }

      function handleReconnectClick(projectFolder) {
        bodyEl.innerHTML = 'Reconnecting…';
        CCE.fsaccess.reconnectProjectHandle(projectFolder).then(function () {
          load();
        }).catch(function (err) {
          bodyEl.innerHTML =
            '<div class="doc-empty"><h3>Could not reconnect</h3><p>' +
            CCE.markdown.esc(err && err.message ? err.message : String(err)) +
            '</p></div>';
        });
      }

      /* Single delegated listener for the entire sidebar */
      listEl.addEventListener('click', function (e) {
        /* --- attach / reconnect actions (must be checked before the
         * group-header toggle, since these buttons live inside it) --- */
        var attachBtn = e.target.closest('[data-attach]');
        if (attachBtn) {
          handleAttachClick(attachBtn.getAttribute('data-attach'));
          return;
        }
        var reconnectBtn = e.target.closest('[data-reconnect]');
        if (reconnectBtn) {
          handleReconnectClick(reconnectBtn.getAttribute('data-reconnect'));
          return;
        }

        /* --- collapsible group header toggle --- */
        var header = e.target.closest('.doc-group-header');
        if (header) {
          var group = header.closest('.doc-group');
          if (group) {
            var isOpen = group.classList.toggle('open');
            if (CCE.app && typeof CCE.app.setActiveProject === 'function') {
              CCE.app.setActiveProject(isOpen ? header.getAttribute('data-project') : null);
            }
          }
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
      function load() {
        openables = [];
        CCE.fsaccess.listMemory().then(function (data) {
          var globalFiles = (data && data.global) ? data.global : [];
          var projects    = (data && data.projects) ? data.projects : [];
          lastProjects = projects;

          /* Empty-state: nothing at all */
          if (globalFiles.length === 0 && projects.length === 0) {
            bodyEl.innerHTML =
              '<div class="doc-empty">' +
              '<h3>No memory files</h3>' +
              '<p>Global memory files live in ~/.claude/. Attach a project folder to show its CLAUDE.md here.</p>' +
              '<button class="doc-attach-btn" data-attach="__new__">Connect project folder</button>' +
              '</div>';
            bodyEl.querySelector('[data-attach]').addEventListener('click', function () {
              handleAttachClick('__new__');
            });
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
                '<div class="doc-item" data-skill-idx="' + entryIdx + '" data-open-key="global::' +
                CCE.markdown.esc(item.file.name) + '">' +
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
              var hasWorkingClaudeMd = files.some(function (f) {
                return f.name === 'CLAUDE.md' && !f.reconnectNeeded;
              });
              var reconnectFile = files.find(function (f) { return f.reconnectNeeded; });

              html +=
                '<div class="doc-group">' +
                '<div class="doc-group-header" data-group="' + groupIdx + '" data-project="' +
                CCE.markdown.esc(project.projectFolder) + '">' +
                '<span class="doc-chevron">▸</span> ' +
                CCE.markdown.esc(project.displayPath || project.projectFolder) +
                ' <span class="doc-group-count">(' + files.length + ')</span>';

              if (reconnectFile) {
                html +=
                  '<button class="doc-attach-btn doc-reconnect-btn" data-reconnect="' +
                  CCE.markdown.esc(project.projectFolder) + '">Reconnect CLAUDE.md</button>';
              } else if (!hasWorkingClaudeMd) {
                html +=
                  '<button class="doc-attach-btn" data-attach="' +
                  CCE.markdown.esc(project.projectFolder) + '">Connect CLAUDE.md</button>';
              }

              html += '</div><div class="doc-group-items">';

              files.forEach(function (file) {
                if (file.reconnectNeeded) {
                  html +=
                    '<div class="doc-item doc-item-reconnect">' +
                    CCE.markdown.esc(file.name) +
                    ' <span class="doc-pill">needs reconnect</span>' +
                    '</div>';
                  return;
                }
                var entryIdx = openables.length;
                openables.push({ read: file.read.bind(file) });
                html +=
                  '<div class="doc-item" data-skill-idx="' + entryIdx + '" data-open-key="' +
                  CCE.markdown.esc(project.projectFolder + '::' + file.name) + '">' +
                  CCE.markdown.esc(file.name) +
                  '</div>';
              });

              html += '</div></div>'; /* .doc-group-items + .doc-group */
            });

            listEl.innerHTML = html;

            /* Deep link (?open=<key>) takes priority over the default auto-open */
            var openKey = new URLSearchParams(location.hash.split('?')[1] || '').get('open');
            var openTarget = openKey
              ? listEl.querySelector('[data-open-key="' + CSS.escape(openKey) + '"]')
              : null;

            if (openTarget) {
              var openGroup = openTarget.closest('.doc-group');
              if (openGroup) openGroup.classList.add('open');
              setActive(openTarget);
              openTarget.scrollIntoView({ block: 'nearest' });
              openEntry(parseInt(openTarget.getAttribute('data-skill-idx'), 10));
            } else if (firstGlobalIdx !== -1) {
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

      load();
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
