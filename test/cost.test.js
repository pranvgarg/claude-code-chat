const { test } = require('node:test');
const assert = require('node:assert');
require('../assets/js/core/cost.js');
const { cost } = globalThis.CCE;

test('opus estimate uses opus rates', () => {
  const c = cost.estimate('claude-opus-4-8', { input_tokens: 1000000, output_tokens: 0 });
  assert.equal(Math.round(c), 15);
});
test('unknown model defaults to sonnet rates', () => {
  const c = cost.estimate('mystery', { input_tokens: 1000000, output_tokens: 0 });
  assert.equal(Math.round(c), 3);
});
test('no model or usage -> 0', () => {
  assert.equal(cost.estimate('', null), 0);
});
