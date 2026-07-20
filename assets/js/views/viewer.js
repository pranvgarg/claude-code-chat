(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function highlight(html, term) {
    if (!term) return html;
    var re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return html.replace(re, '<mark>$1</mark>');
  }

  function truncate(s, max) {
    return String(s).length > max ? String(s).slice(0, max) + '…' : String(s);
  }

  function truncateWithExpand(text, max, id) {
    var t = String(text == null ? '' : text);
    if (t.length <= max) return esc(t);
    return esc(t.slice(0, max)) +
      '<span id="' + id + '-trunc">…<button class="vwr-btn vwr-show-full-btn" onclick="CCE.viewer._showFull(\'' + id + '\')">Show full (' + (t.length / 1024).toFixed(1) + 'KB)</button></span>' +
      '<span id="' + id + '-full" style="display:none">' + esc(t.slice(max)) + '</span>';
  }

  function fmtTime(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return String(ts); }
  }

  function relativeTimeDelta(prev, curr) {
    if (!prev || !curr) return '';
    var diff = new Date(curr) - new Date(prev);
    if (diff < 60000) return '';
    if (diff < 3600000) return Math.round(diff / 60000) + ' min later';
    if (diff < 86400000) return Math.round(diff / 3600000) + 'h later';
    return Math.round(diff / 86400000) + 'd later';
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* ------------------------------------------------------------------ */
  /* Markdown / code rendering (guarded for missing libs)               */
  /* ------------------------------------------------------------------ */
  function highlightCode(code, lang) {
    if (g.Prism && lang && Prism.languages[lang]) {
      try { return Prism.highlight(code, Prism.languages[lang], lang); } catch (e) {}
    }
    return esc(code);
  }

  function detectLang(toolName, input) {
    if (toolName === 'Bash') return 'bash';
    if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
      var fp = (input && input.file_path) || '';
      var ext = fp.split('.').pop().toLowerCase();
      var MAP = {
        py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript',
        tsx: 'typescript', json: 'json', rs: 'rust', go: 'go', html: 'markup',
        css: 'css', rb: 'ruby', sh: 'bash', yml: 'yaml', yaml: 'yaml', md: 'markdown'
      };
      return MAP[ext] || '';
    }
    return '';
  }

  /* renderMarkdown — SECURITY:
     - When DOMPurify is ABSENT we NEVER emit raw HTML from marked.
       We fall back to esc() which entity-encodes everything.
       A <script> tag inside a markdown code-block becomes &lt;script&gt; and
       is never executed. This satisfies the DOMPurify-absent security requirement.
     - When DOMPurify IS present we sanitize the marked output before inserting it.
  */
  function renderMarkdown(text) {
    if (!g.marked) {
      // No markdown lib: plain escaped text
      return esc(text);
    }
    try {
      var renderer = new marked.Renderer();
      renderer.code = function (code, lang) {
        var language = lang || '';
        var highlighted = highlightCode(code, language);
        return '<pre class="vwr-code-block"><code class="language-' + esc(language) + '">' + highlighted + '</code></pre>';
      };
      var raw = marked.parse(text, { breaks: true, gfm: true, renderer: renderer });
      // Sanitize or fall back to escaped plain text
      if (g.DOMPurify) {
        return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
      } else {
        // DOMPurify absent: discard raw HTML entirely, return escaped plain text
        return esc(text);
      }
    } catch (e) {
      return esc(text);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tool input formatting                                               */
  /* ------------------------------------------------------------------ */
  function formatToolInput(name, input) {
    switch (name) {
      case 'Bash':  return (input && input.command) || JSON.stringify(input, null, 2);
      case 'Read':  return (input && input.file_path) || JSON.stringify(input, null, 2);
      case 'Write': return ((input && input.file_path) || '') + '\n---\n' + ((input && input.content) || '');
      case 'Edit':  return ((input && input.file_path) || '') + '\n--- old ---\n' + ((input && input.old_string) || '') + '\n--- new ---\n' + ((input && input.new_string) || '');
      case 'Grep':  return 'pattern: ' + ((input && input.pattern) || '') + (input && input.path ? '  path: ' + input.path : '') + (input && input.glob ? '  glob: ' + input.glob : '');
      case 'Glob':  return 'pattern: ' + ((input && input.pattern) || '') + (input && input.path ? '  path: ' + input.path : '');
      case 'Agent': return '[' + ((input && input.subagent_type) || 'general') + '] ' + ((input && input.prompt) || '');
      default:      return JSON.stringify(input, null, 2);
    }
  }

  function toolSummary(name, input) {
    function shortPath(p) {
      var parts = String(p).replace(/\\/g, '/').split('/');
      return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : p;
    }
    switch (name) {
      case 'Bash':  return truncate((input && input.command) || '', 60);
      case 'Read':  return shortPath((input && input.file_path) || '');
      case 'Write': return shortPath((input && input.file_path) || '');
      case 'Edit':  return shortPath((input && input.file_path) || '');
      case 'Grep':  return (input && input.pattern) || '';
      case 'Glob':  return (input && input.pattern) || '';
      case 'Agent': return (input && input.description) || truncate((input && input.prompt) || '', 50);
      default:      return '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Block toggle (called from inline onclick)                           */
  /* ------------------------------------------------------------------ */
  function toggleBlock(id, headerEl) {
    var body = document.getElementById(id);
    if (!body) return;
    body.classList.toggle('vwr-open');
    var chev = headerEl.querySelector('.vwr-chevron');
    if (chev) chev.classList.toggle('vwr-open');
  }

  /* ------------------------------------------------------------------ */
  /* Per-mount state                                                      */
  /* ------------------------------------------------------------------ */
  var _state = {
    entries: [],
    toolResults: {},
    filters: { user: true, assistant: true, system: true, progress: false, snapshot: false },
    search: '',
    searchIndex: 0,
    searchMatches: [],
    sidebarOpen: false
  };

  /* ------------------------------------------------------------------ */
  /* Render helpers                                                       */
  /* ------------------------------------------------------------------ */
  function renderUser(entry, search, lastTimestamp) {
    var content = entry.message && entry.message.content;
    var text = typeof content === 'string' ? content
      : (Array.isArray(content)
          ? content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n')
          : JSON.stringify(content));

    if (search && text.toLowerCase().indexOf(search) === -1) return null;

    var ts = fmtTime(entry.timestamp);
    var delta = relativeTimeDelta(lastTimestamp, entry.timestamp);
    var deltaHtml = delta ? ' <span class="vwr-time-delta">' + esc(delta) + '</span>' : '';

    var imageSrcs = [];
    if (Array.isArray(content)) {
      for (var i = 0; i < content.length; i++) {
        var block = content[i];
        if (block.type === 'image') {
          var src = block.source && block.source.type === 'base64'
            ? 'data:' + (block.source.media_type || 'image/png') + ';base64,' + block.source.data
            : (block.source && block.source.url) || '';
          if (src) imageSrcs.push(src);
        }
      }
    }

    var div = document.createElement('div');
    div.className = 'vwr-entry vwr-user';
    div.innerHTML =
      '<div class="vwr-entry-header">' +
        '<span class="vwr-role">User</span>' +
        '<span>' + esc(ts) + '</span>' + deltaHtml +
      '</div>' +
      '<div class="vwr-text-content">' + (search ? highlight(esc(text), search) : esc(text)) + '</div>';
    // Images added via DOM (src assigned as a property) so a crafted image URL
    // in an untrusted .jsonl cannot break out of the attribute or inject handlers.
    for (var im = 0; im < imageSrcs.length; im++) {
      var img = document.createElement('img');
      img.className = 'vwr-inline-image';
      img.alt = 'User image';
      img.src = imageSrcs[im];
      div.appendChild(img);
    }
    return div;
  }

  function renderAssistant(entry, search, lastTimestamp, toolResults) {
    var msg = entry.message || {};
    var blocks = msg.content || [];
    var ts = fmtTime(entry.timestamp);
    var model = msg.model || '';
    var usage = msg.usage;

    var delta = relativeTimeDelta(lastTimestamp, entry.timestamp);
    var deltaHtml = delta ? ' <span class="vwr-time-delta">' + esc(delta) + '</span>' : '';

    var hasMatch = !search;
    var html =
      '<div class="vwr-entry-header">' +
        '<span class="vwr-role">Assistant</span>' +
        (model ? '<span class="vwr-model-badge">' + esc(model) + '</span>' : '') +
        '<span>' + esc(ts) + '</span>' + deltaHtml +
      '</div>';

    for (var bi = 0; bi < blocks.length; bi++) {
      var block = blocks[bi];
      if (block.type === 'text') {
        var t = block.text || '';
        if (search && t.toLowerCase().indexOf(search) !== -1) hasMatch = true;
        if (search) {
          html += '<div class="vwr-text-content">' + highlight(esc(t), search) + '</div>';
        } else {
          html += '<div class="vwr-md-content">' + renderMarkdown(t) + '</div>';
        }
      } else if (block.type === 'thinking') {
        var th = block.thinking || '';
        if (!th.trim()) {
          html += '<div class="vwr-thinking-block"><div class="vwr-thinking-header"><span class="vwr-chevron">&#9658;</span> Thinking (empty/redacted)</div></div>';
        } else {
          if (search && th.toLowerCase().indexOf(search) !== -1) hasMatch = true;
          var tid = 'vth-' + Math.random().toString(36).slice(2, 9);
          html +=
            '<div class="vwr-thinking-block">' +
              '<div class="vwr-thinking-header" onclick="CCE.viewer._toggleBlock(\'' + tid + '\', this)">' +
                '<span class="vwr-chevron">&#9658;</span> Thinking (' + th.length.toLocaleString() + ' chars)' +
              '</div>' +
              '<div class="vwr-thinking-body" id="' + tid + '">' +
                (search ? highlight(esc(th), search) : esc(th)) +
              '</div>' +
            '</div>';
        }
      } else if (block.type === 'tool_use') {
        var name = block.name || 'unknown';
        var input = block.input || {};
        var inputStr = formatToolInput(name, input);
        var result = toolResults[block.id];
        if (search && (inputStr.toLowerCase().indexOf(search) !== -1 || name.toLowerCase().indexOf(search) !== -1)) hasMatch = true;
        var tuid = 'vtu-' + Math.random().toString(36).slice(2, 9);
        var summary = toolSummary(name, input);
        var lang = detectLang(name, input);
        var highlightedInput;
        if (name === 'Write' && !search && inputStr.length > 3000) {
          var writeHeader = ((input && input.file_path) || '') + '\n---\n';
          var writeContent = (input && input.content) || '';
          var writeId = 'vwt-' + tuid;
          highlightedInput = esc(writeHeader) + truncateWithExpand(writeContent, 3000, writeId);
        } else if (name === 'Write' && !search) {
          highlightedInput = lang ? highlightCode(inputStr, lang) : esc(inputStr);
        } else {
          highlightedInput = search ? highlight(esc(inputStr), search) : (lang ? highlightCode(inputStr, lang) : esc(inputStr));
        }
        var resultStr = result !== undefined
          ? (typeof result === 'string' ? result : JSON.stringify(result, null, 2))
          : null;
        html +=
          '<div class="vwr-tool-block">' +
            '<div class="vwr-tool-header" onclick="CCE.viewer._toggleBlock(\'' + tuid + '\', this)">' +
              '<span class="vwr-chevron">&#9658;</span>' +
              '<span class="vwr-tool-name">' + esc(name) + '</span>' +
              '<span class="vwr-tool-summary">' + esc(summary) + '</span>' +
            '</div>' +
            '<div class="vwr-tool-body" id="' + tuid + '">' +
              '<div class="vwr-tool-input">' + highlightedInput + '</div>' +
              (resultStr !== null
                ? '<div class="vwr-tool-result-label">Result</div><div class="vwr-tool-result-content">' + truncateWithExpand(resultStr, 8000, 'vtr-' + tuid) + '</div>'
                : '') +
            '</div>' +
          '</div>';
      }
    }

    // Usage bar
    if (usage) {
      var parts = [];
      if (usage.input_tokens)               parts.push('in: ' + usage.input_tokens.toLocaleString());
      if (usage.output_tokens)              parts.push('out: ' + usage.output_tokens.toLocaleString());
      if (usage.cache_read_input_tokens)    parts.push('cache read: ' + usage.cache_read_input_tokens.toLocaleString());
      if (usage.cache_creation_input_tokens) parts.push('cache write: ' + usage.cache_creation_input_tokens.toLocaleString());
      var cost = CCE.cost.estimate(model, usage);
      if (cost > 0) parts.push('~$' + cost.toFixed(4));
      if (parts.length) {
        html += '<div class="vwr-usage-bar">' + parts.map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('') + '</div>';
      }
    }

    if (!hasMatch) return null;
    var div = document.createElement('div');
    div.className = 'vwr-entry vwr-assistant';
    div.innerHTML = html;
    return div;
  }

  function renderSystem(entry, search, lastTimestamp) {
    var subtype = entry.subtype || 'system';
    var dur = entry.durationMs ? ' — ' + (entry.durationMs / 1000).toFixed(1) + 's' : '';
    var ts = fmtTime(entry.timestamp);
    var text = subtype + dur;
    if (search && text.toLowerCase().indexOf(search) === -1) return null;
    var delta = relativeTimeDelta(lastTimestamp, entry.timestamp);
    var deltaHtml = delta ? ' <span class="vwr-time-delta">' + esc(delta) + '</span>' : '';
    var div = document.createElement('div');
    div.className = 'vwr-entry vwr-system';
    div.innerHTML =
      '<div class="vwr-entry-header"><span class="vwr-role">System</span><span>' + esc(ts) + '</span>' + deltaHtml + '</div>' +
      '<span>' + esc(text) + '</span>';
    return div;
  }

  function renderProgress(entry, search) {
    var data = entry.data || {};
    var parts = [data.type || 'progress'];
    if (data.command)  parts.push(truncate(data.command, 100));
    if (data.hookName) parts.push('hook: ' + data.hookName);
    var text = parts.join(' — ');
    if (search && text.toLowerCase().indexOf(search) === -1) return null;
    var div = document.createElement('div');
    div.className = 'vwr-entry vwr-progress';
    div.textContent = text;
    return div;
  }

  function renderSnapshot(entry) {
    var snap = entry.snapshot || {};
    var files = Object.keys(snap.trackedFileBackups || {});
    var div = document.createElement('div');
    div.className = 'vwr-entry vwr-snapshot';
    div.textContent = 'file snapshot — ' + files.length + ' file(s) tracked';
    return div;
  }

  function renderLastPrompt(entry, search) {
    var text = entry.lastPrompt || '';
    if (search && text.toLowerCase().indexOf(search) === -1) return null;
    var lpId = 'vlp-' + Math.random().toString(36).slice(2, 9);
    var div = document.createElement('div');
    div.className = 'vwr-entry vwr-system';
    div.innerHTML =
      '<div class="vwr-entry-header"><span class="vwr-role">Last Prompt</span></div>' +
      '<div class="vwr-text-content">' + truncateWithExpand(text, 500, lpId) + '</div>';
    return div;
  }

  /* ------------------------------------------------------------------ */
  /* Main render loop                                                     */
  /* ------------------------------------------------------------------ */
  function renderConversation(conv, tocContent) {
    conv.innerHTML = '';
    if (tocContent) tocContent.innerHTML = '';

    var entries = _state.entries;
    var toolResults = _state.toolResults;
    var search = _state.search;
    var filters = _state.filters;

    var entryIdx = 0;
    var lastDateStr = '';
    var lastTimestamp = null;
    var tocItems = [];

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var type = entry.type;

      // Filter logic
      if (type === 'user') {
        if (!filters.user) continue;
        // Skip pure tool-result-only user turns
        if (entry.toolUseResult !== undefined && !entry.message) continue;
        if (entry.toolUseResult !== undefined) {
          var c = entry.message && entry.message.content;
          if (typeof c === 'string' && c.trim() === '') continue;
          if (Array.isArray(c) && c.every(function (b) { return b.type === 'tool_result'; })) continue;
        }
      } else if (type === 'assistant') {
        if (!filters.assistant) continue;
      } else if (type === 'system') {
        if (!filters.system) continue;
      } else if (type === 'progress') {
        if (!filters.progress) continue;
      } else if (type === 'file-history-snapshot') {
        if (!filters.snapshot) continue;
      } else if (type === 'last-prompt') {
        if (!filters.system) continue;
      } else {
        continue;
      }

      var el = null;
      if (type === 'user')                   el = renderUser(entry, search, lastTimestamp);
      else if (type === 'assistant')         el = renderAssistant(entry, search, lastTimestamp, toolResults);
      else if (type === 'system')            el = renderSystem(entry, search, lastTimestamp);
      else if (type === 'progress')          el = renderProgress(entry, search);
      else if (type === 'file-history-snapshot') el = renderSnapshot(entry);
      else if (type === 'last-prompt')       el = renderLastPrompt(entry, search);

      if (!el) continue;

      // Date separator
      if (entry.timestamp) {
        try {
          var dateStr = new Date(entry.timestamp).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          if (dateStr !== lastDateStr) {
            var sep = document.createElement('div');
            sep.className = 'vwr-date-separator';
            sep.innerHTML = '<span>' + esc(dateStr) + '</span>';
            conv.appendChild(sep);
            lastDateStr = dateStr;
          }
        } catch (e) {}
      }

      el.setAttribute('data-entry-idx', String(entryIdx));
      conv.appendChild(el);

      // TOC entries (user + assistant only)
      if (tocContent && (type === 'user' || type === 'assistant')) {
        tocItems.push({ el: el, type: type, ts: fmtTime(entry.timestamp) });
      }

      entryIdx++;
      if (entry.timestamp) lastTimestamp = entry.timestamp;
    }

    // Build TOC
    if (tocContent) {
      for (var ti = 0; ti < tocItems.length; ti++) {
        (function (item) {
          var previewEl = item.el.querySelector('.vwr-text-content') || item.el.querySelector('.vwr-md-content');
          var previewText = previewEl ? previewEl.textContent.slice(0, 50).trim() : item.el.textContent.slice(0, 50).trim();
          var tocItem = document.createElement('div');
          var tocCls = item.type === 'user' ? 'vwr-toc-user' : 'vwr-toc-assistant';
          tocItem.className = 'vwr-toc-item ' + tocCls;
          tocItem.innerHTML =
            '<span class="vwr-toc-role">' + esc(item.type === 'user' ? 'User' : 'Assistant') + '</span>' +
            '<span class="vwr-toc-preview">' + esc(previewText) + '</span>' +
            (item.ts ? '<span class="vwr-toc-time">' + esc(item.ts) + '</span>' : '');
          tocItem.addEventListener('click', function () {
            item.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          tocContent.appendChild(tocItem);
        })(tocItems[ti]);
      }
    }

    // Search nav
    if (search) {
      updateSearchNav(conv);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Search navigation                                                    */
  /* ------------------------------------------------------------------ */
  function updateSearchNav(conv, navEl) {
    var marks = Array.from((conv || document).querySelectorAll('.vwr-conv mark'));
    _state.searchMatches = marks;
    var navEl2 = navEl || document.getElementById('vwr-search-nav');
    var countEl = document.getElementById('vwr-search-count');
    if (!marks.length) {
      if (navEl2) navEl2.style.display = 'none';
      return;
    }
    if (navEl2) navEl2.style.display = 'flex';
    _state.searchIndex = Math.max(0, Math.min(_state.searchIndex, marks.length - 1));
    for (var i = 0; i < marks.length; i++) marks[i].classList.remove('vwr-active-match');
    marks[_state.searchIndex].classList.add('vwr-active-match');
    if (countEl) countEl.textContent = (_state.searchIndex + 1) + ' of ' + marks.length;
    marks[_state.searchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ------------------------------------------------------------------ */
  /* Markdown export                                                      */
  /* ------------------------------------------------------------------ */
  function exportMarkdown(entries) {
    var lines = ['# Session\n'];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var type = entry.type;
      if (type === 'user') {
        var content = entry.message && entry.message.content;
        var text = typeof content === 'string' ? content
          : (Array.isArray(content)
              ? content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n')
              : '');
        if (!text.trim()) continue;
        lines.push('## User\n');
        lines.push(text.trim() + '\n');
      } else if (type === 'assistant') {
        var blocks = (entry.message && entry.message.content) || [];
        var hasMd = false;
        var mdParts = [];
        for (var bi = 0; bi < blocks.length; bi++) {
          var b = blocks[bi];
          if (b.type === 'text' && b.text && b.text.trim()) {
            hasMd = true;
            mdParts.push(b.text.trim());
          } else if (b.type === 'tool_use') {
            var inp = formatToolInput(b.name || 'tool', b.input || {});
            mdParts.push('**Tool:** `' + (b.name || 'tool') + '`\n\n```\n' + inp + '\n```');
            hasMd = true;
          } else if (b.type === 'thinking' && b.thinking && b.thinking.trim()) {
            mdParts.push('> *Thinking:* ' + b.thinking.slice(0, 200).replace(/\n/g, ' ') + '…');
            hasMd = true;
          }
        }
        if (hasMd) {
          lines.push('## Assistant\n');
          lines.push(mdParts.join('\n\n') + '\n');
        }
      }
    }
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* View mount                                                           */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/viewer', {
    title: 'Viewer',
    mount: function (root) {
      /* ---- 1. Parse session id (+ optional subagent) from hash query ---- */
      var hash = location.hash || '';
      var qIdx = hash.indexOf('?');
      var id = '', sub = '';
      if (qIdx !== -1) {
        var params = hash.slice(qIdx + 1).split('&');
        for (var pi = 0; pi < params.length; pi++) {
          var kv = params[pi].split('=');
          var val = decodeURIComponent(kv.slice(1).join('='));
          if (kv[0] === 'id') id = val;
          else if (kv[0] === 'sub') sub = val;
        }
      }

      /* ---- 2. Populate toolbar ---- */
      var shellToolbar = document.querySelector('.toolbar');
      if (shellToolbar) {
        shellToolbar.innerHTML =
          '<button class="vwr-btn" id="vwr-back">&#8592; Sessions</button>' +
          '<span class="vwr-session-id" id="vwr-session-label" title="' + esc(id) + '">' + esc(truncate(id, 40)) + '</span>' +
          '<div class="vwr-filter-group" id="vwr-filters">' +
            '<label class="vwr-filter-label"><input type="checkbox" data-filter="user" checked> User</label>' +
            '<label class="vwr-filter-label"><input type="checkbox" data-filter="assistant" checked> Assistant</label>' +
            '<label class="vwr-filter-label"><input type="checkbox" data-filter="system" checked> System</label>' +
            '<label class="vwr-filter-label"><input type="checkbox" data-filter="progress"> Progress</label>' +
            '<label class="vwr-filter-label"><input type="checkbox" data-filter="snapshot"> Snapshots</label>' +
          '</div>' +
          '<div class="vwr-search-row">' +
            '<input type="text" id="vwr-search-box" class="vwr-search-input" placeholder="Search messages…">' +
            '<span id="vwr-search-nav" style="display:none;align-items:center;gap:4px;">' +
              '<span id="vwr-search-count" class="vwr-search-count-label"></span>' +
              '<button class="vwr-btn" id="vwr-search-prev" title="Previous match">&#9650;</button>' +
              '<button class="vwr-btn" id="vwr-search-next" title="Next match">&#9660;</button>' +
            '</span>' +
          '</div>' +
          '<div class="spacer"></div>' +
          '<button class="vwr-btn" id="vwr-toc-btn">&#9776; TOC</button>' +
          '<button class="vwr-btn" id="vwr-expand-all">Expand All</button>' +
          '<button class="vwr-btn" id="vwr-collapse-all">Collapse All</button>' +
          '<button class="vwr-btn" id="vwr-export-md">Export .md</button>';
      }

      /* ---- 3. Build view structure ---- */
      root.innerHTML =
        '<div class="vwr-root">' +
          '<aside class="vwr-sidebar" id="vwr-sidebar">' +
            '<div class="vwr-sidebar-content" id="vwr-toc-content"></div>' +
          '</aside>' +
          '<div class="vwr-main">' +
            '<div class="vwr-session-meta" id="vwr-session-meta"></div>' +
            '<div id="vwr-subagents"></div>' +
            '<div class="vwr-conv" id="vwr-conv"></div>' +
          '</div>' +
        '</div>';

      var conv = root.querySelector('#vwr-conv');
      var tocContent = root.querySelector('#vwr-toc-content');
      var metaEl = root.querySelector('#vwr-session-meta');
      var subagentsEl = root.querySelector('#vwr-subagents');

      /* ---- 4. Wire toolbar controls ---- */
      function reRender() {
        renderConversation(conv, tocContent);
        var navEl = document.getElementById('vwr-search-nav');
        if (_state.search) {
          updateSearchNav(conv, navEl);
        } else {
          if (navEl) navEl.style.display = 'none';
          _state.searchMatches = [];
        }
      }

      var backBtn = document.getElementById('vwr-back');
      if (backBtn) backBtn.addEventListener('click', function () { CCE.router.go('#/sessions'); });

      var filterContainer = document.getElementById('vwr-filters');
      if (filterContainer) {
        filterContainer.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
          var f = cb.dataset.filter;
          cb.checked = !!_state.filters[f];
          cb.addEventListener('change', function () {
            _state.filters[f] = cb.checked;
            reRender();
          });
        });
      }

      var searchBox = document.getElementById('vwr-search-box');
      if (searchBox) {
        searchBox.addEventListener('input', debounce(function () {
          _state.search = searchBox.value.trim().toLowerCase();
          _state.searchIndex = 0;
          reRender();
        }, 200));
        searchBox.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) searchPrev(); else searchNext();
          }
        });
      }

      var searchNavEl = document.getElementById('vwr-search-nav');
      var prevBtn = document.getElementById('vwr-search-prev');
      var nextBtn = document.getElementById('vwr-search-next');
      function searchNext() {
        if (!_state.searchMatches.length) return;
        _state.searchIndex = (_state.searchIndex + 1) % _state.searchMatches.length;
        updateSearchNav(conv, searchNavEl);
      }
      function searchPrev() {
        if (!_state.searchMatches.length) return;
        _state.searchIndex = (_state.searchIndex - 1 + _state.searchMatches.length) % _state.searchMatches.length;
        updateSearchNav(conv, searchNavEl);
      }
      if (prevBtn) prevBtn.addEventListener('click', searchPrev);
      if (nextBtn) nextBtn.addEventListener('click', searchNext);

      var tocBtn = document.getElementById('vwr-toc-btn');
      var sidebar = document.getElementById('vwr-sidebar');
      if (tocBtn && sidebar) {
        tocBtn.addEventListener('click', function () {
          _state.sidebarOpen = !_state.sidebarOpen;
          sidebar.classList.toggle('vwr-sidebar-open', _state.sidebarOpen);
        });
      }

      var expandAllBtn = document.getElementById('vwr-expand-all');
      var collapseAllBtn = document.getElementById('vwr-collapse-all');
      if (expandAllBtn) expandAllBtn.addEventListener('click', function () {
        conv.querySelectorAll('.vwr-thinking-body, .vwr-tool-body').forEach(function (el) { el.classList.add('vwr-open'); });
        conv.querySelectorAll('.vwr-chevron').forEach(function (el) { el.classList.add('vwr-open'); });
      });
      if (collapseAllBtn) collapseAllBtn.addEventListener('click', function () {
        conv.querySelectorAll('.vwr-thinking-body, .vwr-tool-body').forEach(function (el) { el.classList.remove('vwr-open'); });
        conv.querySelectorAll('.vwr-chevron').forEach(function (el) { el.classList.remove('vwr-open'); });
      });

      var exportBtn = document.getElementById('vwr-export-md');
      if (exportBtn) exportBtn.addEventListener('click', function () {
        var md = exportMarkdown(_state.entries);
        var blob = new Blob([md], { type: 'text/markdown' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (id || 'session') + '.md';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
      });

      /* ---- 5. Load session data ---- */
      if (!id) {
        conv.innerHTML = '<div class="empty"><h3>No session selected</h3><p>Go back to Sessions and pick one.</p></div>';
        return;
      }

      // Show loading
      conv.innerHTML = '<div class="empty"><p>Loading…</p></div>';

      function buildMeta(entries, prefixHtml) {
        var branch = '', version = '', slug = '';
        for (var ei = 0; ei < entries.length; ei++) {
          var e = entries[ei];
          if (!branch && e.gitBranch) branch = e.gitBranch;
          if (!version && e.version)  version = e.version;
          if (!slug && e.slug)        slug = e.slug;
        }
        var totalCost = 0;
        for (var ci = 0; ci < entries.length; ci++) {
          var ce = entries[ci];
          if (ce.type === 'assistant' && ce.message && ce.message.usage) {
            totalCost += CCE.cost.estimate(ce.message.model || '', ce.message.usage);
          }
        }
        var mp = [];
        if (prefixHtml) mp.push(prefixHtml);
        if (slug)    mp.push('<span title="Session slug">' + esc(slug) + '</span>');
        if (branch)  mp.push('<span>branch: ' + esc(branch) + '</span>');
        if (version) mp.push('<span>v' + esc(version) + '</span>');
        mp.push('<span>' + entries.length + ' entries</span>');
        if (totalCost > 0) mp.push('<span>Est. cost: $' + totalCost.toFixed(2) + '</span>');
        if (metaEl) metaEl.innerHTML = mp.join('<span class="vwr-meta-sep">\xb7</span>');
      }

      function loadInto(readFn, prefixHtml) {
        return readFn().then(function (text) {
          var entries = CCE.jsonl.parse(text);
          _state.entries = entries;
          _state.toolResults = CCE.jsonl.indexToolResults(entries);
          _state.search = '';
          _state.searchIndex = 0;
          _state.searchMatches = [];
          buildMeta(entries, prefixHtml);
          reRender();
        });
      }

      CCE.fsaccess.listSessions().then(function (items) {
        var parent = null;
        for (var ii = 0; ii < items.length; ii++) {
          if (items[ii].id === id) { parent = items[ii]; break; }
        }
        if (!parent) {
          conv.innerHTML = '<div class="empty"><h3>Session not found</h3><p>ID: ' + esc(id) + '</p></div>';
          return;
        }
        var projectFolder = parent.projectFolder;

        if (sub) {
          // Viewing a subagent transcript spawned inside this session.
          return CCE.fsaccess.listSubagents(projectFolder, id).then(function (subs) {
            var si = null;
            for (var k = 0; k < subs.length; k++) { if (subs[k].id === sub) { si = subs[k]; break; } }
            if (!si) {
              conv.innerHTML = '<div class="empty"><h3>Subagent not found</h3><p>' + esc(sub) + '</p></div>';
              return;
            }
            var backLink = '<a class="vwr-sub-back" href="#/viewer?id=' + encodeURIComponent(id) + '">← parent session</a>';
            var subTag = '<span class="vwr-sub-tag">subagent</span>';
            return loadInto(si.read, backLink + subTag);
          });
        }

        return loadInto(parent.read).then(function () {
          // Surface any subagents this session spawned.
          if (!subagentsEl) return;
          subagentsEl.innerHTML = '';
          return CCE.fsaccess.listSubagents(projectFolder, id).then(function (subs) {
            if (!subs || subs.length === 0) return;
            var rows = subs.map(function (s) {
              var label = s.id.replace(/^agent-/, '');
              return '<a class="vwr-subagent" href="#/viewer?id=' + encodeURIComponent(id) +
                '&sub=' + encodeURIComponent(s.id) + '" title="' + esc(s.id) + '">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 2h6M9 14h.01M15 14h.01"/></svg>' +
                esc(label) + '</a>';
            }).join('');
            subagentsEl.innerHTML =
              '<div class="vwr-subagents-title">Subagents spawned in this session (' + subs.length + ')</div>' +
              '<div class="vwr-subagents-list">' + rows + '</div>';
          });
        });
      }).catch(function (err) {
        conv.innerHTML = '<div class="empty"><h3>Failed to load session</h3><p>' + esc(err && err.message ? err.message : String(err)) + '</p></div>';
      });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Public API                                                           */
  /* ------------------------------------------------------------------ */
  CCE.viewer = {
    exportMarkdown: exportMarkdown,
    // Internal helpers exposed for inline onclick handlers
    _toggleBlock: toggleBlock,
    _showFull: function (id) {
      var trunc = document.getElementById(id + '-trunc');
      var full  = document.getElementById(id + '-full');
      if (trunc) trunc.style.display = 'none';
      if (full)  full.style.display  = 'inline';
    }
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
