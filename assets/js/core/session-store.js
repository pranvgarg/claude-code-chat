(function (g) {
  'use strict';
  const CCE = g.CCE = g.CCE || {};
  const DB_NAME = 'cce-cache', DB_VERSION = 1, BATCH = 8;

  function openCacheDB() {
    return new Promise(function (resolve, reject) {
      if (!g.indexedDB) { reject(new Error('indexedDB unavailable')); return; }
      var req = g.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('summaries')) db.createObjectStore('summaries', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('search')) db.createObjectStore('search', { keyPath: 'key' });
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function idbCache(storeName) {
    var dbP = null;
    function db() { if (!dbP) dbP = openCacheDB().catch(function () { return null; }); return dbP; }
    return {
      get: function (key) {
        return db().then(function (d) {
          if (!d) return null;
          return new Promise(function (resolve) {
            var req = d.transaction(storeName, 'readonly').objectStore(storeName).get(key);
            req.onsuccess = function (e) { resolve(e.target.result || null); };
            req.onerror = function () { resolve(null); };
          });
        });
      },
      set: function (key, value) {
        return db().then(function (d) {
          if (!d) return;
          return new Promise(function (resolve) {
            var tx = d.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(Object.assign({ key: key }, value));
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { resolve(); };
          });
        });
      }
    };
  }

  function defaultYield() {
    if (g.scheduler && typeof g.scheduler.yield === 'function') return g.scheduler.yield();
    return new Promise(function (r) { setTimeout(r, 0); });
  }

  function createStore(deps) {
    var _all = null, _descs = null, _loading = null;

    function load(opts) {
      opts = opts || {};
      if (_loading) return _loading;
      _loading = deps.listSessions().then(function (descs) {
        _descs = descs;
        var results = [], done = 0, cached = 0, i = 0;
        function one(desc) {
          var key = desc.projectFolder + '/' + desc.id;
          return desc.stat().then(function (st) {
            return deps.cache.get(key).then(function (hit) {
              if (hit && hit.size === st.size && hit.lastModified === st.lastModified) { cached++; return hit.summary; }
              return desc.read().then(function (text) {
                if (opts.onText) { try { opts.onText(desc, text); } catch (e) {} }
                var summary = deps.summarize(deps.parse(text), { id: desc.id, projectFolder: desc.projectFolder });
                summary.displayPath = deps.projectDisplayPath(desc.projectFolder);
                summary.relPath = desc.relPath;
                return deps.cache.set(key, { size: st.size, lastModified: st.lastModified, summary: summary }).then(function () { return summary; });
              });
            });
          }).catch(function () { return null; });
        }
        function nextBatch() {
          var batch = descs.slice(i, i + BATCH);
          if (!batch.length) return Promise.resolve();
          i += BATCH;
          return Promise.all(batch.map(one)).then(function (out) {
            out.forEach(function (s) { if (s) { s.displayPath = s.displayPath || deps.projectDisplayPath(s.projectFolder); results.push(s); } });
            done += batch.length;
            if (opts.onProgress) opts.onProgress({ done: done, total: descs.length, cached: cached });
            return deps.yieldFn().then(nextBatch);
          });
        }
        return nextBatch().then(function () {
          results.sort(function (a, b) { return (b.lastTs ? Date.parse(b.lastTs) : 0) - (a.lastTs ? Date.parse(a.lastTs) : 0); });
          _all = results;
          deps.dispatch('cce:sessions-loaded', { count: results.length });
          return results;
        });
      }).finally(function () { _loading = null; });
      return _loading;
    }

    return {
      load: load,
      all: function () { return _all; },
      descriptors: function () { return _descs; },
      invalidate: function () { _all = null; _descs = null; }
    };
  }

  var defaultDeps = {
    listSessions: function () { return CCE.fsaccess.listSessions(); },
    parse: function (t) { return CCE.jsonl.parse(t); },
    summarize: function (e, m) { return CCE.sessionIndex.summarize(e, m); },
    projectDisplayPath: function (f) { return CCE.sessionIndex.projectDisplayPath(f); },
    cache: idbCache('summaries'),
    yieldFn: defaultYield,
    dispatch: function (name, detail) {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') g.dispatchEvent(new g.CustomEvent(name, { detail: detail }));
    }
  };
  var live = createStore(defaultDeps);

  CCE.sessionStore = {
    load: live.load, all: live.all, descriptors: live.descriptors, invalidate: live.invalidate,
    createStore: createStore, openCacheDB: openCacheDB, idbCache: idbCache
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
