# RepRounds

A mobile app for tracking gym workouts and martial arts training. Reps for the gym, rounds for the mat — one log.

Full spec: [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md) — that file is the source of truth. Build phases in order; do not skip ahead.

---

## Monorepo layout

```
/frontend   Expo RN app (Expo Router, React Query, expo-secure-store)
/backend    Cloudflare Worker (Hono) + Hyperdrive + Drizzle schema/migrations/seed
/shared     API contract types, field_config types, pure calculators (e.g. est. 1RM)
```

Package manager: **pnpm workspaces**. Always `pnpm install` from root. Each package has its own `package.json`; `shared` is imported as `@app/shared`.

---

## Hard boundaries

- `frontend` NEVER imports from `backend`. It only imports from `@app/shared`.
- `backend` owns the database exclusively — Drizzle schema, migrations, and seed all live here.
- `shared` is pure TypeScript only — no platform-specific code, no runtime deps beyond what both sides can use.
- Routines are **started on demand**, not scheduled — there is no calendar, recurrence, or RRULE projection. (The weekly-schedule/`/calendar` feature was removed; routines are reusable plans the user runs whenever.)
- Hyperdrive binding is required in production — never call Neon directly from a Worker.
- **Never use `@gorhom/bottom-sheet` `BottomSheetModal`** — its `present()` silently no-ops in release builds on RN 0.79 + New Architecture (two fix attempts failed on device, including `enableDynamicSizing={false}`). Use plain RN `Modal` with `presentationStyle="pageSheet"` like every existing dialog. The `BottomSheetModalProvider` in the root layout is vestigial.

---

## Auth rules

- Three sign-in methods: **Google** (primary), **email/password** (credential accounts), and **guest** (device-scoped). No Firebase.
- The Worker verifies the Google ID token against Google JWKS (signature + `iss` + `aud` + `exp`). Never trust the device's claim.
- Email/password: passwords are hashed with **PBKDF2-HMAC-SHA-256 via WebCrypto** (native, Workers-compatible — do NOT hand-roll crypto). Hashes are stored in a self-describing `algo$iterations$salt$hash` format so params can be rotated. workerd caps PBKDF2 at 100,000 iterations, which is the value used.
- Email uniqueness is enforced by a **partial unique index on `lower(email)` WHERE `password_hash IS NOT NULL`** (credential accounts only — Google accounts may share an email). Registering an email already tied to a Google account is rejected; use Google for it.
- Login failures return a uniform "Invalid email or password" — never leak which field was wrong.
- No password-reset flow yet (no transactional email infra) — see the note in `backend/src/routes/auth.ts`.
- Session JWT stored in `expo-secure-store` only — **never** AsyncStorage.
- EAS dev builds required for device testing — Expo Go does not support `@react-native-google-signin`.

---

## Data rules

- Every user-owned DB row is keyed by `user_id`.
- `user_id = NULL` on `exercises` / `disciplines` = global seed data visible to everyone.
- All `id` columns are `uuid DEFAULT gen_random_uuid()`.
- All tables have `created_at timestamptz NOT NULL DEFAULT now()`.
- **Training Focuses** (`training_focuses` + the `session_focuses` join table) are user-owned goals with a `focus_status` (active/achieved/archived); a mat session ticks which focuses it worked on. Scope every focus query by `user_id`.

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

## Deploy

**CI deploys the backend automatically**: `.github/workflows/deploy-backend.yml` runs `deploy:production` (migrate, then publish `reprounds-api-prod`) **and then `deploy:no-migrate` to publish the dev Worker `reprounds-api`** on every push to `main` or `develop` that touches `backend/` or `shared/`. Preview app builds (also develop-triggered) point at the production API, so the backend is always live before a new app build reaches a tester.

**Two Workers, one deploy.** `reprounds-api-prod` (prod, `[env.production]` in `wrangler.toml`) is what preview/Play builds call; `reprounds-api` (top-level config) is what **EAS dev builds** call (`EXPO_PUBLIC_API_URL` in the `development` profile). They currently share one Neon DB (same Hyperdrive id), so the dev Worker deploys with `deploy:no-migrate`. CI deploys **both** so a dev build never 404s on a route that shipped to prod — this exact drift once broke Training Focuses on the owner's dev build.

Manual deploy still works the same way:

```bash
pnpm --filter backend deploy:production   # runs db:migrate against Neon, THEN wrangler deploy --env production
```

The deploy scripts **always apply pending Drizzle migrations to production before publishing the Worker**, so schema-dependent code never ships ahead of the database. (Skipping this is how a missing `notes` column once broke `GET /sessions/:id` in prod while the session list kept working.)

- The migrate step reads `DATABASE_URL` from the root `.env` via `drizzle.config.ts` — same as `db:migrate`.
- Migrate-before-deploy is correct for **additive** migrations (new column/table). For a **destructive** change (drop/rename a column the live code still reads), deploy the new code first, then migrate — use `pnpm --filter backend deploy:no-migrate` followed by `pnpm --filter backend db:migrate`.

---

## App builds & Play Store delivery

The **entire tester loop is automatic**: push to `develop` → backend deploys (~2 min) → `.github/workflows/selfhosted-preview-mobile.yml` ("Preview mobile (Gradle)") builds a signed AAB on a GitHub-hosted runner (~20 min) and submits it to the Play **closed testing (alpha)** track → testers get an Update in the Play Store. To ship after merging to `main`, fast-forward develop (`git push origin origin/main:refs/heads/develop`) — the repo convention is that develop mirrors main.

Facts that save debugging time:

- **EAS Build is NOT used for previews** — the free-plan quota ran out (resets monthly). The Gradle workflow costs no EAS quota: `expo prebuild` → `frontend/scripts/apply-android-signing.js` (patches in upload-key signing from env) → `gradlew :app:bundleRelease`. The EAS workflows (`preview-mobile.yml`, `release-mobile.yml`) remain as manual/tag-triggered fallbacks but burn quota.
- **Submit to the `alpha` (closed) track, never `internal`** — the real testers (including the owner's phone) are enrolled on closed testing; internal-track builds are invisible to them. The two tracks have separate tester lists and separate opt-in links.
- **versionCode = 100 + workflow run number**, injected via `ANDROID_VERSION_CODE` (see `app.config.ts`). EAS builds ignore it (`appVersionSource: remote`).
- Required GitHub secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (upload keystore exported from EAS), `GOOGLE_PLAY_KEY_BASE64`, plus `CLOUDFLARE_API_TOKEN` / `DATABASE_URL` for the backend deploy. All are configured.
- Production release = Play Console → Closed testing → **Promote release → Production** (no rebuild), or tag `v*` (EAS path, quota permitting).
- A **Draft** release sitting on a Play track blocks/confuses API submissions — discard drafts created in the console.

---

## Specialized agents (`.claude/agents/`)

Invoke these for deep domain work:

| Agent | Use for |
|---|---|
| `frontend-rn` | Expo RN screens, navigation, React Query hooks, UI components |
| `backend-worker` | Hono routes, Cloudflare Worker config, Wrangler, Hyperdrive |
| `database` | Drizzle schema, migrations, seed, SQL queries |
| `auth` | Google Sign-In flow, JWT minting/verification, JWKS |
| `shared-types` | API contract types, field_config schema, est. 1RM calculator |
| `security-reviewer` | Pre-commit/pre-push security review: leaked secrets, auth/authz mistakes, IDOR, injection risks, data exposure |

---

## Security

`.githooks/` runs a secret scanner on every `git commit` (staged diff) and `git push` (pushed commits). It blocks on API keys, tokens, private key blocks, `.env` files, and `.claude/settings*.json`. Bypass with `--no-verify` only when the diff is confirmed clean.

For deeper AI-powered review before committing, invoke the `security-reviewer` agent — it checks auth/authz scoping, IDOR, injection risks, and data exposure in addition to secrets.
