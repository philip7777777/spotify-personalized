/**
 * Wraps fetch with handling for Spotify's rate limiting:
 *
 * - If Spotify returns a 429 with a short Retry-After (a few seconds),
 *   waits and retries once.
 * - If Retry-After is long (Spotify sometimes imposes multi-hour quota
 *   penalties after repeated abuse), we do NOT wait/retry inline — instead
 *   we record a shared "rate limited until" timestamp and immediately
 *   short-circuit *all* subsequent Spotify API calls (across requests,
 *   since this runs server-side) until that time passes. This stops the
 *   app from digging the hole deeper while a long penalty is active.
 */

const SHORT_RETRY_CAP_SECONDS = 10;

// Module-level state persists across requests within the same server
// process (fine for a single-instance/dev deployment; safe fallback of
// "just try again" if the process restarts).
let rateLimitedUntil = 0;

export class SpotifyRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Spotify rate limited for ${retryAfterSeconds}s`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function spotifyFetch(
  url: string,
  init: RequestInit,
  maxRetries = 1,
): Promise<Response> {
  const now = Date.now();
  if (rateLimitedUntil > now) {
    throw new SpotifyRateLimitError(Math.ceil((rateLimitedUntil - now) / 1000));
  }

  let res = await fetch(url, init);

  let retries = 0;
  while (res.status === 429) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || 1 : 1;

    if (retryAfterSeconds > SHORT_RETRY_CAP_SECONDS) {
      // Long penalty — stop hitting Spotify entirely until it clears.
      rateLimitedUntil = Date.now() + retryAfterSeconds * 1000;
      throw new SpotifyRateLimitError(retryAfterSeconds);
    }

    if (retries >= maxRetries) break;

    await new Promise((resolve) =>
      setTimeout(resolve, retryAfterSeconds * 1000),
    );
    res = await fetch(url, init);
    retries++;
  }

  return res;
}

/**
 * Human-friendly formatting for a retry-after duration in seconds.
 */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

/**
 * Very small in-memory response cache, keyed by an arbitrary string
 * (e.g. `${userId}:tracks`). Reduces how often we hit Spotify for data
 * that doesn't change often, which matters a lot given how easily their
 * rate limit is triggered. Not persisted — resets on server restart.
 */
const cache = new Map<string, { data: unknown; expiresAt: number }>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

