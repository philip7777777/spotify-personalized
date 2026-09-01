"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export function SpotifySection({ connected }: { connected: boolean }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("spotify_error");
  const justConnected = searchParams.get("spotify_connected");

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Spotify</h2>

      {connected ? (
        <>
          <p className="text-sm text-gray-500">
            Your Spotify account is connected.
          </p>
          <Link
            href="/library"
            className="inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Go to library
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Connect your Spotify account to access your saved tracks.
          </p>
          <a
            href="/api/spotify/login"
            className="inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Connect Spotify
          </a>
        </>
      )}

      {justConnected && (
        <p className="text-sm text-green-600">Spotify connected!</p>
      )}
      {error && (
        <p className="text-sm text-red-600">
          Failed to connect Spotify ({error}).
        </p>
      )}
    </div>
  );
}
