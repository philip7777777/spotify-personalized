import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";
import { SPOTIFY_API_BASE } from "@/lib/spotify";
import {
  spotifyFetch,
  SpotifyRateLimitError,
  formatRetryAfter,
} from "@/lib/spotify-fetch";

type SpotifySearchTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string };
};

type SpotifySearchAlbum = {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
  total_tracks: number;
  images: { url: string }[];
};

/**
 * Searches Spotify's catalog for tracks matching the query, and reports
 * whether each result is already saved in the user's Liked Songs.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ tracks: [] });
  }

  const accessToken = await getValidSpotifyAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify account not connected" },
      { status: 400 },
    );
  }

  try {
    const searchParamsOut = new URLSearchParams({
      type: "track,album",
      limit: "10",
      q,
    });
    const searchUrl = `${SPOTIFY_API_BASE}/search?${searchParamsOut.toString()}`;
    const res = await spotifyFetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Spotify /search failed: ${res.status} ${body}`);
      return NextResponse.json(
        { error: "Failed to search Spotify" },
        { status: res.status },
      );
    }

    const data: {
      tracks: { items: SpotifySearchTrack[] };
      albums: { items: SpotifySearchAlbum[] };
    } = await res.json();
    const items = data.tracks.items;
    const albumItems = data.albums.items;

    // Check which of these results are already in the user's Liked Songs.
    // (Spotify's older /me/tracks/contains endpoint is deprecated and now
    // returns 403 for apps in Development Mode — use /me/library/contains
    // instead, which accepts URIs.)
    let savedFlags: boolean[] = items.map(() => false);
    if (items.length > 0) {
      const uris = items.map((t) => t.uri).join(",");
      const containsRes = await spotifyFetch(
        `${SPOTIFY_API_BASE}/me/library/contains?uris=${encodeURIComponent(uris)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (containsRes.ok) {
        savedFlags = await containsRes.json();
      }
    }

    const tracks = items.map((t, i) => ({
      id: t.id,
      uri: t.uri,
      name: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      album: t.album.name,
      durationMs: t.duration_ms,
      saved: savedFlags[i] ?? false,
    }));

    const albums = albumItems.map((a) => ({
      id: a.id,
      name: a.name,
      artist: a.artists.map((ar) => ar.name).join(", "),
      trackCount: a.total_tracks,
      imageUrl: a.images[0]?.url ?? null,
    }));

    return NextResponse.json({ tracks, albums });
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
}
