(function (g) {
  'use strict';
  const CCE = g.CCE = g.CCE || {};

  /* ------------------------------------------------------------------ */
  /* Constants                                                            */
  /* ------------------------------------------------------------------ */
  const SKIP_DIRS = new Set([
    'cache', 'backups', 'file-history', 'debug',
    'sessions', 'session-env', 'node_modules',
    // 'plugins' holds many plugin-provided skills/commands we don't want to
    // surface as the user's own; pruning it also speeds up the folder scan.
    'plugins'
  ]);

  /* ------------------------------------------------------------------ */
  /* Mode detection                                                       */
  /* ------------------------------------------------------------------ */
  // Running on http(s) localhost -> server mode (Phase-4 stub).
  // Everything else (file://, double-click, etc.) -> picker mode.
  var _isServer = false;
  try {
    _isServer = /^https?:$/.test(g.location.protocol) &&
                /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(g.location.host);
  } catch (_) { /* non-browser environment */ }

  /* ------------------------------------------------------------------ */
  /* Internal file list                                                   */
  /* ------------------------------------------------------------------ */
  // Each entry is { webkitRelativePath|relPath, name, text:()=>Promise<string> }
  var _files = [];

  // Cache for listPluginSkills — populated on first call, reused thereafter.
  var _pluginSkillsCache = null;

  /* ------------------------------------------------------------------ */
  /* Pure helper: filter a flat file list down to session descriptors    */
  /* ------------------------------------------------------------------ */
  // Exported (attached to CCE.fsaccess) so test/fsaccess.test.js can call it.
  function sessionsFromFileList(fileList) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var relPath = f.webkitRelativePath || f.relPath || '';
      var parts = relPath.split('/');

      // Must contain a 'projects' segment.
      var pi = parts.indexOf('projects');
      if (pi === -1) continue;

      // Skip if any path segment is in SKIP_DIRS.
      var skip = false;
      for (var j = 0; j < parts.length; j++) {
        if (SKIP_DIRS.has(parts[j])) { skip = true; break; }
      }
      if (skip) continue;

      // Must end in .jsonl.
      var fname = f.name || parts[parts.length - 1];
      if (!/\.jsonl$/.test(fname)) continue;

      // projectFolder is the segment immediately after 'projects'.
      var projectFolder = parts[pi + 1];
      if (!projectFolder) continue;

      // The file must be a direct child of projectFolder
      // i.e. parts = [..., 'projects', <folder>, <file.jsonl>] — no deeper.
      if (parts[pi + 2] !== fname) continue;
      if (parts.length !== pi + 3) continue;

      out.push({
        id: fname.replace(/\.jsonl$/, ''),
        projectFolder: projectFolder,
        // read() is resolved at call-time (f.text might not exist in test stubs)
        _file: f
      });
    }
    return out;
  }

  /* Pure helper: plan files stored at plans/<name>.md (direct children only) */
  function plansFromFileList(fileList) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      var pi = parts.indexOf('plans');
      if (pi === -1) continue;
      var fname = f.name || parts[parts.length - 1];
      if (!/\.md$/.test(fname)) continue;
      // Must be a DIRECT child of the 'plans' segment: parts[pi+1] === fname, length === pi+2
      if (parts[pi + 1] !== fname) continue;
      if (parts.length !== pi + 2) continue;
      out.push({ name: fname.replace(/\.md$/, ''), _file: f });
    }
    return out;
  }

  /* Pure helper: skill descriptors stored at skills/<name>/SKILL.md
     Also accepts one extra namespace level: skills/<ns>/<name>/SKILL.md
     Excludes any path that contains a 'plugins' segment (those are Tier-2). */
  function skillsFromFileList(fileList) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      // Exclude plugin paths — they belong to Tier-2 (pluginSkillsFromFileList).
      var hasPlugins = false;
      for (var j = 0; j < parts.length; j++) {
        if (parts[j] === 'plugins') { hasPlugins = true; break; }
      }
      if (hasPlugins) continue;
      var pi = parts.indexOf('skills');
      if (pi === -1) continue;
      var fname = f.name || parts[parts.length - 1];
      if (fname !== 'SKILL.md') continue;
      // Depth-agnostic: the skill name is the folder directly containing SKILL.md.
      // When it nests deeper than skills/<name>/SKILL.md (e.g. a local plugin at
      // skills/<ns>/skills/<name>/SKILL.md) the folder right after the first
      // 'skills' segment is the namespace, and the skill loads as `ns:name`.
      var skillName = parts[parts.length - 2];
      if (!skillName || skillName === 'skills') continue;
      var namespace = (parts.length > pi + 3) ? parts[pi + 1] : '';
      out.push({ name: skillName, namespace: namespace, _file: f });
    }
    return out;
  }

  /* Pure helper: plugin skill descriptors — any SKILL.md whose path contains
     a 'plugins' segment (Tier-2).
     publisher derivation (generic, no fixed depth):
       - find the 'plugins' segment index.
       - scan forward for 'cache' or 'marketplaces'; publisher = segment after it.
       - if neither found, publisher = segment right after 'plugins'.
       - if still nothing, publisher = 'unknown'.
     name: the folder that directly contains SKILL.md (parts[length-2]). */
  function pluginSkillsFromFileList(fileList) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      // Must contain a 'plugins' segment.
      var pluginsIdx = parts.indexOf('plugins');
      if (pluginsIdx === -1) continue;
      // Must be named SKILL.md.
      var fname = f.name || parts[parts.length - 1];
      if (fname !== 'SKILL.md') continue;

      // Derive publisher: look for 'cache' or 'marketplaces' after 'plugins'.
      var publisher = 'unknown';
      var foundAnchor = false;
      for (var k = pluginsIdx + 1; k < parts.length - 1; k++) {
        if (parts[k] === 'cache' || parts[k] === 'marketplaces') {
          if (k + 1 < parts.length - 1) {
            publisher = parts[k + 1];
          }
          foundAnchor = true;
          break;
        }
      }
      if (!foundAnchor) {
        // Fall back: segment right after 'plugins'.
        if (pluginsIdx + 1 < parts.length - 1) {
          publisher = parts[pluginsIdx + 1];
        }
      }

      // name: folder directly containing SKILL.md.
      var skillName = parts[parts.length - 2] || 'unknown';

      out.push({ publisher: publisher, name: skillName, _file: f });
    }
    return out;
  }

  /* Pure helper: subagent transcripts for one session, stored at
     projects/<projectFolder>/<sessionId>/subagents/<agent>.jsonl */
  function subagentsFromFileList(fileList, projectFolder, sessionId) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      var pi = parts.indexOf('projects');
      if (pi === -1) continue;
      var fname = f.name || parts[parts.length - 1];
      if (!/\.jsonl$/.test(fname)) continue;
      if (parts[pi + 1] !== projectFolder) continue;
      if (parts[pi + 2] !== sessionId) continue;
      if (parts[pi + 3] !== 'subagents') continue;
      if (parts[pi + 4] !== fname) continue;
      if (parts.length !== pi + 5) continue;
      out.push({ id: fname.replace(/\.jsonl$/, ''), _file: f });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* webkitdirectory picker (always available)                           */
  /* ------------------------------------------------------------------ */
  function connectViaPicker() {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.onchange = function () { resolve(Array.from(input.files)); };
      input.oncancel = function () { reject(new Error('cancelled')); };
      input.click();
    });
  }

  /* ------------------------------------------------------------------ */
  /* File System Access API — handle persistence via IndexedDB           */
  /* ------------------------------------------------------------------ */
  var IDB_DB    = 'cce';
  var IDB_STORE = 'handles';
  var IDB_KEY   = 'root';

  function openHandleDB() {
    return new Promise(function (resolve, reject) {
      var req = g.indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = function (e) {
        e.target.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  function saveHandle(handle) {
    return openHandleDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var req = tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function loadHandle() {
    return openHandleDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = function (e) { resolve(e.target.result || null); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  /* Recursively collect {relPath, name, text} from a FileSystemDirectoryHandle */
  function collectFromHandle(dirHandle, prefix) {
    prefix = prefix || '';
    var result = [];
    return (function recurse(handle, path) {
      var entries = [];
      return new Promise(function (resolve) {
        var iter = handle.entries();
        function step() {
          iter.next().then(function (r) {
            if (r.done) { resolve(entries); return; }
            entries.push(r.value);
            step();
          });
        }
        step();
      }).then(function (pairs) {
        var tasks = [];
        for (var k = 0; k < pairs.length; k++) {
          (function (name, child) {
            var childPath = path ? path + '/' + name : name;
            if (child.kind === 'directory') {
              if (SKIP_DIRS.has(name)) return; // prune
              tasks.push(recurse(child, childPath));
            } else {
              // It's a FileSystemFileHandle — wrap into our uniform shape
              result.push({
                relPath: childPath,
                name: name,
                text: function () { return child.getFile().then(function (f) { return f.text(); }); }
              });
            }
          })(pairs[k][0], pairs[k][1]);
        }
        return Promise.all(tasks);
      });
    })(dirHandle, prefix).then(function () { return result; });
  }

  /* Try to restore previously saved handle. Returns files array or null. */
  function restoreFromHandle() {
    if (!g.indexedDB) return Promise.resolve(null);
    return loadHandle().then(function (handle) {
      if (!handle) return null;
      return handle.queryPermission({ mode: 'read' }).then(function (perm) {
        if (perm !== 'granted') return null;
        return collectFromHandle(handle);
      });
    }).catch(function () { return null; });
  }

  /* Show the showDirectoryPicker dialog, save handle, return files. */
  function connectViaFSA() {
    return g.showDirectoryPicker({ mode: 'read' }).then(function (handle) {
      return saveHandle(handle).catch(function () { /* non-fatal */ })
        .then(function () { return collectFromHandle(handle); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* High-level connect                                                   */
  /* ------------------------------------------------------------------ */
  // Returns Promise<Array<files>> regardless of which path was taken.
  function acquireFiles() {
    if (g.showDirectoryPicker) {
      // FSA available: try restoring first, then prompt.
      return restoreFromHandle().then(function (restored) {
        if (restored) return restored;
        return connectViaFSA().catch(function (err) {
          // User cancelled FSA or permission denied — fall back to picker.
          if (err && err.name === 'AbortError') throw err; // propagate cancel
          return connectViaPicker();
        });
      });
    }
    return connectViaPicker();
  }

  /* ------------------------------------------------------------------ */
  /* listSessions — public async API                                      */
  /* ------------------------------------------------------------------ */
  function listSessions() {
    if (_isServer) {
      return Promise.reject(new Error(
        '[CCE] Server mode listSessions is not implemented in Phase 1.'
      ));
    }
    var descs = sessionsFromFileList(_files);
    var out = descs.map(function (d) {
      return {
        id: d.id,
        projectFolder: d.projectFolder,
        read: function () { return d._file.text(); }
      };
    });
    return Promise.resolve(out);
  }

  /* listSubagents — subagent transcripts spawned inside one session. */
  function listSubagents(projectFolder, sessionId) {
    var descs = subagentsFromFileList(_files, projectFolder, sessionId);
    return Promise.resolve(descs.map(function (d) {
      return { id: d.id, read: function () { return d._file.text(); } };
    }));
  }

  /* listPlans — plan markdown files from plans/<name>.md */
  function listPlans() {
    var descs = plansFromFileList(_files);
    return Promise.resolve(descs.map(function (d) {
      return { name: d.name, read: function () { return d._file.text(); } };
    }));
  }

  /* listSkills — skill descriptors from skills/<name>/SKILL.md */
  function listSkills() {
    var descs = skillsFromFileList(_files);
    return Promise.resolve(descs.map(function (d) {
      return { name: d.name, namespace: d.namespace, read: function () { return d._file.text(); } };
    }));
  }

  /* Recursively collect SKILL.md files under a plugins directory handle.
     Pruning is light: skip node_modules and .git only (NOT cache — plugin
     skills live under plugins/cache/...). */
  var PLUGIN_SKIP_DIRS = new Set(['node_modules', '.git']);

  function collectPluginsFromHandle(dirHandle, prefix) {
    var result = [];
    return (function recurse(handle, path) {
      var entries = [];
      return new Promise(function (resolve) {
        var iter = handle.entries();
        function step() {
          iter.next().then(function (r) {
            if (r.done) { resolve(entries); return; }
            entries.push(r.value);
            step();
          });
        }
        step();
      }).then(function (pairs) {
        var tasks = [];
        for (var k = 0; k < pairs.length; k++) {
          (function (name, child) {
            var childPath = path ? path + '/' + name : name;
            if (child.kind === 'directory') {
              if (PLUGIN_SKIP_DIRS.has(name)) return; // prune heavy/irrelevant dirs
              tasks.push(recurse(child, childPath));
            } else if (name === 'SKILL.md') {
              // Capture fileHandle in closure for lazy read.
              (function (fileHandle, fp) {
                result.push({
                  relPath: fp,
                  name: 'SKILL.md',
                  text: function () { return fileHandle.getFile().then(function (f) { return f.text(); }); }
                });
              })(child, childPath);
            }
          })(pairs[k][0], pairs[k][1]);
        }
        return Promise.all(tasks);
      });
    })(dirHandle, prefix).then(function () { return result; });
  }

  /* listPluginSkills — on-demand, lazy; cached after first call.
     Returns Promise<[{ publisher, name, read:()=>Promise<string> }]> */
  function listPluginSkills() {
    // 1. Picker mode: _files already contains plugin files (they were not pruned).
    var pickerDescs = pluginSkillsFromFileList(_files);
    if (pickerDescs.length > 0) {
      return Promise.resolve(pickerDescs.map(function (d) {
        return {
          publisher: d.publisher,
          name: d.name,
          read: function () { return d._file.text(); }
        };
      }));
    }

    // 2. Return cache if already populated.
    if (_pluginSkillsCache !== null) {
      return Promise.resolve(_pluginSkillsCache);
    }

    // 3. FSA mode: walk plugins/ on demand.
    if (!g.indexedDB) {
      _pluginSkillsCache = [];
      return Promise.resolve(_pluginSkillsCache);
    }

    return loadHandle().then(function (root) {
      if (!root) {
        _pluginSkillsCache = [];
        return _pluginSkillsCache;
      }
      return root.getDirectoryHandle('plugins').then(function (pluginsHandle) {
        return collectPluginsFromHandle(pluginsHandle, 'plugins');
      }).then(function (rawList) {
        var descs = pluginSkillsFromFileList(rawList);
        _pluginSkillsCache = descs.map(function (d) {
          return {
            publisher: d.publisher,
            name: d.name,
            read: function () { return d._file.text(); }
          };
        });
        return _pluginSkillsCache;
      }).catch(function () {
        // plugins/ directory doesn't exist or access denied.
        _pluginSkillsCache = [];
        return _pluginSkillsCache;
      });
    }).catch(function () {
      _pluginSkillsCache = [];
      return _pluginSkillsCache;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Public surface                                                       */
  /* ------------------------------------------------------------------ */
  CCE.fsaccess = {
    get mode() { return _isServer ? 'server' : 'picker'; },
    SKIP_DIRS: SKIP_DIRS,
    listSessions: listSessions,
    listSubagents: listSubagents,
    listPlans: listPlans,
    listSkills: listSkills,
    listPluginSkills: listPluginSkills,
    // Exposed for unit testing only:
    _sessionsFromFileList: sessionsFromFileList,
    _subagentsFromFileList: subagentsFromFileList,
    _plansFromFileList: plansFromFileList,
    _skillsFromFileList: skillsFromFileList,
    _pluginSkillsFromFileList: pluginSkillsFromFileList
  };

  CCE.connect = {
    init: function (onConnected) {
      var btn = document.getElementById('btn-connect');
      if (!btn) return;

      // On load: attempt silent restore (FSA handle with granted permission).
      if (g.showDirectoryPicker && g.indexedDB) {
        restoreFromHandle().then(function (restored) {
          if (restored && restored.length > 0) {
            _files = restored;
            onConnected();
          }
        }).catch(function () { /* silent */ });
      }

      btn.onclick = function () {
        acquireFiles().then(function (f) {
          _files = f;
          onConnected();
        }).catch(function (err) {
          if (err && err.name !== 'AbortError' && err.message !== 'cancelled') {
            console.error('[CCE] connect failed:', err);
          }
        });
      };
    }
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
