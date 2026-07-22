(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* View registration                                                    */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/hooks', {
    title: 'Hooks',
    mount: function (root) {
      /* 1. Set shell toolbar title */
      var tb = document.querySelector('.toolbar');
      if (tb) {
        tb.innerHTML = '<span class="doc-title">Hooks</span><div class="spacer"></div>';
      }

      /* 2. Load settings */
      CCE.fsaccess.readSettings().then(function (settings) {

        /* Null / unreadable */
        if (settings === null || settings === undefined) {
          root.innerHTML =
            '<div class="doc-empty" style="padding:60px 20px;text-align:center">' +
            '<h3>No settings found</h3>' +
            '<p>~/.claude/settings.json is not readable.</p>' +
            '</div>';
          return;
        }

        var esc = CCE.markdown.esc;
        var html = '<div class="hooks-view">';

        /* ---- Hooks by event ---- */
        var hooks = settings.hooks;
        if (hooks && typeof hooks === 'object') {
          var eventNames = Object.keys(hooks);
          eventNames.forEach(function (eventName) {
            var entries = hooks[eventName];
            var entryCount = Array.isArray(entries) ? entries.length : 0;

            html +=
              '<div class="hooks-event">' +
              '<div class="hooks-event-name">' +
              esc(eventName) +
              ' <span class="hooks-count">(' + entryCount + ')</span>' +
              '</div>';

            if (entryCount === 0) {
              html += '<div class="hooks-empty-event">none configured</div>';
            } else {
              entries.forEach(function (entry) {
                var hookList = Array.isArray(entry.hooks) ? entry.hooks : [];
                if (hookList.length === 0) {
                  /* Entry with no hooks array — still render the matcher */
                  var matcher = entry.matcher != null ? String(entry.matcher) : '*';
                  html +=
                    '<div class="hooks-card">' +
                    '<div class="hooks-matcher">matcher: <code>' + esc(matcher) + '</code></div>' +
                    '</div>';
                } else {
                  hookList.forEach(function (hook) {
                    var matcher = entry.matcher != null ? String(entry.matcher) : '*';
                    var command = hook.command != null ? String(hook.command) : '';
                    html +=
                      '<div class="hooks-card">' +
                      '<div class="hooks-matcher">matcher: <code>' + esc(matcher) + '</code></div>' +
                      '<div class="hooks-cmd">' + esc(command) + '</div>' +
                      '</div>';
                  });
                }
              });
            }

            html += '</div>'; /* .hooks-event */
          });
        }

        /* ---- Status line ---- */
        if (settings.statusLine && typeof settings.statusLine === 'object') {
          var slCmd = settings.statusLine.command != null
            ? String(settings.statusLine.command)
            : '';
          html +=
            '<div class="hooks-event">' +
            '<div class="hooks-event-name">Status line</div>' +
            '<div class="hooks-card">' +
            '<div class="hooks-cmd">' + esc(slCmd) + '</div>' +
            '</div>' +
            '</div>';
        }

        html += '</div>'; /* .hooks-view */

        root.innerHTML = html;

      }).catch(function (err) {
        console.error('[CCE hooks] readSettings failed:', err);
        root.innerHTML =
          '<div class="doc-empty" style="padding:60px 20px;text-align:center">' +
          '<h3>No settings found</h3>' +
          '<p>~/.claude/settings.json is not readable.</p>' +
          '</div>';
      });
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
