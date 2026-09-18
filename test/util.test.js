const { test } = require('node:test');
const assert = require('node:assert');
require('../assets/js/core/util.js');
const u = globalThis.CCE.util;

test('esc escapes html-significant characters', () => {
  assert.equal(u.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(u.esc(null), '');
});
test('money formats two decimals', () => {
  assert.equal(u.money(1.844), '$1.84');
  assert.equal(u.money(undefined), '$0.00');
});
test('fmtTokens abbreviates', () => {
  assert.equal(u.fmtTokens(0), '0');
  assert.equal(u.fmtTokens(999), '999');
  assert.equal(u.fmtTokens(1500), '1.5k');
  assert.equal(u.fmtTokens(1200000), '1.2M');
});
test('relTime buckets by age', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');
  assert.equal(u.relTime('2026-09-17T11:56:00Z', now), '4m');
  assert.equal(u.relTime('2026-09-17T09:00:00Z', now), '3h');
  assert.equal(u.relTime('2026-09-15T12:00:00Z', now), '2d');
  assert.equal(u.relTime('2026-09-08T12:00:00Z', now), '1w');
  assert.equal(u.relTime('2026-08-27T12:00:00Z', now), '3w');
  assert.equal(u.relTime(null, now), '');
});
test('modelClass maps families', () => {
  assert.equal(u.modelClass('claude-opus-5'), 'opus');
  assert.equal(u.modelClass('claude-haiku-4-5'), 'haiku');
  assert.equal(u.modelClass('claude-fable-5-1'), 'fable');
  assert.equal(u.modelClass('claude-mythos-5-1'), 'fable');
  assert.equal(u.modelClass('claude-sonnet-5'), 'sonnet');
  assert.equal(u.modelClass(''), 'sonnet');
});
test('debounce fires once on the trailing edge', async () => {
  let n = 0;
  const d = u.debounce(() => { n++; }, 10);
  d(); d(); d();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(n, 1);
});
