import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getValidSpotifyAccessToken } from "@/lib/spotify-token";
import { SPOTIFY_API_BASE } from "@/lib/spotify";

const schema = z.object({
  deviceId: z.string().min(1),
  uris: z.array(z.string()).min(1),
});

/**
 * Starts playback of the given track URI(s) on the given Web Playback SDK
 * device (identified by deviceId, obtained client-side from the SDK's
 * "ready" event).
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
      { status: 400 }
    );
  }

  const { deviceId, uris } = parsed.data;

  const res = await fetch(
    `${SPOTIFY_API_BASE}/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris }),
    }
  );

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Playback failed: ${res.status} ${text}` },
      { status: res.status }
    );
  }

  return NextResponse.json({ success: true });
}
