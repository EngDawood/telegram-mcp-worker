# docs/

Two kinds of files live here. Do not mix them up.

## Codebase documentation (hand-written, this fork)

- [codebase.md](codebase.md) — how this codebase actually works: entry
  points, request flow, the tool registry, full configuration reference
  with defaults, the webhook receiver, and the Worker limits.

## Bot API mirror (generated — do not hand-edit)

Everything else in this folder is a mirror of the official Telegram Bot
API documentation, downloaded from core.telegram.org and used by
`npm run audit` to prove the tool registry matches the official spec:

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

## Historical

- `gap-analysis.md` — a pre-project analysis of other Telegram MCP
  servers against Bot API 9.6. Kept for history; it does not describe
  this codebase, which covers 185/185 methods at Bot API 10.2.
