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

  // Leaf name of the connected root folder (best-effort — browsers don't
  // expose absolute paths for security). Set on connect; used by app.js to
  // populate the sidebar brand-path.
  var _rootName = '';

  // Cache for listPluginSkills — populated on first call, reused thereafter.
  var _pluginSkillsCache = null;
  // Cache for listPluginCommands — populated on first call, reused thereafter.
  var _pluginCommandsCache = null;

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

  /* Pure helper: global memory files — root-level .md files NOT inside
     projects/, plugins/, skills/, commands/, plans/, hooks/, or memory/.
     Depth rule: parts = [rootName, filename] (length === 2) OR
     parts = [filename] (length === 1).  No forbidden segments anywhere. */
  var MEMORY_EXCL_SEGS = new Set([
    'projects', 'plugins', 'skills', 'commands', 'plans', 'hooks', 'memory'
  ]);
  function globalMemoryFromFileList(fileList) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      var fname = f.name || parts[parts.length - 1];
      if (!/\.md$/i.test(fname)) continue;
      // Must be at depth 1 (just filename) or depth 2 (root-name + filename).
      if (parts.length > 2) continue;
      // No forbidden segment anywhere in the path.
      var hasForbidden = false;
      for (var j = 0; j < parts.length; j++) {
        if (MEMORY_EXCL_SEGS.has(parts[j])) { hasForbidden = true; break; }
      }
      if (hasForbidden) continue;
      out.push({ name: fname.replace(/\.md$/i, ''), _file: f });
    }
    return out;
  }

  /* Pure helper: per-project memory files at projects/<folder>/memory/<name>.md
     (direct children of a 'memory' dir inside projects/<folder>). */
  function memoryFromFileList(fileList) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      var pi = parts.indexOf('projects');
      if (pi === -1) continue;
      var fname = f.name || parts[parts.length - 1];
      if (!/\.md$/i.test(fname)) continue;
      // Must be: ..., 'projects', <folder>, 'memory', <file.md>
      var projectFolder = parts[pi + 1];
      if (!projectFolder) continue;
      if (parts[pi + 2] !== 'memory') continue;
      if (parts[pi + 3] !== fname) continue;
      if (parts.length !== pi + 4) continue;
      out.push({ projectFolder: projectFolder, name: fname.replace(/\.md$/i, ''), _file: f });
    }
    return out;
  }

  /* Find a root-level CLAUDE.md in a collectFromHandle()-shaped file list.
   * Root-depth only — does not recurse into subdirectories, to avoid
   * picking up unrelated CLAUDE.md files nested in vendored deps etc. */
  function findClaudeMd(files) {
    for (var i = 0; i < files.length; i++) {
      if (files[i].relPath === 'CLAUDE.md') return files[i];
    }
    return null;
  }

  /* Pure helper: user commands at commands/<name>.md (direct children).
     Excludes any path that contains a 'plugins' segment. */
  function commandsFromFileList(fileList) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      // Exclude plugin paths.
      var hasPlugins = false;
      for (var j = 0; j < parts.length; j++) {
        if (parts[j] === 'plugins') { hasPlugins = true; break; }
      }
      if (hasPlugins) continue;
      var pi = parts.indexOf('commands');
      if (pi === -1) continue;
      var fname = f.name || parts[parts.length - 1];
      if (!/\.md$/i.test(fname)) continue;
      // Must be a DIRECT child of 'commands': parts[pi+1] === fname, length === pi+2
      if (parts[pi + 1] !== fname) continue;
      if (parts.length !== pi + 2) continue;
      out.push({ name: fname.replace(/\.md$/i, ''), _file: f });
    }
    return out;
  }

  /* Pure helper: plugin commands — .md files whose immediate parent dir is
     'commands' AND the path contains a 'plugins' segment.
     Publisher derivation is the SAME generic logic as pluginSkillsFromFileList. */
  function pluginCommandsFromFileList(fileList) {
    var out = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      // Must contain a 'plugins' segment.
      var pluginsIdx = parts.indexOf('plugins');
      if (pluginsIdx === -1) continue;
      // Immediate parent folder must be 'commands'.
      var fname = f.name || parts[parts.length - 1];
      if (!/\.md$/i.test(fname)) continue;
      if (parts[parts.length - 2] !== 'commands') continue;

      // Derive publisher: same logic as pluginSkillsFromFileList.
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
        if (pluginsIdx + 1 < parts.length - 1) {
          publisher = parts[pluginsIdx + 1];
        }
      }

      out.push({ publisher: publisher, name: fname.replace(/\.md$/i, ''), _file: f });
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
      input.onchange = function () {
        var files = Array.from(input.files);
        // Derive root folder name from the first file's webkitRelativePath
        // (e.g. ".claude/projects/.../x.jsonl" -> ".claude").
        if (files.length > 0 && files[0].webkitRelativePath) {
          _rootName = files[0].webkitRelativePath.split('/')[0] || _rootName;
        }
        resolve(files);
      };
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

  function saveHandleAs(key, handle) {
    return openHandleDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var req = tx.objectStore(IDB_STORE).put(handle, key);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function loadHandleAs(key) {
    return openHandleDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function (e) { resolve(e.target.result || null); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function deleteHandleAs(key) {
    return openHandleDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var req = tx.objectStore(IDB_STORE).delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  /* All stored handle keys, e.g. ['root', 'project:-Users-me-Developer-app'] */
  function listHandleKeys() {
    return openHandleDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).getAllKeys();
        req.onsuccess = function (e) { resolve(e.target.result || []); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function saveHandle(handle) { return saveHandleAs(IDB_KEY, handle); }
  function loadHandle() { return loadHandleAs(IDB_KEY); }

  var PROJECT_HANDLE_PREFIX = 'project:';

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
        if (handle.name) _rootName = handle.name;
        return collectFromHandle(handle);
      });
    }).catch(function () { return null; });
  }

  /* Show the showDirectoryPicker dialog, save handle, return files. */
  function connectViaFSA() {
    return g.showDirectoryPicker({ mode: 'read' }).then(function (handle) {
      if (handle && handle.name) _rootName = handle.name;
      return saveHandle(handle).catch(function () { /* non-fatal */ })
        .then(function () { return collectFromHandle(handle); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Secondary project-folder roots (for reading a project's own          */
  /* CLAUDE.md, which lives outside ~/.claude entirely)                   */
  /* ------------------------------------------------------------------ */

  /* Prompt for a project folder (no persistence yet — caller confirms which
   * project it belongs to before it's saved, since the slug<->path match is
   * only a guess). Returns { handle, files }. */
  function pickProjectFolder() {
    return g.showDirectoryPicker({ mode: 'read' }).then(function (handle) {
      return collectFromHandle(handle).then(function (files) {
        return { handle: handle, files: files };
      });
    });
  }

  /* Persist an already-picked handle under a confirmed project slug. */
  function attachProjectFolder(projectFolder, handle) {
    return saveHandleAs(PROJECT_HANDLE_PREFIX + projectFolder, handle)
      .catch(function () { /* non-fatal */ });
  }

  /* Try to restore a previously attached project handle without prompting.
   * Returns { handle, files } if permission is granted, or
   * { handle, needsPermission: true } if it needs to be re-requested. */
  function restoreProjectHandle(projectFolder) {
    if (!g.indexedDB) return Promise.resolve(null);
    return loadHandleAs(PROJECT_HANDLE_PREFIX + projectFolder).then(function (handle) {
      if (!handle) return null;
      return handle.queryPermission({ mode: 'read' }).then(function (perm) {
        if (perm !== 'granted') return { handle: handle, needsPermission: true };
        return collectFromHandle(handle).then(function (files) {
          return { handle: handle, files: files };
        });
      });
    }).catch(function () { return null; });
  }

  /* Re-request permission on an already-stored project handle (no fresh picker). */
  function reconnectProjectHandle(projectFolder) {
    return loadHandleAs(PROJECT_HANDLE_PREFIX + projectFolder).then(function (handle) {
      if (!handle) throw new Error('No stored handle for ' + projectFolder);
      return handle.requestPermission({ mode: 'read' }).then(function (perm) {
        if (perm !== 'granted') throw new Error('Permission denied');
        return collectFromHandle(handle).then(function (files) {
          return { handle: handle, files: files };
        });
      });
    });
  }

  /* All attached project-folder slugs, e.g. ['-Users-me-Developer-app'] */
  function listAttachedProjectFolders() {
    return listHandleKeys().then(function (keys) {
      return keys
        .filter(function (k) { return typeof k === 'string' && k.indexOf(PROJECT_HANDLE_PREFIX) === 0; })
        .map(function (k) { return k.slice(PROJECT_HANDLE_PREFIX.length); });
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
            } else if (name === 'SKILL.md' || (
                // Also keep .md files whose immediate parent dir is 'commands'
                /\.md$/i.test(name) &&
                (function () {
                  var segs = childPath.split('/');
                  return segs[segs.length - 2] === 'commands';
                })()
              )) {
              // Capture fileHandle in closure for lazy read.
              (function (fileHandle, fp, n) {
                result.push({
                  relPath: fp,
                  name: n,
                  text: function () { return fileHandle.getFile().then(function (f) { return f.text(); }); }
                });
              })(child, childPath, name);
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

  /* listMemory — global and per-project memory .md files.
     Returns Promise<{ global: [{name, read}], projects: [{projectFolder, displayPath, files:[{name,read}]}] }> */
  function listMemory() {
    var globalDescs = globalMemoryFromFileList(_files);
    var projectDescs = memoryFromFileList(_files);

    // Group project memory by projectFolder.
    var byFolder = {};
    for (var i = 0; i < projectDescs.length; i++) {
      var d = projectDescs[i];
      if (!byFolder[d.projectFolder]) byFolder[d.projectFolder] = [];
      byFolder[d.projectFolder].push(d);
    }

    function displayPathFor(folder) {
      return (CCE.sessionIndex && CCE.sessionIndex.projectDisplayPath)
        ? CCE.sessionIndex.projectDisplayPath(folder)
        : folder;
    }

    var projects = Object.keys(byFolder).map(function (folder) {
      return {
        projectFolder: folder,
        displayPath: displayPathFor(folder),
        files: byFolder[folder].map(function (d) {
          return { name: d.name, read: function () { return d._file.text(); } };
        })
      };
    });

    var byFolderProject = {};
    projects.forEach(function (p) { byFolderProject[p.projectFolder] = p; });

    // Merge in any attached project folders (a project's own root CLAUDE.md,
    // which lives outside ~/.claude entirely and can never be found by the
    // memory/*.md scan above).
    return listAttachedProjectFolders().then(function (folders) {
      return Promise.all(folders.map(function (folder) {
        return restoreProjectHandle(folder).then(function (result) {
          return { folder: folder, result: result };
        });
      }));
    }).then(function (attachments) {
      attachments.forEach(function (att) {
        var folder = att.folder;
        var result = att.result;
        if (!result) return;

        var fileEntry;
        if (result.needsPermission) {
          fileEntry = {
            name: 'CLAUDE.md',
            reconnectNeeded: true,
            projectFolder: folder,
            read: function () {
              return Promise.reject(new Error('Permission revoked — click to reconnect'));
            }
          };
        } else {
          var claudeMdFile = findClaudeMd(result.files || []);
          if (!claudeMdFile) return; // attached folder has no root CLAUDE.md
          fileEntry = { name: 'CLAUDE.md', read: function () { return claudeMdFile.text(); } };
        }

        var group = byFolderProject[folder];
        if (!group) {
          group = { projectFolder: folder, displayPath: displayPathFor(folder), files: [] };
          byFolderProject[folder] = group;
          projects.push(group);
        }
        group.files.push(fileEntry);
      });

      return {
        global: globalDescs.map(function (d) {
          return { name: d.name, read: function () { return d._file.text(); } };
        }),
        projects: projects
      };
    });
  }

  /* listCommands — user command .md files from commands/<name>.md */
  function listCommands() {
    var descs = commandsFromFileList(_files);
    return Promise.resolve(descs.map(function (d) {
      return { name: d.name, read: function () { return d._file.text(); } };
    }));
  }

  /* listPluginCommands — on-demand, lazy; cached after first call.
     Returns Promise<[{ publisher, name, read:()=>Promise<string> }]>
     Mirrors listPluginSkills but filters for plugin command .md files. */
  function listPluginCommands() {
    // 1. Picker mode: _files may already contain plugin command files.
    var pickerDescs = pluginCommandsFromFileList(_files);
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
    if (_pluginCommandsCache !== null) {
      return Promise.resolve(_pluginCommandsCache);
    }

    // 3. FSA mode: walk plugins/ on demand.
    if (!g.indexedDB) {
      _pluginCommandsCache = [];
      return Promise.resolve(_pluginCommandsCache);
    }

    return loadHandle().then(function (root) {
      if (!root) {
        _pluginCommandsCache = [];
        return _pluginCommandsCache;
      }
      return root.getDirectoryHandle('plugins').then(function (pluginsHandle) {
        return collectPluginsFromHandle(pluginsHandle, 'plugins');
      }).then(function (rawList) {
        var descs = pluginCommandsFromFileList(rawList);
        _pluginCommandsCache = descs.map(function (d) {
          return {
            publisher: d.publisher,
            name: d.name,
            read: function () { return d._file.text(); }
          };
        });
        return _pluginCommandsCache;
      }).catch(function () {
        _pluginCommandsCache = [];
        return _pluginCommandsCache;
      });
    }).catch(function () {
      _pluginCommandsCache = [];
      return _pluginCommandsCache;
    });
  }

  /* readSettings — parse ~/.claude/settings.json.
     Picker path: find the top-level settings.json in _files (no projects/plugins/skills segment).
     FSA path: root.getFileHandle('settings.json').
     Returns Promise<Object|null>. */
  function readSettings() {
    // Try picker-mode _files first.
    for (var i = 0; i < _files.length; i++) {
      var f = _files[i];
      var fname = f.name || (f.relPath || f.webkitRelativePath || '').split('/').pop();
      if (fname !== 'settings.json') continue;
      var parts = (f.webkitRelativePath || f.relPath || '').split('/');
      // Must be top-level: no forbidden segments.
      var hasForbidden = false;
      var SETTINGS_EXCL = ['projects', 'plugins', 'skills'];
      for (var j = 0; j < parts.length; j++) {
        if (SETTINGS_EXCL.indexOf(parts[j]) !== -1) { hasForbidden = true; break; }
      }
      if (hasForbidden) continue;
      return f.text().then(function (txt) {
        try { return JSON.parse(txt); } catch (_) { return null; }
      });
    }

    // FSA path.
    if (!g.indexedDB) return Promise.resolve(null);
    return loadHandle().then(function (root) {
      if (!root) return null;
      return root.getFileHandle('settings.json').then(function (fh) {
        return fh.getFile().then(function (file) { return file.text(); });
      }).then(function (txt) {
        try { return JSON.parse(txt); } catch (_) { return null; }
      });
    }).catch(function () { return null; });
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
    listMemory: listMemory,
    listCommands: listCommands,
    listPluginCommands: listPluginCommands,
    readSettings: readSettings,
    pickProjectFolder: pickProjectFolder,
    attachProjectFolder: attachProjectFolder,
    restoreProjectHandle: restoreProjectHandle,
    reconnectProjectHandle: reconnectProjectHandle,
    listAttachedProjectFolders: listAttachedProjectFolders,
    // Exposed for unit testing only:
    _sessionsFromFileList: sessionsFromFileList,
    _subagentsFromFileList: subagentsFromFileList,
    _plansFromFileList: plansFromFileList,
    _skillsFromFileList: skillsFromFileList,
    _pluginSkillsFromFileList: pluginSkillsFromFileList,
    _globalMemoryFromFileList: globalMemoryFromFileList,
    _memoryFromFileList: memoryFromFileList,
    _commandsFromFileList: commandsFromFileList,
    _pluginCommandsFromFileList: pluginCommandsFromFileList,
    _findClaudeMd: findClaudeMd
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
    },
    // Returns the leaf name of the connected root folder, or '~/.claude'
    // as a friendly fallback when no name is available.
    getPath: function () {
      return _rootName || '~/.claude';
    }
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
