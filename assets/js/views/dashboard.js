(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmtCost(n) {
    return '$' + (n || 0).toFixed(2);
  }

  function fmtTokens(n) {
    if (!n) return '0';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  /* Detect short model class from full model id */
  function modelClass(fullModel) {
    if (!fullModel) return 'sonnet';
    var m = String(fullModel).toLowerCase();
    if (m.indexOf('opus') !== -1) return 'opus';
    return 'sonnet';
  }

  /* Return ISO date string YYYY-MM-DD for a timestamp */
  function isoDay(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* Return array of 14 ISO date strings ending today */
  function last14Days() {
    var days = [];
    var now = new Date();
    for (var i = 13; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0'));
    }
    return days;
  }

  /* Format a YYYY-MM-DD to short label e.g. "Jul 6" */
  function shortDayLabel(iso) {
    var parts = iso.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  /* Bar colors cycle for projects */
  var PROJECT_COLORS = [
    'var(--c-user)',
    'var(--c-assistant)',
    'var(--c-tool)',
    'var(--c-thinking)',
    'var(--c-system)',
    '#79c0ff',
    '#7ee787'
  ];

  /* ------------------------------------------------------------------ */
  /* Compute aggregates from session summaries                           */
  /* ------------------------------------------------------------------ */
  function compute(summaries) {
    var totalCost = 0;
    var totalTokens = 0;
    var projectFolders = {};

    summaries.forEach(function (s) {
      totalCost   += s.cost   || 0;
      totalTokens += s.tokens || 0;
      var pf = s.projectFolder || '(unknown)';
      if (!projectFolders[pf]) {
        projectFolders[pf] = {
          folder:      pf,
          displayPath: s.displayPath || CCE.sessionIndex.projectDisplayPath(pf),
          cost:        0,
          count:       0
        };
      }
      projectFolders[pf].cost  += s.cost  || 0;
      projectFolders[pf].count += 1;
    });

    /* Per-project array sorted by cost desc */
    var projects = Object.keys(projectFolders).map(function (k) {
      return projectFolders[k];
    });
    projects.sort(function (a, b) { return b.cost - a.cost; });

    /* 14-day activity */
    var days14 = last14Days();
    var dayCounts = {};
    days14.forEach(function (d) { dayCounts[d] = 0; });
    summaries.forEach(function (s) {
      var ts = s.lastTs || s.firstTs;
      var day = isoDay(ts);
      if (day && dayCounts.hasOwnProperty(day)) {
        dayCounts[day] += 1;
      }
    });

    /* Most expensive sessions — top 6 by cost */
    var top6 = summaries.slice().sort(function (a, b) {
      return (b.cost || 0) - (a.cost || 0);
    }).slice(0, 6);

    return {
      totalCost:    totalCost,
      totalTokens:  totalTokens,
      totalSessions: summaries.length,
      activeProjects: projects.length,
      projects:     projects,
      days14:       days14,
      dayCounts:    dayCounts,
      top6:         top6
    };
  }

  /* ------------------------------------------------------------------ */
  /* Render helpers                                                       */
  /* ------------------------------------------------------------------ */
  function renderStatCards(data) {
    var avgPerProject = data.activeProjects > 0
      ? (data.totalCost / data.activeProjects)
      : 0;

    return '<div class="dash-stat-cards">' +

      /* Card 1: Total Est. Cost */
      '<div class="dash-stat-card">' +
        '<div class="dash-stat-card-inner">' +
          '<div class="dash-stat-label">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' +
            'Total Est. Cost' +
          '</div>' +
          '<div class="dash-stat-value">' + esc(fmtCost(data.totalCost)) + '</div>' +
          '<div class="dash-stat-sub">across all sessions</div>' +
        '</div>' +
      '</div>' +

      /* Card 2: Total Sessions */
      '<div class="dash-stat-card">' +
        '<div class="dash-stat-card-inner">' +
          '<div class="dash-stat-label">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
            'Total Sessions' +
          '</div>' +
          '<div class="dash-stat-value">' + esc(String(data.totalSessions)) + '</div>' +
          '<div class="dash-stat-sub">across <strong>' + esc(String(data.activeProjects)) + '</strong> projects</div>' +
        '</div>' +
      '</div>' +

      /* Card 3: Total Tokens */
      '<div class="dash-stat-card">' +
        '<div class="dash-stat-card-inner">' +
          '<div class="dash-stat-label">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
            'Total Tokens' +
          '</div>' +
          '<div class="dash-stat-value">' + esc(fmtTokens(data.totalTokens)) + '</div>' +
          '<div class="dash-stat-sub">estimated usage</div>' +
        '</div>' +
      '</div>' +

      /* Card 4: Active Projects */
      '<div class="dash-stat-card">' +
        '<div class="dash-stat-card-inner">' +
          '<div class="dash-stat-label">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
            'Active Projects' +
          '</div>' +
          '<div class="dash-stat-value">' + esc(String(data.activeProjects)) + '</div>' +
          '<div class="dash-stat-sub">avg <strong>' + esc(fmtCost(avgPerProject)) + '</strong> / project</div>' +
        '</div>' +
      '</div>' +

    '</div>';
  }

  function renderProjectBars(projects) {
    if (!projects || projects.length === 0) {
      return '<div class="dash-empty-small">No project data.</div>';
    }
    var maxCost = projects[0].cost || 0; // sorted desc
    if (maxCost === 0) maxCost = 1;     // avoid divide-by-zero

    return projects.map(function (p, i) {
      var pct = Math.round((p.cost / maxCost) * 100);
      var color = PROJECT_COLORS[i % PROJECT_COLORS.length];
      // Gradient fill — fades the role color toward transparent on the right.
      var bg = 'linear-gradient(90deg, ' + color + ', color-mix(in srgb, ' + color + ' 35%, transparent))';
      return '<div class="dash-proj-row">' +
        '<div class="dash-proj-name" title="' + esc(p.displayPath) + '">' + esc(p.displayPath) + '</div>' +
        '<div class="dash-bar-track">' +
          '<div class="dash-bar-fill" style="width:' + pct + '%;background:' + bg + '" title="' + esc(fmtCost(p.cost)) + '"></div>' +
        '</div>' +
        '<div class="dash-proj-cost">' + esc(fmtCost(p.cost)) + '</div>' +
      '</div>';
    }).join('');
  }

  function renderActivityBars(days14, dayCounts) {
    var values = days14.map(function (d) { return dayCounts[d] || 0; });
    var maxVal = Math.max.apply(null, values);
    if (maxVal === 0) maxVal = 1;

    return days14.map(function (d, i) {
      var v = values[i];
      var heightPct = v === 0 ? 2 : Math.round((v / maxVal) * 56);
      var opacity = v > (maxVal * 0.6) ? '1' : v > (maxVal * 0.3) ? '0.6' : '0.3';
      var showLabel = (i % 2 === 0);
      var label = showLabel ? shortDayLabel(d) : '';
      // Gradient bar fill (fades the user-color toward transparent on top).
      var bg = 'linear-gradient(180deg, var(--c-user), color-mix(in srgb, var(--c-user) 45%, transparent))';
      return '<div class="dash-act-col">' +
        '<div class="dash-act-bar" ' +
          'style="height:' + heightPct + 'px;background:' + bg + ';opacity:' + opacity + '" ' +
          'title="' + esc(shortDayLabel(d)) + ': ' + esc(String(v)) + ' session' + (v !== 1 ? 's' : '') + '">' +
        '</div>' +
        '<span class="dash-act-label">' + esc(label) + '</span>' +
      '</div>';
    }).join('');
  }

  /* Inline SVG sparkline of the last 7 days' session counts.
     Renders above the activity chart as a quick trend indicator. */
  function renderSparkline(days14, dayCounts) {
    var last7 = days14.slice(-7);
    var values = last7.map(function (d) { return dayCounts[d] || 0; });
    var maxVal = Math.max.apply(null, values);
    var total = values.reduce(function (a, b) { return a + b; }, 0);
    var W = 220, H = 32, PAD = 2;
    var step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
    var scale = maxVal > 0 ? (H - PAD * 2) / maxVal : 0;

    // Build polyline points (top-aligned so 0 sits at the bottom).
    var pts = values.map(function (v, i) {
      var x = PAD + i * step;
      var y = H - PAD - v * scale;
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var pathD = 'M' + pts.join(' L');

    // Filled area path (for the subtle gradient under the line).
    var areaD = pathD + ' L' + (PAD + (values.length - 1) * step).toFixed(1) + ',' + (H - PAD) +
                ' L' + PAD + ',' + (H - PAD) + ' Z';

    return '<div class="dash-sparkline-row">' +
      '<span class="dash-sparkline-label">7-day trend</span>' +
      '<svg class="dash-sparkline-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
        '<path class="dash-sparkline-area" d="' + esc(areaD) + '"/>' +
        '<path class="dash-sparkline-path" d="' + esc(pathD) + '"/>' +
      '</svg>' +
      '<span class="dash-sparkline-stat">' + esc(String(total)) + ' session' + (total !== 1 ? 's' : '') + ' · max ' + esc(String(maxVal)) + '/day</span>' +
    '</div>';
  }

  function renderExpensiveTable(top6) {
    if (!top6 || top6.length === 0) {
      return '<div class="dash-empty-small">No sessions to display.</div>';
    }

    var rows = top6.map(function (s) {
      var cls = modelClass(s.model);
      var modelLabel = s.model ? (s.model.length > 22 ? s.model.slice(0, 22) + '…' : s.model) : 'unknown';
      var proj = (s.displayPath || CCE.sessionIndex.projectDisplayPath(s.projectFolder || '') || '').split('/').pop() || s.displayPath || '';
      var prompt = s.prompt || '(no prompt)';
      if (prompt.length > 80) prompt = prompt.slice(0, 80) + '…';
      return '<div class="dash-trow" data-id="' + esc(s.id) + '">' +
        '<div class="dash-td dash-td-prompt">' + esc(prompt) + '</div>' +
        '<div class="dash-td" style="font-family:var(--font-mono);font-size:11px">' + esc(proj) + '</div>' +
        '<div class="dash-td"><span class="dash-model-tag ' + esc(cls) + '">' + esc(modelLabel) + '</span></div>' +
        '<div class="dash-td">' + esc(String(s.msgs || 0)) + '</div>' +
        '<div class="dash-td"><span class="dash-cost-val">' + esc(fmtCost(s.cost)) + '</span></div>' +
      '</div>';
    }).join('');

    return '<div class="dash-table">' +
      '<div class="dash-thead">' +
        '<div class="dash-th">Prompt</div>' +
        '<div class="dash-th">Project</div>' +
        '<div class="dash-th">Model</div>' +
        '<div class="dash-th">Msgs</div>' +
        '<div class="dash-th">Cost</div>' +
      '</div>' +
      '<div class="dash-tbody">' + rows + '</div>' +
    '</div>';
  }

  function renderDashboard(root, summaries) {
    var data = compute(summaries);

    root.innerHTML =
      '<div class="dash-content">' +

        /* Page header */
        '<div class="dash-page-header">' +
          '<div class="dash-page-title">Usage &amp; Cost</div>' +
          '<div class="dash-date-hint">All sessions</div>' +
        '</div>' +

        /* Stat cards */
        renderStatCards(data) +

        /* Per-project cost breakdown */
        '<div class="dash-section">' +
          '<div class="dash-section-header">' +
            '<span class="dash-section-title">Cost by project</span>' +
            '<span class="dash-section-sub">' + esc(String(data.projects.length)) + ' project' + (data.projects.length !== 1 ? 's' : '') + '</span>' +
          '</div>' +
          '<div class="dash-proj-bars">' +
            renderProjectBars(data.projects) +
          '</div>' +
        '</div>' +

        /* 14-day activity */
        '<div class="dash-section">' +
          '<div class="dash-section-header">' +
            '<span class="dash-section-title">Activity — last 14 days</span>' +
            '<span class="dash-section-sub">sessions per day</span>' +
          '</div>' +
          '<div class="dash-act-wrap">' +
            renderSparkline(data.days14, data.dayCounts) +
            '<div class="dash-act-grid">' +
              renderActivityBars(data.days14, data.dayCounts) +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Most expensive sessions */
        '<div class="dash-section">' +
          '<div class="dash-section-header">' +
            '<span class="dash-section-title">Most expensive sessions</span>' +
            '<span class="dash-section-sub">Top ' + Math.min(data.top6.length, 6) + ' by estimated cost</span>' +
          '</div>' +
          renderExpensiveTable(data.top6) +
        '</div>' +

      '</div>';

    /* Wire table row click → viewer */
    root.querySelectorAll('.dash-trow[data-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        CCE.router.go('#/viewer?id=' + encodeURIComponent(el.dataset.id));
      });
    });
  }

  function renderLoading(root) {
    root.innerHTML =
      '<div class="dash-content">' +
        '<div class="dash-page-header">' +
          '<div class="dash-page-title">Usage &amp; Cost</div>' +
        '</div>' +
        '<div class="skeleton" style="margin-top:20px">' +
          '<div class="sk"></div><div class="sk"></div>' +
          '<div class="sk"></div><div class="sk"></div>' +
        '</div>' +
        '<div class="skeleton" style="margin-top:16px">' +
          '<div class="sk" style="height:200px;grid-column:1/-1"></div>' +
        '</div>' +
      '</div>';
  }

  function renderError(root, msg) {
    root.innerHTML =
      '<div class="dash-content">' +
        '<div class="empty" style="padding-top:80px">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/>' +
          '</svg>' +
          '<h3>Could not load usage data</h3>' +
          '<p>' + esc(msg) + '</p>' +
        '</div>' +
      '</div>';
  }

  function renderEmpty(root) {
    root.innerHTML =
      '<div class="dash-content">' +
        '<div class="empty" style="padding-top:80px">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' +
          '</svg>' +
          '<h3>No sessions found</h3>' +
          '<p>Connect to a folder with Claude sessions to see usage.</p>' +
        '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Clear toolbar when mounting (no controls needed for dashboard)      */
  /* ------------------------------------------------------------------ */
  function clearToolbar() {
    var shellToolbar = document.querySelector('.toolbar');
    if (shellToolbar) {
      shellToolbar.innerHTML =
        '<span style="font-size:12px;color:var(--text-dim);font-family:var(--font-mono)">Usage &amp; Cost</span>';
    }
  }

  /* ------------------------------------------------------------------ */
  /* View registration                                                    */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/usage', {
    title: 'Usage',
    mount: function (root) {
      clearToolbar();
      renderLoading(root);

      /* Try to use cached data from browse.js */
      var data = (CCE.sessions && CCE.sessions.all && CCE.sessions.all()) || null;
      if (data) {
        if (data.length === 0) {
          renderEmpty(root);
        } else {
          renderDashboard(root, data);
        }
        return;
      }

      /* Cache miss: load sessions ourselves */
      CCE.fsaccess.listSessions().then(function (descriptors) {
        var BATCH = 8;
        var results = [];
        var i = 0;

        function nextBatch() {
          var batch = descriptors.slice(i, i + BATCH);
          if (batch.length === 0) return Promise.resolve();
          i += BATCH;
          return Promise.all(
            batch.map(function (desc) {
              return desc.read()
                .then(function (text) {
                  var entries = CCE.jsonl.parse(text);
                  var summary = CCE.sessionIndex.summarize(entries, {
                    id: desc.id,
                    projectFolder: desc.projectFolder
                  });
                  summary.displayPath = CCE.sessionIndex.projectDisplayPath(desc.projectFolder);
                  return summary;
                })
                .catch(function () { return null; });
            })
          ).then(function (batchResults) {
            batchResults.forEach(function (s) { if (s) results.push(s); });
            return nextBatch();
          });
        }

        return nextBatch().then(function () {
          if (results.length === 0) {
            renderEmpty(root);
          } else {
            renderDashboard(root, results);
          }
        });
      }).catch(function (err) {
        console.error('[CCE dashboard] listSessions failed:', err);
        renderError(root, err && err.message ? err.message : String(err));
      });
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
