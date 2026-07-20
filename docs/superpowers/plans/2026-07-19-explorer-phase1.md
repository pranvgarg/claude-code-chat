# Claude Code Explorer — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-file chat viewer into a modular, offline-first "Claude Code Explorer" whose Phase-1 slice ships the app shell, folder connection, a 3-view Session Browser, a Usage dashboard, and the redesigned Viewer.

**Architecture:** One double-clickable `index.html` over `file://`, classic `<script>`/`<link>` tags only (no ES modules/bundler). Logic lives in namespaced global modules (`window.CCE.*`) that also load under Node for tests. A `core/fsaccess.js` abstraction hides "where files come from" (folder picker now; server API later). Views register with a tiny hash-router in `app.js`.

**Tech Stack:** Vanilla JS + HTML + CSS. Vendored libs: marked, Prism, DOMPurify, Fuse.js. Node's built-in `node:test` for unit tests. No runtime dependencies, no CDN.

## Global Constraints

- **No build step, no bundler.** App must open by double-clicking `index.html` over `file://`.
- **Classic scripts only** — NO ES module `import`/`export`, NO top-level `fetch()`. Each module wraps in an IIFE that attaches to a single global: `(function(g){ const CCE = g.CCE = g.CCE || {}; CCE.<name> = {...}; })(typeof globalThis!=='undefined'?globalThis:this);`
- **Offline-first:** no network at runtime. All libs vendored under `assets/vendor/`. Fonts = system stack only (display `Georgia`, data `ui-monospace,'SF Mono','Cascadia Code','JetBrains Mono',Menlo,Consolas,monospace`, UI system sans). NO `@font-face`, NO webfont downloads.
- **Read-only:** never write, move, or delete any file under the user's `~/.claude`.
- **Themes:** dark default + light; instant toggle; persisted.
- **Color grammar (CSS vars):** `--c-user`/sonnet = blue, `--c-assistant`/opus = purple, `--c-tool` = green, `--c-thinking` = orange, `--c-system` = pink, `--c-cost` = amber.
- **Aesthetic reference:** `docs/mockups/sessions-v2.html` (tokens, grain overlay, editorial serif wordmark, segmented view toggle, skeleton/empty states). Reuse its CSS verbatim where possible.
- **Tests:** `node --test test/` must pass, using only `node:test` + `node:assert`. No test deps.
- **Commits:** frequent, one per task minimum. Branch: `feat/claude-code-explorer` (already checked out).

---

## File Structure

```
index.html                       app entry (shell + connect screen + <script>/<link> tags)
assets/
  css/
    tokens.css                   :root + [data-theme=light] vars, fonts, grain (from sessions-v2)
    shell.css                    sidebar nav, toolbar, layout
    components.css               cards/list/tiles, chips, badges, skeleton, empty, viewer blocks
  js/
    app.js                       boot, hash-router, view registry, connect flow
    core/
      store.js                   localStorage persistence + in-memory fallback + export/import
      cost.js                    model pricing + per-usage cost estimate
      jsonl.js                   parse .jsonl text + index tool results
      session-index.js           entries -> session summary; project folder -> display path
      fsaccess.js                folder picker + File System Access + IndexedDB handle
    views/
      browse.js                  Session Browser: List/Grid/Tiles, search, sort, favorites
      viewer.js                  conversation viewer (ported render + DOMPurify + export)
      dashboard.js               usage aggregation + CSS bars
  vendor/
    marked.min.js prism.min.js prism.css purify.min.js fuse.min.js
test/
  fixtures/dot-claude/           sample ~/.claude tree for manual + unit testing
  store.test.js cost.test.js jsonl.test.js session-index.test.js
README.md                        updated usage + future launcher
```

Existing `index.html` (current viewer) is the **source to port** for `viewer.js`, `jsonl.js`, `cost.js`; it is replaced by the new `index.html` at the end (Task 11). Keep it in git history.

---

### Task 1: Project skeleton + app shell + connect screen

**Files:**
- Create: `assets/css/tokens.css`, `assets/css/shell.css`, `assets/css/components.css`
- Create: `assets/js/app.js`
- Create (empty namespaced stubs): `assets/js/core/store.js`, `core/cost.js`, `core/jsonl.js`, `core/session-index.js`, `core/fsaccess.js`, `assets/js/views/browse.js`, `views/viewer.js`, `views/dashboard.js`
- Create: `index-explorer.html` (new entry; renamed to `index.html` in Task 11)

**Interfaces:**
- Produces: global `window.CCE` namespace; `CCE.router` with `register(hash, {mount, title})` and `go(hash)`; `CCE.app.boot()`.

- [ ] **Step 1: Extract CSS from the mockup.** Copy the `:root`, `[data-theme="light"]`, `body::after` grain, and shell/toolbar/component rules out of `docs/mockups/sessions-v2.html` into the three CSS files (`tokens.css` = variables + fonts + grain; `shell.css` = `.app/.sidebar/.nav/.toolbar`; `components.css` = `.card/.view-list/.tile/.badge-*/.chip-*/.skeleton/.empty`). Do not change values.

- [ ] **Step 2: Write the namespaced module stub pattern** into each `core/*.js` and `views/*.js`:

```js
(function (g) {
  const CCE = g.CCE = g.CCE || {};
  CCE.store = CCE.store || {}; // replace `store` with this file's name
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 3: Write `app.js`** with a hash-router, view registry, connect flow, and theme boot:

```js
(function (g) {
  const CCE = g.CCE = g.CCE || {};
  const views = {};
  const router = {
    register(hash, view) { views[hash] = view; },
    go(hash) {
      if (location.hash !== hash) { location.hash = hash; return; }
      render();
    }
  };
  function render() {
    const hash = (location.hash || '#/sessions').split('?')[0]; // strip query (e.g. #/viewer?id=x)
    const view = views[hash] || views['#/sessions'];
    const main = document.getElementById('view-root');
    if (!view || !CCE.state.connected) return;
    document.querySelectorAll('.nav-item[data-hash]').forEach(n =>
      n.classList.toggle('active', n.dataset.hash === hash));
    main.innerHTML = '';
    view.mount(main);
  }
  CCE.router = router;
  CCE.state = { connected: false };
  CCE.app = {
    boot() {
      const t = CCE.store.get('theme', 'dark');
      document.documentElement.dataset.theme = t;
      window.addEventListener('hashchange', render);
      document.getElementById('btn-theme')?.addEventListener('click', () => {
        const nt = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = nt; CCE.store.set('theme', nt);
      });
      CCE.connect.init(() => { CCE.state.connected = true; showApp(); render(); });
    }
  };
  function showApp() {
    document.getElementById('connect').style.display = 'none';
    document.getElementById('app').style.display = '';
  }
  g.addEventListener('DOMContentLoaded', () => CCE.app.boot());
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Write `index-explorer.html`** — a `#connect` screen (port markup from `docs/mockups/connect.html`, button id `btn-connect`), a hidden `#app` shell (sidebar nav with `data-hash` items `#/sessions #/usage #/plans #/skills #/commands #/hooks #/memory`, a `#view-root` main pane, `#btn-theme`). In the sidebar foot include `#btn-export-prefs`, `#btn-import-prefs`, and a hidden `<input type="file" id="prefs-file" accept="application/json">` (wired in Task 2). Then `<link>` the three CSS files and `<script>` every module in order: core/* then views/* then app.js. (Vendor `<script>`s added in Task 10.) `CCE.connect` is provided by fsaccess in Task 6; for now stub `CCE.connect = { init(cb){ document.getElementById('btn-connect').onclick = cb; } }` at the bottom of app.js so the shell is navigable.

- [ ] **Step 5: Verify in browser.** Run `python3 -m http.server 8790` in the repo root, open `http://localhost:8790/index-explorer.html`. Expected: connect screen shows; clicking "Choose folder" reveals the shell; sidebar items switch the active state; theme toggle flips dark/light and persists across reload. (Also open the file directly via `file://` to confirm no console errors.)

- [ ] **Step 6: Commit.**

```bash
git add index-explorer.html assets/
git commit -m "feat(explorer): app shell, hash-router, connect screen, CSS tokens"
```

---

### Task 2: `core/store.js` — persistence + fallback + export/import

**Files:**
- Modify: `assets/js/core/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces: `CCE.store.get(key, dflt)`, `CCE.store.set(key, value)`, `CCE.store.available` (bool), `CCE.store.isFavorite(id)`, `CCE.store.toggleFavorite(id)`, `CCE.store.exportPrefs()` -> JSON string, `CCE.store.importPrefs(jsonString)` -> bool. Namespace key: `cce.v1`. Favorites stored as an array under key `favorites`.

- [ ] **Step 1: Write the failing test** `test/store.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails.** Run `node --test test/store.test.js`. Expected: FAIL (methods undefined).

- [ ] **Step 3: Implement `store.js`:**

```js
(function (g) {
  const CCE = g.CCE = g.CCE || {};
  const NS = 'cce.v1';
  let ls = null;
  try { ls = g.localStorage; const k='__t'; ls.setItem(k,'1'); ls.removeItem(k); }
  catch (e) { ls = null; }
  let data = {};
  try { data = ls ? (JSON.parse(ls.getItem(NS)) || {}) : {}; } catch (e) { data = {}; }
  function persist() { if (ls) { try { ls.setItem(NS, JSON.stringify(data)); } catch (e) {} } }
  const store = {
    available: !!ls,
    get(key, dflt) { return key in data ? data[key] : dflt; },
    set(key, value) { data[key] = value; persist(); },
    isFavorite(id) { return (data.favorites || []).indexOf(id) !== -1; },
    toggleFavorite(id) {
      const f = data.favorites || (data.favorites = []);
      const i = f.indexOf(id); if (i === -1) f.push(id); else f.splice(i, 1);
      persist();
    },
    exportPrefs() { return JSON.stringify(data, null, 2); },
    importPrefs(json) {
      try { const o = JSON.parse(json); if (o && typeof o === 'object') { data = o; persist(); return true; } }
      catch (e) {} return false;
    }
  };
  CCE.store = store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run test to verify it passes.** Run `node --test test/store.test.js`. Expected: PASS (3 tests).

- [ ] **Step 5: Add a localStorage-present test** to prove the persistence path:

```js
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
```

Run `node --test test/store.test.js`. Expected: PASS (4 tests).

- [ ] **Step 6: Wire the prefs Export/Import UI** in `app.js` `boot()` (spec §6.5). Export downloads `explorer-prefs.json`; Import reads the chosen file and reloads:

```js
document.getElementById('btn-export-prefs')?.addEventListener('click', () => {
  const blob = new Blob([CCE.store.exportPrefs()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'explorer-prefs.json'; a.click();
});
const pf = document.getElementById('prefs-file');
document.getElementById('btn-import-prefs')?.addEventListener('click', () => pf.click());
pf?.addEventListener('change', async () => {
  if (!pf.files[0]) return;
  const ok = CCE.store.importPrefs(await pf.files[0].text());
  if (ok) location.reload();
});
if (!CCE.store.available) {
  // one-time, non-nagging notice that prefs won't persist for double-clicked files
  console.warn('[CCE] Preferences will not persist in this browser for file:// — use Export prefs, or the launcher.');
}
```

- [ ] **Step 7: Commit.**

```bash
git add assets/js/core/store.js assets/js/app.js index-explorer.html test/store.test.js
git commit -m "feat(explorer): store.js persistence + prefs export/import UI + notice"
```

---

### Task 3: `core/cost.js` — pricing + estimate (ported)

**Files:**
- Modify: `assets/js/core/cost.js`
- Test: `test/cost.test.js`

**Interfaces:**
- Produces: `CCE.cost.PRICING` (object), `CCE.cost.estimate(model, usage)` -> Number. `usage` fields: `input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens`.

- [ ] **Step 1: Write the failing test** `test/cost.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify fail.** `node --test test/cost.test.js` -> FAIL.

- [ ] **Step 3: Implement `cost.js`** porting `PRICING` and `estimateCost` from current `index.html` (lines ~935–956):

```js
(function (g) {
  const CCE = g.CCE = g.CCE || {};
  const PRICING = { opus:[15,75,1.5,18.75], sonnet:[3,15,0.3,3.75], haiku:[0.8,4,0.08,1] };
  function estimate(model, usage) {
    if (!model || !usage) return 0;
    const m = (model || '').toLowerCase();
    let r = PRICING.sonnet;
    for (const k in PRICING) { if (m.includes(k)) { r = PRICING[k]; break; } }
    return ((usage.input_tokens||0)*r[0] + (usage.output_tokens||0)*r[1]
      + (usage.cache_read_input_tokens||0)*r[2] + (usage.cache_creation_input_tokens||0)*r[3]) / 1e6;
  }
  CCE.cost = { PRICING, estimate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run to verify pass.** `node --test test/cost.test.js` -> PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add assets/js/core/cost.js test/cost.test.js
git commit -m "feat(explorer): cost.js pricing + estimate (ported)"
```

---

### Task 4: `core/jsonl.js` — parse + index tool results (ported)

**Files:**
- Modify: `assets/js/core/jsonl.js`
- Test: `test/jsonl.test.js`

**Interfaces:**
- Produces: `CCE.jsonl.parse(text)` -> Array<entry> (skips blank/invalid lines), `CCE.jsonl.indexToolResults(entries)` -> Object map keyed by tool_use id / `user:<uuid>`.

- [ ] **Step 1: Write the failing test** `test/jsonl.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify fail.** `node --test test/jsonl.test.js` -> FAIL.

- [ ] **Step 3: Implement `jsonl.js`.** Port `preprocessToolResults` logic from current `index.html` (lines ~574–617). Minimal core:

```js
(function (g) {
  const CCE = g.CCE = g.CCE || {};
  function parse(text) {
    const out = [];
    for (const line of String(text).split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { out.push(JSON.parse(t)); } catch (e) {}
    }
    return out;
  }
  function indexToolResults(entries) {
    const map = {};
    for (const e of entries) {
      if (e.type === 'user' && e.toolUseResult !== undefined) map['user:' + e.uuid] = e.toolUseResult;
      const content = e.message && e.message.content;
      if (Array.isArray(content)) for (const b of content)
        if (b.type === 'tool_result' && b.tool_use_id) map[b.tool_use_id] = b.content || b;
    }
    const asstById = {};
    for (const e of entries) if (e.type === 'assistant') asstById[e.uuid] = e;
    for (const e of entries) {
      if (e.type === 'user' && e.sourceToolAssistantUUID && e.toolUseResult !== undefined) {
        const a = asstById[e.sourceToolAssistantUUID];
        if (a && a.message && a.message.content) for (const b of a.message.content)
          if (b.type === 'tool_use') map[b.id] = e.toolUseResult;
      }
    }
    return map;
  }
  CCE.jsonl = { parse, indexToolResults };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run to verify pass.** `node --test test/jsonl.test.js` -> PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add assets/js/core/jsonl.js test/jsonl.test.js
git commit -m "feat(explorer): jsonl.js parse + tool-result indexing (ported)"
```

---

### Task 5: `core/session-index.js` — session summary + path decode

**Files:**
- Modify: `assets/js/core/session-index.js`
- Test: `test/session-index.test.js`

**Interfaces:**
- Consumes: `CCE.cost.estimate`, `CCE.jsonl.parse`.
- Produces: `CCE.sessionIndex.summarize(entries, {id, projectFolder})` -> `{ id, prompt, model, branch, msgs, cost, tokens, firstTs, lastTs }`; `CCE.sessionIndex.projectDisplayPath(folder)` -> String (e.g. `-Users-me-Developer-app` -> `~/Developer/app`).

- [ ] **Step 1: Write the failing test** `test/session-index.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify fail.** `node --test test/session-index.test.js` -> FAIL.

- [ ] **Step 3: Implement `session-index.js`:**

```js
(function (g) {
  const CCE = g.CCE = g.CCE || {};
  function firstUserPrompt(entries) {
    for (const e of entries) {
      if (e.type !== 'user') continue;
      const c = e.message && e.message.content;
      if (typeof c === 'string' && c.trim()) return c.trim();
      if (Array.isArray(c)) { const t = c.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim(); if (t) return t; }
    }
    return '(no prompt)';
  }
  function summarize(entries, meta) {
    let model = '', branch = '', cost = 0, tokens = 0, firstTs = null, lastTs = null;
    for (const e of entries) {
      if (e.gitBranch && !branch) branch = e.gitBranch;
      if (e.timestamp) { if (!firstTs) firstTs = e.timestamp; lastTs = e.timestamp; }
      if (e.type === 'assistant' && e.message) {
        if (e.message.model && !model) model = e.message.model;
        if (e.message.usage) {
          cost += CCE.cost.estimate(e.message.model || '', e.message.usage);
          tokens += (e.message.usage.input_tokens||0) + (e.message.usage.output_tokens||0);
        }
      }
    }
    return { id: meta.id, prompt: firstUserPrompt(entries), model, branch,
      msgs: entries.filter(e=>e.type==='user'||e.type==='assistant').length,
      cost, tokens, firstTs, lastTs };
  }
  function projectDisplayPath(folder) {
    // folder is the absolute path with '/' replaced by '-'. Best-effort decode.
    let p = folder.replace(/-/g, '/');            // -Users-me-Developer-app -> /Users/me/Developer/app
    p = p.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
    return p;
  }
  CCE.sessionIndex = { summarize, projectDisplayPath };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Note the known ambiguity: real dashes in a path are indistinguishable from separators; document this as best-effort in code comments and README.

- [ ] **Step 4: Run to verify pass.** `node --test test/session-index.test.js` -> PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add assets/js/core/session-index.js test/session-index.test.js
git commit -m "feat(explorer): session-index summarize + project path decode"
```

---

### Task 6: `core/fsaccess.js` — folder connection (picker + FSA + IndexedDB)

**Files:**
- Modify: `assets/js/core/fsaccess.js`
- Modify: `assets/js/app.js` (replace the `CCE.connect` stub)

**Interfaces:**
- Consumes: `CCE.jsonl.parse`, `CCE.sessionIndex.summarize`.
- Produces: `CCE.fsaccess.mode` (`'picker'|'server'`), `CCE.connect.init(onConnected)`, `CCE.fsaccess.listSessions()` -> Promise<Array<{id, projectFolder, read:()=>Promise<string>}>>, `CCE.fsaccess.SKIP_DIRS` (Set of ignored dir names).

- [ ] **Step 1: Implement the file source.** In `fsaccess.js`, detect mode (`location.protocol==='http:'||'https:'` && host is localhost -> `'server'`, else `'picker'`). Implement picker mode fully (server mode returns a `notImplemented` stub for Phase 4):

```js
(function (g) {
  const CCE = g.CCE = g.CCE || {};
  const SKIP_DIRS = new Set(['cache','backups','file-history','debug','sessions','session-env','node_modules']);
  const isServer = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)/.test(location.hostname);
  let files = []; // {relPath, file}

  function connectViaPicker() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file'; input.webkitdirectory = true;
      input.onchange = () => resolve(Array.from(input.files));
      input.oncancel = () => reject(new Error('cancelled'));
      input.click();
    });
  }

  async function listSessions() {
    // sessions = files under <root>/projects/<folder>/<uuid>.jsonl
    const out = [];
    for (const f of files) {
      const parts = (f.webkitRelativePath || f.relPath).split('/');
      const pi = parts.indexOf('projects');
      if (pi === -1) continue;
      if (parts.some(p => SKIP_DIRS.has(p))) continue;
      if (!/\.jsonl$/.test(f.name)) continue;
      const projectFolder = parts[pi + 1];
      if (!projectFolder || parts[pi + 2] !== f.name) continue; // direct child only
      out.push({ id: f.name.replace(/\.jsonl$/, ''), projectFolder,
        read: () => f.text() });
    }
    return out;
  }

  CCE.fsaccess = { get mode(){ return isServer ? 'server' : 'picker'; }, SKIP_DIRS, listSessions };
  CCE.connect = {
    init(onConnected) {
      const btn = document.getElementById('btn-connect');
      if (btn) btn.onclick = async () => {
        try { files = await connectViaPicker(); onConnected(); } catch (e) {}
      };
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 2: Wire the File System Access "remember" enhancement** (Chromium only), with graceful fallback. Add to `fsaccess.js`: if `window.showDirectoryPicker` exists, prefer it and store the handle in IndexedDB (db `cce`, store `handles`, key `root`); on boot, attempt `restore()` and, if a handle exists with granted permission, auto-list without prompting. If unsupported or permission denied, fall back to `connectViaPicker`. (Reading files from a handle: recurse `handle.entries()`, skipping `SKIP_DIRS`, collecting `{relPath, file}`.)

- [ ] **Step 3: Remove the `CCE.connect` stub from `app.js`** (now provided by fsaccess). Ensure `fsaccess.js` is loaded before `app.js` in `index-explorer.html`.

- [ ] **Step 4: Verify in browser.** Serve and open `index-explorer.html`. Point the picker at `test/fixtures/dot-claude` (created in Task 11; for now, at your real `~/.claude`). Add a temporary `console.log((await CCE.fsaccess.listSessions()).length)` in the connect callback. Expected: logs a non-zero session count; no errors. On Chrome, confirm the folder is remembered on reload (no re-pick). Remove the temporary log.

- [ ] **Step 5: Commit.**

```bash
git add assets/js/core/fsaccess.js assets/js/app.js index-explorer.html
git commit -m "feat(explorer): fsaccess folder picker + FSA remember + session listing"
```

---

### Task 7: `views/browse.js` — Session Browser (List/Grid/Tiles)

**Files:**
- Modify: `assets/js/views/browse.js`
- Modify: `index-explorer.html` (register vendor Fuse in Task 10; here use substring search, upgraded later)

**Interfaces:**
- Consumes: `CCE.fsaccess.listSessions`, `CCE.jsonl.parse`, `CCE.sessionIndex.summarize`/`projectDisplayPath`, `CCE.store` (favorites, view mode), `CCE.router`.
- Produces: `CCE.router.register('#/sessions', { title:'Sessions', mount(root){...} })`.

- [ ] **Step 1: Port the three renderers** from `docs/mockups/sessions-v2.html` (`renderGrid`, `renderList`/`rowHTML`, `renderTiles`, `modelBadge`, `branchChip`, `starSVG`) into `browse.js`. Replace the mockup's hardcoded `SESSIONS` array with real data built from `fsaccess.listSessions()` -> for each, `read()` -> `jsonl.parse` -> `sessionIndex.summarize`; map `projectFolder` through `projectDisplayPath`. Cache the resulting summary array in a module-level variable and expose it for the dashboard: `CCE.sessions = { all: () => cached };` (set `cached` after the summaries resolve).

- [ ] **Step 2: Wire the segmented toggle + persistence.** Default view = `CCE.store.get('view','list')`. On toggle, `CCE.store.set('view', mode)` and re-render. Stars call `CCE.store.toggleFavorite(id)` and reflect `CCE.store.isFavorite(id)` on mount (this is the persistence the user asked for).

- [ ] **Step 3: Wire search/sort/group** using the mockup's `data()` logic (substring over prompt+project; sort by Recent/Cost/Messages; group-by-project). Show the skeleton loader while sessions parse, and the empty state when zero results.

- [ ] **Step 4: Show a loading skeleton during initial parse** (reuse `.skeleton` markup) since parsing many files is async; render progressively (list appears as summaries resolve; use `Promise.all` with a cap or sequential batches for large sets).

- [ ] **Step 5: Verify in browser.** Serve, connect to a folder with real sessions. Expected: sessions list appears; List/Grid/Tiles toggle works and is remembered on reload; starring a session persists across reload; search filters; clicking a session calls `CCE.router.go('#/viewer?id='+id)` (viewer built in Task 8 — until then, a placeholder alert is acceptable, then wired).

- [ ] **Step 6: Commit.**

```bash
git add assets/js/views/browse.js
git commit -m "feat(explorer): Session Browser with List/Grid/Tiles + persisted favorites"
```

---

### Task 8: `views/viewer.js` — conversation viewer (ported + DOMPurify + export)

**Files:**
- Modify: `assets/js/views/viewer.js`

**Interfaces:**
- Consumes: `CCE.jsonl.parse`/`indexToolResults`, `CCE.cost.estimate`, vendored `marked`, `DOMPurify`, `Prism`, `CCE.router`, `CCE.fsaccess` (to read the selected session by id).
- Produces: `CCE.router.register('#/viewer', { mount(root){ /* reads id from location.hash query */ } })`; `CCE.viewer.exportMarkdown(entries)` -> String.

- [ ] **Step 1: Port rendering** from current `index.html`: `renderUser/renderAssistant/renderSystem/renderProgress/renderSnapshot/renderLastPrompt`, thinking/tool blocks, usage bar, date separators, relative-time, TOC, `toggleBlock`, expand/collapse, search-with-nav. Keep behavior; restyle to new tokens (classes already in `components.css` from Task 1 — add viewer block styles there if missing).

- [ ] **Step 2: Replace the hand-rolled sanitizer** (`sanitizeHtml`, current `index.html` ~1011–1033) with `DOMPurify.sanitize(html, { ADD_ATTR:['target'] })` inside `renderMarkdown`. Keep the marked renderer + Prism `highlightCode`.

- [ ] **Step 3: Fix the reading-column layout** (the v1 mockup white-gap bug): the view root must be full-bleed (`background: var(--bg)`), with the conversation column `max-width: 860px; margin: 0 auto` and no fixed-width ancestor leaving unpainted space. Verify no white strip at the right edge at 1512px width.

- [ ] **Step 4: Add Export.** Implement `exportMarkdown(entries)` producing a `# Session` doc (user/assistant turns, code fences preserved) and a header "Export" button that triggers a `.md` download via a Blob URL. Also add a "Back to Sessions" button -> `CCE.router.go('#/sessions')`.

- [ ] **Step 5: Verify in browser.** From the Session Browser, open a real session. Expected: full conversation renders (markdown, code highlight, thinking/tool blocks expand, TOC scrolls, usage/cost bar shows); no right-edge white gap; Export downloads a readable `.md`; markdown with a `<script>` in a code block is NOT executed (DOMPurify). Check the console for zero errors.

- [ ] **Step 6: Commit.**

```bash
git add assets/js/views/viewer.js assets/css/components.css
git commit -m "feat(explorer): viewer ported with DOMPurify, layout fix, markdown export"
```

---

### Task 9: `views/dashboard.js` — Usage dashboard

**Files:**
- Modify: `assets/js/views/dashboard.js`

**Interfaces:**
- Consumes: the summarized sessions (reuse `browse`'s cached list; expose `CCE.sessions.all()` returning the cached summary array — add this tiny cache to `browse.js` in Task 7 if not present), `CCE.sessionIndex.projectDisplayPath`.
- Produces: `CCE.router.register('#/usage', { mount(root){...} })`.

- [ ] **Step 1: Port the dashboard markup** from `docs/mockups/usage-dashboard.html` (4 stat cards, per-project cost bars, 14-day activity bars, most-expensive table) into `dashboard.js`, but compute values from `CCE.sessions.all()`: total cost = sum of `cost`; total sessions = length; total tokens = sum `tokens`; active projects = distinct `projectFolder`; per-project cost = grouped sum; most-expensive = top 6 by `cost`. Bars are pure CSS widths (percent of max). No chart library.

- [ ] **Step 2: Verify in browser.** Connect to real data, click Usage. Expected: numbers match the session list (spot-check total sessions count), bars render proportionally, table lists the priciest sessions, theme toggle keeps it readable in light mode.

- [ ] **Step 3: Commit.**

```bash
git add assets/js/views/dashboard.js assets/js/views/browse.js
git commit -m "feat(explorer): usage dashboard computed from real sessions"
```

---

### Task 10: Vendor libraries offline

**Files:**
- Create: `assets/vendor/marked.min.js`, `prism.min.js`, `prism.css`, `purify.min.js`, `fuse.min.js`
- Modify: `index-explorer.html` (add vendor `<link>`/`<script>` before app modules), `assets/js/views/browse.js` (use `Fuse` if present), `assets/js/views/viewer.js` (use vendored `marked`/`Prism`/`DOMPurify`).

- [ ] **Step 1: Download pinned versions into `assets/vendor/`** (one-time, then committed so runtime is offline):

```bash
mkdir -p assets/vendor
curl -sL https://cdn.jsdelivr.net/npm/marked@12/marked.min.js -o assets/vendor/marked.min.js
curl -sL https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js -o assets/vendor/purify.min.js
curl -sL https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.min.js -o assets/vendor/fuse.min.js
curl -sL https://cdn.jsdelivr.net/npm/prismjs@1/prism.min.js -o assets/vendor/prism.min.js
curl -sL https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism-tomorrow.min.css -o assets/vendor/prism.css
for l in python bash json typescript javascript css markup yaml rust go markdown; do \
  curl -sL "https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-$l.min.js" >> assets/vendor/prism.min.js; done
```

Verify each file is non-empty: `wc -c assets/vendor/*`.

- [ ] **Step 2: Reference them locally** in `index-explorer.html` (no CDN, no `onerror`): `<link rel="stylesheet" href="assets/vendor/prism.css">` and `<script src="assets/vendor/marked.min.js"></script>` etc., BEFORE the `core/*` and `views/*` scripts. Set `Prism.manual = true` inline after the Prism script.

- [ ] **Step 3: Upgrade search to Fuse** in `browse.js` (fuzzy over `prompt` + display path) guarded by `typeof Fuse !== 'undefined'` (fallback to substring).

- [ ] **Step 4: Verify offline.** Turn off Wi-Fi (or use browser devtools "Offline"). Reload `index-explorer.html`. Expected: markdown renders, code is highlighted, fuzzy search works, no network requests in the Network tab, no console errors.

- [ ] **Step 5: Commit.**

```bash
git add assets/vendor index-explorer.html assets/js/views/browse.js assets/js/views/viewer.js
git commit -m "feat(explorer): vendor marked/prism/dompurify/fuse for offline use"
```

---

### Task 11: Sample fixture, promote entry, README, end-to-end verify

**Files:**
- Create: `test/fixtures/dot-claude/projects/-Users-demo-Developer-sample/<uuid>.jsonl` (+ 1-2 more), `test/fixtures/dot-claude/plans/example.md`
- Rename: `index-explorer.html` -> `index.html` (replace the old viewer entry); keep old file's git history
- Modify: `README.md`

- [ ] **Step 1: Build a small fixture** `.claude` tree: 2–3 fake `.jsonl` sessions across 2 project folders with a realistic mix (user/assistant/thinking/tool_use/tool_result/usage), so the app can be verified without touching real data. Include a `projects/` dir so `listSessions` finds them.

- [ ] **Step 2: Promote the entry.** `git mv index.html index-legacy-viewer.html` then `git mv index-explorer.html index.html`. (Keeps the legacy single-file viewer available and preserves history.)

- [ ] **Step 3: Update README** to describe the Explorer, the correct on-disk layout (sessions are `.jsonl` directly in each `projects/<folder>/`, not a `chat/` subfolder), the three views, persistence + Export/Import, offline behavior, and the planned `npx claude-viewer` launcher. Remove the outdated "chat/ directory" claim.

- [ ] **Step 4: Full end-to-end verification.** `node --test test/` (all pass). Then serve, open `index.html`, connect to `test/fixtures/dot-claude`. Expected: sessions list from the fixture; List/Grid/Tiles + persisted stars; open a session (renders, exports); Usage tab shows fixture totals; theme + view persist across reload; offline works. Also open via `file://` (double-click) to confirm no ES-module/CORS errors.

- [ ] **Step 5: Commit.**

```bash
git add test/fixtures README.md index.html index-legacy-viewer.html
git commit -m "feat(explorer): sample fixture, promote index.html, README, e2e verify"
```

---

## Verification Summary

- Unit: `node --test test/` — store, cost, jsonl, session-index.
- Manual/browser per task, plus the Task 11 end-to-end pass (fixture + offline + file:// + persistence).
- Phase 1 done = Sessions (3 views + favorites), Usage, Viewer all work from a picked `~/.claude`, offline, double-clickable, with persisted local state.

## Out of scope (later phases)
- Plans/Skills/Commands/Hooks/Memory views (Phase 2–3).
- `npx claude-viewer` launcher + MCP view + server-mode `fsaccess` (Phase 4).
- Vendored distinctive webface (optional; system stack for now).
