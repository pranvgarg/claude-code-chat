# Claude Code Explorer

[![License: MIT](https://img.shields.io/github/license/pranvgarg/claude-code-chat?style=flat-square)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)

## See your Claude Code history clearly

Claude Code Explorer is a local dashboard for the data Claude Code already stores in `~/.claude`.

Browse sessions, search transcripts, review token usage, inspect plans and skills, and understand your project history from one focused workspace.

Your files stay on your machine. CCE runs as a local static app and reads your selected folder in the browser.

## Start in one command

```bash
npx harness-explorer
```

CCE opens your browser and keeps the server attached to the terminal. Press `Ctrl+C` to stop it.

For a checkout, run:

```bash
node bin/cce.js
```

Then choose `~/.claude` in the browser.

CCE uses `http://localhost:61489` by default. The stable origin lets Chrome and Edge remember your folder permission between launches. If the port is in use, stop the existing CCE terminal with `Ctrl+C` before starting another one.

## Why use CCE?

Claude Code creates useful history, but its raw JSONL files are difficult to browse. CCE turns that history into a workspace for daily review:

- Find an old decision without opening files one by one.
- Compare model use, token counts, and estimated cost.
- Return to recently opened sessions.
- Inspect plans, skills, commands, hooks, and memory in context.
- Keep your data local without setting up a database or hosted service.

## What you can do

| Area | Use it to |
| --- | --- |
| Sessions | Browse sessions in List, Grid, or Tiles view. Filter by project, model, branch, date, or favorite. |
| Viewer | Read rendered Markdown, code, tool calls, thinking blocks, snapshots, token usage, and estimated cost. |
| Search | Search titles, transcripts, thinking blocks, and tool calls. Jump from a result to the matching turn. |
| Usage | Review estimated cost, sessions, tokens, project totals, activity, and the most expensive sessions. |
| Plans | Read Markdown plans stored in `~/.claude/plans`. |
| Skills | Browse local skills and their Markdown instructions. |
| Commands | Inspect local slash commands and plugin commands. |
| Hooks | Review configured hook events, matchers, commands, and local hook scripts. |
| Memory | Read global memory and project memory files with resizable list panes. |

## Designed for a local workflow

- No database.
- No build step.
- No server-side parsing.
- No analytics.
- No file upload.
- Vendored browser libraries with no CDN dependency at runtime.
- Dark and light themes.
- Resizable sidebars and document panes.
- Keyboard-friendly controls with visible focus states.
- Reduced-motion support.

## How it works

1. Start CCE from your terminal.
2. Open the local URL.
3. Choose your `~/.claude` folder.
4. CCE reads and parses the files in your browser.
5. Use the sidebar to browse sessions and supporting Claude Code context.

The File System Access API stores the selected folder handle in IndexedDB when the browser supports it. Chrome and Edge can restore the handle. If the browser asks for permission again, click the reconnect button once.

## Browser support

| Browser | Folder permission | Notes |
| --- | --- | --- |
| Chrome 86+ | Can persist | Full File System Access API support. |
| Edge 86+ | Can persist | Full File System Access API support. |
| Safari 15.2+ | Re-pick required | Partial File System Access API support. |
| Firefox | Re-pick required | The folder picker works, but File System Access API support is limited. |

Use the local server for full-text search. Web Workers do not run from `file://`, so opening `index.html` directly uses a slower main-thread fallback for search indexing.

## Claude Code data layout

Claude Code stores sessions as JSONL files directly inside each project folder:

```text
~/.claude/
├── projects/
│   ├── -Users-yourname-Developer-my-project/
│   │   ├── abc123.jsonl
│   │   └── def456.jsonl
│   └── -Users-yourname-Developer-another-project/
├── settings.json
└── CLAUDE.md
```

CCE also reads plans, skills, commands, hooks, and memory files from the selected Claude directory.

## Privacy and permissions

CCE reads files only after you choose a folder. The browser grants CCE read access to that folder. CCE does not send the files to a server because the app does not provide a data upload path.

The local static server serves only the application files. It does not read or parse your Claude Code data.

## Preferences and persistence

CCE stores these preferences in the browser:

| Preference | Stored |
| --- | --- |
| Favorite sessions | Yes |
| Theme | Yes |
| Session view | Yes |
| Sidebar and pane widths | Yes |
| Folder handle | Chrome and Edge only |

Use Preferences in the sidebar to export or import your UI preferences as JSON.

## Development

Clone the repository and start the local app:

```bash
git clone https://github.com/pranvgarg/claude-code-chat.git
cd claude-code-chat
node bin/cce.js
```

Run the test suite:

```bash
npm test
```

The project has no frontend build step. Edit the files under `assets/`, reload the browser, and test again.

## CLI reference

```text
cce                 Start the local server in the foreground
cce --help          Show usage
cce --version       Show the installed version
```

Use `Ctrl+C` to stop the server. CCE has no background `start`, `stop`, or `status` commands.

## Project structure

```text
bin/cce.js                 Local foreground launcher
lib/static-server.js       Safe static file server
assets/js/core/             File access, parsing, search, cost, and storage
assets/js/views/            Sessions, viewer, usage, docs, hooks, and memory
assets/css/                 Tokens, shell, and view styles
assets/vendor/              Offline browser libraries
test/                       Node test suite
```

## Roadmap

- Adapters for other coding-agent session formats.
- A command palette for fast navigation.
- Multi-root browsing for project-level `CLAUDE.md` files.

## Contributing

Issues and pull requests are welcome. Please include the browser, operating system, CCE command, and a short reproduction when reporting a problem.

## License

MIT. See [LICENSE](LICENSE).
