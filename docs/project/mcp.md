# MCP surface

Everything a client or plugin consumer needs about this codebase's MCP
interface. For internals see [codebase.md](codebase.md).

## Hosted endpoint

| | |
|---|---|
| URL | `https://telegram-mcp-worker.dawod.workers.dev/mcp` |
| Transport | Streamable HTTP, stateless, JSON responses |
| Auth | `Authorization: Bearer <MCP_AUTH_TOKEN>` (401 when missing/wrong) |
| Tools | 191 — the 185 Bot API methods plus `telegram_format`, `download_file`, `get_message_file` and 3 TRAIL tools |

Client config (`.mcp.json`):

```json
{
  "mcpServers": {
    "telegram": {
      "type": "http",
      "url": "https://telegram-mcp-worker.dawod.workers.dev/mcp",
      "headers": { "Authorization": "Bearer ${MCP_AUTH_TOKEN}" }
    }
  }
}
```

## Meta-mode

With `TELEGRAM_META_MODE=true` on the server, the 185 Bot API tools collapse into
two: `telegram_find` (search the registry) and `telegram_call` (invoke a
method by name with its schema). Same coverage, ~99% fewer tool tokens.

## Claude plugin

This repo is a Claude plugin and its own marketplace:

- `.claude-plugin/plugin.json` — plugin manifest
- `.claude-plugin/marketplace.json` — marketplace listing (source `./`)
- `.mcp.json` — registers the hosted endpoint above
- `skills/telegram-mcp-worker/SKILL.md` — the agent skill shipped with
  the plugin (also linked from `.claude/skills/`)

Install in Claude Code:

```text
/plugin marketplace add EngDawood/telegram-mcp-worker
/plugin install telegram-mcp-worker@telegram-mcp-worker
```

## Self-hosting the endpoint

Deploy the Worker (see the README's Deploy section), set the
`TELEGRAM_BOT_TOKEN` and `MCP_AUTH_TOKEN` secrets, and point the client
`url` at your own `https://<your-worker>.workers.dev/mcp`. The stdio
build (`npm run build && npm start`) exposes the identical tool surface
over stdio for local clients.
