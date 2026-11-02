import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";
import { SPOTIFY_API_BASE } from "@/lib/spotify";
import {
  spotifyFetch,
  SpotifyRateLimitError,
  formatRetryAfter,
  getCached,
  setCached,
} from "@/lib/spotify-fetch";

type SpotifyAlbumTrack = {
  id: string;
  uri: string;
  name: string;
  type: string; // "track"
  duration_ms: number;
  artists: { name: string }[];
};

type AlbumTracksResponse = {
  name?: string;
  tracks: {
    id: string;
    uri: string;
    name: string;
    artist: string;
    album: string;
    durationMs: number;
    saved: boolean;
  }[];
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Returns all tracks on the given album, paginating through Spotify's
 * 50-item-per-request limit for album tracks.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const accessToken = await getValidSpotifyAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify account not connected" },
      { status: 400 },
    );
  }

  const cacheKey = `${session.user.id}:album:${id}`;
  const cached = getCached<AlbumTracksResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  let albumName: string | undefined;
  try {
    const metaRes = await spotifyFetch(
      `${SPOTIFY_API_BASE}/albums/${id}?fields=name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (metaRes.ok) {
      const meta: { name: string } = await metaRes.json();
      albumName = meta.name;
    }
  } catch {
    // Non-fatal — we can still show tracks without a name.
  }

  const PAGE_SIZE = 50;
  let url: string | null =
    `${SPOTIFY_API_BASE}/albums/${id}/tracks?limit=${PAGE_SIZE}`;
  const allItems: SpotifyAlbumTrack[] = [];

  try {
    while (url) {
      const res: Response = await spotifyFetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          `Spotify /albums/${id}/tracks failed: ${res.status} ${body}`,
        );
        return NextResponse.json(
          {
            error:
              res.status === 404
                ? "Album not found."
                : "Failed to fetch album tracks from Spotify",
          },
          { status: res.status },
        );
      }

      const data: {
        items: SpotifyAlbumTrack[];
        next: string | null;
      } = await res.json();

      allItems.push(...data.items);
      url = data.next;
    }
  } catch (err) {
    if (err instanceof SpotifyRateLimitError) {
      return NextResponse.json(
        {
          error: `Spotify rate limit hit — try again in ${formatRetryAfter(err.retryAfterSeconds)}.`,
        },
        { status: 429 },
      );
    }
    throw err;
  }

  const tracks = allItems
    .filter((item) => item.type === "track")
    .map((item) => ({
      id: item.id,
      uri: item.uri,
      name: item.name,
      artist: item.artists.map((a) => a.name).join(", "),
      album: albumName ?? "",
      durationMs: item.duration_ms,
    }));

  // Check which of these tracks are already in the user's Liked Songs.
  // Spotify's /me/library/contains only accepts up to 50 URIs per request,
  // so batch in chunks of 50 to be safe.
  const savedFlags: boolean[] = tracks.map(() => false);
  const BATCH_SIZE = 50;
  try {
    for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
      const batch = tracks.slice(i, i + BATCH_SIZE);
      const uris = batch.map((t) => t.uri).join(",");
      const containsRes = await spotifyFetch(
        `${SPOTIFY_API_BASE}/me/library/contains?uris=${encodeURIComponent(uris)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (containsRes.ok) {
        const flags: boolean[] = await containsRes.json();
        flags.forEach((flag, j) => {
          savedFlags[i + j] = flag;
        });
      }
    }
  } catch {
    // Non-fatal — tracks will just show as not-saved.
  }

  const tracksWithSaved = tracks.map((t, i) => ({
    ...t,
    saved: savedFlags[i] ?? false,
  }));

  const responseBody: AlbumTracksResponse = {
    name: albumName,
    tracks: tracksWithSaved,
  };
  setCached(cacheKey, responseBody, CACHE_TTL_MS);

  return NextResponse.json(responseBody);
}
