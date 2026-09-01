import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "./actions";

export default async function Home() {
  const session = await auth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Spotify Personalized</h1>

      {session?.user ? (
        <>
          <p className="text-sm text-gray-500">
            Signed in as{" "}
            <span className="font-medium">{session.user.username}</span>
          </p>
          <div className="flex gap-4">
            <Link
              href="/library"
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white"
            >
              Library
            </Link>
            <Link
              href="/settings"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Settings
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border px-4 py-2 text-sm font-medium"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      ) : (
        <div className="flex gap-4">
          <Link
            href="/login"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Log in
          </Link>
        </div>
      )}
    </main>
  );
}
