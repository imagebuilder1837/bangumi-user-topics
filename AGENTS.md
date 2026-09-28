# Repository instructions

## Always-on constraints

- Preserve Bangumi's host DOM and runtime state. Extend native UI patterns; do not replace the host page body. See `docs/spec/host-view.md` before changing page integration.
- Userscript metadata and version fields are human-managed; require explicit, per-field approval before changing them. See `docs/agents/metadata.md`.
- Issue writes are read-only by default; write only when explicitly requested or authorized by a relevant skill. See `docs/agents/issue-tracker.md`.
- Use Conventional Commits. Before a commit, run `npm run check` on the final change state; see `docs/development.md` for the workflow.

## Task-specific guides

- Before SearchEncore, route, or user-page UI implementation, follow the constraints in `docs/spec/` (data and scheduling semantics in `spec/feed.md`, view behavior in `spec/ui.md`).
- For code changes, use `docs/module-guide.md` to locate maintained sources. `src/index.user.js` is generated; do not load the entire artifact by default.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues via `gh`; issue writes are read-only by default. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
