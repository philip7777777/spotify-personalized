import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateCode, sendSmsCode } from "@/lib/sms";

const schema = z.object({
  username: z.string().min(1),
  password: z.string(),
});

/**
 * Pre-flight check used by the login page before calling NextAuth's
 * signIn(). Validates the username/password and, if the account has 2FA
 * enabled, sends a fresh SMS code and tells the client to prompt for it.
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
      { status: 401 }
    );
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 }
    );
  }

  if (!user.twoFactorEnabled) {
    return NextResponse.json({ requires2FA: false });
  }

  if (!user.phone) {
    return NextResponse.json(
      { error: "2FA is enabled but no phone number is on file" },
      { status: 400 }
    );
  }

  const code = generateCode();
  const expires = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorCode: code, twoFactorCodeExpires: expires },
  });

  await sendSmsCode(user.phone, code);

  return NextResponse.json({ requires2FA: true });
}
