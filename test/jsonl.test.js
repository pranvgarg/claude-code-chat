const { test } = require('node:test');
const assert = require('node:assert');
require('../assets/js/core/jsonl.js');
const { jsonl } = globalThis.CCE;

test('parse skips blank and malformed lines', () => {
  const text = '{"type":"user"}\n\nnot-json\n{"type":"assistant"}';
  const e = jsonl.parse(text);
  assert.equal(e.length, 2);
  assert.equal(e[0].type, 'user');
});
test('indexToolResults maps tool_use_id -> content', () => {
  const entries = [{ type:'user', message:{ content:[{ type:'tool_result', tool_use_id:'t1', content:'ok' }] } }];
  const map = jsonl.indexToolResults(entries);
  assert.equal(map['t1'], 'ok');
});
