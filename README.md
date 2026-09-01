# Spotify Personalized — Auth Scaffolding

A Next.js (App Router, TypeScript, Tailwind CSS) starter with:

- Single-user username/password authentication (NextAuth / Auth.js v5,
  Credentials provider) — **no public signup**, one account only
- A settings page with:
  - **Change password**
  - **Two-factor authentication (2FA) via SMS** (enroll phone number, verify with a texted code, disable)
  - **Connect Spotify** (OAuth Authorization Code flow)
- A `/library` page: lists your saved Spotify tracks (podcasts/episodes
  filtered out, no cover art shown) with playback via the Spotify Web
  Playback SDK (requires Spotify Premium)
- Prisma ORM with Postgres, using Neon's serverless driver
  (`@neondatabase/serverless` + `@prisma/adapter-neon`) — ideal for
  Vercel's serverless functions

## Requirements

- Node.js 20+
- npm
- A Postgres database (free options: [Neon](https://neon.tech),
  [Vercel Postgres](https://vercel.com/storage/postgres),
  [Supabase](https://supabase.com))

## Setup

1. Install dependencies (already done if you're reading this after scaffolding):

   ```bash
   npm install
   ```

2. Copy/check environment variables in `.env`:

   ```bash
   DATABASE_URL="postgresql://user:password@host-pooler.region.aws.neon.tech/dbname?channel_binding=require&sslmode=require"
   DIRECT_URL="postgresql://user:password@host.region.aws.neon.tech/dbname?sslmode=require"
   AUTH_SECRET="<random base64 string>"   # generate with: npx auth secret
   TWILIO_ACCOUNT_SID=""
   TWILIO_AUTH_TOKEN=""
   TWILIO_FROM_NUMBER=""
   SPOTIFY_CLIENT_ID=""
   SPOTIFY_CLIENT_SECRET=""
   SPOTIFY_REDIRECT_URI="http://127.0.0.1:3000/api/spotify/callback"
   ```

   - `DATABASE_URL` / `DIRECT_URL`: create a free database at
     [Neon](https://neon.tech) (recommended — fastest signup, works great
     with Vercel). Neon gives you two connection strings:
     - The **pooled** one (hostname ends in `-pooler`) → `DATABASE_URL`,
       used by the app at runtime via `@neondatabase/serverless`
       (WebSocket-based, works well in serverless/Vercel functions).
     - The **direct/unpooled** one (no `-pooler`) → `DIRECT_URL`, used only
       by Prisma Migrate to run schema migrations (pooled connections
       don't support the session features migrations need).
   - `AUTH_SECRET` is required by NextAuth to sign session tokens.
   - `TWILIO_*` variables are **optional** for local development. If left
     blank, verification codes are printed to the server console instead of
     being texted, so you can test the full 2FA flow without a Twilio
     account. To send real texts, create a Twilio account, buy/verify a
     phone number, and fill in the three `TWILIO_*` values.
   - `SPOTIFY_*` variables come from a Spotify app registered at the
     [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
     Register the redirect URI exactly as `http://127.0.0.1:3000/api/spotify/callback`
     (Spotify requires the literal loopback IP, not `localhost`, for
     non-HTTPS redirect URIs). Enable **Web API** and **Web Playback SDK**
     for the app.

3. Apply the database schema:

   ```bash
   npx prisma migrate dev
   ```

4. Seed the single user account (username `philip.chakram`, random password):

   ```bash
   npm run seed
   ```

   This prints a generated password to the terminal — **copy it somewhere
   safe**, it won't be shown again. Re-running the seed script resets the
   password to a new random one. Once logged in, you can change the
   password anytime from `/settings`.

5. Run the dev server:

   ```bash
   npm run dev
   ```

6. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (use `127.0.0.1`,
   not `localhost`, so cookies/redirects stay consistent with the Spotify
   redirect URI) and log in with `philip.chakram` and the password from
   step 4.
7. Go to **Settings** → **Connect Spotify** to link your account, then
   visit **Library** to see your saved tracks and play them.

## How it works

- **Login** (`/login`): posts credentials to `/api/auth/login-check`, which
  validates the password and, if 2FA is enabled, texts a 6-digit code and
  asks the login page to prompt for it. The final sign-in is completed via
  NextAuth's `signIn("credentials", …)`, which re-validates the password
  and code server-side.
- **Settings** (`/settings`, requires login):
  - Change password: verifies the current password before updating.
  - Enable 2FA: enter a phone number → a code is texted → enter the code to
    confirm and turn 2FA on.
  - Disable 2FA: one click, no re-verification (add re-auth if you want
    stricter security).
  - Connect Spotify: redirects to Spotify's Authorization Code OAuth flow;
    on success, access/refresh tokens are stored in the `SpotifyAccount`
    table tied to your user.
- **Library** (`/library`, requires login + connected Spotify account):
  - Fetches your saved tracks via `GET /me/tracks`, filtering out anything
    that isn't `type === "track"` (podcast episodes never appear in saved
    tracks, but this filter is a safety net) and omitting album art.
  - Initializes the Spotify Web Playback SDK client-side, which creates a
    "device" you can direct playback to — click **Play** on a track to
    start it. Requires **Spotify Premium**.
  - Access tokens are refreshed automatically server-side when expired
    (`src/lib/spotify-token.ts`).

## Project structure

```
src/
  auth.ts                       NextAuth config (Credentials provider)
  lib/
    prisma.ts                   Prisma client singleton
    sms.ts                      Twilio SMS helper (falls back to console.log)
    spotify.ts                  Spotify OAuth + Web API helpers (auth URL, token exchange/refresh)
    spotify-token.ts            Gets a valid (auto-refreshed) access token for a user
  app/
    page.tsx                    Home page (shows login or settings/library links)
    login/page.tsx
    settings/
      page.tsx                  Server component, loads current user + guards route
      settings-form.tsx         Client component: password + 2FA forms
      spotify-section.tsx       Client component: Connect Spotify button/status
    library/
      page.tsx                  Server component, guards route (requires connected Spotify account)
      library-client.tsx        Client component: track list + Web Playback SDK player
    actions.ts                  Server action for sign-out
    api/
      auth/
        [...nextauth]/route.ts  NextAuth handlers
        login-check/route.ts    Pre-flight check + SMS code send
      settings/
        change-password/route.ts
        2fa/enroll/route.ts
        2fa/verify/route.ts
        2fa/disable/route.ts
      spotify/
        login/route.ts          Redirects to Spotify's /authorize
        callback/route.ts       Exchanges code for tokens, stores them
        token/route.ts          Hands a fresh access token to the client SDK
        tracks/route.ts         Fetches + filters saved tracks
        play/route.ts           Starts playback on a Web Playback SDK device
prisma/
  schema.prisma                 User + SpotifyAccount models
  seed.ts                       Creates/resets the single "philip.chakram" account
```

## Deploying to Vercel

1. Push this repo to GitHub (already done) and import it in the
   [Vercel dashboard](https://vercel.com/new).
2. Create a Neon Postgres database (or use Vercel's Neon marketplace
   integration) and grab both the **pooled** and **direct** connection
   strings from its dashboard.
3. In the Vercel project's **Settings → Environment Variables**, add every
   variable from `.env` (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
   `TWILIO_*`, `SPOTIFY_*`) — pointing `SPOTIFY_REDIRECT_URI` at your
   production URL, e.g. `https://your-app.vercel.app/api/spotify/callback`.
4. Update the redirect URI in the Spotify Developer Dashboard to match
   exactly.
5. Run migrations against the production database once, from your machine:
   ```bash
   DATABASE_URL="<pooled connection string>" DIRECT_URL="<direct connection string>" npx prisma migrate deploy
   DATABASE_URL="<pooled connection string>" npm run seed
   ```
6. Deploy (Vercel will run `npm run build`, which generates the Prisma
   client automatically via the `build`/`postinstall` scripts).

## Notes & next steps

- Verification codes expire after 5 minutes and are single-use.
- Consider rate-limiting `login-check` and the 2FA endpoints before
  deploying publicly.
- Consider requiring re-authentication before disabling 2FA.
- The Spotify redirect URI must exactly match what's registered in the
  Spotify Developer Dashboard (`http://127.0.0.1:3000/api/spotify/callback`
  for local dev). If you deploy this somewhere with HTTPS, update
  `SPOTIFY_REDIRECT_URI` and register the new HTTPS URI in the dashboard.
- The Web Playback SDK requires **Spotify Premium** — playback requests
  will fail on Free accounts.
