import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";

/**
 * Hands a short-lived access token to the client so it can initialize the
 * Web Playback SDK. This is scoped to the logged-in user's own session and
 * refreshed on demand, so it's safe to expose to the browser (same trust
 * boundary as any other client-side Spotify Web Playback SDK usage).
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
      { status: 400 }
    );
  }

  return NextResponse.json({ accessToken });
}
