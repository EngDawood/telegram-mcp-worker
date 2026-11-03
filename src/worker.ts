/**
 * Cloudflare Worker entry point.
 *
 * Exposes the same MCP server as the stdio build (src/index.ts) over
 * stateless Streamable HTTP at POST /mcp, using the SDK's web-standard
 * transport. A fresh server is built per request; no session state is kept.
 *
 * Secrets (wrangler secret put / .dev.vars):
 *   TELEGRAM_BOT_TOKEN  — required, from @BotFather
 *   MCP_AUTH_TOKEN      — optional; when set, clients must send
 *                         `Authorization: Bearer <MCP_AUTH_TOKEN>`
 * Optional vars: TELEGRAM_DEFAULT_CHAT_ID, TELEGRAM_DEFAULT_THREAD_ID,
 * TELEGRAM_META_MODE ("true" = 2 meta-tools instead of all methods), and the
 * TELEGRAM_* tuning knobs documented in src/config.ts.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

export interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  MCP_AUTH_TOKEN?: string;
  [key: string]: string | undefined;
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

    if (url.pathname !== "/mcp") {
      return json({ error: "not_found" }, 404);
    }

    if (env.MCP_AUTH_TOKEN) {
      if (request.headers.get("authorization") !== `Bearer ${env.MCP_AUTH_TOKEN}`) {
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
