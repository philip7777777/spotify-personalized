import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";
import { SPOTIFY_API_BASE } from "@/lib/spotify";

type SpotifyPlaylist = {
  id: string;
  name: string;
  owner: { id: string; display_name: string | null };
  tracks: { total: number };
};

/**
 * Returns the user's "Daily Mix" playlists (Daily Mix 1, Daily Mix 2, ...).
 * These are regular playlists owned by Spotify that show up in the
 * current user's playlist list — there's no dedicated API for them.
 */
export async function GET() {
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

  const PAGE_SIZE = 50;
  let url: string | null = `${SPOTIFY_API_BASE}/me/playlists?limit=${PAGE_SIZE}`;
  const allPlaylists: SpotifyPlaylist[] = [];

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch playlists from Spotify" },
        { status: res.status },
      );
    }

    const data: { items: SpotifyPlaylist[]; next: string | null } =
      await res.json();
    allPlaylists.push(...data.items);
    url = data.next;
  }

  const dailyMixes = allPlaylists
    .filter((p) => p.name?.startsWith("Daily Mix"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((p) => ({
      id: p.id,
      name: p.name,
      owner: p.owner.display_name ?? p.owner.id,
      trackCount: p.tracks.total,
    }));

  return NextResponse.json({ dailyMixes });
}
