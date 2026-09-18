(function (g) {
  'use strict';
  var CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  var esc = CCE.util.esc, debounce = CCE.util.debounce, fmtTime = CCE.util.fmtTime;

  // Cap on characters sent through Prism (or otherwise inlined) for any
  // single tool-input rendering; larger inputs collapse behind "Show full".
  var MAX_TOOL_INPUT = 3000;

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

  function relativeTimeDelta(prev, curr) {
    if (!prev || !curr) return '';
    var diff = new Date(curr) - new Date(prev);
    if (diff < 60000) return '';
    if (diff < 3600000) return Math.round(diff / 60000) + ' min later';
    if (diff < 86400000) return Math.round(diff / 3600000) + 'h later';
    return Math.round(diff / 86400000) + 'd later';
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
    return CCE.markdown.render(text, { codeRenderer: function (code, lang) {
      var language = lang || '';
      return '<pre class="vwr-code-block"><code class="language-' + esc(language) + '">' + highlightCode(code, language) + '</code></pre>';
    } });
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
    var isNowOpen = body.classList.toggle('vwr-open');
    var chev = headerEl.querySelector('.vwr-chevron');
    if (chev) chev.classList.toggle('vwr-open');
    headerEl.setAttribute('aria-expanded', String(isNowOpen));
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
    sidebarOpen: false,
    render: null,
    io: null
  };

  // Scroll listener for the progress bar + scroll-to-bottom FAB.
  // Tracked at module scope so the next mount can remove it (the scroll
  // container #view-root persists across route changes).
  var _scrollHandler = null;

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
              '<div class="vwr-thinking-header" role="button" tabindex="0" aria-expanded="false" onclick="CCE.viewer._toggleBlock(\'' + tid + '\', this)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();CCE.viewer._toggleBlock(\'' + tid + '\', this)}">' +
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
        if (name === 'Write' && !search && inputStr.length > MAX_TOOL_INPUT) {
          var writeHeader = ((input && input.file_path) || '') + '\n---\n';
          var writeContent = (input && input.content) || '';
          var writeId = 'vwt-' + tuid;
          highlightedInput = esc(writeHeader) + truncateWithExpand(writeContent, MAX_TOOL_INPUT, writeId);
        } else if (name === 'Write' && !search) {
          highlightedInput = lang ? highlightCode(inputStr, lang) : esc(inputStr);
        } else if (search) {
          highlightedInput = highlight(esc(inputStr), search);
        } else if (lang) {
          highlightedInput = inputStr.length > MAX_TOOL_INPUT
            ? truncateWithExpand(inputStr, MAX_TOOL_INPUT, tuid + '-in')
            : highlightCode(inputStr, lang);
        } else {
          highlightedInput = inputStr.length > MAX_TOOL_INPUT
            ? truncateWithExpand(inputStr, MAX_TOOL_INPUT, tuid + '-in')
            : esc(inputStr);
        }
        var resultStr = result !== undefined
          ? (typeof result === 'string' ? result : JSON.stringify(result, null, 2))
          : null;
        html +=
          '<div class="vwr-tool-block">' +
            '<div class="vwr-tool-header" role="button" tabindex="0" aria-expanded="false" onclick="CCE.viewer._toggleBlock(\'' + tuid + '\', this)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();CCE.viewer._toggleBlock(\'' + tuid + '\', this)}">' +
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
  var CHUNK = 150;

  // Renders a single transcript entry (filter check, renderer dispatch, date
  // separator, TOC item) and appends it to `conv`/`tocContent`. `r` is the
  // shared render cursor (`_state.render`): { i, entryIdx, lastDateStr,
  // lastTimestamp }. Mutates r.entryIdx / r.lastDateStr / r.lastTimestamp so
  // chunked calls continue seamlessly from where the previous chunk left off.
  function appendEntry(conv, tocContent, entry, r) {
    var toolResults = _state.toolResults;
    var search = _state.search;
    var filters = _state.filters;
    var type = entry.type;

    // Filter logic
    if (type === 'user') {
      if (!filters.user) return;
      // Skip pure tool-result-only user turns
      if (entry.toolUseResult !== undefined && !entry.message) return;
      if (entry.toolUseResult !== undefined) {
        var c = entry.message && entry.message.content;
        if (typeof c === 'string' && c.trim() === '') return;
        if (Array.isArray(c) && c.every(function (b) { return b.type === 'tool_result'; })) return;
      }
    } else if (type === 'assistant') {
      if (!filters.assistant) return;
    } else if (type === 'system') {
      if (!filters.system) return;
    } else if (type === 'progress') {
      if (!filters.progress) return;
    } else if (type === 'file-history-snapshot') {
      if (!filters.snapshot) return;
    } else if (type === 'last-prompt') {
      if (!filters.system) return;
    } else {
      return;
    }

    var el = null;
    if (type === 'user')                   el = renderUser(entry, search, r.lastTimestamp);
    else if (type === 'assistant')         el = renderAssistant(entry, search, r.lastTimestamp, toolResults);
    else if (type === 'system')            el = renderSystem(entry, search, r.lastTimestamp);
    else if (type === 'progress')          el = renderProgress(entry, search);
    else if (type === 'file-history-snapshot') el = renderSnapshot(entry);
    else if (type === 'last-prompt')       el = renderLastPrompt(entry, search);

    if (!el) return;

    // Date separator
    if (entry.timestamp) {
      try {
        var dateStr = new Date(entry.timestamp).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (dateStr !== r.lastDateStr) {
          var sep = document.createElement('div');
          sep.className = 'vwr-date-separator';
          sep.innerHTML = '<span>' + esc(dateStr) + '</span>';
          conv.appendChild(sep);
          r.lastDateStr = dateStr;
        }
      } catch (e) {}
    }

    el.setAttribute('data-entry-idx', String(r.entryIdx));
    el.setAttribute('data-uuid', entry.uuid || '');
    conv.appendChild(el);

    // TOC entry (user + assistant only), appended immediately so the TOC
    // grows incrementally with each rendered chunk.
    if (tocContent && (type === 'user' || type === 'assistant')) {
      var previewEl = el.querySelector('.vwr-text-content') || el.querySelector('.vwr-md-content');
      var previewText = previewEl ? previewEl.textContent.slice(0, 50).trim() : el.textContent.slice(0, 50).trim();
      var itemTs = fmtTime(entry.timestamp);
      var tocItem = document.createElement('div');
      var tocCls = type === 'user' ? 'vwr-toc-user' : 'vwr-toc-assistant';
      tocItem.className = 'vwr-toc-item ' + tocCls;
      tocItem.innerHTML =
        '<span class="vwr-toc-role">' + esc(type === 'user' ? 'User' : 'Assistant') + '</span>' +
        '<span class="vwr-toc-preview">' + esc(previewText) + '</span>' +
        (itemTs ? '<span class="vwr-toc-time">' + esc(itemTs) + '</span>' : '');
      tocItem.addEventListener('click', function () {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      tocContent.appendChild(tocItem);
    }

    r.entryIdx++;
    if (entry.timestamp) r.lastTimestamp = entry.timestamp;
  }

  // Renders the transcript in chunks of CHUNK entries. The first chunk (plus
  // any further chunks needed to reach opts.untilUuid) renders synchronously;
  // remaining entries render lazily as a sentinel scrolls into view.
  function renderConversation(conv, tocContent, opts) {
    opts = opts || {};
    conv.innerHTML = ''; if (tocContent) tocContent.innerHTML = '';
    if (_state.io) { _state.io.disconnect(); _state.io = null; }
    _state.render = { i: 0, entryIdx: 0, lastDateStr: '', lastTimestamp: null };
    function renderNext() {
      var r = _state.render, end = Math.min(_state.entries.length, r.i + CHUNK);
      while (r.i < end) { appendEntry(conv, tocContent, _state.entries[r.i], r); r.i++; }
      // Inject copy buttons + language labels into any new code blocks.
      // Uses DOM construction (no inline onclick) so listeners are cleaned
      // up when the conv element is replaced on next render. Already-
      // augmented blocks (from a prior chunk) are skipped internally.
      injectCodeCopyButtons(conv);
      // Recompute matches/count/nav visibility for the newly rendered
      // marks, but don't yank the viewport back to the active match while
      // the user is scrolling to load this chunk lazily.
      if (_state.search) updateSearchNav(conv, null, { scroll: false });
      return r.i < _state.entries.length;
    }
    var more = renderNext();
    if (opts.untilUuid) {
      // If untilUuid never matches (e.g. a stale or unknown uuid), this
      // renders every remaining chunk — the whole transcript ends up in
      // the DOM with no sentinel/observer left to attach.
      while (more && !conv.querySelector('[data-uuid="' + CSS.escape(opts.untilUuid) + '"]')) more = renderNext();
    }
    if (more) {
      var sentinel = document.createElement('div'); sentinel.className = 'vwr-sentinel'; conv.appendChild(sentinel);
      _state.io = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        var still = renderNext();
        conv.appendChild(sentinel);
        if (!still) { _state.io.disconnect(); _state.io = null; sentinel.remove(); }
      }, { root: document.getElementById('view-root'), rootMargin: '800px' });
      _state.io.observe(sentinel);
    }
  }

  function injectCodeCopyButtons(conv) {
    var blocks = conv.querySelectorAll('.vwr-code-block');
    blocks.forEach(function (block) {
      // Skip if already augmented (re-render safety).
      if (block.querySelector('.vwr-code-head')) return;

      var codeEl = block.querySelector('code');
      var lang = '';
      if (codeEl) {
        var cls = codeEl.className || '';
        var m = cls.match(/language-([^\s]+)/);
        if (m) lang = m[1];
      }

      var head = document.createElement('div');
      head.className = 'vwr-code-head';

      var langLabel = document.createElement('span');
      langLabel.className = 'vwr-code-lang';
      langLabel.textContent = lang || 'code';

      var copyBtn = document.createElement('button');
      copyBtn.className = 'vwr-code-copy';
      copyBtn.type = 'button';
      copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
      copyBtn.innerHTML = copyIconSVG();
      copyBtn.addEventListener('click', function () {
        var text = codeEl ? codeEl.textContent : '';
        copyToClipboard(text).then(function () {
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = checkIconSVG();
          setTimeout(function () {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = copyIconSVG();
          }, 1400);
        }).catch(function () { /* clipboard unavailable — silent */ });
      });

      head.appendChild(langLabel);
      head.appendChild(copyBtn);
      block.insertBefore(head, block.firstChild);
    });
  }

  function copyIconSVG() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
      '</svg> Copy';
  }
  function checkIconSVG() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="20 6 9 17 4 12"/>' +
      '</svg> Copied';
  }

  function copyToClipboard(text) {
    if (g.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for file:// or older browsers.
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Search navigation                                                    */
  /* ------------------------------------------------------------------ */
  // Recomputes _state.searchMatches, the active-match highlight and the
  // count label/visibility of the nav UI. By default also scrolls the
  // active match into view; pass { scroll: false } to skip that (used when
  // a lazily-loaded chunk adds new marks and the user's own scroll should
  // not be interrupted).
  function updateSearchNav(conv, navEl, opts) {
    opts = opts || {};
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
    if (opts.scroll !== false) {
      marks[_state.searchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

  function exportHTML() {
    var conv = document.getElementById('vwr-conv');
    if (!conv) return;
    // App-authored CSS from our own stylesheets, not user/session data — safe to inline as-is.
    var css = Array.from(document.styleSheets).map(function (s) {
      try { return Array.from(s.cssRules).map(function (r) { return r.cssText; }).join('\n'); } catch (e) { return ''; }
    }).join('\n');
    var html = '<!doctype html><html data-theme="' + esc(document.documentElement.dataset.theme || 'dark') + '"><head><meta charset="utf-8"><title>Session export</title><style>' + css + '\nbody{overflow:auto}.vwr-scroll-fab{display:none}</style></head><body><div class="content"><div class="vwr-conv">' + conv.innerHTML + '</div></div></body></html>';
    var blob = new Blob([html], { type: 'text/html' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'session.html'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  }

  /* ------------------------------------------------------------------ */
  /* View mount                                                           */
  /* ------------------------------------------------------------------ */
  CCE.router.register('#/viewer', {
    title: 'Viewer',
    unmount: function () {
      var scroller = document.getElementById('view-root');
      if (scroller && _scrollHandler) scroller.removeEventListener('scroll', _scrollHandler);
      _scrollHandler = null;
      if (_state.io) { _state.io.disconnect(); _state.io = null; }
    },
    mount: function (root) {
      /* ---- 1. Parse session id (+ optional subagent) from hash query ---- */
      var hash = location.hash || '';
      var qIdx = hash.indexOf('?');
      var id = '', sub = '', turn = '', find = '';
      if (qIdx !== -1) {
        var params = hash.slice(qIdx + 1).split('&');
        for (var pi = 0; pi < params.length; pi++) {
          var kv = params[pi].split('=');
          var val = decodeURIComponent(kv.slice(1).join('='));
          if (kv[0] === 'id') id = val;
          else if (kv[0] === 'sub') sub = val;
          else if (kv[0] === 'turn') turn = val;
          else if (kv[0] === 'find') find = val;
        }
      }

      /* ---- 2. Populate toolbar ---- */
      var shellToolbar = document.getElementById('toolbar-actions');
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
          '<button class="vwr-btn" id="vwr-export-md">Export .md</button>' +
          '<button class="vwr-btn" id="vwr-export-html">Export .html</button>';
      }

      /* ---- 3. Build view structure ---- */
      root.innerHTML =
        '<div class="vwr-root">' +
          '<aside class="vwr-sidebar" id="vwr-sidebar">' +
            '<div class="vwr-sidebar-content" id="vwr-toc-content"></div>' +
          '</aside>' +
          '<div class="vwr-main">' +
            '<div class="vwr-progress-track"><div class="vwr-progress-fill" id="vwr-progress-fill"></div></div>' +
            '<div class="vwr-session-meta" id="vwr-session-meta"></div>' +
            '<div id="vwr-subagents"></div>' +
            '<div class="vwr-conv" id="vwr-conv"></div>' +
            '<button class="vwr-scroll-fab" id="vwr-scroll-fab" type="button" aria-label="Scroll to bottom">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<polyline points="6 9 12 15 18 9"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</div>';

      var conv = root.querySelector('#vwr-conv');
      var tocContent = root.querySelector('#vwr-toc-content');
      var metaEl = root.querySelector('#vwr-session-meta');
      var subagentsEl = root.querySelector('#vwr-subagents');
      var progressFill = root.querySelector('#vwr-progress-fill');
      var scrollFab = root.querySelector('#vwr-scroll-fab');

      /* ---- 3a. Wire scroll-progress + scroll-to-bottom FAB ---- */
      // The scroll container is .content (#view-root), which persists across
      // mounts. Track the handler so unmount() can remove it.
      var scroller = document.getElementById('view-root');
      _scrollHandler = function () {
        var max = scroller.scrollHeight - scroller.clientHeight;
        if (max <= 0) {
          if (progressFill) progressFill.style.width = '0%';
          if (scrollFab) scrollFab.classList.remove('show');
          return;
        }
        var pct = Math.min(100, Math.max(0, (scroller.scrollTop / max) * 100));
        if (progressFill) progressFill.style.width = pct.toFixed(1) + '%';
        // Show FAB when user has scrolled up more than 200px from the bottom.
        var distanceFromBottom = max - scroller.scrollTop;
        if (scrollFab) scrollFab.classList.toggle('show', distanceFromBottom > 200);
      };
      if (scroller) {
        scroller.addEventListener('scroll', _scrollHandler, { passive: true });
        // Initial paint.
        _scrollHandler();
      }
      if (scrollFab) {
        scrollFab.addEventListener('click', function () {
          scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
        });
      }

      /* ---- 4. Wire toolbar controls ---- */
      function reRender() {
        renderConversation(conv, tocContent, { untilUuid: turn });
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

      var exportHtmlBtn = document.getElementById('vwr-export-html');
      if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', exportHTML);

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
          if (turn) {
            // reRender() above already called renderConversation with
            // { untilUuid: turn }, so the target's chunk is already in the
            // DOM — just look it up rather than rendering it again.
            var target = conv.querySelector('[data-uuid="' + CSS.escape(turn) + '"]');
            if (target) {
              target.classList.add('vwr-target');
              target.scrollIntoView({ block: 'center' });
              setTimeout(function () { target.classList.remove('vwr-target'); }, 2000);
            }
          }
          if (find) {
            var box = document.getElementById('vwr-search-box');
            if (box) { box.value = find; box.dispatchEvent(new Event('input')); }
          }
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
        if (CCE.app && typeof CCE.app.setActiveProject === 'function') {
          CCE.app.setActiveProject(projectFolder);
        }

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
    exportHTML: exportHTML,
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
