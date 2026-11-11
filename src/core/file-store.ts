/**
 * Temporary file storage for runtimes without a local filesystem.
 *
 * The Worker build keeps downloaded Telegram files in an R2 bucket and hands
 * the caller a short-lived URL served by the Worker itself (GET /files/<key>).
 * Each key carries a random UUID, so the URL is unguessable; objects older
 * than the TTL are refused and deleted on access. Add an R2 lifecycle rule on
 * the `tmp/` prefix to also purge files nobody fetched.
 */

export interface StoredFile {
  /** Public URL the caller can download the file from. */
  url: string;
  /** ISO timestamp after which the URL stops working. */
  expiresAt: string;
  size: number;
  contentType: string;
}

export interface FileStore {
  save(fileName: string, data: ArrayBuffer): Promise<StoredFile>;
}

/** The subset of the R2 bucket binding this module uses. */
export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
}

export interface R2ObjectLike {
  body: ReadableStream;
  size: number;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}

export const DEFAULT_FILE_TTL_SECONDS = 3600;
const KEY_PREFIX = "tmp/";
const ROUTE_PREFIX = "/files/";

/**
 * Types served inline. Anything else (HTML, SVG, scripts, unknown) goes out
 * as an octet-stream attachment so stored content can never run on the
 * Worker's origin.
 */
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
  zip: "application/zip",
};
const FALLBACK_TYPE = "application/octet-stream";

export function contentTypeFor(fileName: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  return CONTENT_TYPES[ext] ?? FALLBACK_TYPE;
}

/** Reduce a file name to a safe single path segment. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-120);
  return clean || "file";
}

export function parseTtl(raw: string | undefined): number {
  const ttl = parseInt(raw ?? "", 10);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_FILE_TTL_SECONDS;
}

export class R2FileStore implements FileStore {
  constructor(
    private bucket: R2BucketLike,
    private origin: string,
    private ttlSeconds: number = DEFAULT_FILE_TTL_SECONDS
  ) {}

  async save(fileName: string, data: ArrayBuffer): Promise<StoredFile> {
    const name = sanitizeFileName(fileName);
    const contentType = contentTypeFor(name);
    const path = `${crypto.randomUUID()}/${name}`;
    await this.bucket.put(KEY_PREFIX + path, data, { httpMetadata: { contentType } });
    return {
      url: `${this.origin}${ROUTE_PREFIX}${path}`,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000).toISOString(),
      size: data.byteLength,
      contentType,
    };
  }
}

/** Handle GET /files/<uuid>/<name>. Returns null when the path is not a file route. */
export async function serveStoredFile(
  request: Request,
  bucket: R2BucketLike | undefined,
  ttlSeconds: number = DEFAULT_FILE_TTL_SECONDS
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(ROUTE_PREFIX)) return null;

  const notFound = () =>
    new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const path = decodeURIComponent(pathname.slice(ROUTE_PREFIX.length));
  // Exactly "<uuid>/<name>": nothing else in the bucket is reachable.
  if (!bucket || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(path)) return notFound();

  const key = KEY_PREFIX + path;
  const object = await bucket.get(key);
  if (!object) return notFound();

  if (Date.now() - object.uploaded.getTime() > ttlSeconds * 1000) {
    await bucket.delete(key).catch(() => undefined);
    return notFound();
  }

  const contentType = object.httpMetadata?.contentType ?? FALLBACK_TYPE;
  const headers: Record<string, string> = {
    "content-type": contentType,
    "content-length": String(object.size),
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
  };
  if (contentType === FALLBACK_TYPE) {
    headers["content-disposition"] = `attachment; filename="${path.split("/")[1]}"`;
  }
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}
