/**
 * Cloudflare Worker entry point.
 *
 * Exposes the same MCP server as the stdio build (src/index.ts) over
 * stateless Streamable HTTP at POST /mcp, using the SDK's web-standard
 * transport. A fresh server is built per request; no session state is kept.
 *
 * Secrets (wrangler secret put / .dev.vars):
 *   TELEGRAM_BOT_TOKEN  — required, from @BotFather
 *   MCP_AUTH_TOKEN      — optional; when set, clients must send the token
 *                         in one of: `Authorization: Bearer <MCP_AUTH_TOKEN>`,
 *                         `x-api-key: <MCP_AUTH_TOKEN>`,
 *                         `api-key: <MCP_AUTH_TOKEN>` or the URL query
 *                         `?token=<MCP_AUTH_TOKEN>` (same token, any form
 *                         the client supports).
 *   WEBHOOK_SECRET      — optional; when set, POST /webhook only accepts
 *                         updates whose `X-Telegram-Bot-Api-Secret-Token`
 *                         header matches (register the same value as the
 *                         setWebhook secret_token).
 *
 * Webhook: point the bot's webhook at POST /webhook on this worker (via the
 * set_webhook MCP tool). Updates are written to the worker log (Workers
 * observability / wrangler tail). While a webhook is set, get_updates
 * returns an error on Telegram's side, so delete the webhook first if you
 * want to poll again.
 * Optional vars: TELEGRAM_DEFAULT_CHAT_ID, TELEGRAM_DEFAULT_THREAD_ID,
 * TELEGRAM_META_MODE ("true" = 2 meta-tools instead of all methods), and the
 * TELEGRAM_* tuning knobs documented in src/config.ts.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "./core/config.js";
import { buildServer } from "./mcp/server.js";

export interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  MCP_AUTH_TOKEN?: string;
  WEBHOOK_SECRET?: string;
  [key: string]: string | undefined;
}

/**
 * A request is authorized when it carries the MCP_AUTH_TOKEN in any of the
 * credential forms MCP clients commonly support: Bearer authorization, the
 * `x-api-key` or `api-key` headers, or a `?token=` query parameter (for
 * URL-only clients; headers are preferred because URLs get logged). Header
 * names are case-insensitive (Headers normalizes them); the token value
 * must match exactly.
 */
function isAuthorized(request: Request, token: string): boolean {
  if (request.headers.get("authorization") === `Bearer ${token}`) return true;
  if (request.headers.get("x-api-key") === token) return true;
  if (request.headers.get("api-key") === token) return true;
  if (new URL(request.url).searchParams.get("token") === token) return true;
  return false;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        "telegram-api-mcp worker is running. MCP endpoint: POST /mcp\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }

    if (url.pathname === "/webhook") {
      if (request.method === "GET") {
        return new Response(
          "telegram webhook endpoint is active. Telegram delivers updates via POST.\n",
          { headers: { "content-type": "text/plain; charset=utf-8" } }
        );
      }
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
      }
      if (env.WEBHOOK_SECRET) {
        if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
          return json({ error: "unauthorized" }, 401);
        }
      }
      let update: unknown;
      try {
        update = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      // v1 receiver: acknowledge fast and keep the update in the worker log
      // (visible in the Cloudflare dashboard observability / wrangler tail).
      console.log("telegram_update", JSON.stringify(update));
      return json({ ok: true });
    }

    if (url.pathname !== "/mcp") {
      return json({ error: "not_found" }, 404);
    }

    if (env.MCP_AUTH_TOKEN) {
      if (!isAuthorized(request, env.MCP_AUTH_TOKEN)) {
        return json({ error: "unauthorized" }, 401);
      }
    }

    let config;
    try {
      config = loadConfig(env as Record<string, string | undefined>);
    } catch (error) {
      return json({ error: "server_misconfigured", message: (error as Error).message }, 500);
    }

    const { server, client } = buildServer(config);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } finally {
      client.destroy();
      await server.close().catch(() => undefined);
    }
  },
};
