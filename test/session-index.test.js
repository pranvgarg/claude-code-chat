const { test } = require('node:test');
const assert = require('node:assert');
require('../assets/js/core/cost.js');
require('../assets/js/core/jsonl.js');
require('../assets/js/core/session-index.js');
const { sessionIndex } = globalThis.CCE;

test('summarize extracts first prompt, model, branch, counts, cost', () => {
  const entries = [
    { type:'user', timestamp:'2026-07-19T10:00:00Z', gitBranch:'main', message:{ content:'Fix the parser bug' } },
    { type:'assistant', timestamp:'2026-07-19T10:01:00Z', message:{ model:'claude-opus-4-8', content:[{type:'text',text:'ok'}], usage:{ output_tokens:1000000 } } }
  ];
  const s = sessionIndex.summarize(entries, { id:'u1', projectFolder:'-Users-me-Developer-app' });
  assert.equal(s.prompt, 'Fix the parser bug');
  assert.equal(s.branch, 'main');
  assert.match(s.model, /opus/);
  assert.equal(s.msgs, 2);
  assert.equal(Math.round(s.cost), 75);
});
test('projectDisplayPath decodes home + slashes', () => {
  assert.equal(sessionIndex.projectDisplayPath('-Users-me-Developer-app'), '~/Developer/app');
});
