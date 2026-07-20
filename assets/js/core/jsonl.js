(function (g) {
  const CCE = g.CCE = g.CCE || {};
  function parse(text) {
    const out = [];
    for (const line of String(text).split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { out.push(JSON.parse(t)); } catch (e) {}
    }
    return out;
  }
  function indexToolResults(entries) {
    const map = {};
    for (const e of entries) {
      if (e.type === 'user' && e.toolUseResult !== undefined) map['user:' + e.uuid] = e.toolUseResult;
      const content = e.message && e.message.content;
      if (Array.isArray(content)) for (const b of content)
        if (b.type === 'tool_result' && b.tool_use_id) map[b.tool_use_id] = b.content || b;
    }
    const asstById = {};
    for (const e of entries) if (e.type === 'assistant') asstById[e.uuid] = e;
    for (const e of entries) {
      if (e.type === 'user' && e.sourceToolAssistantUUID && e.toolUseResult !== undefined) {
        const a = asstById[e.sourceToolAssistantUUID];
        if (a && a.message && a.message.content) for (const b of a.message.content)
          if (b.type === 'tool_use') map[b.id] = e.toolUseResult;
      }
    }
    return map;
  }
  CCE.jsonl = { parse, indexToolResults };
})(typeof globalThis !== 'undefined' ? globalThis : this);
