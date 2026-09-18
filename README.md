# Claude Code Explorer

A local, offline explorer for your `~/.claude` folder — browse sessions, usage, plans, skills, commands, hooks, and memory. All data reading and parsing happens client-side via the File System Access API; there is no server-side parsing.

## Quick Start

**Option A — `npx` (recommended):**

```bash
npx harness-explorer
```

This starts a local static file server and opens your browser automatically. The server prefers a fixed port (`61489`) and falls back sequentially (`61490`, `61491`, …) only if that port is taken — the browser's folder permission (granted via the File System Access API) is tied to the origin (scheme + host + port), so keeping the port stable across restarts means you don't get re-prompted to pick `~/.claude` again. Use `cce stop` to stop it, `cce status` to check whether it's running, `cce --help` for usage, and `cce --version` for the installed version (all installed alongside the `cce` binary).

Full-text search (the global search box) needs the app to be served over `http://localhost` — Web Workers, which build the search index off the main thread, are unavailable on `file://`. Opening `index.html` directly still works; the app detects the missing Worker and falls back to building the index on the main thread, which is slower for large session histories.

**Option B — open the file directly:**

1. Double-click `index.html` (or `open index.html` from Terminal)
2. Click **"Choose ~/.claude folder"** and select your `~/.claude` directory
3. Browse sessions in List, Grid, or Tiles view

Either way, Chrome and Edge remember your folder selection via the File System Access API — future visits skip the picker. Safari and Firefox will re-prompt each time (browser limitation).

## On-Disk Layout

Claude Code stores sessions as `.jsonl` files directly inside each project subfolder:

```
~/.claude/
  projects/
    -Users-yourname-Developer-my-project/     # one folder per project
      abc123-def4-5678-abcd-ef1234567890.jsonl  # one .jsonl file per session
      bcd456-ef12-3456-bcde-f12345678901.jsonl
    -Users-yourname-another-project/
      ...
  settings.json
  CLAUDE.md
```

The folder name is the absolute path of your project with slashes replaced by dashes. Sessions live **directly** in the project folder — there is no `chat/` subfolder.

## Features

### Connect screen

The first-run experience is an aurora-lit card over a faint grid backdrop. Animated color blobs drift slowly behind the card (gated by `prefers-reduced-motion`), and the card itself has a subtle gradient border. All existing copy and CTAs (folder picker, single-file picker, privacy note, browser note) are preserved.

### Session Browser

Three views for browsing sessions — switch with the List / Grid / Tiles toggle in the header:

| View | Description |
|---|---|
| **List** (default) | Compact rows with date, model, turn count, cost |
| **Grid** | Cards with a soft top-gradient strip + session summary excerpt |
| **Tiles** | Dense tile layout for high-volume browsing |

- **Star sessions** — Click the star to favorite a session; favorites persist across browser restarts
- **Filters** — Project, model, git branch, date range (7/30/90 days or all time), and starred-only, combinable
- **Sort** — By date (recent), cost, turn count, or project (alphabetical, then recent within each project)
- **Recently opened** — A strip of your last few opened sessions for quick return
- **Global search** — See "Search" below for the full-text search box in the toolbar
- **What's remembered** — View mode (List/Grid/Tiles) and grouping (By project) are saved and restored on your next visit; filters (project, model, branch, date range, starred) reset to "all" each time you open Sessions

### Search

The search box in the toolbar searches across your whole `~/.claude` folder, not just the current view:

- **What it searches** — Session titles, full transcripts (user messages, assistant responses, thinking blocks), and tool calls
- **Scope toggle** — Narrow to Titles, Full text, or Tool calls only
- **Results grouped by session** — Each matching session shows its top snippets inline; click a snippet to jump straight to that exact turn in the viewer, or "Show N more" to see every match in that session
- **Indexing** — The index is built in a Web Worker (off the main thread) and cached in IndexedDB, keyed by file size + modified time, so unchanged sessions are never re-indexed on subsequent visits

### Session Viewer

Click any session to open it as a rendered conversation:

- **Markdown rendering** — Assistant responses rendered with headings, bold, code blocks, tables (via vendored marked.js)
- **Syntax highlighting** — Code blocks and tool inputs colored for 15+ languages (via vendored Prism.js)
- **Copy button on every code block** — One-click copy with a "Copied" confirmation; language label shown in the code header row
- **Thinking blocks** — Click to expand Claude's internal reasoning chain
- **Tool calls** — Expand to see input and result; long outputs have a "Show full" toggle
- **Token usage** — Input / output / cache counts per assistant turn
- **Cost per turn** — Estimated cost shown on each assistant message
- **DOMPurify sanitization** — All HTML content sanitized before render (vendored)
- **Scroll-to-bottom FAB** — Appears after scrolling up >200px; smooth-scrolls back to the latest turn
- **Scroll-progress bar** — A 2px gradient bar at the top of the viewer tracks reading position
- **View mode persists, filters reset per session** — Role filters (User/Assistant/System/Progress/Snapshots) and the TOC sidebar's open/closed state carry over as you move between sessions in the viewer; the search box itself resets to empty each time you open a session

### Usage Dashboard

The **Usage** tab shows aggregated statistics across all sessions in the picked folder:

- **4 stat cards** — Each with a gradient header band in its role color (cost / sessions / tokens / projects)
- **Cost by project** — Gradient-filled bars; tooltips show exact spend
- **7-day sparkline** — Inline SVG trend above the 14-day activity chart
- **14-day activity** — Sessions per day, gradient bars with hover tooltips
- **Most expensive sessions** — Top 6 by estimated cost, clickable into the viewer
- **Total spend by project**
- **Token usage over time**
- **Model breakdown** (if multiple models used)
- **Session count and average cost**

### Hooks

The **Hooks** tab shows the hooks configured across your `settings.json` files:

- **Per-event sidebar** — Hooks grouped by lifecycle event (PreToolUse, PostToolUse, Notification, etc.); pick an event to see the matchers and commands registered for it
- **Inline script preview** — Hook commands that point at a local script under `~/.claude/hooks` show the script's contents inline, so you don't have to open a terminal to see what a hook actually runs
- **User-level hooks only** — Reads your global `~/.claude/settings.json`; a note flags that a repository's own project-level `.claude/settings.json` hooks aren't shown here

## Persistence

Preferences are saved to `localStorage` keyed by session UUID:

| What | Stored |
|---|---|
| Starred / favorite sessions | Yes (per UUID) |
| Last selected view (List/Grid/Tiles) | Yes |
| Theme (light/dark) | Yes |
| Folder handle | Chrome/Edge only (File System Access API) |

**Export / Import prefs** — Use the settings panel to export your favorites and preferences as JSON, or import a backup. Useful when switching browsers or machines.

**Safari caveat** — Safari does not persist the folder handle; you must re-pick `~/.claude` on each visit. All other prefs (stars, theme, view) persist normally via localStorage.

## Offline Behavior

All libraries are vendored locally under `assets/vendor/` — no CDN calls, no network required:

- `marked.min.js` — Markdown rendering
- `purify.min.js` — HTML sanitization
- `fuse.min.js` — Fuzzy search
- `prism.min.js` + `prism.css` — Syntax highlighting

The app works fully offline after first open. You can even copy the whole folder to a USB drive.

## Visual System & CSS Architecture

The stylesheet is layered — a shared design-system layer plus per-view scoped files:

```
assets/css/
  tokens.css              Design tokens (colors, type scale, spacing, radii,
                          shadows, motion). Dark + light themes.
  shell.css               App frame: sidebar, nav, toolbar, content scroll.
                          Active accent bar, hover gradient, focus-visible,
                          aria-current style, collapsed-mode tooltips.
  views/
    connect.css           Connect screen (aurora, gradient-border card, pills)
    cards.css             Shared primitives: .card, .view-list, .tile,
                          .skeleton, .empty, .badge-*, .chip-branch
    viewer.css            Conversation viewer (.vwr-*): bubbles, code blocks
                          (copy button + lang label), thinking/tool blocks,
                          scroll-progress bar, scroll-to-bottom FAB
    dashboard.css         Usage dashboard (.dash-*): stat cards with
                          gradient header bands, project bars, sparkline,
                          activity chart, expensive-sessions table
    docs.css              Plans & Skills (.doc-*): list + markdown body
```

**Conventions:**
- View-specific classes are prefix-scoped (`vwr-`, `dash-`, `doc-`) so they don't collide across views.
- Shared primitives (`.empty`, `.skeleton`, `.card`, `.star`, `.cost`) live in `cards.css` and are the design-system layer used by every view.
- All animations are gated by `@media (prefers-reduced-motion: no-preference)`. Users with reduced motion enabled see static final states — shimmer, hover lifts, aurora drift, and view fade-in all stop automatically.
- `--font-display` repointed to a refined system sans stack (was Georgia serif). No webfonts are loaded; `--font-mono` and `--font-ui` remain system stacks.

## Browser Support

| Browser | Folder memory | Notes |
|---|---|---|
| Chrome 86+ | Persists | Full File System Access API support |
| Edge 86+ | Persists | Full File System Access API support |
| Safari 15.2+ | Re-pick each time | Partial FSA support; no handle persistence |
| Firefox | Re-pick each time | FSA not supported; picker works each time |

## Legacy Viewer

`index-legacy-viewer.html` is the previous single-file viewer (loads one `.jsonl` at a time via drag-and-drop or file picker). It still works if you want a quick look at a single file without picking the whole `~/.claude` folder.

`index-legacy-viewer.html` and `claude-conversation.schema.json` are kept in the repository for reference only; they are not part of the `npx harness-explorer` package.

## Roadmap

**Phase 1 (current):** Sessions, Viewer, Usage, Plans, Skills, Commands, Hooks, and Memory — all working offline from a picked `~/.claude`, and all read/parsed client-side (no server-side parsing).

**Shipped:** the `npx harness-explorer` / `cce` CLI (see Quick Start above) — a static file server with no dependencies beyond `open`, that only serves the app's own files. It still relies on the File System Access API in the browser to read `~/.claude`; it does not read or parse your data on the server side.

**Future work:** adapters for other coding-agent session formats (Codex, Gemini, etc.), a command palette, and multi-root folder support for browsing a project's own `CLAUDE.md` alongside its auto-memory notes.

## Schema Reference

The `claude-conversation.schema.json` file in this repo documents every JSONL entry type:

| Entry Type | Description |
|---|---|
| `user` | User messages and tool results |
| `assistant` | Assistant responses (text, thinking blocks, tool calls) |
| `system` | System events (turn duration, etc.) |
| `progress` | Streaming progress events (bash commands, hooks) |
| `file-history-snapshot` | File backup snapshots taken during the session |
| `last-prompt` | The last user prompt for session resumption |

## Quick Reference

```bash
# Where are your Claude Code sessions?
ls ~/.claude/projects/

# List sessions for a specific project (they're .jsonl files directly in the folder)
ls -lt ~/.claude/projects/-Users-$(whoami)-Developer-my-project/

# Open the Explorer
open index.html
```
