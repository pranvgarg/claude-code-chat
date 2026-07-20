(function (g) {
  const CCE = g.CCE = g.CCE || {};
  const PRICING = { opus:[15,75,1.5,18.75], sonnet:[3,15,0.3,3.75], haiku:[0.8,4,0.08,1] };
  function estimate(model, usage) {
    if (!model || !usage) return 0;
    const m = (model || '').toLowerCase();
    let r = PRICING.sonnet;
    for (const k in PRICING) { if (m.includes(k)) { r = PRICING[k]; break; } }
    return ((usage.input_tokens||0)*r[0] + (usage.output_tokens||0)*r[1]
      + (usage.cache_read_input_tokens||0)*r[2] + (usage.cache_creation_input_tokens||0)*r[3]) / 1e6;
  }
  CCE.cost = { PRICING, estimate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
