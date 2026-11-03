/**
 * Server configuration from environment variables.
 */
export interface Config {
  /** Telegram Bot token from @BotFather */
  botToken: string;
  /** Default chat_id for all tools (optional) */
  defaultChatId?: string;
  /** Default message_thread_id for forum topics (optional) */
  defaultThreadId?: number;
  /** Global rate limit: max requests per second (default: 30, Telegram FAQ limit) */
  globalRateLimit: number;
  /** Per-chat rate limit: max messages per minute to same group (default: 20, Telegram FAQ limit) */
  perChatRateLimit: number;
  /** Max retry attempts on transient errors (default: 3) */
  maxRetries: number;
  /** Circuit breaker: consecutive failures to open circuit (default: 5) */
  circuitBreakerThreshold: number;
  /** Circuit breaker: cooldown in ms before half-open (default: 30000) */
  circuitBreakerCooldown: number;
  /** Allowed directories for file uploads (comma-separated, empty = no restriction) */
  allowedUploadDirs: string[];
  /** Max file size in bytes (default: 50MB) */
  maxFileSize: number;
  /** Run in meta-mode with 2 tools instead of all (default: false) */
  metaMode: boolean;
}

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const token = source.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is required. Get one from @BotFather: https://t.me/BotFather"
    );
  }

  const threadId = source.TELEGRAM_DEFAULT_THREAD_ID;

  const uploadDirs = source.TELEGRAM_ALLOWED_UPLOAD_DIRS;

  return {
    botToken: token,
    defaultChatId: source.TELEGRAM_DEFAULT_CHAT_ID || undefined,
    defaultThreadId: threadId ? parseInt(threadId, 10) : undefined,
    globalRateLimit: parseInt(source.TELEGRAM_GLOBAL_RATE_LIMIT || "30", 10),
    perChatRateLimit: parseInt(source.TELEGRAM_PER_CHAT_RATE_LIMIT || "20", 10),
    maxRetries: parseInt(source.TELEGRAM_MAX_RETRIES || "3", 10),
    circuitBreakerThreshold: parseInt(source.TELEGRAM_CB_THRESHOLD || "5", 10),
    circuitBreakerCooldown: parseInt(source.TELEGRAM_CB_COOLDOWN || "30000", 10),
    allowedUploadDirs: uploadDirs ? uploadDirs.split(",").map((d) => d.trim()) : [],
    maxFileSize: parseInt(source.TELEGRAM_MAX_FILE_SIZE || String(50 * 1024 * 1024), 10),
    metaMode: source.TELEGRAM_META_MODE === "true",
  };
}
