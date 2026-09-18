(function (g) {
  'use strict';
  const CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Escape helper: pure regex escape (matches CCE.util.esc). Must NOT   */
  /* use the DOM textContent/innerHTML trick — that does not escape     */
  /* quotes, and this value is interpolated into HTML attributes         */
  /* (e.g. data-open-key="...") by skills.js / commands.js / memory.js / */
  /* plans.js.                                                            */
  /* ------------------------------------------------------------------ */
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------------ */
  /* render(text) → safe HTML string                                     */
  /*                                                                     */
  /* Priority:                                                           */
  /*   1. marked present + DOMPurify present → full markdown + sanitize  */
  /*   2. marked present, DOMPurify ABSENT   → escape only (never raw)  */
  /*   3. marked absent                      → escape only              */
  /* ------------------------------------------------------------------ */
  function render(text, opts) {
    if (typeof text !== 'string') text = String(text);

    if (g.marked && typeof g.marked.parse === 'function') {
      var options = { breaks: true, gfm: true };
      if (opts && typeof opts.codeRenderer === 'function' && typeof g.marked.Renderer === 'function') {
        var r = new g.marked.Renderer();
        r.code = function (code, lang) { return opts.codeRenderer(typeof code === 'object' ? code.text : code, typeof code === 'object' ? code.lang : lang); };
        options.renderer = r;
      }
      var raw = g.marked.parse(text, options);
      if (g.DOMPurify && typeof g.DOMPurify.sanitize === 'function') {
        return g.DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
      }
      // DOMPurify absent: do NOT return unsanitized marked HTML
      return esc(text);
    }

    return esc(text);
  }

  /* ------------------------------------------------------------------ */
  /* YAML frontmatter helpers (shared by Skills / Memory / Commands)     */
  /* ------------------------------------------------------------------ */
  // Parse the leading `--- ... ---` block for `name` / `description`.
  // Handles YAML folded/literal scalars (`>` / `|`) that continue on
  // following indented lines.
  function parseFrontmatter(text, fallbackName) {
    var result = { name: fallbackName || '', description: '' };
    if (typeof text !== 'string' || text.slice(0, 3) !== '---') return result;
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
      if ((val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') ||
          (val.charAt(0) === "'" && val.charAt(val.length - 1) === "'")) {
        val = val.slice(1, val.length - 1);
      }
      if (key === 'name') result.name = val || (fallbackName || '');
      if (key === 'description') {
        if (val === '' || val === '>' || val === '|' || val === '>-' || val === '|-') {
          var collected = [];
          var k = j + 1;
          for (; k < end && /^\s+\S/.test(lines[k]); k++) collected.push(lines[k].trim());
          val = collected.join(' ');
          j = k - 1;
        }
        result.description = val;
      }
    }
    return result;
  }

  // Remove the leading `--- ... ---` frontmatter block before rendering.
  function stripFrontmatter(text) {
    if (typeof text !== 'string' || text.slice(0, 3) !== '---') return text || '';
    var lines = text.split('\n');
    for (var i = 1; i < lines.length; i++) {
      if (lines[i].trimRight() === '---') {
        return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
      }
    }
    return text;
  }

  /* ------------------------------------------------------------------ */
  /* Public surface                                                       */
  /* ------------------------------------------------------------------ */
  CCE.markdown = {
    render: render,
    esc: esc,
    parseFrontmatter: parseFrontmatter,
    stripFrontmatter: stripFrontmatter
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
