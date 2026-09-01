import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, generateQrCodeDataUrl } from "@/lib/totp";

/**
 * Starts the 2FA enrollment flow: generates a new TOTP secret, saves it
 * (unverified — totpEnabled stays false until /verify succeeds), and
 * returns a QR code the user can scan with an authenticator app.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const secret = generateTotpSecret();

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: secret, totpEnabled: false },
  });

  const qrCodeDataUrl = await generateQrCodeDataUrl(user.username, secret);

  return NextResponse.json({ qrCodeDataUrl, secret });
}
