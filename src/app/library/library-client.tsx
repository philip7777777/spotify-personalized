"use client";

import { useEffect, useRef, useState } from "react";

type Track = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
};

// Minimal shape of the bits of the Spotify Web Playback SDK we use.
type SpotifyPlayerState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: { uri: string; name: string; artists: { name: string }[] };
  };
} | null;

type SpotifyPlayer = {
  addListener: (event: string, cb: (arg: unknown) => void) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  getCurrentState: () => Promise<SpotifyPlayerState>;
};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function LibraryClient() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sdkReady, setSdkReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  const playerRef = useRef<SpotifyPlayer | null>(null);

  // Load saved tracks (already filtered server-side to real tracks only).
  useEffect(() => {
    fetch("/api/spotify/tracks")
      .then(async (res) => {
        if (!res.ok)
          throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data) => setTracks(data.tracks))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Load the Web Playback SDK script and initialize the player.
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Spotify Personalized",
        getOAuthToken: (cb) => {
          fetch("/api/spotify/token")
            .then((res) => res.json())
            .then((data) => cb(data.accessToken));
        },
        volume: 0.8,
      });

      player.addListener("ready", (arg) => {
        const { device_id } = arg as { device_id: string };
        setDeviceId(device_id);
        setSdkReady(true);
      });

      player.addListener("not_ready", () => {
        setSdkReady(false);
      });

      player.addListener("player_state_changed", (arg) => {
        const state = arg as SpotifyPlayerState;
        if (!state) return;
        setCurrentUri(state.track_window.current_track.uri);
        setIsPaused(state.paused);
        setPosition(state.position);
        setDuration(state.duration);
      });

      player.connect();
      playerRef.current = player;
    };

    return () => {
      playerRef.current?.disconnect();
    };
  }, []);

  // Tick the displayed position forward while playing (player_state_changed
  // only fires on actual transitions, not continuously).
  useEffect(() => {
    if (isPaused || seeking) return;
    const interval = setInterval(() => {
      setPosition((p) => Math.min(p + 500, duration));
    }, 500);
    return () => clearInterval(interval);
  }, [isPaused, duration, seeking]);

  async function playTrack(index: number) {
    if (!deviceId) return;
    await fetch("/api/spotify/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        uris: tracks.map((t) => t.uri),
        offset: index,
      }),
    });
  }

  async function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    setPosition(Number(e.target.value));
  }

  async function commitSeek() {
    await playerRef.current?.seek(position);
    setSeeking(false);
  }

  const currentTrack = tracks.find((t) => t.uri === currentUri) ?? null;

  return (
    <main className="flex flex-1 flex-col items-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold">Your Library</h1>

        {!sdkReady && (
          <p className="text-sm text-gray-500">Connecting to Spotify player…</p>
        )}

        {loading && <p className="text-sm text-gray-500">Loading tracks…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="divide-y rounded-lg border pb-20">
          {tracks.map((track, index) => {
            const isCurrent = currentUri === track.uri;
            return (
              <li
                key={track.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-medium ${
                      isCurrent ? "text-green-600" : ""
                    }`}
                  >
                    {track.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {track.artist}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {formatDuration(track.durationMs)}
                  </span>
                  <button
                    onClick={() =>
                      isCurrent
                        ? playerRef.current?.togglePlay()
                        : playTrack(index)
                    }
                    disabled={!sdkReady}
                    className="rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50"
                  >
                    {isCurrent && !isPaused ? "Pause" : "Play"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {!loading && tracks.length === 0 && !error && (
          <p className="text-sm text-gray-500">No saved tracks found.</p>
        )}
      </div>

      {currentTrack && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-right text-xs text-gray-400">
                {formatDuration(position)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={1000}
                value={position}
                onMouseDown={() => setSeeking(true)}
                onChange={handleSeek}
                onMouseUp={commitSeek}
                onTouchStart={() => setSeeking(true)}
                onTouchEnd={commitSeek}
                className="h-1 flex-1 accent-green-600"
              />
              <span className="w-10 shrink-0 text-xs text-gray-400">
                {formatDuration(duration)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {currentTrack.name}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {currentTrack.artist}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => playerRef.current?.previousTrack()}
                  disabled={!sdkReady}
                  aria-label="Previous track"
                  className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  ⏮
                </button>
                <button
                  onClick={() => playerRef.current?.togglePlay()}
                  disabled={!sdkReady}
                  aria-label={isPaused ? "Play" : "Pause"}
                  className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {isPaused ? "▶" : "⏸"}
                </button>
                <button
                  onClick={() => playerRef.current?.nextTrack()}
                  disabled={!sdkReady}
                  aria-label="Next track"
                  className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  ⏭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
