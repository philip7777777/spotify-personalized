import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForTokens, fetchSpotifyMe } from "@/lib/spotify";

const STATE_COOKIE = "spotify_oauth_state";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?spotify_error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/settings?spotify_error=invalid_state", request.url)
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const profile = await fetchSpotifyMe(tokens.access_token);

    await prisma.spotifyAccount.upsert({
      where: { userId: session.user.id },
      update: {
        spotifyUserId: profile.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt,
        scope: tokens.scope,
      },
      create: {
        userId: session.user.id,
        spotifyUserId: profile.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
        expiresAt,
        scope: tokens.scope,
      },
    });
  } catch (err) {
    console.error("Spotify OAuth callback failed:", err);
    return NextResponse.redirect(
      new URL("/settings?spotify_error=token_exchange_failed", request.url)
    );
  }

  const res = NextResponse.redirect(
    new URL("/settings?spotify_connected=1", request.url)
  );
  res.cookies.delete(STATE_COOKIE);
  return res;
}
