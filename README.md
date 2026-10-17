# Ashtray

A multi-user cigarette and drink tracker with a private friend circle, actual paid prices, sourced Indian pack-price references, and the original mobile 3D interface. Vercel uses durable Neon storage; local development can use SQLite.

## Run locally

Node 22.13+ is required for the built-in SQLite runtime (tested on Node 25.6).

```sh
npm install
npm run dev
```

For the production version:

```sh
npm run build
npm start
```

Open http://localhost:3000. The server binds to the local network so a friend on the **same Wi-Fi** can open `http://YOUR_LOCAL_IP:3000`, create a separate account, and connect through Your circle. The invite button resolves the local network address when copied from localhost. Keep this computer and server running. This local build has no public hosting, password recovery, or email verification; use a unique password and keep it on a trusted local network.

## Accounts and privacy

To add a friend:

1. Create your own account, then open **Circle → Bring a friend** and copy your invite link.
2. Your friend opens the link on their phone and creates their own username and password.
3. They send the prefilled friend request. You accept it in Circle.
4. Each of you can enable **Share cigarette details** to share today’s brands, quantities and times.

Each account saves its own logs independently, including before a friendship is connected. Your friend can sign in with the same account on another device connected to this same server.

Accounts use usernames and scrypt-hashed passwords. Sessions use hashed random tokens in HttpOnly, SameSite cookies. Each ledger and mutation is scoped to its signed-in owner. Friend requests require acceptance. Accepted friends see the cigarette information you choose. Counts only is the default and preserves existing accounts’ settings: today’s cigarette total, weekly pattern/spend, daily limit and last cigarette time. The optional details mode adds today’s cigarette brands, quantities and exact times in the sharing account’s timezone. It includes up to50 recent entries and clearly marks truncation. Private mode hides all activity while keeping the connection and name visible. Notes, drink logs and individual paid prices are never included in friend activity payloads.

An authenticated server-sent event connection checks permitted revisions every two seconds and refreshes changed summaries. The stream carries opaque revisions, never private logs. Private activity and drink logs do not trigger friend activity notifications. Hidden tabs suspend streaming; returning to the app reconnects and reconciles the latest state. A visible Live/Syncing/Offline indicator reflects connection state. A slower refresh fallback handles reconnects and day rollover. Tabs on the same origin also coordinate saves and account changes.

Check-ins use unique request IDs to make uncertain network retries safe. A delayed refresh cannot overwrite a successful save. If a response is lost after the server saved a check-in, reconciliation confirms the saved entry and clears the retry message. Offline check-ins require reconnection before saving.

Local state lives in `data/ashtray.sqlite` with SQLite WAL files. This directory is excluded from Git and Vercel uploads. Back up the database using SQLite's backup API or stop the server before copying the whole `data/` directory. Restarting the local app does not clear accounts.

On Vercel, accounts, hashed sessions, logs, friendships, retry keys and revision counters live in the separate `ashtray` schema of the configured Neon database. Every request uses an authenticated owner scope; no local filesystem is used for hosted account storage. Deploying a new app version does not clear hosted accounts.

## Hosting and Git pushes

Git contains the app source and assets. Account databases, sessions, passwords, local credentials and screenshots are excluded. A push does not upload or move saved accounts and logs.

Vercel uses the durable cloud adapter automatically; it never falls back to SQLite. Configure `DATABASE_URL` as a sensitive environment variable for Production and Preview, and set `ASHTRAY_STORAGE=neon`. Run the explicit, idempotent schema setup once before deployment:

```sh
node --env-file=/secure/path/cloud.env scripts/setup-cloud.mjs --apply
ASHTRAY_CLOUD_TEST=1 node --env-file=/secure/path/cloud.env scripts/test-cloud-social.mjs
vercel --prod
```

The setup creates only the isolated `ashtray` schema. It does not modify the original `public.events`, products or settings. Database migrations never run automatically in web requests. Cloud tests create uniquely named QA accounts and remove only their own fixtures.

Cloud writes use PostgreSQL transactions, durable attempt limits and idempotency keys. Each snapshot is read atomically. Server-sent event connections recheck authenticated revisions without loading event bodies, and reconnect before Vercel's configured request duration ends. The original shared history remains preserved separately; assigning it to an account requires choosing its owner explicitly.

## Prices and calculations

[PRICING.md](PRICING.md) records exact sources, dates, variants and limits. Premium loose sticks default to the user's stated **₹25 estimate**, independently of observed pack-derived references. The usual price is editable in Settings; the actual price and quantity are entered on each log. Changing a catalogue or preference never rewrites a historical paid price. Unverified variants and drinks are explicitly labelled as estimates.

Tracking days use the account's timezone, including after timezone changes. The activity ledger preserves each entry's original date/time. Empty dates mean missing logs, not confirmed smoke-free days. The app does not calculate individual life expectancy or infer nicotine exposure from brand names.

## Existing tracker and history

This working copy was created from `/Users/prabhas/dev/cig-tracker`. The original project, untracked product images, credentials, and Neon database were preserved. Credentials were not copied into this app. The original unauthenticated server actions have been replaced with owner-scoped local actions.

The new local database starts with no user history. Create your intended account first, then preview the read-only legacy import:

```sh
/usr/local/bin/node scripts/import-legacy.mjs --env /Users/prabhas/dev/cig-tracker/.env.local --username YOUR_USERNAME
```

Add `--apply` to import the previewed history into that explicit account. Add `--include-settings` on the first import if you also want the original baseline, timezone, city and favorites. The source database is read inside a read-only transaction. The local write is atomic and idempotent; historic prices are preserved, and a source record cannot be silently assigned to a different account. No automatic import was run.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

The integration test uses a temporary database. It covers authentication, session invalidation, owner isolation, input validation, historic prices, invitation acceptance, private mode, removal, restart persistence, request-body limits and CSRF (including localhost/LAN hosts), live revision delivery, cross-process updates, disconnect cleanup, privacy of revision timing, and idempotent retries. Browser verification covered two separate accounts on localhost and the Wi-Fi address, real invitation acceptance, live friend check-ins without reloading, summary privacy, price changes, logging, desktop and 320px layouts, native dialog focus, and empty states.

The client sync suite executes the actual hook source with controlled requests and hook effects. It checks stale refreshes, recovery after a committed response is lost, stale stream callbacks, and account changes during an in-flight save. It uses no app database and adds no test dependency.

## Design research

Refero research reviewed 50 screens and 8 detailed references, including Clearful's weekly activity, Monarch's spend hierarchy, Duolingo's invite flow, and privacy controls from Pinterest and Handshake. The final design builds on the original rendered Ashtray: white/black/cream, compact elapsed timer, physical cigarette and drink assets, one-tap shelves, and the finite smoke/ash animation. Friends, stats and the searchable shelf sit behind a compact bottom bar. Native bottom sheets, visible focus, 44px actions, reduced-motion support and readable inputs improve mobile use without replacing the original identity.

The object polish also studied Refero's [ID by amo](https://refero.design/screens/933bfdaa-36da-4ffe-96e0-69c3f32d51a5) and [sticker presentation reference](https://refero.design/screens/c05ac0ec-afdf-4351-bdf8-69b2a0fb7cf1). Transparent SVG objects use die-cut edges, paper/cork texture, cylindrical shading, glass refraction and distinct serving vessels. A saved tap lifts its object from the measured shelf position; cigarette smoke and falling ash share the actual tip geometry. Drinks ripple only when their container is open. The finite effect stays decorative and skips under reduced motion. Sheets support a downward drag on the grabber, Escape, a close button and focus restoration.
