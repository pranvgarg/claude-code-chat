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
  /* Public surface                                                       */
  /* ------------------------------------------------------------------ */
  CCE.markdown = {
    render: render,
    esc: esc
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
