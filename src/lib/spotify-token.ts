import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "@/lib/spotify";

/**
 * Returns a valid Spotify access token for the given user, refreshing it
 * first if it has expired (or is about to, within 60s).
 * Returns null if the user has no linked Spotify account.
 */
export async function getValidSpotifyAccessToken(
  userId: string,
): Promise<string | null> {
  const account = await prisma.spotifyAccount.findUnique({
    where: { userId },
  });
  if (!account) return null;

  const expiresSoon = account.expiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon) {
    return account.accessToken;
  }

  const refreshed = await refreshAccessToken(account.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  await prisma.spotifyAccount.update({
    where: { userId },
    data: {
      accessToken: refreshed.access_token,
      // Spotify may or may not return a new refresh token; keep the old one if not.
      refreshToken: refreshed.refresh_token ?? account.refreshToken,
      expiresAt,
      scope: refreshed.scope,
    },
  });

  return refreshed.access_token;
}
