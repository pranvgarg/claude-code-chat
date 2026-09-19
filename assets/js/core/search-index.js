(function (g) {
  'use strict';
  const CCE = g.CCE = g.CCE || {};
  const SPLIT = /[^\p{L}\p{N}_.\/-]+/u, SUB = /[._\/-]+/;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ok(t) { return t.length >= 2 && t.length <= 64; }
  function tokenize(text) {
    const out = [], seen = new Set();
    const parts = String(text || '').toLowerCase().split(SPLIT);
    for (const raw of parts) {
      const p = raw.replace(/^[._\/-]+|[._\/-]+$/g, '');
      if (!p) continue;
      const cands = [p];
      if (SUB.test(p)) {
        // Split hierarchically so intermediate compounds (e.g. the basename
        // of a path) are indexed too, not just the fully atomized pieces.
        const segs = p.split('/');
        if (segs.length > 1) for (const s of segs) if (s) cands.push(s);
        for (const seg of (segs.length > 1 ? segs : [p])) {
          if (/[._-]/.test(seg)) for (const s of seg.split(/[._-]+/)) if (s) cands.push(s);
        }
      }
      for (const c of cands) if (ok(c) && !seen.has(c)) { seen.add(c); out.push(c); }
    }
    return out;
  }
  function textBlocks(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.filter(function (b) { return b && b.type === 'text'; }).map(function (b) { return b.text || ''; }).join('\n');
    return '';
  }
  function resultText(b) {
    if (typeof b.content === 'string') return b.content;
    if (Array.isArray(b.content)) return textBlocks(b.content);
    return '';
  }
  function extractTurns(entries) {
    const turns = [];
    for (const e of entries || []) {
      if (!e || e.isSidechain === true || e.isMeta === true) continue;
      const c = e.message && e.message.content;
      if (e.type === 'user') {
        if (Array.isArray(c)) {
          const results = c.filter(function (b) { return b.type === 'tool_result'; });
          if (results.length) { turns.push({ uuid: e.uuid, role: 'tool_result', text: results.map(resultText).join('\n') }); continue; }
        }
        const t = textBlocks(c);
        if (t.trim()) turns.push({ uuid: e.uuid, role: 'user', text: t });
      } else if (e.type === 'assistant' && Array.isArray(c)) {
        for (const b of c) {
          if (b.type === 'thinking' && b.thinking) turns.push({ uuid: e.uuid, role: 'thinking', text: b.thinking });
          else if (b.type === 'text' && b.text) turns.push({ uuid: e.uuid, role: 'assistant', text: b.text });
          else if (b.type === 'tool_use') turns.push({ uuid: e.uuid, role: 'tool_input', text: (b.name || '') + ' ' + JSON.stringify(b.input || {}) });
        }
      }
    }
    return turns;
  }
  function build(key, entries) {
    const turns = extractTurns(entries), postings = Object.create(null);
    turns.forEach(function (t, i) {
      for (const tok of tokenize(t.text)) {
        const list = postings[tok] || (postings[tok] = []);
        if (list[list.length - 1] !== i) list.push(i);
      }
    });
    return { key: key, turns: turns.map(function (t) { return { uuid: t.uuid, role: t.role }; }), postings: postings };
  }
  const SCOPES = {
    full: null,
    tools: { tool_input: 1, tool_result: 1 },
    titles: { user: 1 }
  };
  function query(indexes, q, scope) {
    const terms = tokenize(q);
    if (!terms.length) return [];
    const allowed = SCOPES[scope] || null, out = [];
    for (const idx of indexes) {
      let set = null;
      for (const term of terms) {
        const list = idx.postings[term];
        if (!list) { set = null; break; }
        const cur = new Set(list);
        set = set ? new Set([...set].filter(function (i) { return cur.has(i); })) : cur;
        if (!set.size) break;
      }
      if (!set || !set.size) continue;
      let turnIdxs = [...set].sort(function (a, b) { return a - b; });
      if (allowed) turnIdxs = turnIdxs.filter(function (i) { return allowed[idx.turns[i].role]; });
      if (scope === 'titles') turnIdxs = turnIdxs.filter(function (i) { return i === idx.turns.findIndex(function (t) { return t.role === 'user'; }); });
      if (!turnIdxs.length) continue;
      const roles = { user: 0, assistant: 0, thinking: 0, tool_input: 0, tool_result: 0 };
      for (const i of turnIdxs) roles[idx.turns[i].role]++;
      out.push({ key: idx.key, turnIdxs: turnIdxs, hits: turnIdxs.length, roles: roles });
    }
    out.sort(function (a, b) { return b.hits - a.hits; });
    return out;
  }
  function snippet(text, terms, radius) {
    radius = radius || 80;
    const raw = String(text || '');
    const code = /```/.test(raw) || /^(?:    |\t)\S/m.test(raw);
    const src = raw.replace(/```[\w-]*\s*/g, '').replace(/```/g, '').replace(/^ {4}/gm, '').replace(/^\t/gm, '');
    const lower = src.toLowerCase();
    let first = -1, firstLen = 0;
    for (const t of terms) {
      const tl = t.toLowerCase();
      const i = lower.indexOf(tl);
      if (i !== -1 && (first === -1 || i < first)) { first = i; firstLen = tl.length; }
    }
    if (first === -1) return { html: esc(src.slice(0, radius * 2)) + (src.length > radius * 2 ? '…' : ''), code: code };
    // Centre the window on the match itself (not just its start) so a
    // short radius still shows context on both sides of the hit.
    const center = first + Math.floor(firstLen / 2);
    const start = Math.max(0, center - radius), end = Math.min(src.length, center + radius);
    let html = esc(src.slice(start, end));
    const re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    html = html.replace(re, '<mark>$1</mark>');
    return { html: (start > 0 ? '…' : '') + html + (end < src.length ? '…' : ''), code: code };
  }
  CCE.searchIndex = { tokenize, extractTurns, build, query, snippet };
})(typeof globalThis !== 'undefined' ? globalThis : this);
