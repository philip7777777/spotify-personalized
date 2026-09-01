/**
 * Wraps fetch with basic handling for Spotify's rate limiting: if a 429
 * is returned, waits for the duration in the Retry-After header (capped)
 * and retries once. Spotify's Web API returns Retry-After in seconds.
 */
export async function spotifyFetch(
  url: string,
  init: RequestInit,
  maxRetries = 1,
): Promise<Response> {
  let res = await fetch(url, init);

  let retries = 0;
  while (res.status === 429 && retries < maxRetries) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader
      ? Math.min(Number(retryAfterHeader) || 1, 10)
      : 1;
    await new Promise((resolve) =>
      setTimeout(resolve, retryAfterSeconds * 1000),
    );
    res = await fetch(url, init);
    retries++;
  }

  return res;
}
