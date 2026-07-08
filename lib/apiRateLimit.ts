import { createHash } from 'crypto';

/**
 * In-memory fixed-window rate limiter for the public v1 API (P2 — sécu #3).
 *
 * Buckets are keyed per API key (bearer token hash) so each credential gets
 * its own quota, falling back to the client IP for unauthenticated requests.
 *
 * CAVEAT: state lives in process memory, so on a multi-instance / serverless
 * deployment the effective limit is per-instance, not global. Swap the store
 * for Redis/Upstash if a distributed limit is required.
 */

const WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 120; // requests per window

function maxPerWindow(): number {
  const raw = parseInt(process.env.API_RATE_LIMIT_PER_MIN || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX;
}

const store = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number; // seconds until the window resets (0 when allowed)
}

/**
 * Derive a stable bucket identity from the request.
 * Prefers the bearer token (per-key quota); falls back to client IP.
 */
export function rateLimitIdentity(request: Request): string {
  const auth = request.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.substring(7);
    if (token) return `k:${createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
  }
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

/** Consume one unit for `identity`. Fixed 1-minute window. */
export function checkApiRateLimit(identity: string): RateLimitResult {
  const limit = maxPerWindow();
  const now = Date.now();

  // Opportunistic cleanup to bound memory under key churn.
  if (store.size > 10000) {
    for (const [key, rec] of store.entries()) {
      if (now > rec.resetAt) store.delete(key);
    }
  }

  const rec = store.get(identity);
  if (!rec || now > rec.resetAt) {
    store.set(identity, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, limit, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (rec.count >= limit) {
    return { allowed: false, limit, remaining: 0, retryAfterSec: Math.ceil((rec.resetAt - now) / 1000) };
  }

  rec.count += 1;
  return { allowed: true, limit, remaining: limit - rec.count, retryAfterSec: 0 };
}
