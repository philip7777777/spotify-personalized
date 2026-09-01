import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";

/**
 * Invalidates all existing recovery codes and issues a fresh batch.
 * Requires 2FA to already be enabled.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true },
  });

  if (!user?.totpEnabled) {
    return NextResponse.json(
      { error: "Two-factor authentication is not enabled" },
      { status: 400 },
    );
  }

  const recoveryCodes = generateRecoveryCodes();

  await prisma.recoveryCode.deleteMany({ where: { userId: session.user.id } });
  await prisma.recoveryCode.createMany({
    data: await Promise.all(
      recoveryCodes.map(async (code) => ({
        userId: session.user.id,
        codeHash: await hashRecoveryCode(code),
      })),
    ),
  });

  return NextResponse.json({ recoveryCodes });
}
