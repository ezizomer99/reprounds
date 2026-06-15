# Glima Tracker

A mobile app for tracking gym workouts (strength + conditioning) and martial arts training in one place, with a unified calendar and recurring weekly schedule. Named for glíma, the centuries-old Norse grappling art. Android/Samsung is the primary target; iOS is supported.

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | Expo (managed) + React Native + TypeScript |
| Navigation | Expo Router (file-based) |
| Server state | TanStack Query (React Query) |
| Secure storage | expo-secure-store |
| Auth (device) | @react-native-google-signin/google-signin |
| Backend | Cloudflare Workers + Hono |
| DB proxy | Cloudflare Hyperdrive |
| Database | Neon (serverless Postgres) |
| ORM / migrations | Drizzle ORM |
| Monorepo | pnpm workspaces |

---

## Prerequisites

- **Node.js** >= 20
- **pnpm** — `npm install -g pnpm`
- **Wrangler CLI** — `pnpm add -g wrangler` (Cloudflare Worker dev + deploy)
- **EAS CLI** — `pnpm add -g eas-cli` (device builds — Expo Go does not support Google sign-in)
- A **Neon** Postgres database (free tier works)
- A **Google Cloud** project with OAuth 2.0 credentials (Web + Android client IDs)

---

## Getting started

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/ezizomer99/glima-tracker.git
   cd glima-tracker
   pnpm install
   ```

2. Configure secrets (see [Environment setup](#environment-setup) below).

3. Start the backend dev server:
   ```bash
   pnpm --filter backend dev
   ```

4. Start the frontend bundler, then connect a device via EAS dev build:
   ```bash
   pnpm --filter frontend start
   ```

---

## Environment setup

### Backend (Cloudflare Worker)

Set these via `wrangler secret put` — never commit them:

```bash
wrangler secret put JWT_SECRET        # random 32+ byte string for signing session JWTs
wrangler secret put GOOGLE_CLIENT_ID  # Web OAuth client ID from Google Cloud Console
```

The Hyperdrive binding and its local connection string are already in `backend/wrangler.toml`.

### Frontend (Expo)

Configure Google client IDs in `app.json` / `eas.json` at build time:

- **Web OAuth client ID** — used by `@react-native-google-signin` on both platforms
- **Android OAuth client ID** — register your debug **and** release SHA-1 fingerprints in Google Cloud Console; release builds break silently if the release fingerprint is missing

---

## Project structure

```
glima-tracker/
  frontend/          Expo RN app (Expo Router, React Query, expo-secure-store)
  backend/           Cloudflare Worker (Hono) + Hyperdrive
                     Drizzle schema, migrations, seed + RRULE projection
  shared/            API contract types, field_config types, pure calculators (est. 1RM)
                     imported as @app/shared
  docs/
    BUILD_SPEC.md    Full specification — data model, API surface, build phases
  .claude/agents/    Specialized AI agents for domain work
  .githooks/         Pre-commit secret scanner + pre-push hook
```

`frontend` never imports from `backend` — only from `@app/shared`. `backend` owns the database exclusively. All recurrence projection happens server-side in the `/calendar` endpoint.

---

## Common commands

```bash
# From repo root
pnpm install

# Backend (Wrangler dev server)
pnpm --filter backend dev

# Frontend (Metro bundler — use EAS for device)
pnpm --filter frontend start

# Database
pnpm --filter backend db:generate   # generate Drizzle migration
pnpm --filter backend db:migrate    # apply migrations to Neon
pnpm --filter backend db:seed       # seed global defaults
```

---

## Security

Git hooks in `.githooks/` run automatically on every commit and push, scanning for leaked secrets (API keys, tokens, private key blocks, `.env` files). Bypass with `--no-verify` only when the diff is confirmed clean.

For a deeper pre-commit review, use the `security-reviewer` agent — it checks auth/authz scoping, IDOR, injection risks, and data exposure in addition to secrets.

---

See [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md) for the full architecture, data model, API surface, and build phases.
