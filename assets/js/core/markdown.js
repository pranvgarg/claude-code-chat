(function (g) {
  'use strict';
  const CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Escape helper: uses the DOM textContent trick so no regex needed.   */
  /* In a non-browser environment (Node), falls back to a simple regex.  */
  /* ------------------------------------------------------------------ */
  function esc(s) {
    if (typeof s !== 'string') s = String(s);
    if (g.document && g.document.createElement) {
      var el = g.document.createElement('span');
      el.textContent = s;
      return el.innerHTML;
    }
    // Fallback (non-DOM environments, e.g. node --check syntax pass)
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------ */
  /* render(text) → safe HTML string                                     */
  /*                                                                     */
  /* Priority:                                                           */
  /*   1. marked present + DOMPurify present → full markdown + sanitize  */
  /*   2. marked present, DOMPurify ABSENT   → escape only (never raw)  */
  /*   3. marked absent                      → escape only              */
  /* ------------------------------------------------------------------ */
  function render(text) {
    if (typeof text !== 'string') text = String(text);

    if (g.marked && typeof g.marked.parse === 'function') {
      var raw = g.marked.parse(text, { breaks: true, gfm: true });
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
