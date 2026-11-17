---
name: telegram-mcp-worker
description: Send and receive Telegram messages through the telegram-mcp-worker MCP server (the full Bot API through 8 tools in meta-mode on a Cloudflare Worker). Use whenever the task involves Telegram — sending a message, photo, document or poll to a chat, reading a chat or the bot's updates, checking webhook status, or formatting rich Telegram content.
---

# Telegram via telegram-mcp-worker

The `telegram` MCP server exposes the whole Telegram Bot API. The bot
token lives inside the Worker; you never need it, and you must never ask
the user for it. If a call fails with 401, the client's `MCP_AUTH_TOKEN`
environment variable is missing or wrong — say that instead.

It runs in meta-mode (8 tools): find a method with `telegram_find`, then
call it through `telegram_call` with its camelCase Bot API name (e.g.
`getMe`, `sendMessage`) and a `params` object. The snake_case names in the
sections below are the pre-meta-mode tool names — the method they map to
is the camelCase form (`send_message` → `sendMessage`,
`get_webhook_info` → `getWebhookInfo`).

## First check

Call `telegram_call` with `{"method": "getMe"}` once per session before
other work. It proves the whole
chain (client → Worker → Telegram) and returns the bot's username and id.

## Sending

- `send_message` — text up to 4096 characters. `chat_id` is a numeric id
  or a public `@username`. If the server was configured with a default
  chat, `chat_id` may be omitted.
- Longer or structured posts: `send_rich_message` (up to 32768 characters,
  headings, tables, lists, media). Documents, photos, video and audio go
  through `send_document`, `send_photo`, `send_video`, `send_audio` —
  prefer `file_id` or URL arguments; uploads from local paths fail on the
  Worker.
- Before building any non-trivial payload (`rich_message`, `media`,
  `reply_markup`, `poll`, inline keyboards), call `telegram_format` for
  that topic first and follow the shape it returns exactly. Never guess
  Telegram's JSON shapes.

## Receiving

- A webhook is registered for this bot, so `get_updates` returns an error
  — that is expected, not a fault. Incoming updates are written to the
  Worker log (Cloudflare dashboard → the Worker → Logs).
- `get_webhook_info` shows the registered URL, pending update count and
  the last delivery error. Use it to diagnose delivery problems.
- Only suggest `delete_webhook` if the user explicitly wants to go back
  to polling with `get_updates`.

## Reading chats

- `get_chat` for chat details, `get_chat_member` / `get_chat_administrators`
  for membership, `get_chat_history`-style reads are not part of the Bot
  API — bots only see updates addressed to them, not full history.

## Meta-mode

The server runs in meta-mode: only `telegram_find` and `telegram_call`
(plus `telegram_format`, `download_file`, `get_message_file` and the TRAIL
tools) are visible. Find the method name with `telegram_find`, check its
schema, then invoke it through `telegram_call` — e.g.
`{"method": "getMe"}` or
`{"method": "sendMessage", "params": {"chat_id": "...", "text": "..."}}`.

## Limits to respect

- The Worker cannot run filesystem tools: local-path uploads and the
  TRAIL log tools return errors. Work around them with `file_id`/URL-based
  calls.
- To get a file out of Telegram: `download_file` (by `file_id`) or
  `get_message_file` (by chat + message ID; for `t.me/c/1234567890/150`
  use `from_chat_id` `-1001234567890`, `message_id` `150`). Both return a
  download URL that expires after about an hour, so fetch it promptly.
  The Bot API has no "read message by ID" method; `get_message_file` is
  the way to reach an old message's file.
- Respect Telegram rate limits the server reports (429 with
  `retry_after`); do not retry in a tight loop.
