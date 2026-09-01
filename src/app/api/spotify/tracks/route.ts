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

type TracksResponse = {
  tracks: {
    id: string;
    uri: string;
    name: string;
    artist: string;
    album: string;
    durationMs: number;
  }[];
  total: number;
  hasMore: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type SpotifySavedTrackItem = {
  track: {
    id: string;
    uri: string;
    name: string;
    type: string; // "track" (podcast episodes have type "episode" and never appear in /me/tracks anyway)
    duration_ms: number;
    artists: { name: string }[];
    album: { name: string };
  } | null;
};

export async function GET(request: Request) {
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

  const cacheKey = `${session.user.id}:tracks`;
  const cached = getCached<TracksResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Spotify caps a single request at 50 items, so page through everything
  // to return the user's full liked-songs library in one response.
  const PAGE_SIZE = 50;
  let url: string | null =
    `${SPOTIFY_API_BASE}/me/tracks?limit=${PAGE_SIZE}&offset=0`;
  const allItems: SpotifySavedTrackItem[] = [];
  let total = 0;

  try {
    while (url) {
      const res: Response = await spotifyFetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`Spotify /me/tracks failed: ${res.status} ${body}`);
        return NextResponse.json(
          { error: "Failed to fetch tracks from Spotify" },
          { status: res.status },
        );
      }

      const data: {
        items: SpotifySavedTrackItem[];
        total: number;
        next: string | null;
      } = await res.json();

      allItems.push(...data.items);
      total = data.total;
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

  // Only actual songs, never podcast episodes. No album art / images included.
  const tracks = allItems
    .filter((item) => item.track && item.track.type === "track")
    .map((item) => ({
      id: item.track!.id,
      uri: item.track!.uri,
      name: item.track!.name,
      artist: item.track!.artists.map((a) => a.name).join(", "),
      album: item.track!.album.name,
      durationMs: item.track!.duration_ms,
    }));

  const responseBody: TracksResponse = {
    tracks,
    total,
    hasMore: false,
  };

  setCached(cacheKey, responseBody, CACHE_TTL_MS);

  return NextResponse.json(responseBody);
}