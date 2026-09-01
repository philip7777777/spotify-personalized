import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LibraryClient } from "./library-client";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const spotifyAccount = await prisma.spotifyAccount.findUnique({
    where: { userId: session.user.id },
  });

  if (!spotifyAccount) {
    redirect("/settings");
  }

  return <LibraryClient />;
}
