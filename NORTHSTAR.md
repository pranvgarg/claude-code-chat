# North Star

## Vision

Claude Code Explorer becomes a single lightweight `npx` package that lets
anyone browse and understand their local AI coding agent sessions — usage,
cost, plans, skills, memory — starting with Claude Code, then expanding to
other agents, without ever giving up the zero-backend, zero-build philosophy
this project already has.

## Why this exists

Opening `index.html` by double-click serves it over `file://`, and
IndexedDB-backed folder-handle persistence doesn't reliably survive that
origin in Chromium — so auto-reconnect silently fails. Serving over
`http://localhost` fixes this for free. Packaging that as `npx` also gives
the project a real distribution story instead of "clone the repo."

Prior art check: `d-kimuson/claude-code-viewer` (1260★) already solves
"npx + localhost + Claude Code session viewing," including a live terminal.
Our differentiation is architectural (zero-backend, FSA-only, reads files
directly in-browser — never a Node process with filesystem access to
session content) and scope (multi-agent from the start), not feature parity.

`LukeRenton/explore-claude-code` is the packaging inspiration, not a
competitor — it's a docs site, not a session viewer. Its lesson: zero deps,
zero build, and `npx <static-server>` is enough; you don't need a framework
to ship something that feels like a product.

## Phased roadmap

1. **Package for npx (current)** — `bin/cce.js`, Node built-ins only plus
   one justified dependency (`open`, for real cross-platform browser
   launch including Windows). `cce start` / `cce stop` / `cce status` via
   a PID file. No new dependency for port allocation (`net.createServer()
   .listen(0)`). This alone fixes the file:// bug.
2. **Codex adapter** — parse `~/.codex/sessions/rollout-*.jsonl` into the
   same internal session shape `fsaccess.js` already produces, tagged by
   source agent. No new views; existing Sessions/Usage views render it.
3. **Combined usage** — one dashboard aggregating tokens/cost across
   Claude Code + Codex, filterable by agent. A merge function, not a new
   subsystem.
4. **Pi adapter** — same pattern as Codex, `~/.pi` session format.
5. **tokview integration** — layered on top for realtime token/cost during
   *live* sessions. tokview's SQLite output is read as just another data
   source, at arm's length — never absorbed into the main app's runtime
   model. If a feature can't be reduced to "read some files, normalize,
   render," it doesn't belong in this package.
6. **Single entry point** — all of the above surfaced through the one
   `npx` package.

Hermes was considered and deferred: its session store is SQLite
(`~/.hermes/state.db`), architecturally incompatible with the flat-file
FSA reader used everywhere else in this app, and Hermes itself is a
broader multi-channel agent, not primarily a coding CLI.

## Non-negotiables (keep re-reading these before adding anything)

- **No server-side parsing, ever.** The Node process's only job across
  every phase is to serve static files. Every agent adapter (Claude Code,
  Codex, Pi, tokview) reads and normalizes data client-side, same as
  `fsaccess.js` does today. The moment a feature requires the server to
  read `~/.claude` (or any session data) itself, it's out of scope for
  this package as designed.
- **Zero npm dependencies unless justified per-feature.** `open` is the
  one dependency added so far, justified by needing real Windows support.
  Anything else needs the same bar: "can this be ~15 lines of Node
  built-ins" is asked before reaching for a package.
- **No build step, no bundler, no framework, no webfonts.** Vanilla JS,
  system fonts, vendored libs under `assets/vendor/` — unchanged from the
  existing `CLAUDE.md` rules, applies to every future phase too.
- **Multi-agent = more parsers, not more app.** Each new agent gets a
  `*access.js` sibling to `fsaccess.js` and a merge step. It never gets a
  new view, a new framework, or a new backend responsibility.

## Current phase status

Phase 1 in progress on branch `feat/npx-package` (branched off `main`
after the 7-wave explorer plan shipped in `97510b6`).
