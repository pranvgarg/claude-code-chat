(function (g) {
  'use strict';
  const CCE = g.CCE = g.CCE || {};
  const CONCURRENCY = 4;
  // Reuse the shared cached-record shape version from session-store.js (falls
  // back to 1 if session-store.js hasn't loaded — e.g. createSearchStore()
  // used standalone in tests).
  const CACHE_VERSION = (CCE.sessionStore && CCE.sessionStore.CACHE_VERSION) || 1;

  function workerBuilder() {
    var worker = null, pending = {}, seq = 0;
    function ensureWorker() {
      if (worker || typeof g.Worker !== 'function') return worker;
      try {
        worker = new g.Worker('assets/js/workers/index-worker.js');
      } catch (e) {
        // Worker construction can throw (e.g. SecurityError on file://).
        // Fall back to the main-thread indexer (CCE.searchIndex.build) below.
        worker = null;
        return null;
      }
      worker.onmessage = function (e) {
        var m = e.data || {}, p = pending[m.id];
        if (!p) return;
        delete pending[m.id];
        if (m.error) p.reject(new Error(m.error)); else p.resolve(m.index);
      };
      worker.onerror = function () {
        var ids = Object.keys(pending);
        for (var j = 0; j < ids.length; j++) pending[ids[j]].reject(new Error('index worker failed'));
        pending = {};
        worker = null;
      };
      return worker;
    }
    return function buildIndex(key, text) {
      var w = ensureWorker();
      if (!w) return Promise.resolve(CCE.searchIndex.build(key, CCE.jsonl.parse(text)));
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        pending[id] = { resolve: resolve, reject: reject };
        try {
          w.postMessage({ id: id, key: key, text: text });
        } catch (err) {
          delete pending[id];
          reject(err);
        }
      });
    };
  }

  function createSearchStore(deps) {
    var indexes = new Map(), building = null, built = false;

    function ensureBuilt(onProgress, opts) {
      opts = opts || {};
      if (built && !opts.force) return Promise.resolve();
      if (building) return building;
      building = Promise.resolve(deps.descriptors()).then(function (descs) {
        descs = descs || [];
        var total = descs.length, done = 0, i = 0;
        function one(desc) {
          var key = desc.projectFolder + '/' + desc.id;
          return desc.stat().then(function (st) {
            return deps.cache.get(key).then(function (hit) {
              if (hit && hit.v === CACHE_VERSION && hit.size === st.size && hit.lastModified === st.lastModified) { indexes.set(key, hit.index); return; }
              return desc.read().then(function (text) { return deps.buildIndex(key, text); }).then(function (index) {
                indexes.set(key, index);
                return deps.cache.set(key, { v: CACHE_VERSION, size: st.size, lastModified: st.lastModified, index: index });
              });
            });
          }).catch(function (err) { console.warn('[CCE search] index failed for', key, err); })
            .then(function () { done++; if (onProgress) onProgress({ done: done, total: total }); deps.dispatch('cce:search-progress', { done: done, total: total }); });
        }
        function next() {
          var batch = descs.slice(i, i + CONCURRENCY);
          if (!batch.length) return Promise.resolve();
          i += CONCURRENCY;
          return Promise.all(batch.map(one)).then(next);
        }
        return next();
      }).then(function () { built = true; }).finally(function () { building = null; });
      return building;
    }

    return {
      ensureBuilt: ensureBuilt,
      search: function (q, scope) { return CCE.searchIndex.query(indexes.values(), q, scope || 'full'); },
      indexFor: function (key) { return indexes.get(key); },
      size: function () { return indexes.size; }
    };
  }

  CCE.searchStore = { createSearchStore: createSearchStore };

  if (CCE.sessionStore) {
    var live = createSearchStore({
      descriptors: function () {
        var d = CCE.sessionStore.descriptors();
        return d ? d : CCE.sessionStore.load().then(function () { return CCE.sessionStore.descriptors(); });
      },
      buildIndex: workerBuilder(),
      cache: CCE.sessionStore.idbCache('search'),
      dispatch: function (name, detail) {
        if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') g.dispatchEvent(new g.CustomEvent(name, { detail: detail }));
      }
    });

    CCE.searchStore.ensureBuilt = live.ensureBuilt;
    CCE.searchStore.search = live.search;
    CCE.searchStore.indexFor = live.indexFor;
    CCE.searchStore.size = live.size;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
