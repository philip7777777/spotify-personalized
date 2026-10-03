import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await prisma.spotifyAccount.deleteMany({
    where: { userId: session.user.id },
  });

  return NextResponse.redirect(new URL("/settings", request.url));
}
