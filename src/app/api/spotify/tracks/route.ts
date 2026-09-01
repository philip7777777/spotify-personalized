import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";
import { SPOTIFY_API_BASE } from "@/lib/spotify";
import { spotifyFetch } from "@/lib/spotify-fetch";

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

  // Spotify caps a single request at 50 items, so page through everything
  // to return the user's full liked-songs library in one response.
  const PAGE_SIZE = 50;
  let url: string | null =
    `${SPOTIFY_API_BASE}/me/tracks?limit=${PAGE_SIZE}&offset=0`;
  const allItems: SpotifySavedTrackItem[] = [];
  let total = 0;

  while (url) {
    const res: Response = await spotifyFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Spotify /me/tracks failed: ${res.status} ${body}`);
      return NextResponse.json(
        {
          error:
            res.status === 429
              ? "Spotify rate limit hit — please wait a bit and try again."
              : "Failed to fetch tracks from Spotify",
        },
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

  return NextResponse.json({
    tracks,
    total,
    hasMore: false,
  });
}
