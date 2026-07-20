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

      /* Show active skill markdown */
      function showSkill(rawText) {
        bodyEl.innerHTML = '<div class="vwr-md-content">' + CCE.markdown.render(stripFrontmatter(rawText)) + '</div>';
      }

      /* 3. Load skills */
      CCE.fsaccess.listSkills().then(function (skills) {
        if (!skills || skills.length === 0) {
          bodyEl.innerHTML =
            '<div class="doc-empty">' +
            '<h3>No skills</h3>' +
            '<p>Skills in ~/.claude/skills will appear here.</p>' +
            '</div>';
          return;
        }

        /* Read all SKILL.md files concurrently */
        var reads = skills.map(function (skill) {
          return skill.read()
            .then(function (text) {
              var fm = parseFrontmatter(text, skill.name);
              return { skill: skill, text: text, fm: fm };
            })
            .catch(function () {
              return { skill: skill, text: '', fm: { name: skill.name, description: '' } };
            });
        });

        Promise.all(reads).then(function (items) {
          /* Build sidebar list */
          var listHTML = '';
          items.forEach(function (item, idx) {
            var desc = item.fm.description;
            var descTrunc = desc.length > 90 ? desc.slice(0, 90) + '…' : desc;
            listHTML +=
              '<div class="doc-item' + (idx === 0 ? ' active' : '') + '" data-idx="' + idx + '">' +
              '<strong>' + CCE.markdown.esc(item.skill.name) + '</strong>' +
              (descTrunc
                ? '<div class="doc-item-desc">' + CCE.markdown.esc(descTrunc) + '</div>'
                : '') +
              '</div>';
          });
          listEl.innerHTML = listHTML;

          /* Auto-render first skill */
          if (items[0] && items[0].text) {
            showSkill(items[0].text);
          }

          /* Wire click events */
          listEl.addEventListener('click', function (e) {
            var item = e.target.closest('.doc-item');
            if (!item) return;
            listEl.querySelectorAll('.doc-item').forEach(function (el) {
              el.classList.remove('active');
            });
            item.classList.add('active');
            var idx = parseInt(item.getAttribute('data-idx'), 10);
            if (items[idx]) showSkill(items[idx].text);
          });
        });

      }).catch(function (err) {
        console.error('[CCE skills] listSkills failed:', err);
        bodyEl.innerHTML =
          '<div class="doc-empty">' +
          '<h3>Could not load skills</h3>' +
          '<p>' + CCE.markdown.esc(err && err.message ? err.message : String(err)) + '</p>' +
          '</div>';
      });
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
