import { describe, it, expect } from "vitest";
import worker, { type Env } from "../src/worker.js";

// Auth gate seam: POST /mcp. The test env deliberately omits
// TELEGRAM_BOT_TOKEN, so a request that PASSES the auth gate fails later
// with 500 server_misconfigured, while a rejected one stops at 401.
const env: Env = { MCP_AUTH_TOKEN: "test-secret" };

function mcpRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://worker.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
}

describe("Worker /mcp auth", () => {
  it("rejects a request with no credentials", async () => {
    const res = await worker.fetch(mcpRequest(), env);
    expect(res.status).toBe(401);
  });

  it("accepts Authorization: Bearer <token>", async () => {
    const res = await worker.fetch(
      mcpRequest({ authorization: "Bearer test-secret" }),
      env
    );
    expect(res.status).not.toBe(401);
  });

  it("rejects a wrong Bearer token", async () => {
    const res = await worker.fetch(
      mcpRequest({ authorization: "Bearer wrong" }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("accepts x-api-key: <token>", async () => {
    const res = await worker.fetch(
      mcpRequest({ "x-api-key": "test-secret" }),
      env
    );
    expect(res.status).not.toBe(401);
  });

  it("rejects a wrong x-api-key", async () => {
    const res = await worker.fetch(
      mcpRequest({ "x-api-key": "wrong" }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("accepts api-key: <token>", async () => {
    const res = await worker.fetch(
      mcpRequest({ "api-key": "test-secret" }),
      env
    );
    expect(res.status).not.toBe(401);
  });

  it("rejects a wrong api-key", async () => {
    const res = await worker.fetch(mcpRequest({ "api-key": "wrong" }), env);
    expect(res.status).toBe(401);
  });
});
