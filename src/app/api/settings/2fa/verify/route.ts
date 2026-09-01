import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  code: z.string().length(6),
});

/**
 * Confirms the code texted during enrollment and turns 2FA on.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const codeValid =
    user.twoFactorCode &&
    user.twoFactorCode === parsed.data.code &&
    user.twoFactorCodeExpires &&
    user.twoFactorCodeExpires > new Date();

  if (!codeValid) {
    return NextResponse.json(
      { error: "Code is invalid or expired" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phoneVerified: true,
      twoFactorEnabled: true,
      twoFactorCode: null,
      twoFactorCodeExpires: null,
    },
  });

  return NextResponse.json({ success: true });
}
