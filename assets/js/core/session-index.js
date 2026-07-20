(function (g) {
  const CCE = g.CCE = g.CCE || {};
  function firstUserPrompt(entries) {
    for (const e of entries) {
      if (e.type !== 'user') continue;
      const c = e.message && e.message.content;
      if (typeof c === 'string' && c.trim()) return c.trim();
      if (Array.isArray(c)) { const t = c.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim(); if (t) return t; }
    }
    return '(no prompt)';
  }
  function summarize(entries, meta) {
    let model = '', branch = '', cost = 0, tokens = 0, firstTs = null, lastTs = null;
    for (const e of entries) {
      if (e.gitBranch && !branch) branch = e.gitBranch;
      if (e.timestamp) { if (!firstTs) firstTs = e.timestamp; lastTs = e.timestamp; }
      if (e.type === 'assistant' && e.message) {
        if (e.message.model && !model) model = e.message.model;
        if (e.message.usage) {
          cost += CCE.cost.estimate(e.message.model || '', e.message.usage);
          tokens += (e.message.usage.input_tokens||0) + (e.message.usage.output_tokens||0);
        }
      }
    }
    return { id: meta.id, prompt: firstUserPrompt(entries), model, branch,
      msgs: entries.filter(e=>e.type==='user'||e.type==='assistant').length,
      cost, tokens, firstTs, lastTs };
  }
  function projectDisplayPath(folder) {
    // folder is the absolute path with '/' replaced by '-'. Best-effort decode:
    // real dashes in the original path are indistinguishable from path separators.
    let p = folder.replace(/-/g, '/');            // -Users-me-Developer-app -> /Users/me/Developer/app
    p = p.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
    return p;
  }
  CCE.sessionIndex = { summarize, projectDisplayPath };
})(typeof globalThis !== 'undefined' ? globalThis : this);
