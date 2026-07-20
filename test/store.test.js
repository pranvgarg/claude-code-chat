const { test } = require('node:test');
const assert = require('node:assert');
// no localStorage in Node -> exercises in-memory fallback
require('../assets/js/core/store.js');
const { store } = globalThis.CCE;

test('falls back to memory when localStorage is absent', () => {
  assert.equal(store.available, false);
  store.set('theme', 'light');
  assert.equal(store.get('theme', 'dark'), 'light');
});
test('favorites toggle by id', () => {
  assert.equal(store.isFavorite('abc'), false);
  store.toggleFavorite('abc');
  assert.equal(store.isFavorite('abc'), true);
  store.toggleFavorite('abc');
  assert.equal(store.isFavorite('abc'), false);
});
test('export then import round-trips', () => {
  store.set('view', 'grid'); store.toggleFavorite('xyz');
  const json = store.exportPrefs();
  store.importPrefs('{"view":"list","favorites":["q"]}');
  assert.equal(store.get('view'), 'list');
  assert.equal(store.isFavorite('q'), true);
  assert.ok(json.includes('grid'));
});
test('uses localStorage when present', () => {
  const bucket = {};
  globalThis.localStorage = { getItem:k=>k in bucket?bucket[k]:null, setItem:(k,v)=>{bucket[k]=v;}, removeItem:k=>{delete bucket[k];} };
  delete require.cache[require.resolve('../assets/js/core/store.js')];
  delete globalThis.CCE;
  require('../assets/js/core/store.js');
  const s = globalThis.CCE.store;
  assert.equal(s.available, true);
  s.set('theme','light');
  assert.ok(bucket['cce.v1'].includes('light'));
});
