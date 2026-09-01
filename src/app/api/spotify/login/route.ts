import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { getAuthorizeUrl } from "@/lib/spotify";

const STATE_COOKIE = "spotify_oauth_state";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = randomBytes(16).toString("hex");
  const url = getAuthorizeUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });
  return res;
}
