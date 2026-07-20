# Claude Code Explorer — Design Spec

**Date:** 2026-07-19
**Status:** Approved design, pending implementation plan
**Supersedes:** the current single-file `index.html` "Claude Code Chat Viewer"

---

## 1. Summary

Evolve the current single-file chat viewer into **Claude Code Explorer**: a local,
zero-install, offline-first web UI that points at a user's standard `~/.claude`
folder and renders everything in it through a tabbed, sidebar-navigation app —
chat sessions, plans, skills, commands, hooks, memory files, and aggregate usage
stats.

Because `~/.claude` exists on every Mac/Windows Claude Code install, this is
immediately useful to **any** Claude Code user, not just this repo's author. That
"works for external users out of the box" property is a primary goal.

The app ships in two runtime modes that share one frontend:

- **Double-click mode (`file://`)** — the default now. Zero install. The user picks
  their `~/.claude` folder once; the browser exposes its contents.
- **Launcher mode (`http://localhost`)** — a future `npx claude-viewer` companion
  that serves the same UI and reads `~/.claude` directly (zero picking,
  live-refresh, and unlocks MCP config). Documented here, built in a later phase.

---

## 2. Goals / Non-goals

### Goals
- List **all sessions across all projects** automatically after one folder pick —
  no manual navigation into `~/.claude/projects/<folder>/`.
- Render other `~/.claude` artifacts: plans, skills, commands, hooks, memory.
- Aggregate **usage/cost stats** across everything.
- Stay **double-clickable** (no build step, no server) and **offline-first**.
- Keep the codebase **modular** so new views and the launcher backend are drop-ins.
- A polished, distinctive developer-tool visual design.

### Non-goals (this project)
- No editing/writing/deleting of any `~/.claude` files. **Read-only**, always.
- No cloud sync, accounts, telemetry, or network calls of any kind.
- No build toolchain, bundler, or framework in the double-click phase.
- MCP server view is deferred to the launcher phase (see §9).

---

## 3. Architecture

### 3.1 Runtime & delivery
- Single `index.html` entry point, opened by double-click, runs over `file://`.
- Works fully offline. All libraries **vendored locally** (no CDN).
- Constraint that drives everything: over `file://`, **ES modules (`import`/`export`)
  and `fetch()` are blocked** by browser security. Therefore the double-click phase
  uses **classic `<script>`/`<link>` tags** (namespaced globals), not ES modules.
  Modern module cleanup is deferred to the launcher phase, which serves over
  `http://` where modules/fetch work.

### 3.2 Single page, multiple views
- One HTML page. Views are swapped by a small **hash-router** (`#/sessions`,
  `#/usage`, `#/plans`, ...). Not multiple HTML files: over `file://` a picked
  `File`/folder handle cannot survive navigation between pages, so multi-page is
  technically impossible here.

### 3.3 The keystone abstraction: `core/fsaccess.js`
A single module answers **"where do files come from?"** and hides the runtime mode
from every view:

- **Double-click mode** → source = the folder the user picked
  (`<input webkitdirectory>` and/or File System Access API). Returns file
  handles/blobs and text.
- **Launcher mode** → source = the local server's `/api` endpoints (detected when
  the page is served over `http://localhost`).

Public interface (shape, not final signatures):
- `fsaccess.connect()` → prompt/restore access to `~/.claude`.
- `fsaccess.list(subpath)` → entries under a subtree (e.g. `projects`, `plans`).
- `fsaccess.readText(path)` → file contents as text.
- `fsaccess.mode` → `'picker' | 'server'`.

Views (`sessions`, `plans`, `skills`, ...) call only `fsaccess` and never know the
mode. This makes the future launcher a **drop-in backend**, not a rewrite.

### 3.4 Code structure
```
claude-code-explorer/
  index.html                  ← double-click entry
  assets/
    vendor/                   ← marked, prism, purify, fuse (vendored, offline)
    css/  base.css  theme.css  components.css
    js/
      app.js                  ← boot + hash-router + view registry
      core/
        fsaccess.js           ← picker/server file-source abstraction (keystone)
        jsonl.js              ← parse .jsonl session files (from current io logic)
        session-index.js      ← scan projects → session metadata list
        markdown.js           ← marked + DOMPurify wrapper (safe render)
        highlight.js          ← Prism wrapper
        cost.js               ← pricing/estimate (from current format.estimateCost)
        store.js              ← localStorage: theme, favorites, recent, view prefs
        util.js               ← esc, time, debounce, path helpers
      views/
        browse.js             ← Session Browser (list default + cards toggle)
        viewer.js             ← conversation viewer (ported from current render.*)
        dashboard.js          ← usage/cost aggregation
        plans.js  skills.js  commands.js  hooks.js  memory.js
  docs/
    mockups/                  ← approved visual templates (fake data)
    superpowers/specs/        ← this spec
  README.md
```
Adding a future view = drop one file in `views/` that registers with the router.

---

## 4. Information architecture (sidebar tabs)

`Sessions` · `Usage` · `Plans` · `Skills` · `Commands` · `Hooks` · `Memory`
(+ `MCP` appears only in launcher mode — see §9).

Left icon-sidebar app shell: wordmark + connected `~/.claude` path at top; theme
toggle + "Reconnect folder" at bottom; active view in the main pane. Matches
`docs/mockups/session-browser-A.html` / `-B.html`.

---

## 5. Data sources & parsing

| View | Source on disk | Notes |
|---|---|---|
| Sessions | `~/.claude/projects/<proj>/<uuid>.jsonl` | Sessions are `.jsonl` **directly** in each project folder (not a `chat/` subfolder — the old README was wrong). Sibling `memory/` folder ignored for the list. |
| Usage | derived from the parsed sessions | Aggregate cost/tokens. |
| Plans | `~/.claude/plans/*.md` | Markdown. |
| Skills | `~/.claude/skills/<name>/SKILL.md` (+ files) | Markdown + frontmatter. |
| Commands | `~/.claude/commands/*.md` | Markdown (custom slash commands). |
| Hooks | `~/.claude/settings.json` (`hooks`) + `~/.claude/hooks/*` | Config + scripts. |
| Memory | `~/.claude/CLAUDE.md`, `RTK.md`, per-project `memory/` | Markdown. |
| MCP (launcher only) | `~/.claude.json` (`mcpServers`) | **Outside** `.claude/` — see §9. |

**Performance:** only the light, relevant subtrees above are scanned. Heavy/irrelevant
dirs (`cache`, `backups`, `file-history`, `plugins/cache`, `debug`, `sessions`,
`session-env`) are **skipped**. Session metadata is read cheaply (parse enough of
each `.jsonl` to extract first user prompt, message count, model, git branch,
timestamps, token usage for cost) and parsed **progressively** so the list appears
fast even with many projects. Full-file parse happens only when a session is opened.

---

## 6. Feature detail

### 6.0 View-mode toggle (applies to ALL collection panels)
Every collection panel (Sessions, Plans, Skills, Commands) offers the **same
segmented view toggle with three modes**, remembered per-panel in `localStorage`:
- **List** (default) — dense rows with aligned columns; groupable by project.
- **Grid** — rich cards (preview + metadata), colour-accented by model/type.
- **Tiles** — compact, many-per-row, title + one key stat for glanceable overview.

The reference implementation of all three is `docs/mockups/sessions-v2.html`
(renders one dataset through three renderers; toggle + persistence working).

### 6.1 Session Browser (`views/browse.js`)
- **Default view: List**, with the **Grid / Tiles** toggle from §6.0.
- Two ordering modes: **Recent-first flat list** (default) and **Group-by-project**.
- **Rich session data** per row/card: first-prompt preview, project path, relative
  last-modified, message count, model badge, git branch chip, estimated cost, file size.
- **Search/filter across all sessions** (Fuse.js fuzzy over prompt text + project path).
- **Sort** by date / cost / message count / project name.
- **Filter** by model / git branch / date range.
- **Favorites** (star) and **recently-viewed** strip, both in `localStorage`.
- Clicking a session opens the Viewer.

### 6.2 Viewer (`views/viewer.js`)
- Ports the existing rendering logic (user/assistant/system/progress/snapshot/
  last-prompt, thinking blocks, tool calls with input+result, token/cost bar, date
  separators, relative-time labels, TOC sidebar, search-with-nav, expand/collapse).
- **Redesigned** to the new visual system (see mockup `viewer.html`).
- **Security fix:** replace the hand-rolled regex HTML sanitizer with **DOMPurify**.
- Adds **Export** (Markdown and/or printable HTML) of the open conversation.
- "Back to Sessions" returns to the browser view (same page).

### 6.3 Usage dashboard (`views/dashboard.js`)
- 4 stat cards: total est. cost, total sessions, total tokens, active projects.
- Per-project cost breakdown as **pure CSS/SVG bars** (no chart library in Phase 1).
- 14-day activity bars.
- "Most expensive sessions" table.
- Chart.js (vendored) may be added later only if time-series charts are wanted.

### 6.4 Markdown views (Plans / Skills / Commands / Memory)
- Shared markdown renderer (`core/markdown.js` = marked + DOMPurify).
- List on the left / rendered document on the right, per view.
- Skills additionally surface `SKILL.md` frontmatter (name/description).

### 6.5 Persistence & local state (`core/store.js`)
All "local-agnostic" user state — **favorites/stars, theme, per-panel view mode
(List/Grid/Tiles), sort/group/filter prefs, recently-viewed** — persists across
closing and reopening the file, via one versioned key (`cce.v1`) in `localStorage`.
Favorites are keyed by **session UUID** (the stable `.jsonl` filename), so re-scanning
the folder on reopen re-applies stars correctly. The Chrome/Edge folder grant (a
non-string `FileSystemDirectoryHandle`) is stored in **IndexedDB**.

`file://` reality: `localStorage` persists reliably on **Chrome/Edge/Firefox**;
**Safari** restricts/clears it for double-clicked files (may even throw). Chosen
robustness level (**localStorage + Export/Import + safe fallback**):
- All storage access wrapped in `try/catch` with an **in-memory fallback** so the
  app never crashes when storage is blocked.
- A **one-time, non-nagging notice** if persistence is unavailable.
- **Export / Import preferences** — download/upload a small `explorer-prefs.json`;
  the universal, browser-agnostic backup and machine-portability path (covers Safari
  and moving machines).
- The **launcher phase** makes persistence bulletproof everywhere (real
  `http://localhost` origin; optional on-disk prefs file).

In the current `sessions-v2.html` mockup, theme + view mode already persist; stars
are visual-only there and will be wired to `store.js` in the build.

### 6.6 Hooks view
- Renders the `hooks` block from `settings.json` (event → matcher → command) and
  links to the referenced scripts in `~/.claude/hooks/`.

---

## 7. Libraries (vendored, offline)

| Lib | ~Size | Role | Status |
|---|---|---|---|
| marked | 35KB | Markdown → HTML | keep (vendor) |
| Prism.js | 15KB+ | Syntax highlighting | keep (vendor) |
| DOMPurify | 20KB | Safe HTML sanitize (replaces hand-rolled regex) | **add** |
| Fuse.js | 7KB | Fuzzy search across sessions | add |
| Chart.js | ~200KB | Usage time-series | **deferred** (CSS bars first) |
| Alpine/React/Vue | — | reactivity/framework | **rejected** (breaks double-click / not thin) |

Launcher (future, Node): built-in `http` + `fs` (zero-dep server + read), `open`
(launch browser), optional `chokidar` + SSE (live refresh). ~1–3 tiny deps total.

---

## 8. Design system

**Aesthetic direction: "editorial terminal"** — a refined dark developer tool with
an **editorial serif** used for the wordmark and large numbers (unexpected elegance
against the data), mono for all technical strings, one sharp accent, hairline
borders, and a **subtle grain overlay** for depth. Reference:
`docs/mockups/sessions-v2.html` (verified in browser). Not maximalist — precision
and restraint over intensity.

- Dark theme default + light theme (a warm paper-white `#f5f3ef`, not generic pure
  white), driven entirely by CSS custom properties; instant toggle, persisted.
- Colour grammar: **blue = user/sonnet, purple = assistant/opus, green = tool,
  orange = thinking, pink = system, amber = cost**. Consistent across cards, chips,
  bars, rows.
- **Typography / offline (fixes the v1 violation):** the first mockups pulled fonts
  from the Google Fonts **CDN** and had **no `@font-face`**, so they broke
  offline-first and silently degraded to system mono. Resolution — TWO acceptable
  options, both CDN-free:
  1. **Refined system stack (current v2):** editorial serif = `Georgia` (display),
     `ui-monospace / 'SF Mono' / 'Cascadia Code' / 'JetBrains Mono'` (data), system
     sans (UI). Zero downloads, truly offline.
  2. **Vendored webface (optional, build-time):** download OFL fonts (e.g.
     Instrument Serif + IBM Plex Mono) into `assets/vendor/fonts/` with local
     `@font-face`. More distinctive; requires vendoring the `.woff2` files. Chosen
     only with an explicit go-ahead to download.
- Rounded corners (~8–12px), subtle hover/active (lift + border shift), icon sidebar.
- **Real empty / loading / error states** (skeleton shimmer on load; a styled empty
  state on no-match) — not blank screens. Demonstrated in `sessions-v2.html`.

### 8.1 Viewer layout bug (must fix in build)
The v1 `viewer.html` mockup has a real layout defect: the reading column is
`max-width:820px; margin:0 auto` but the app background does not fill the pane,
leaving a **white gap on the right edge** and lopsided whitespace. The real Viewer
must use a full-bleed app background with a correctly centred, symmetric reading
column. (Not yet re-mocked; captured here as a build requirement.)

---

## 9. The MCP caveat (deliberate deferral)

MCP servers are configured in **`~/.claude.json`**, which lives in the home
directory **outside** the `~/.claude` folder. A `webkitdirectory`/File System Access
grant to `~/.claude` therefore **cannot reach it**. Rather than bolt on an awkward
"also pick your `~/.claude.json`" step, the **MCP view is a launcher-phase feature**
(the server has real FS access and can read it cleanly). The `MCP` tab only appears
in launcher mode.

---

## 10. The launcher (`npx claude-viewer`) — future phase, documented now

Lifecycle (matches the desired "close terminal → it stops" behavior):
1. `npx claude-viewer` runs the package's bin script.
2. Starts an HTTP server bound to **`127.0.0.1`** only (localhost; not reachable
   from other devices) on a default port, auto-incrementing if taken.
3. Serves the same static UI plus small **read-only** endpoints:
   `GET /api/tree` (projects/sessions/plans/skills/…) and
   `GET /api/file?path=…` (one file). Optional `GET /api/events` (SSE) for
   live-refresh via a `chokidar` watch on `~/.claude`.
4. Auto-opens the default browser to `http://localhost:<port>`.
5. Runs in the **foreground**, printing the URL/logs. It is a process, not a daemon.
6. **Ctrl+C or closing the terminal** sends SIGINT/SIGHUP → `server.close()` →
   process exits → the browser page's next `/api` call fails and the UI shows a
   "disconnected — relaunch" state. Nothing persists in the background.

Properties: localhost-only, **read-only**, no telemetry, no install (npx transient;
`npm i -g` optional). The frontend detects `http://localhost` and routes `fsaccess`
to the API automatically — same UI, richer backend, plus the MCP tab.

---

## 11. Phasing (decomposition)

Each phase is an independently shippable vertical slice.

- **Phase 1 — Shell + Sessions + Usage (tracer bullet).** Modular skeleton, vendored
  libs, `core/fsaccess.js` (picker mode) + File-System-Access "remember folder" on
  Chromium with graceful fallback, hash-router, app shell, redesigned **Session
  Browser** (list default + cards toggle, all §6.1 features), **Usage dashboard**,
  redesigned **Viewer** (ported logic + DOMPurify + Export). Replaces and beats the
  current app.
- **Phase 2 — Plans + Skills + Commands.** Three markdown-driven views on the shared
  renderer.
- **Phase 3 — Hooks + Memory** (+ optionally Plugins/History views).
- **Phase 4 (future) — `npx claude-viewer` launcher** (§10) + the **MCP** view
  (§9) + ES-module cleanup enabled by serving over http.

---

## 12. Testing & verification

- Bundle a small **sample `.claude` fixture** (fake projects/sessions/plans/skills)
  under `docs/` or `test/fixtures/` so the UI can be verified without touching the
  user's real `~/.claude` data.
- Manual verification steps per phase: double-click `index.html`, pick the fixture
  folder, confirm each view renders, theme toggles, search/sort/filter/favorites
  work, viewer opens and exports.
- Where practical, small unit checks for pure helpers (`jsonl.js`, `cost.js`,
  `session-index.js`) runnable without a browser.

---

## 13. Migration note

The current `index.html` rendering logic (`ChatViewer.io.*`, `ChatViewer.render.*`,
`ChatViewer.format.*`) is largely reused: it moves into `core/jsonl.js`,
`core/markdown.js`, `core/highlight.js`, `core/cost.js`, and `views/viewer.js`. The
README is updated to describe the Explorer, the correct on-disk layout (sessions are
`.jsonl` directly in each project folder), and the planned `npx claude-viewer`.
