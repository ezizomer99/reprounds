# RepRounds

A mobile app for tracking gym workouts (strength + conditioning) and martial arts training in one place. Reps for the gym, rounds for the mat — one log. Log lifts with set types/RPE/rest timers and mat sessions with a data-driven round logger; reuse routines started on demand; track ongoing goals with Training Focuses; and keep combat-sports records (partners, fights, belt promotions, body weight). Android/Samsung is the primary target; iOS is supported.

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | Expo (managed) + React Native + TypeScript |
| Navigation | Expo Router (file-based) |
| Server state | TanStack Query (React Query) |
| Secure storage | expo-secure-store |
| Auth | Google Sign-In (@react-native-google-signin), email/password, guest |
| Subscriptions | RevenueCat (react-native-purchases) |
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
- A **Google Cloud** project with OAuth 2.0 credentials (Web + Android client IDs) — only needed for Google sign-in; email/password and guest auth work without it

---

## Getting started

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/ezizomer99/reprounds.git
   cd reprounds
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
reprounds/
  frontend/          Expo RN app (Expo Router, React Query, expo-secure-store)
  backend/           Cloudflare Worker (Hono) + Hyperdrive
                     Drizzle schema, migrations, seed
  shared/            API contract types, field_config types, pure calculators (est. 1RM)
                     imported as @app/shared
  docs/
    BUILD_SPEC.md    Full specification — data model, API surface, build phases
    DEPLOYMENT.md    Operator runbook for the Google Play launch
    PROGRESS.md      Build phase status + launch checklist
  .claude/agents/    Specialized AI agents for domain work
  .githooks/         Pre-commit secret scanner + pre-push hook
```

`frontend` never imports from `backend` — only from `@app/shared`. `backend` owns the database exclusively. Routines are started on demand (no calendar/recurrence).

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

# Tests + typecheck (all workspaces)
pnpm test
pnpm typecheck

# Deploy backend (applies pending migrations first, then wrangler deploy)
pnpm --filter backend deploy              # dev worker
pnpm --filter backend deploy:production   # production worker
```

---

## Security

Git hooks in `.githooks/` run automatically on every commit and push, scanning for leaked secrets (API keys, tokens, private key blocks, `.env` files). Bypass with `--no-verify` only when the diff is confirmed clean.

For a deeper pre-commit review, use the `security-reviewer` agent — it checks auth/authz scoping, IDOR, injection risks, and data exposure in addition to secrets.

---

See [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md) for the full architecture, data model, API surface, and build phases.
