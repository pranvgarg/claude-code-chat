(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* View registration                                                    */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/skills', {
    title: 'Skills',
    mount: function (root) {
      /* 1. Set shell toolbar title */
      var tb = document.getElementById('toolbar-actions');
      if (tb) tb.innerHTML = '<span class="doc-title">Skills</span><div class="spacer"></div>';

      /* 2. Build layout */
      root.innerHTML =
        '<div class="doc-view">' +
        '<aside class="doc-list" id="doc-list"></aside>' +
        '<div class="doc-resizer" id="skills-resizer" role="separator" aria-label="Resize skills list" tabindex="0"></div>' +
        '<div class="doc-body" id="doc-body"></div>' +
        '</div>';

      var listEl = root.querySelector('#doc-list');
      var bodyEl = root.querySelector('#doc-body');
      if (CCE.app.initResizable) {
        CCE.app.initResizable(root.querySelector('#skills-resizer'), listEl, { min: 220, max: 460, key: 'skills-list-width' });
      }

      /*
       * openables[] is a flat array of { read: fn } entries keyed by
       * data-skill-idx on each .doc-item so clicks can delegate back here.
       */
      var openables = [];

      /* Render a skill's SKILL.md into #doc-body */
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
            '<div class="doc-empty"><h3>Error loading skill</h3><p>' +
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

        /* --- skill item click --- */
        var item = e.target.closest('.doc-item');
        if (!item) return;
        setActive(item);
        var idx = parseInt(item.getAttribute('data-skill-idx'), 10);
        openEntry(idx);
      });

      /* ------------------------------------------------------------ */
      /* Load BOTH tiers concurrently; render sidebar when ready       */
      /* ------------------------------------------------------------ */
      var userSkillsPromise = CCE.fsaccess.listSkills().catch(function () { return []; });
      var pluginSkillsPromise = CCE.fsaccess.listPluginSkills().catch(function () { return []; });

      Promise.all([userSkillsPromise, pluginSkillsPromise]).then(function (results) {
        var userSkills   = results[0] || [];
        var pluginSkills = results[1] || [];

        /* Empty-state: nothing at all */
        if (userSkills.length === 0 && pluginSkills.length === 0) {
          bodyEl.innerHTML =
            '<div class="doc-empty">' +
            '<h3>No skills</h3>' +
            '<p>Skills in ~/.claude/skills and ~/.claude/plugins will appear here.</p>' +
            '</div>';
          return;
        }

        /*
         * We pre-read user skills (only ~13) to show name+description.
         * Plugin skills are NOT pre-read (326 files); lazy only.
         */
        var userReads = userSkills.map(function (skill) {
          return skill.read()
            .then(function (text) {
              var fm = CCE.markdown.parseFrontmatter(text, skill.name);
              return { skill: skill, text: text, fm: fm };
            })
            .catch(function () {
              return { skill: skill, text: '', fm: { name: skill.name, description: '' } };
            });
        });

        Promise.all(userReads).then(function (userItems) {
          var html = '';

          /* ---- TIER 1: User Skills ---- */
          html += '<div class="doc-section-title">User Skills (' + userItems.length + ')</div>';

          var firstUserIdx = -1;
          userItems.forEach(function (item) {
            var entryIdx = openables.length;
            openables.push({ read: item.skill.read.bind(item.skill) });

            var desc = item.fm.description;
            var descTrunc = desc.length > 90 ? desc.slice(0, 90) + '…' : desc;
            var key = item.skill.namespace ? (item.skill.namespace + ':' + item.skill.name) : item.skill.name;
            var label = item.fm.name && !item.skill.namespace ? item.fm.name : key;

            if (firstUserIdx === -1) firstUserIdx = entryIdx;

            html +=
              '<div class="doc-item" data-skill-idx="' + entryIdx + '" data-open-key="' +
              CCE.markdown.esc(key) + '">' +
              '<strong>' + CCE.markdown.esc(label) + '</strong>' +
              (descTrunc
                ? '<div class="doc-item-desc">' + CCE.markdown.esc(descTrunc) + '</div>'
                : '') +
              '</div>';
          });

          /* ---- TIER 2: Plugin Skills ---- */
          html += '<div class="doc-section-title">Plugin Skills (' + pluginSkills.length + ')</div>';

          /* Group by publisher */
          var publisherMap = Object.create(null);
          pluginSkills.forEach(function (skill) {
            var pub = skill.publisher || 'unknown';
            if (!publisherMap[pub]) publisherMap[pub] = [];
            publisherMap[pub].push(skill);
          });

          /* Sort publishers: descending count, then alpha */
          var publishers = Object.keys(publisherMap).sort(function (a, b) {
            var diff = publisherMap[b].length - publisherMap[a].length;
            return diff !== 0 ? diff : a.localeCompare(b);
          });

          publishers.forEach(function (pub, groupIdx) {
            var groupSkills = publisherMap[pub];
            html +=
              '<div class="doc-group">' +
              '<div class="doc-group-header" data-group="' + groupIdx + '">' +
              '<span class="doc-chevron">▸</span> ' +
              CCE.markdown.esc(pub) +
              ' <span class="doc-group-count">(' + groupSkills.length + ')</span>' +
              '</div>' +
              '<div class="doc-group-items">';

            groupSkills.forEach(function (skill) {
              var entryIdx = openables.length;
              openables.push({ read: skill.read.bind(skill) });
              var label = skill.namespace ? (skill.namespace + ':' + skill.name) : skill.name;
              html +=
                '<div class="doc-item" data-skill-idx="' + entryIdx + '" data-open-key="' +
                CCE.markdown.esc(label) + '">' +
                CCE.markdown.esc(skill.name) +
                '</div>';
            });

            html += '</div></div>'; /* .doc-group-items + .doc-group */
          });

          listEl.innerHTML = html;

          /* Deep link (?open=<namespace:name>) takes priority over auto-open */
          var openKey = new URLSearchParams(location.hash.split('?')[1] || '').get('open');
          var target = openKey
            ? listEl.querySelector('[data-open-key="' + CSS.escape(openKey) + '"]')
            : null;

          if (target) {
            var group = target.closest('.doc-group');
            if (group) group.classList.add('open');
            setActive(target);
            target.scrollIntoView({ block: 'nearest' });
            openEntry(parseInt(target.getAttribute('data-skill-idx'), 10));
          } else if (firstUserIdx !== -1) {
            /* Auto-open first user skill (cheap — we already have the text) */
            var firstItemEl = listEl.querySelector('[data-skill-idx="' + firstUserIdx + '"]');
            if (firstItemEl) firstItemEl.classList.add('active');

            var firstUserItem = userItems[0];
            if (firstUserItem && firstUserItem.text) {
              bodyEl.innerHTML =
                '<div class="vwr-md-content">' +
                CCE.markdown.render(CCE.markdown.stripFrontmatter(firstUserItem.text)) +
                '</div>';
            }
          } else if (pluginSkills.length > 0) {
            /* No user skills — show hint instead of auto-reading a plugin skill */
            bodyEl.innerHTML =
              '<div class="doc-empty">' +
              '<h3>Select a skill</h3>' +
              '<p>Click a skill in the sidebar to view its documentation.</p>' +
              '</div>';
          }

        }); /* end Promise.all(userReads) */

      }).catch(function (err) {
        console.error('[CCE skills] load failed:', err);
        bodyEl.innerHTML =
          '<div class="doc-empty">' +
          '<h3>Could not load skills</h3>' +
          '<p>' + CCE.markdown.esc(err && err.message ? err.message : String(err)) + '</p>' +
          '</div>';
      });
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
