(function (g) {
  const CCE = g.CCE = g.CCE || {};

  function isPrimary(e) { return e && e.isSidechain !== true && e.isMeta !== true; }

  function textOf(content) {
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) return content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim();
    return '';
  }

  function firstUserPrompt(entries) {
    for (const e of entries) {
      if (e.type !== 'user' || !isPrimary(e)) continue;
      if (e.toolUseResult !== undefined) continue;
      const t = textOf(e.message && e.message.content);
      if (t) return t;
    }
    return '';
  }

  function dedupe(entries) {
    const seen = new Set(), out = [];
    for (const e of entries) {
      if (e && e.uuid) { if (seen.has(e.uuid)) continue; seen.add(e.uuid); }
      out.push(e);
    }
    return out;
  }

  function summarize(rawEntries, meta) {
    const entries = dedupe(rawEntries || []);
    let model = '', branch = '', cost = 0, tokens = 0, cacheRead = 0, cacheWrite = 0, firstTs = null, lastTs = null, msgs = 0, toolCalls = 0, unknownModel = false;
    for (const e of entries) {
      if (e.gitBranch && !branch) branch = e.gitBranch;
      if (e.timestamp) { if (!firstTs) firstTs = e.timestamp; lastTs = e.timestamp; }
      if ((e.type === 'user' || e.type === 'assistant') && isPrimary(e)) msgs++;
      if (e.type === 'assistant' && e.message) {
        if (e.message.model && !model) model = e.message.model;
        if (e.message.model && !CCE.cost.isKnownModel(e.message.model)) unknownModel = true;
        if (Array.isArray(e.message.content)) {
          for (const b of e.message.content) if (b.type === 'tool_use') toolCalls++;
        }
        const u = e.message.usage;
        if (u) {
          cost += CCE.cost.estimate(e.message.model || '', u);
          tokens += (u.input_tokens || 0) + (u.output_tokens || 0);
          cacheRead += u.cache_read_input_tokens || 0;
          cacheWrite += CCE.cost.cacheWriteTokens(u);
        }
      }
    }
    const prompt = firstUserPrompt(entries);
    return { id: meta.id, projectFolder: meta.projectFolder, prompt: prompt || '(no prompt)', model, branch,
      msgs, cost, tokens, cacheRead, cacheWrite, firstTs, lastTs, toolCalls,
      empty: msgs === 0, unknownModel };
  }

  function projectDisplayPath(folder) {
    const win = /^([A-Za-z])--(.*)$/.exec(folder);
    if (win) {
      let p = win[1].toUpperCase() + ':\\' + win[2].replace(/-/g, '\\');
      p = p.replace(/^[A-Z]:\\Users\\[^\\]+/, '~');
      return p;
    }
    let p = folder.replace(/-/g, '/');
    p = p.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
    return p;
  }

  CCE.sessionIndex = { summarize, projectDisplayPath, dedupe };
})(typeof globalThis !== 'undefined' ? globalThis : this);
