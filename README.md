<div align="center">

# telegram-mcp-worker

**Ultimate MCP server for Telegram Bot API — 185 methods, full v10.2 coverage, rich messages, meta-mode, rate limiting, circuit breaker — running on Cloudflare Workers.**

[![Stars](https://img.shields.io/github/stars/EngDawood/telegram-mcp-worker?style=flat-square)](https://github.com/EngDawood/telegram-mcp-worker/stargazers)
[![License](https://img.shields.io/github/license/EngDawood/telegram-mcp-worker?style=flat-square)](LICENSE)
[![Bot API](https://img.shields.io/badge/Telegram%20Bot%20API-10.2-26A5E4?style=flat-square&logo=telegram)](https://core.telegram.org/bots/api)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com)

</div>

185/185 Bot API methods with Zod validation, token masking, tool annotations, and zero bloat (2 dependencies) — 190 MCP tools in total, served over stateless Streamable HTTP. The same Worker also receives bot updates through a built-in webhook endpoint, so one deployment covers both sending and receiving.

**Live deployment:** `https://telegram-mcp-worker.dawod.workers.dev`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` or `/health` | GET | Plain-text status check |
| `/mcp` | POST | MCP endpoint (Streamable HTTP, stateless) |
| `/webhook` | POST | Telegram webhook receiver for bot updates |
| `/webhook` | GET | Webhook endpoint status check |

## What this fork adds

- **Worker entry point** (`src/worker.ts`) — the original MCP server served
  over Streamable HTTP on Cloudflare Workers, a fresh server per request.
- **Webhook receiver** (`POST /webhook`) — acknowledges updates and writes
  them to the Worker log (Cloudflare observability / `wrangler tail`),
  optionally verified with Telegram's secret-token header.
- **Bearer auth for `/mcp`** — when `MCP_AUTH_TOKEN` is set, clients must
  send `Authorization: Bearer <MCP_AUTH_TOKEN>`.
- **GitHub-connected deployment** — pushes to `main` deploy automatically
  from the Cloudflare dashboard.

Everything else — the tool registry with Zod validation, rate limiting,
circuit breaker, retry with backoff, token masking, meta-mode and the
`telegram_format` helper — is inherited from the original project (see the
fork notice at the end).

## Connect an MCP client

Point any MCP client at the hosted endpoint:

```json
{
  "mcpServers": {
    "telegram": {
      "url": "https://telegram-mcp-worker.dawod.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <your MCP_AUTH_TOKEN>"
      }
    }
  }
}
```

## Deploy your own

### Option A — Cloudflare dashboard (GitHub-connected)

1. Fork or clone this repo to your GitHub account.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Import a
   repository** and pick the repo. Pushes to `main` now deploy
   automatically.
3. Add the secrets below under **Settings → Variables and Secrets**.

### Option B — Wrangler

```bash
npm install
npx wrangler secret put TELEGRAM_BOT_TOKEN   # from @BotFather
npx wrangler secret put MCP_AUTH_TOKEN       # bearer token for /mcp
npx wrangler secret put WEBHOOK_SECRET       # webhook verification token
npm run worker:deploy
```

### Secrets

| Secret | Required | Purpose |
|--------|:---:|---------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `MCP_AUTH_TOKEN` | Recommended | Bearer token clients must send to `POST /mcp`. Without it the endpoint is open. |
| `WEBHOOK_SECRET` | Optional | When set, `POST /webhook` only accepts updates whose `X-Telegram-Bot-Api-Secret-Token` header matches it. Register the same value as the `setWebhook` `secret_token`. |

Optional plain variables (`TELEGRAM_DEFAULT_CHAT_ID`,
`TELEGRAM_DEFAULT_THREAD_ID`, `TELEGRAM_META_MODE` and the tuning knobs) are
documented in `src/config.ts`.

## Webhook

Register the webhook through the MCP server itself by calling the
`set_webhook` tool:

```json
{
  "url": "https://<your-worker>.workers.dev/webhook",
  "secret_token": "<same value as the WEBHOOK_SECRET secret>",
  "allowed_updates": ["message", "edited_message", "channel_post", "edited_channel_post", "callback_query", "inline_query"]
}
```

Notes:

- While a webhook is registered, Telegram rejects `get_updates` calls.
  Run the `delete_webhook` tool to go back to polling.
- `get_webhook_info` shows the registered URL, pending update count and
  the last delivery error, if any.
- The receiver currently logs updates; it does not reply to messages.

## Local development

```bash
npm install
npm run worker:dev    # wrangler dev — Worker build on localhost
npm run build         # tsc — also builds the original stdio server
npm test              # vitest
npm run typecheck
```

Create a `.dev.vars` file (git-ignored) with the same secret names for
local runs.

The original stdio build is unchanged and still available:

```bash
npm run build && npm start
```

## From source

The original stdio build still runs locally from source:

```bash
git clone https://github.com/EngDawood/telegram-mcp-worker.git
cd telegram-mcp-worker
npm install
npm run build
TELEGRAM_BOT_TOKEN=<your bot token> npm start
```

To run the Worker build locally from the same checkout instead:

```bash
npm run worker:dev
```

Put the secrets in a `.dev.vars` file first (see Local development above).

## Limitations on Workers

Features of the original Node build that rely on a local filesystem return
errors on Workers:

- Uploading files from local paths (sending by `file_id`, URL or bytes
  works as before)
- `download_file`
- The TRAIL log tools
- Mirroring URL media to disk

## Architecture

```text
MCP client ──POST /mcp (Bearer)──▶ Worker ──fetch──▶ api.telegram.org
Telegram   ──POST /webhook───────▶ Worker ──▶ update written to Worker log
```

- **Stateless per request.** Each `POST /mcp` builds a fresh MCP server on
  a web-standard Streamable HTTP transport with JSON responses. No session
  state is kept between requests, which is what makes the design fit
  Workers.
- **One server builder, two transports.** `buildServer(config)` in
  `src/server.ts` assembles the MCP server and the Telegram client from the
  configuration; the Worker entry (`src/worker.ts`) and the original stdio
  entry (`src/index.ts`) both use it unchanged.
- **Declarative tool registry.** All 185 Bot API methods are defined as
  data — name, Bot API endpoint, Zod input schema — and served by one
  generic handler, alongside the `telegram_format` helper, `download_file`
  and the TRAIL tools. With `TELEGRAM_META_MODE=true` the registry
  collapses into two meta-tools (`telegram_find` / `telegram_call`).
- **Telegram client.** A plain `fetch`-based Bot API client
  (`src/telegram-client.ts`) with global and per-chat rate limiting, a
  circuit breaker and retry with backoff. It also masks the bot token in
  every response and error.
- **Configuration.** `loadConfig` in `src/config.ts` maps the Worker's
  secrets/vars (or environment variables in the stdio build) into one
  validated config object.
- **Webhook path.** `POST /webhook` verifies the secret-token header when
  `WEBHOOK_SECRET` is set, writes the update JSON to the Worker log and
  acknowledges immediately with `{"ok": true}`.

| Path | What it is |
|------|------------|
| `src/worker.ts` | Cloudflare Worker entry: `/mcp`, `/webhook`, `/health` |
| `src/server.ts` | Builds the MCP server (shared by Worker and stdio builds) |
| `src/index.ts` | Original stdio entry point |
| `src/config.ts` | Environment/secrets loading and tuning knobs |
| `docs/` | Mirror of the official Bot API documentation |

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgments

This project is a fork of
[timoncool/telegram-api-mcp](https://github.com/timoncool/telegram-api-mcp)
(based on commit `34af6ba`), and it would not exist without the original
author's work. All credit for the original MCP server — the tool registry
covering the full Telegram Bot API and the stdio build — goes to
[@timoncool](https://github.com/timoncool). Thank you for building it and
for releasing it under the MIT license, which is preserved in
[LICENSE](LICENSE). This fork only adds the Cloudflare Worker conversion
(`src/worker.ts`), the `/webhook` receiver, and the deployment setup used
to run it at `telegram-mcp-worker.dawod.workers.dev`.
