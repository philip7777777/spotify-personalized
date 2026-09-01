import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";
import { SPOTIFY_API_BASE } from "@/lib/spotify";

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

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  const res = await fetch(
    `${SPOTIFY_API_BASE}/me/tracks?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
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

  // Only actual songs, never podcast episodes. No album art / images included.
  const tracks = data.items
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
    total: data.total,
    hasMore: Boolean(data.next),
  });
}
