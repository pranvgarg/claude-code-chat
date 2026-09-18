/* Web Worker: parses a session's JSONL text and builds its search index off the main thread. */
importScripts('../core/jsonl.js', '../core/search-index.js');
self.onmessage = function (e) {
  var msg = e.data || {};
  try {
    var entries = self.CCE.jsonl.parse(msg.text || '');
    var index = self.CCE.searchIndex.build(msg.key, entries);
    self.postMessage({ id: msg.id, key: msg.key, index: index });
  } catch (err) {
    self.postMessage({ id: msg.id, key: msg.key, error: String(err && err.message || err) });
  }
};
