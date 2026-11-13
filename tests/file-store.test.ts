import { describe, it, expect, vi } from "vitest";
import worker, { type Env } from "../src/worker.js";
import {
  R2FileStore,
  R2BucketLike,
  R2ObjectLike,
  contentTypeFor,
  sanitizeFileName,
} from "../src/core/file-store.js";
import { extractMedia } from "../src/mcp/server.js";

/** In-memory stand-in for an R2 bucket. */
function fakeBucket() {
  const objects = new Map<string, { data: ArrayBuffer; uploaded: Date; contentType?: string }>();
  const bucket: R2BucketLike = {
    async put(key, value, options) {
      objects.set(key, { data: value, uploaded: new Date(), contentType: options?.httpMetadata?.contentType });
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        body: new Response(o.data).body!,
        size: o.data.byteLength,
        uploaded: o.uploaded,
        httpMetadata: { contentType: o.contentType },
      } satisfies R2ObjectLike;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  return { bucket, objects };
}

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe("file store", () => {
  it("round-trips a file through save and GET /files", async () => {
    const { bucket } = fakeBucket();
    const store = new R2FileStore(bucket, "https://worker.test", 60);
    const stored = await store.save("photos/file_12.jpg", bytes("jpeg-bytes"));

    expect(stored.url).toMatch(/^https:\/\/worker\.test\/files\/[0-9a-f-]{36}\/file_12\.jpg$/);
    expect(stored.contentType).toBe("image/jpeg");

    const env: Env = { FILES: bucket };
    const res = await worker.fetch(new Request(stored.url), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(await res.text()).toBe("jpeg-bytes");
  });

  it("refuses and deletes an expired file", async () => {
    const { bucket, objects } = fakeBucket();
    const stored = await new R2FileStore(bucket, "https://worker.test").save("a.png", bytes("x"));
    for (const o of objects.values()) o.uploaded = new Date(Date.now() - 2 * 3600 * 1000);

    const res = await worker.fetch(new Request(stored.url), { FILES: bucket });
    expect(res.status).toBe(404);
    expect(objects.size).toBe(0);
  });

  it("serves unknown types as attachments, never as HTML", async () => {
    const { bucket } = fakeBucket();
    const stored = await new R2FileStore(bucket, "https://worker.test").save("page.html", bytes("<script>"));
    const res = await worker.fetch(new Request(stored.url), { FILES: bucket });
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns 404 for unknown keys, bad paths and a missing binding", async () => {
    const { bucket } = fakeBucket();
    const id = "00000000-0000-0000-0000-000000000000";
    for (const [path, env] of [
      [`/files/${id}/nope.jpg`, { FILES: bucket }],
      ["/files/other-prefix.jpg", { FILES: bucket }],
      [`/files/${id}/a.jpg`, {}],
    ] as [string, Env][]) {
      const res = await worker.fetch(new Request(`https://worker.test${path}`), env);
      expect(res.status).toBe(404);
    }
  });

  it("sanitizes names and maps content types", () => {
    expect(sanitizeFileName("../../etc/pass wd")).toBe("pass_wd");
    expect(sanitizeFileName("...")).toBe("file");
    expect(contentTypeFor("clip.MP4")).toBe("video/mp4");
    expect(contentTypeFor("noext")).toBe("application/octet-stream");
  });
});

describe("extractMedia", () => {
  it("picks the largest photo size", () => {
    const media = extractMedia({ photo: [{ file_id: "small" }, { file_id: "big" }] });
    expect(media).toEqual({ kind: "photo", fileId: "big" });
  });

  it("keeps a document's original file name", () => {
    const media = extractMedia({ document: { file_id: "d1", file_name: "report.pdf" } });
    expect(media).toEqual({ kind: "document", fileId: "d1", fileName: "report.pdf" });
  });

  it("returns null for a text-only message", () => {
    expect(extractMedia({ text: "hi" })).toBeNull();
  });
});

describe("get_message_file over /mcp", () => {
  it("forwards, deletes the copy, stores the file and returns a working URL", async () => {
    const { bucket } = fakeBucket();
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }));
      if (url.endsWith("/forwardMessage")) {
        calls.push(`forward ${String(init?.body)}`);
        return ok({ message_id: 77, photo: [{ file_id: "s" }, { file_id: "BIG" }] });
      }
      if (url.endsWith("/deleteMessage")) {
        calls.push(`delete ${String(init?.body)}`);
        return ok(true);
      }
      if (url.endsWith("/getFile")) return ok({ file_id: "BIG", file_path: "photos/file_9.jpg" });
      if (url.includes("/file/bot")) return new Response("IMG");
      return realFetch(input, init);
    });

    try {
      const env: Env = { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_DEFAULT_CHAT_ID: "42", FILES: bucket };
      const res = await worker.fetch(
        new Request("https://worker.test/mcp", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_message_file", arguments: { from_chat_id: -1004491533337, message_id: 150 } },
          }),
        }),
        env
      );
      const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
      expect(body.result.isError).toBeFalsy();
      const out = JSON.parse(body.result.content[0].text);
      expect(out.file_id).toBe("BIG");
      expect(out.kind).toBe("photo");
      expect(calls[0]).toContain('"chat_id":"42"');
      expect(calls[0]).toContain('"message_id":150');
      expect(calls[1]).toContain('"message_id":77');

      const file = await worker.fetch(new Request(out.url), env);
      expect(await file.text()).toBe("IMG");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
