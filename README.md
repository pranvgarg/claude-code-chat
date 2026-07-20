# Claude Code Explorer

A local, offline, zero-install explorer for your `~/.claude` folder. Open `index.html` in a browser, pick your `~/.claude` directory once, and browse all your Claude Code sessions — no server, no npm, no build step.

## Quick Start

1. Double-click `index.html` (or `open index.html` from Terminal)
2. Click **"Choose ~/.claude folder"** and select your `~/.claude` directory
3. Browse sessions in List, Grid, or Tiles view

That's it. Chrome and Edge remember your folder selection via the File System Access API — future visits skip the picker. Safari and Firefox will re-prompt each time (browser limitation).

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

### Session Browser

Three views for browsing sessions — switch with the List / Grid / Tiles toggle in the header:

| View | Description |
|---|---|
| **List** (default) | Compact rows with date, model, turn count, cost |
| **Grid** | Cards with a session summary excerpt |
| **Tiles** | Dense tile layout for high-volume browsing |

- **Star sessions** — Click the star to favorite a session; favorites persist across browser restarts
- **Search** — Full-text filter across session summaries and project paths
- **Sort** — By date, cost, or turn count
- **Project filter** — Narrow to a single project folder

### Session Viewer

Click any session to open it as a rendered conversation:

- **Markdown rendering** — Assistant responses rendered with headings, bold, code blocks, tables (via vendored marked.js)
- **Syntax highlighting** — Code blocks and tool inputs colored for 15+ languages (via vendored Prism.js)
- **Thinking blocks** — Click to expand Claude's internal reasoning chain
- **Tool calls** — Expand to see input and result; long outputs have a "Show full" toggle
- **Token usage** — Input / output / cache counts per assistant turn
- **Cost per turn** — Estimated cost shown on each assistant message
- **DOMPurify sanitization** — All HTML content sanitized before render (vendored)

### Usage Dashboard

The **Usage** tab shows aggregated statistics across all sessions in the picked folder:

- Total spend by project
- Token usage over time
- Model breakdown (if multiple models used)
- Session count and average cost

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

## Browser Support

| Browser | Folder memory | Notes |
|---|---|---|
| Chrome 86+ | Persists | Full File System Access API support |
| Edge 86+ | Persists | Full File System Access API support |
| Safari 15.2+ | Re-pick each time | Partial FSA support; no handle persistence |
| Firefox | Re-pick each time | FSA not supported; picker works each time |

## Legacy Viewer

`index-legacy-viewer.html` is the previous single-file viewer (loads one `.jsonl` at a time via drag-and-drop or file picker). It still works if you want a quick look at a single file without picking the whole `~/.claude` folder.

## Roadmap

**Phase 1 (current):** Sessions, Viewer, Usage — all working offline from a picked `~/.claude`.

**Placeholder tabs** (visible in UI but not yet implemented — future phases):
- **Plans** — Browse `.claude/plans/` files
- **Skills** — Browse `.claude/commands/` (slash command skills)
- **Hooks** — View hook configuration from `settings.json`
- **Memory** — Browse `CLAUDE.md` and project-level memory files

**Phase 4 (planned):** `npx claude-viewer` — a localhost-only read-only server that unlocks MCP config viewing from `~/.claude.json` without requiring the browser folder picker. Will run on `localhost:3000` and auto-open the browser.

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
