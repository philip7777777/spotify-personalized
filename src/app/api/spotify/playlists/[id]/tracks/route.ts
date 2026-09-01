import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";
import { SPOTIFY_API_BASE } from "@/lib/spotify";

type SpotifyPlaylistTrackItem = {
  track: {
    id: string;
    uri: string;
    name: string;
    type: string; // "track" (local files / episodes are filtered out below)
    duration_ms: number;
    artists: { name: string }[];
    album: { name: string };
  } | null;
};

/**
 * Returns all tracks in the given playlist (e.g. a Daily Mix), paginating
 * through Spotify's 100-item-per-request limit for playlist items.
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

  const PAGE_SIZE = 100;
  let url: string | null =
    `${SPOTIFY_API_BASE}/playlists/${id}/tracks?limit=${PAGE_SIZE}`;
  const allItems: SpotifyPlaylistTrackItem[] = [];

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch playlist tracks from Spotify" },
        { status: res.status },
      );
    }

    const data: {
      items: SpotifyPlaylistTrackItem[];
      next: string | null;
    } = await res.json();

    allItems.push(...data.items);
    url = data.next;
  }

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

  return NextResponse.json({ tracks });
}
