# Claude Code Chat Viewer

A lightweight, single-file HTML viewer for browsing Claude Code conversation history. Drop in a `.jsonl` conversation file and explore the full chat — messages, tool calls, thinking blocks, token usage, and more.

## Features

- Drag-and-drop or file-picker to load `.jsonl` conversation files
- Dark theme UI with color-coded message types (user, assistant, system, progress)
- Collapsible thinking blocks and tool-use blocks with inline results
- Token usage stats per assistant turn (input, output, cache read/write)
- Filter by message type (User, Assistant, System, Progress, Snapshots)
- Full-text search across all messages
- Zero dependencies — just one `index.html` file, no build step

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

### 5. Explore the Conversation

Once loaded, you can:

- **Filter messages** — Toggle checkboxes at the top to show/hide User, Assistant, System, Progress, and Snapshot entries
- **Search** — Type in the search box to highlight and filter messages containing your search term
- **Expand tool calls** — Click any green tool block to see the full input and result
- **Expand thinking blocks** — Click any orange thinking block to see Claude's internal reasoning
- **View token usage** — Each assistant message shows input/output token counts at the bottom
- **Collapse all** — Click "Collapse All" to close all expanded blocks at once
- **Load another file** — Click "Load Another" to go back and pick a different conversation

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
