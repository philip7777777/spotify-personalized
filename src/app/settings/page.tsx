import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./settings-form";
import { SpotifySection } from "./spotify-section";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      totpEnabled: true,
      spotifyAccount: { select: { spotifyUserId: true } },
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center p-8">
      <div className="w-full max-w-md space-y-8">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-500">{user.username}</p>
        <Suspense fallback={null}>
          <SpotifySection connected={Boolean(user.spotifyAccount)} />
        </Suspense>
        <SettingsForm totpEnabled={user.totpEnabled} />
      </div>
    </main>
  );
}
