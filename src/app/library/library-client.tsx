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

type DailyMix = {
  id: string;
  name: string;
  owner: string;
  trackCount: number;
};

type SearchTrack = Track & { saved: boolean };

type SearchAlbum = {
  id: string;
  name: string;
  artist: string;
  trackCount: number;
  imageUrl: string | null;
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

// Renders a simple green music-note icon to a PNG data URL, for use as the
// Media Session artwork so the OS Now Playing widget (lock screen, Control
// Center, CarPlay) shows a music icon instead of no artwork at all.
function generateMusicIconDataUrl(size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#1DB954"; // Spotify green
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  const s = size / 100; // scale factor against a 100x100 design grid
  ctx.lineWidth = 6 * s;

  // Stem
  ctx.beginPath();
  ctx.moveTo(60 * s, 20 * s);
  ctx.lineTo(60 * s, 68 * s);
  ctx.stroke();

  // Flag
  ctx.beginPath();
  ctx.moveTo(60 * s, 20 * s);
  ctx.quadraticCurveTo(85 * s, 28 * s, 78 * s, 45 * s);
  ctx.quadraticCurveTo(70 * s, 36 * s, 60 * s, 36 * s);
  ctx.closePath();
  ctx.fill();

  // Note head
  ctx.beginPath();
  ctx.ellipse(48 * s, 72 * s, 14 * s, 10 * s, -0.3, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL("image/png");
}

export function LibraryClient() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"library" | "dailyMixes" | "search">(
    "library",
  );
  const [dailyMixes, setDailyMixes] = useState<DailyMix[]>([]);
  const [mixesLoading, setMixesLoading] = useState(false);
  const [mixesError, setMixesError] = useState<string | null>(null);
  const [mixesFetched, setMixesFetched] = useState(false);
  const [selectedMix, setSelectedMix] = useState<DailyMix | null>(null);
  const [mixTracks, setMixTracks] = useState<Track[]>([]);
  const [mixTracksLoading, setMixTracksLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [searchAlbums, setSearchAlbums] = useState<SearchAlbum[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [likingTrackId, setLikingTrackId] = useState<string | null>(null);
  const [playingAlbumId, setPlayingAlbumId] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<SearchAlbum | null>(null);
  const [albumTracks, setAlbumTracks] = useState<SearchTrack[]>([]);
  const [albumTracksLoading, setAlbumTracksLoading] = useState(false);
  const [albumTracksError, setAlbumTracksError] = useState<string | null>(null);

  const [sdkReady, setSdkReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [currentTrackName, setCurrentTrackName] = useState<string | null>(null);
  const [currentTrackArtist, setCurrentTrackArtist] = useState<string | null>(
    null,
  );
  const [isPaused, setIsPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  const playerRef = useRef<SpotifyPlayer | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Load Daily Mix playlists once the user switches to that tab (only once
  // per page load — mixesFetched guards against refetch loops even when
  // zero mixes are found).
  useEffect(() => {
    if (view !== "dailyMixes" || mixesFetched || mixesLoading) return;
    setMixesLoading(true);
    setMixesError(null);
    fetch("/api/spotify/daily-mixes")
      .then(async (res) => {
        if (!res.ok)
          throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data) => setDailyMixes(data.dailyMixes))
      .catch((err) => setMixesError(err.message))
      .finally(() => {
        setMixesLoading(false);
        setMixesFetched(true);
      });
  }, [view, mixesFetched, mixesLoading]);

  // Debounced search: wait for the user to stop typing before querying.
  useEffect(() => {
    if (view !== "search") return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchAlbums([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    const timeout = setTimeout(() => {
      fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
        .then(async (res) => {
          if (!res.ok)
            throw new Error((await res.json()).error ?? "Search failed");
          return res.json();
        })
        .then((data) => {
          setSearchResults(data.tracks);
          setSearchAlbums(data.albums ?? []);
        })
        .catch((err) => setSearchError(err.message))
        .finally(() => setSearchLoading(false));
    }, 400);

    return () => clearTimeout(timeout);
  }, [view, searchQuery]);

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
        setCurrentTrackName(state.track_window.current_track.name);
        setCurrentTrackArtist(
          state.track_window.current_track.artists
            .map((a) => a.name)
            .join(", "),
        );
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

  // iOS Safari (and some other mobile browsers) suspend the Web Playback
  // SDK's underlying connection when the tab is backgrounded, and it doesn't
  // always reconnect on its own. When the page becomes visible again, force
  // a reconnect so the play/pause buttons don't stay unresponsive.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        playerRef.current?.connect();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
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

  // Wire up the Media Session API so OS-level media controls — lock
  // screen, Control Center, and CarPlay's Now Playing screen — can show
  // track info and drive play/pause/previous/next. This is the only way
  // a web app can integrate with CarPlay (true native CarPlay support
  // requires a native iOS app with CarPlay entitlements).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;

    navigator.mediaSession.setActionHandler("play", () => {
      playerRef.current?.togglePlay();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      playerRef.current?.togglePlay();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      playerRef.current?.previousTrack();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      playerRef.current?.nextTrack();
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) {
        playerRef.current?.seek(details.seekTime * 1000);
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, []);

  // Keep the OS media session metadata and playback state in sync with
  // what's actually playing.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;

    if (currentTrackName) {
      const artworkUrl = generateMusicIconDataUrl(512);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrackName,
        artist: currentTrackArtist ?? undefined,
        artwork: artworkUrl
          ? [
              { src: artworkUrl, sizes: "512x512", type: "image/png" },
            ]
          : [],
      });
    }
    navigator.mediaSession.playbackState = isPaused ? "paused" : "playing";
  }, [currentTrackName, currentTrackArtist, isPaused]);

  // Report the current playback position/duration so the Now Playing
  // widget can show elapsed/remaining time and a scrubber, not just
  // play/pause controls.
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      !("setPositionState" in navigator.mediaSession) ||
      !duration
    )
      return;
    try {
      navigator.mediaSession.setPositionState({
        duration: duration / 1000,
        position: Math.min(position, duration) / 1000,
        playbackRate: 1,
      });
    } catch {
      // Some browsers throw if position/duration are momentarily out of
      // sync (e.g. during a track change) — safe to ignore.
    }
  }, [position, duration]);

  // iOS attributes the Now Playing / lock screen / CarPlay media session to
  // whichever frame actually holds a playing audio/video element. The
  // Spotify Web Playback SDK decodes audio inside its own cross-origin
  // iframe (sdk.scdn.co), so iOS shows *that* frame's generic "Spotify"
  // widget (play + ±10s skip, no track name) instead of our page's
  // MediaSession metadata and previous/next handlers. Keeping a silent,
  // looping <audio> element playing in our own document tricks iOS into
  // treating our page as the active media session instead, so our
  // metadata/title and previous/next handlers show up on the lock screen,
  // Control Center, and CarPlay.
  useEffect(() => {
    const audio = silentAudioRef.current;
    if (!audio) return;
    if (currentUri && !isPaused) {
      audio.play().catch(() => {
        // Autoplay can be blocked until the user interacts with the page;
        // it will succeed once they've tapped Play at least once.
      });
    } else {
      audio.pause();
    }
  }, [currentUri, isPaused]);

  // Generate a real (but silent) looping audio stream and attach it to the
  // hidden <audio> element below, so the browser has genuine audio content
  // to play (data-URI/static file approaches are fragile across browsers).
  useEffect(() => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor || !silentAudioRef.current) return;

    const ctx = new AudioContextCtor();
    const destination = ctx.createMediaStreamDestination();
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer; // all-zero buffer = silence
    source.loop = true;
    source.connect(destination);
    source.start();

    silentAudioRef.current.srcObject = destination.stream;

    return () => {
      source.stop();
      ctx.close();
    };
  }, []);

  async function playTrack(index: number) {
    if (!deviceId) return;
    await fetch("/api/spotify/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        uris: displayedTracks.map((t) => t.uri),
        offset: index,
      }),
    });
  }

  async function handleSelectMix(mix: DailyMix) {
    setSelectedMix(mix);
    setMixTracks([]);
    setMixTracksLoading(true);
    setMixesError(null);

    try {
      const res = await fetch(`/api/spotify/playlists/${mix.id}/tracks`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load mix");
      setMixTracks(data.tracks);
    } catch (err) {
      setMixesError(err instanceof Error ? err.message : "Failed to load mix");
    } finally {
      setMixTracksLoading(false);
    }
  }

  function extractPlaylistId(input: string): string | null {
    const trimmed = input.trim();
    // spotify:playlist:ID
    const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)/);
    if (uriMatch) return uriMatch[1];
    // https://open.spotify.com/playlist/ID?si=...
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("playlist");
      if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
    } catch {
      // Not a valid URL — fall through.
    }
    // Bare playlist ID.
    if (/^[a-zA-Z0-9]{10,}$/.test(trimmed)) return trimmed;
    return null;
  }

  async function playSearchResult(index: number) {
    if (!deviceId) return;
    await fetch("/api/spotify/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        uris: searchResults.map((t) => t.uri),
        offset: index,
      }),
    });
  }

  async function playAlbum(album: SearchAlbum) {
    if (!deviceId) return;
    setPlayingAlbumId(album.id);
    try {
      const res = await fetch(`/api/spotify/albums/${album.id}/tracks`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load album");
      const uris: string[] = data.tracks.map((t: Track) => t.uri);
      if (uris.length === 0) return;
      await fetch("/api/spotify/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, uris, offset: 0 }),
      });
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Failed to play album",
      );
    } finally {
      setPlayingAlbumId(null);
    }
  }

  async function handleSelectAlbum(album: SearchAlbum) {
    setSelectedAlbum(album);
    setAlbumTracks([]);
    setAlbumTracksError(null);
    setAlbumTracksLoading(true);
    try {
      const res = await fetch(`/api/spotify/albums/${album.id}/tracks`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load album");
      setAlbumTracks(data.tracks);
    } catch (err) {
      setAlbumTracksError(
        err instanceof Error ? err.message : "Failed to load album",
      );
    } finally {
      setAlbumTracksLoading(false);
    }
  }

  async function playAlbumTrack(index: number) {
    if (!deviceId) return;
    await fetch("/api/spotify/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        uris: albumTracks.map((t) => t.uri),
        offset: index,
      }),
    });
  }

  async function toggleLike(track: SearchTrack) {
    setLikingTrackId(track.id);
    try {
      const res = await fetch("/api/spotify/like", {
        method: track.saved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update Liked Songs");
      }
      setSearchResults((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, saved: !track.saved } : t,
        ),
      );
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Failed to update Liked Songs",
      );
    } finally {
      setLikingTrackId(null);
    }
  }

  async function toggleLikeAlbumTrack(track: SearchTrack) {
    setLikingTrackId(track.id);
    try {
      const res = await fetch("/api/spotify/like", {
        method: track.saved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update Liked Songs");
      }
      setAlbumTracks((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, saved: !track.saved } : t,
        ),
      );
    } catch (err) {
      setAlbumTracksError(
        err instanceof Error ? err.message : "Failed to update Liked Songs",
      );
    } finally {
      setLikingTrackId(null);
    }
  }

  async function unlikeTrack(track: Track) {
    setLikingTrackId(track.id);
    try {
      const res = await fetch("/api/spotify/like", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove from Liked Songs");
      }
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove from Liked Songs",
      );
    } finally {
      setLikingTrackId(null);
    }
  }

  async function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    setPosition(Number(e.target.value));
  }

  async function commitSeek() {
    await playerRef.current?.seek(position);
    setSeeking(false);
  }

  const displayedTracks =
    view === "dailyMixes" && selectedMix ? mixTracks : tracks;
  // Prefer duration from the loaded track list (more reliable than the
  // SDK, which sometimes reports 0 briefly), but always fall back to the
  // SDK's own reported name/artist so the bar shows even if the tracks
  // list failed to load or doesn't contain the currently playing track.
  const matchedTrack =
    tracks.find((t) => t.uri === currentUri) ??
    mixTracks.find((t) => t.uri === currentUri) ??
    searchResults.find((t) => t.uri === currentUri) ??
    albumTracks.find((t) => t.uri === currentUri) ??
    null;
  const currentTrack =
    currentUri && (matchedTrack || currentTrackName)
      ? {
          name: matchedTrack?.name ?? currentTrackName ?? "",
          artist: matchedTrack?.artist ?? currentTrackArtist ?? "",
        }
      : null;

  return (
    <main className="flex flex-1 flex-col items-center p-8">
      {/* Silent, looping audio element — see the effect above for why this
          exists. It has no audible content; it only exists so iOS treats
          this page (rather than the Spotify SDK's iframe) as the active
          Now Playing / lock screen media session. */}
      <audio
        ref={silentAudioRef}
        loop
        playsInline
        aria-hidden="true"
        className="hidden"
      />
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold">Your Library</h1>

        {!sdkReady && (
          <p className="text-sm text-gray-500">Connecting to Spotify player…</p>
        )}

        <div className="flex gap-2 border-b">
          <button
            onClick={() => setView("library")}
            className={`px-3 py-2 text-sm font-medium ${
              view === "library" ? "border-b-2 border-black" : "text-gray-500"
            }`}
          >
            Liked Songs
          </button>
          <button
            onClick={() => setView("dailyMixes")}
            className={`px-3 py-2 text-sm font-medium ${
              view === "dailyMixes"
                ? "border-b-2 border-black"
                : "text-gray-500"
            }`}
          >
            Daily Mixes
          </button>
          <button
            onClick={() => setView("search")}
            className={`px-3 py-2 text-sm font-medium ${
              view === "search" ? "border-b-2 border-black" : "text-gray-500"
            }`}
          >
            Search
          </button>
        </div>

        {view === "library" && (
          <>
            {loading && (
              <p className="text-sm text-gray-500">Loading tracks…</p>
            )}
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
                      <button
                        onClick={() => unlikeTrack(track)}
                        disabled={likingTrackId === track.id}
                        className="rounded-md border px-3 py-1 text-xs font-medium text-red-600 disabled:opacity-50"
                      >
                        Dislike
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {!loading && tracks.length === 0 && !error && (
              <p className="text-sm text-gray-500">No saved tracks found.</p>
            )}
          </>
        )}

        {view === "dailyMixes" && !selectedMix && (
          <>
            {mixesLoading && (
              <p className="text-sm text-gray-500">Loading Daily Mixes…</p>
            )}
            {mixesError && <p className="text-sm text-red-600">{mixesError}</p>}

            <ul className="divide-y rounded-lg border pb-20">
              {dailyMixes.map((mix) => (
                <li key={mix.id}>
                  <button
                    onClick={() => handleSelectMix(mix)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{mix.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {mix.trackCount} songs
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {!mixesLoading && dailyMixes.length === 0 && !mixesError && (
              <p className="text-sm text-gray-500">
                No Daily Mixes found. Spotify generates these automatically over
                time — make sure you have some listening history, or try
                refreshing.
              </p>
            )}
          </>
        )}

        {view === "dailyMixes" && selectedMix && (
          <>
            <button
              onClick={() => setSelectedMix(null)}
              className="text-sm font-medium text-gray-500 hover:text-black"
            >
              ← Back to Daily Mixes
            </button>
            <h2 className="text-lg font-medium">{selectedMix.name}</h2>

            {mixTracksLoading && (
              <p className="text-sm text-gray-500">Loading tracks…</p>
            )}

            <ul className="divide-y rounded-lg border pb-20">
              {mixTracks.map((track, index) => {
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
          </>
        )}

        {view === "search" && !selectedAlbum && (
          <>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search songs…"
              className="w-full rounded-md border px-3 py-2 text-base"
              style={{ fontSize: 16 }}
              autoFocus
            />

            {searchLoading && (
              <p className="text-sm text-gray-500">Searching…</p>
            )}
            {searchError && (
              <p className="text-sm text-red-600">{searchError}</p>
            )}
            {!searchLoading &&
              !searchError &&
              searchQuery.trim() &&
              searchResults.length === 0 &&
              searchAlbums.length === 0 && (
                <p className="text-sm text-gray-500">No results found.</p>
              )}

            {searchAlbums.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-500">Albums</h2>
                <ul className="divide-y rounded-lg border">
                  {searchAlbums.map((album) => (
                    <li
                      key={album.id}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <button
                        onClick={() => handleSelectAlbum(album)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        {album.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={album.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {album.name}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {album.artist} · {album.trackCount} tracks
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => playAlbum(album)}
                        disabled={!sdkReady || playingAlbumId === album.id}
                        className="shrink-0 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        {playingAlbumId === album.id ? "Loading…" : "Play"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="divide-y rounded-lg border pb-20">
              {searchResults.map((track, index) => {
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
                        onClick={() => toggleLike(track)}
                        disabled={likingTrackId === track.id}
                        className="rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        {track.saved ? "Unlike" : "Like"}
                      </button>
                      <button
                        onClick={() =>
                          isCurrent
                            ? playerRef.current?.togglePlay()
                            : playSearchResult(index)
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
          </>
        )}

        {view === "search" && selectedAlbum && (
          <>
            <button
              onClick={() => setSelectedAlbum(null)}
              className="text-sm font-medium text-gray-500 hover:text-black"
            >
              ← Back to search
            </button>
            <h2 className="text-lg font-medium">{selectedAlbum.name}</h2>
            <p className="text-sm text-gray-500">{selectedAlbum.artist}</p>

            {albumTracksLoading && (
              <p className="text-sm text-gray-500">Loading tracks…</p>
            )}
            {albumTracksError && (
              <p className="text-sm text-red-600">{albumTracksError}</p>
            )}

            <ul className="divide-y rounded-lg border pb-20">
              {albumTracks.map((track, index) => {
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
                        onClick={() => toggleLikeAlbumTrack(track)}
                        disabled={likingTrackId === track.id}
                        className="rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        {track.saved ? "Unlike" : "Like"}
                      </button>
                      <button
                        onClick={() =>
                          isCurrent
                            ? playerRef.current?.togglePlay()
                            : playAlbumTrack(index)
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
          </>
        )}
      </div>

      {currentTrack && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 text-gray-900 backdrop-blur">
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
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
                >
                  ⏮
                </button>
                <button
                  onClick={() => playerRef.current?.togglePlay()}
                  disabled={!sdkReady}
                  aria-label={isPaused ? "Play" : "Pause"}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
                >
                  {isPaused ? "▶" : "⏸"}
                </button>
                <button
                  onClick={() => playerRef.current?.nextTrack()}
                  disabled={!sdkReady}
                  aria-label="Next track"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
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
