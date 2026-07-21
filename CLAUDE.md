## Agent skills

### Issue tracker

Issues live in GitHub Issues (`github.com/pranvgarg/claude-code-chat`). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Visual system

The stylesheet is layered: a shared design-system layer (`tokens.css`, `shell.css`, `views/cards.css`) plus per-view scoped files in `assets/css/views/` (`connect.css`, `viewer.css`, `dashboard.css`, `docs.css`).

When adding or editing styles:
- Use the design tokens from `tokens.css` (`--fs-*`, `--sp-*`, `--r-*`, `--shadow-*`, `--motion-*`). Don't hardcode magic values.
- View-specific classes must be prefix-scoped (`vwr-` for viewer, `dash-` for dashboard, `doc-` for plans/skills) so they don't collide across views.
- Shared primitives (`.card`, `.tile`, `.empty`, `.skeleton`, `.star`, `.cost`, `.badge-*`, `.chip-*`) live in `views/cards.css` — that's the design-system layer.
- Gate every non-essential animation behind `@media (prefers-reduced-motion: no-preference)` so reduced-motion users see static final states.
- No build step, no bundler, no webfonts. System font stacks only (`--font-ui`, `--font-display`, `--font-mono`). All libs vendored under `assets/vendor/` for offline use.
