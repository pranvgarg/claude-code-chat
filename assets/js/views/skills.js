(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Frontmatter parse helper                                             */
  /* ------------------------------------------------------------------ */
  function parseFrontmatter(text, fallbackName) {
    var result = { name: fallbackName, description: '' };
    if (!text || text.slice(0, 3) !== '---') return result;

    var lines = text.split('\n');
    var end = -1;
    for (var i = 1; i < lines.length; i++) {
      if (lines[i].trimRight() === '---') { end = i; break; }
    }
    if (end === -1) return result;

    for (var j = 1; j < end; j++) {
      var line = lines[j];
      var colon = line.indexOf(':');
      if (colon === -1) continue;
      var key = line.slice(0, colon).trim();
      var val = line.slice(colon + 1).trim();
      // Strip surrounding quotes (single or double)
      if ((val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') ||
          (val.charAt(0) === "'" && val.charAt(val.length - 1) === "'")) {
        val = val.slice(1, val.length - 1);
      }
      if (key === 'name') result.name = val || fallbackName;
      if (key === 'description') {
        // YAML folded/literal block scalar (`>` or `|`): the text is on the
        // following more-indented lines.
        if (val === '' || val === '>' || val === '|' || val === '>-' || val === '|-') {
          var collected = [];
          var k = j + 1;
          for (; k < end && /^\s+\S/.test(lines[k]); k++) collected.push(lines[k].trim());
          val = collected.join(' ');
          j = k - 1; // skip the consumed continuation lines
        }
        result.description = val;
      }
    }
    return result;
  }

  /* Remove the leading `--- ... ---` frontmatter block before rendering the body */
  function stripFrontmatter(text) {
    if (!text || text.slice(0, 3) !== '---') return text || '';
    var lines = text.split('\n');
    for (var i = 1; i < lines.length; i++) {
      if (lines[i].trimRight() === '---') {
        return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
      }
    }
    return text;
  }

  /* ------------------------------------------------------------------ */
  /* View registration                                                    */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/skills', {
    title: 'Skills',
    mount: function (root) {
      /* 1. Set shell toolbar title */
      var tb = document.querySelector('.toolbar');
      if (tb) tb.innerHTML = '<span class="doc-title">Skills</span><div class="spacer"></div>';

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

      /* Render a skill's SKILL.md into #doc-body */
      function openEntry(idx) {
        var entry = openables[idx];
        if (!entry) return;
        bodyEl.innerHTML = 'Loading…';
        entry.read().then(function (text) {
          bodyEl.innerHTML =
            '<div class="vwr-md-content">' +
            CCE.markdown.render(stripFrontmatter(text)) +
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
              var fm = parseFrontmatter(text, skill.name);
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

            if (firstUserIdx === -1) firstUserIdx = entryIdx;

            html +=
              '<div class="doc-item" data-skill-idx="' + entryIdx + '">' +
              '<strong>' + CCE.markdown.esc(item.skill.namespace ? (item.skill.namespace + ':' + item.skill.name) : (item.fm.name || item.skill.name)) + '</strong>' +
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
              html +=
                '<div class="doc-item" data-skill-idx="' + entryIdx + '">' +
                CCE.markdown.esc(skill.name) +
                '</div>';
            });

            html += '</div></div>'; /* .doc-group-items + .doc-group */
          });

          listEl.innerHTML = html;

          /* Auto-open first user skill (cheap — we already have the text) */
          if (firstUserIdx !== -1) {
            var firstItemEl = listEl.querySelector('[data-skill-idx="' + firstUserIdx + '"]');
            if (firstItemEl) firstItemEl.classList.add('active');

            var firstUserItem = userItems[0];
            if (firstUserItem && firstUserItem.text) {
              bodyEl.innerHTML =
                '<div class="vwr-md-content">' +
                CCE.markdown.render(stripFrontmatter(firstUserItem.text)) +
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
