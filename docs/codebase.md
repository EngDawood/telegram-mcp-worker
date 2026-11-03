# Codebase

How `telegram-mcp-worker` works, as the code stands. For installation and
usage see the top-level [README](../README.md).

## Entry points

| Entry | File | Transport |
|-------|------|-----------|
| Cloudflare Worker | `src/worker.ts` | Streamable HTTP (stateless) |
| stdio (original) | `src/index.ts` | stdio |

Both call `buildServer(config)` from `src/server.ts`, which assembles one
MCP server plus one Telegram client from a single config object. Nothing
in the server or registry code knows which transport is in use.

## Worker request flow

`src/worker.ts` routes by path:

| Path | Behaviour |
|------|-----------|
| `GET /`, `GET /health` | Plain-text status |
| `POST /mcp` | Bearer check (when `MCP_AUTH_TOKEN` is set), then a fresh MCP server per request on the SDK's web-standard Streamable HTTP transport, JSON responses, no session |
| `POST /webhook` | Telegram update receiver (below) |
| `GET /webhook` | Plain-text status of the webhook endpoint |
| anything else | `404 {"error":"not_found"}` |

## Tool registry

All 185 Bot API methods are declared as data — tool name, Bot API
endpoint, Zod input schema, annotations — and executed by one generic
handler in `src/server.ts`. Adding a Bot API method means adding a
registry entry, not a new function. On top of the registry the server
exposes:

- `telegram_format` — explains the exact JSON shape of complex payloads
  (also as MCP resources under `telegram://format/…`)
- `download_file` and the TRAIL tools
- Meta-mode: with `TELEGRAM_META_MODE=true`, the registry collapses into
  `telegram_find` + `telegram_call` to save context tokens

`npm run audit` rebuilds and diffs the registry against the official
docs mirror in this folder; any drift fails the audit.

## Telegram client

`src/telegram-client.ts` is a plain `fetch` client for
`api.telegram.org` with:

- Rate limiting — global token bucket (default 30 req/s) plus a per-chat
  bucket (default 20 msg/min)
- Circuit breaker — opens after repeated failures (default threshold 5,
  cooldown 30 s), half-open recovery
- Retries with backoff (default 3), honouring Telegram's 429
  `retry_after`
- Token masking — the bot token is scrubbed from responses, logs and
  errors

## Configuration

`loadConfig` in `src/config.ts` reads one flat environment map — Worker
secrets/vars in the Worker build, process env in the stdio build.

### Secrets

| Name | Required | Purpose |
|------|:---:|---------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather; startup fails without it |
| `MCP_AUTH_TOKEN` | No | When set, `POST /mcp` requires `Authorization: Bearer <token>` |
| `WEBHOOK_SECRET` | No | When set, `POST /webhook` requires the matching `X-Telegram-Bot-Api-Secret-Token` header |

### Variables (with defaults from `src/config.ts`)

| Name | Default | Purpose |
|------|---------|---------|
| `TELEGRAM_DEFAULT_CHAT_ID` | — | Chat used when a call omits `chat_id` |
| `TELEGRAM_DEFAULT_THREAD_ID` | — | Forum thread used by default |
| `TELEGRAM_META_MODE` | `false` | `true` collapses tools into the two meta-tools |
| `TELEGRAM_GLOBAL_RATE_LIMIT` | `30` | Global requests per second |
| `TELEGRAM_PER_CHAT_RATE_LIMIT` | `20` | Messages per chat per minute |
| `TELEGRAM_MAX_RETRIES` | `3` | Retry attempts per Bot API call |
| `TELEGRAM_CB_THRESHOLD` | `5` | Failures before the circuit breaker opens |
| `TELEGRAM_CB_COOLDOWN` | `30000` | Breaker cooldown in ms |
| `TELEGRAM_MAX_FILE_SIZE` | `52428800` | Max upload size in bytes (50 MB) |
| `TELEGRAM_ALLOWED_UPLOAD_DIRS` | — | Comma-separated dirs the stdio build may upload from |

## Webhook receiver

`POST /webhook` in `src/worker.ts`:

1. If `WEBHOOK_SECRET` is set, reject any request whose
   `X-Telegram-Bot-Api-Secret-Token` header differs (`401`).
2. Parse the update JSON (`400` on invalid JSON).
3. Write the update to the Worker log as `telegram_update …` (visible in
   the Cloudflare dashboard observability and `wrangler tail`).
4. Acknowledge immediately with `200 {"ok": true}`.

Register it by calling the `set_webhook` tool with this Worker's
`/webhook` URL and the same secret value. While a webhook is registered,
Telegram rejects `get_updates`; `delete_webhook` restores polling.

## Worker limits

The Worker runtime has no local filesystem, so features of the stdio
build that rely on `node:fs` return errors when called on the Worker:
uploads from local paths, `download_file`, the TRAIL log tools, and
mirroring URL media to disk. Everything addressed by `file_id`, URL or
bytes works.

## Plugin packaging

The repo doubles as a Claude plugin: `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` describe it, `.mcp.json` registers the
hosted Worker endpoint, and the agent skill lives at
`skills/telegram-mcp-worker/SKILL.md` (also linked from `.claude/skills/`).
