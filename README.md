# Claude Code Chat Viewer

A lightweight, single-file HTML viewer for browsing Claude Code conversation history. Drop in a `.jsonl` conversation file and explore the full chat — messages, tool calls, thinking blocks, token usage, cost estimates, and more.

## Features

- **Drag-and-drop** or file-picker to load `.jsonl` conversation files
- **Markdown rendering** — Assistant responses render with proper headings, bold, italic, links, code blocks, lists, and tables (powered by marked.js with offline fallback)
- **Syntax highlighting** — Code blocks and tool inputs are syntax-colored for 10+ languages (powered by Prism.js with offline fallback)
- **Light & dark themes** — Toggle between dark and light modes; your choice persists across sessions
- **Conversation sidebar (TOC)** — Collapsible outline panel showing all user/assistant turns for quick navigation
- **Search with navigation** — Full-text search with match counter, next/prev buttons, and keyboard shortcuts (Enter / Shift+Enter)
- **Expand/Collapse All** — Expand or collapse all tool and thinking blocks with one click
- **"Show Full" for truncated content** — Long tool results and file contents show a "Show full" button instead of hard-truncating
- **Cost estimation** — Per-turn and session-total cost estimates based on model and token usage
- **Date separators & relative timestamps** — Visual date dividers and "3 min later" / "2h later" labels between messages
- **Inline image support** — User-attached screenshots and images render inline
- **Color-coded message types** — User (blue), Assistant (purple), System (pink), Progress (gray)
- **Token usage stats** — Input, output, cache read/write token counts per assistant turn
- **Filter by message type** — Toggle checkboxes for User, Assistant, System, Progress, Snapshots
- **Zero build step** — Just one `index.html` file; CDN-enhanced but fully functional offline

## How to Use

### 1. Open the Viewer

Simply open `index.html` in any modern browser:

```bash
# macOS
open index.html

# Linux
xdg-open index.html

# Or just double-click index.html in your file manager
```

### 2. Find Your Claude Code Chat History

Claude Code stores all conversation logs as `.jsonl` files inside the `.claude/` folder in your home directory:

```
~/.claude/projects/
```

Each project you've used Claude Code in gets its own subfolder. The folder name is derived from the absolute path of the project directory (with slashes replaced by dashes). Inside each project folder there is a `chat/` directory containing the conversation files.

**Full path structure:**

```
~/.claude/
  projects/
    -Users-yourname-Developer-my-project/     # project folder
      chat/
        abc123-def4-5678-abcd-ef1234567890.jsonl   # one file per session
        ...
    -Users-yourname-another-project/
      chat/
        ...
```

### 3. Navigate to the Chat Folder

```bash
# List all project folders
ls ~/.claude/projects/

# Pick your project and list the chat files
ls ~/.claude/projects/-Users-yourname-Developer-my-project/chat/

# Tip: sort by date to find the most recent conversation
ls -lt ~/.claude/projects/-Users-yourname-Developer-my-project/chat/ | head -20
```

### 4. Load the Conversation File

You have two options:

**Option A — Drag and drop:** Open the viewer in your browser, then drag a `.jsonl` file from Finder / file manager onto the drop zone.

**Option B — Terminal shortcut:** Copy the file to a convenient location, or open the viewer and use the file picker to browse to the `.jsonl` file:

```bash
# Example: copy the latest chat file to your Desktop
cp ~/.claude/projects/-Users-yourname-Developer-my-project/chat/LATEST_FILE.jsonl ~/Desktop/
```

Then drop it into the viewer.

### 5. Navigate the Conversation

Once a file is loaded, here's how to use every feature:

#### Header Bar

| Control | What it does |
|---|---|
| **TOC** | Opens/closes the sidebar table of contents |
| **Theme toggle** (sun/moon icon) | Switches between dark and light themes |
| **Expand All** | Opens every tool call and thinking block |
| **Collapse All** | Closes every tool call and thinking block |
| **Load Another** | Returns to the landing page to load a different file |

The header also displays session metadata: file name, git branch, CLI version, entry counts, and **estimated session cost**.

#### Sidebar (TOC)

Click the **TOC** button to open a left-side panel listing every user and assistant message. Each item shows the role, a short preview, and timestamp. **Click any item to scroll directly to that message.**

#### Filtering & Search

- **Filter checkboxes** — Toggle User, Assistant, System, Progress, and Snapshot entries on/off
- **Search box** — Type to filter and highlight matching messages
- **Match counter** — Shows "1 of N matches" when searching
- **Navigation arrows** (or **Enter** / **Shift+Enter**) — Jump to the next/previous match

#### Message Blocks

- **User messages** (blue border) — Your prompts and inputs; attached images render inline
- **Assistant messages** (purple border) — Claude's responses rendered as formatted Markdown with syntax-highlighted code blocks
- **Thinking blocks** (orange) — Click to expand Claude's internal reasoning chain
- **Tool calls** (green) — Click to expand and see the tool input (syntax-highlighted) and result; long results have a **"Show full"** button
- **System entries** (pink) — Turn duration and system events
- **Progress entries** (gray) — Streaming bash commands and hook events (hidden by default — enable via checkbox)

#### Timestamps

- **Date separators** appear between messages on different days
- **Relative time** labels ("3 min later", "2h later") show the gap between consecutive messages

#### Cost & Token Usage

Each assistant turn shows a usage bar with:
- Input / output token counts
- Cache read / write counts
- **Estimated cost** for that turn (e.g., `~$0.0342`)

The session total estimated cost is displayed in the header bar.

## Offline Support

The viewer loads **marked.js** (Markdown) and **Prism.js** (syntax highlighting) from CDN for enhanced rendering. If you're offline or the CDN is unreachable:

- Markdown falls back to plain text display
- Code shows as plain monospace (no colors)
- All other features work normally

No internet connection is required for core functionality.

## Schema

The `claude-conversation.schema.json` file documents the structure of each JSONL entry type:

| Entry Type | Description |
|---|---|
| `user` | User messages and tool results |
| `assistant` | Assistant responses (text, thinking, tool calls) |
| `system` | System events like turn duration |
| `progress` | Streaming progress events (bash commands, hooks) |
| `file-history-snapshot` | File backup snapshots taken during the session |
| `last-prompt` | The last user prompt for session resumption |

## Quick Reference

```bash
# Where are my chats?
ls ~/.claude/projects/

# What project folders exist?
ls ~/.claude/projects/ | head -20

# Find conversations for a specific project
ls -lt ~/.claude/projects/-Users-$(whoami)-Developer-my-project/chat/

# Open the viewer
open index.html
```

## Keyboard Shortcuts

| Key | Action |
|---|---|
| **Enter** (in search box) | Jump to next match |
| **Shift+Enter** (in search box) | Jump to previous match |
