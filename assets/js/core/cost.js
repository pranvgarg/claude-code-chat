(function (g) {
  const CCE = g.CCE = g.CCE || {};
  // [id substring, input, output, cache read, cache write] in USD per million tokens.
  // Matched top to bottom; more specific ids come first. Rates as published
  // by Anthropic (cached 2026-06). Cache read = 10% of input except Fable/Mythos
  // ($0.25); cache write = 125% of input.
  const PRICING = [
    ['fable',       10,   50,   0.25, 12.5],
    ['mythos',      10,   50,   0.25, 12.5],
    ['opus-5',       5,   25,   0.5,   6.25],
    ['opus-4-8',     5,   25,   0.5,   6.25],
    ['opus-4-7',     5,   25,   0.5,   6.25],
    ['opus-4-6',     5,   25,   0.5,   6.25],
    ['opus',        15,   75,   1.5,  18.75],
    ['sonnet-5',     2,   10,   0.2,   2.5],
    ['sonnet',       3,   15,   0.3,   3.75],
    ['haiku-4-5',    1,    5,   0.1,   1.25],
    ['haiku',        0.8,  4,   0.08,  1]
  ];
  const FALLBACK = PRICING.find(function (r) { return r[0] === 'sonnet-5'; });

  function rateFor(model) {
    const m = String(model || '').toLowerCase();
    for (let i = 0; i < PRICING.length; i++) {
      if (m.indexOf(PRICING[i][0]) !== -1) return { rate: PRICING[i], known: true };
    }
    return { rate: FALLBACK, known: false };
  }
  function cacheWriteTokens(usage) {
    if (!usage) return 0;
    if (usage.cache_creation && typeof usage.cache_creation === 'object') {
      return (usage.cache_creation.ephemeral_5m_input_tokens || 0) + (usage.cache_creation.ephemeral_1h_input_tokens || 0);
    }
    return usage.cache_creation_input_tokens || 0;
  }
  function estimate(model, usage) {
    if (!model || !usage) return 0;
    const r = rateFor(model).rate;
    return ((usage.input_tokens || 0) * r[1] + (usage.output_tokens || 0) * r[2]
      + (usage.cache_read_input_tokens || 0) * r[3] + cacheWriteTokens(usage) * r[4]) / 1e6;
  }
  function isKnownModel(model) { return !!model && rateFor(model).known; }

  CCE.cost = { PRICING, estimate, isKnownModel, cacheWriteTokens };
})(typeof globalThis !== 'undefined' ? globalThis : this);
