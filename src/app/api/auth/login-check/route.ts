import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  username: z.string().min(1),
  password: z.string(),
});

/**
 * Pre-flight check used by the login page before calling NextAuth's
 * signIn(). Validates the username/password and tells the client whether
 * to prompt for a TOTP/recovery code next. No code is sent anywhere —
 * TOTP codes are generated locally by the user's authenticator app.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 },
    );
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 },
    );
  }

  return NextResponse.json({ requires2FA: user.totpEnabled });
}
