import { log, warn } from "@/lib/server/log";

// Use globalThis to persist across hot-module reloads in dev.
// NOTE: On serverless platforms (Vercel, AWS Lambda) each cold start gets a
// fresh Map, so this limiter is best-effort only. For stronger protection use
// platform-level rate limiting (e.g. Vercel WAF, Cloudflare Rate Limiting).
const globalForRateLimit = globalThis as unknown as {
  rateLimitHits?: Map<string, { count: number; resetAt: number }>;
};

const hits = (globalForRateLimit.rateLimitHits ??= new Map());

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(
  key: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();

  // Clean up expired entries
  for (const [k, v] of hits) {
    if (v.resetAt <= now) hits.delete(k);
  }

  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    warn(`[rate-limit] BLOCKED ${key}: ${entry.count}/${limit} hits, retry in ${retryAfter}s`);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  log(`[rate-limit] ${key}: ${entry.count}/${limit} hits`);
  return { allowed: true };
}

export function parseClientIp(xForwardedFor: string | null, fallback?: string): string {
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0].trim();
    if (first) return first;
  }
  return fallback ?? "unknown";
}
