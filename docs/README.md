# docs/

Organized by kind. Do not mix generated files with hand-written ones.

## `project/` — codebase documentation (hand-written, this fork)

- [project/codebase.md](project/codebase.md) — how this codebase actually
  works: entry points, request flow, the tool registry, full
  configuration reference with defaults, the webhook receiver, and the
  Worker limits.
- [project/mcp.md](project/mcp.md) — the MCP surface: hosted endpoint,
  client config, meta-mode, and the Claude plugin packaging.

## `bot-api/` — official Bot API mirror (generated, do not hand-edit)

A mirror of the official Telegram Bot API documentation, downloaded from
core.telegram.org and used by `npm run audit` to prove the tool registry
matches the official spec:

- `raw-*.html` — the official Bot API pages, as published
- `bot-api-methods.md` — the method list generated from those pages
  (Bot API version in `api-version.txt`, currently 10.2, 185 methods)
- `api-params.json`, `official-method-list.txt`, `official-type-list.txt`
  — machine-readable extracts for the audit

Regenerate the whole mirror with:

```bash
npm run docs:refresh
```

Hand edits to generated files are lost on the next refresh and can break
the audit.

## `history/` — historical documents

- [history/gap-analysis.md](history/gap-analysis.md) — a pre-project
  analysis of other Telegram MCP servers against Bot API 9.6. Kept for
  history; it does not describe this codebase, which covers 185/185
  methods at Bot API 10.2.
