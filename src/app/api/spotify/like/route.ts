import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";
import { SPOTIFY_API_BASE } from "@/lib/spotify";
import {
  spotifyFetch,
  SpotifyRateLimitError,
  formatRetryAfter,
  clearCached,
} from "@/lib/spotify-fetch";

const schema = z.object({
  trackId: z.string().min(1),
});

/**
 * Adds a track to the user's Liked Songs (PUT /me/tracks).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const accessToken = await getValidSpotifyAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify account not connected" },
      { status: 400 },
    );
  }

  try {
    const res = await spotifyFetch(
      `${SPOTIFY_API_BASE}/me/tracks?ids=${parsed.data.trackId}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!res.ok && res.status !== 200 && res.status !== 204) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to like track: ${res.status} ${text}` },
        { status: res.status },
      );
    }

    clearCached(`${session.user.id}:tracks`);

    return NextResponse.json({ success: true });
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

/**
 * Removes a track from the user's Liked Songs (DELETE /me/tracks).
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const accessToken = await getValidSpotifyAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify account not connected" },
      { status: 400 },
    );
  }

  try {
    const res = await spotifyFetch(
      `${SPOTIFY_API_BASE}/me/tracks?ids=${parsed.data.trackId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!res.ok && res.status !== 200 && res.status !== 204) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to unlike track: ${res.status} ${text}` },
        { status: res.status },
      );
    }

    clearCached(`${session.user.id}:tracks`);

    return NextResponse.json({ success: true });
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
