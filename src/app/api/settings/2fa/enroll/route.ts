import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateCode, sendSmsCode } from "@/lib/sms";

const schema = z.object({
  phone: z.string().min(7, "Enter a valid phone number"),
});

/**
 * Starts the 2FA enrollment flow: saves the phone number (unverified)
 * and texts a verification code to it.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { phone } = parsed.data;
  const code = generateCode();
  const expires = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      phone,
      phoneVerified: false,
      twoFactorCode: code,
      twoFactorCodeExpires: expires,
    },
  });

  await sendSmsCode(phone, code);

  return NextResponse.json({ success: true });
}
