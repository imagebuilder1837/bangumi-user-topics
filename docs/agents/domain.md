# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, proceed silently. Don't flag their absence or suggest creating them upfront; domain docs are created lazily when terms or decisions are resolved.

## File structure

Single-context repo (this repo):

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Multi-context repos use a root `CONTEXT-MAP.md`, system-wide `docs/adr/`, and per-context `CONTEXT.md` / `docs/adr/`.

## Use the glossary's vocabulary

When output names a domain concept, use the term defined in `CONTEXT.md`. If a needed concept is missing, reconsider the terminology or note the gap for domain modeling.

## Flag ADR conflicts

If output contradicts an existing ADR, surface that explicitly rather than silently overriding it.
