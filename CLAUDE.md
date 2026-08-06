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
- Routines are **started on demand** or scheduled as **one-off planned sessions** (`sessions.status='planned'`, created from the `/calendar` screen, started via `POST /sessions/:id/start`). There is **still no recurrence**: no RRULE, no schedule-rules tables, no recurrence columns — the removed weekly-schedule layer stays removed. Scheduling = a normal `sessions` row with `status='planned'` on a future date, nothing more.
- Hyperdrive binding is required in production — never call Neon directly from a Worker.
- **Never use `@gorhom/bottom-sheet` `BottomSheetModal`** — its `present()` silently no-ops in release builds on RN 0.79 + New Architecture (two fix attempts failed on device, including `enableDynamicSizing={false}`). Use plain RN `Modal` with `presentationStyle="pageSheet"` like every existing dialog. The `BottomSheetModalProvider` in the root layout is vestigial.
- **Tab screens must not carry their own `entering` animation.** `(tabs)/_layout.tsx` already slides scenes horizontally, and bottom-tabs mounts each screen lazily — so a screen-level `FadeInDown` fires *during* that slide on the first visit to a tab and the page appears to rise from underneath before sliding. Same applies to pushed stack screens, which get the platform's slide-from-right.
- **Nothing inside a `DraggableFlatList` cell may animate its own height.** No Reanimated `layout={LinearTransition}` / `exiting=` on a row or anything it wraps, and no state that re-renders the list while a pan is active. `react-native-draggable-flatlist@4.0.3` is the last release published before Fabric; it caches cell offsets and re-parents the cell it is dragging, so a card whose height eases underneath it leaves those offsets stale — the list freezes mid-drag and the app dies natively (past the `ErrorBoundary`, so there's no error screen to read). This is exactly how in-session reorder broke. `entering=` on a subtree *inside* an expanded card is fine; it never takes part in a reorder. The session screen also parks its rest and elapsed countdowns for the length of a drag (`draggingRef`) for the same reason.

---

## Known gaps

- **Writes are not idempotent.** Mutations run `networkMode: 'offlineFirst'` with a retry predicate, and `resumePausedMutations()` replays whatever was queued offline. A POST that reached Postgres but whose response was lost will be retried and insert a second row. The window is narrow and the blast radius is one duplicate row the user can delete, so the fix (a client-generated idempotency key plus a unique index and upsert on every write endpoint) is deliberately deferred. Revisit if it's ever reported.
- **`GET /sessions` has no cursor pagination**, only `limit` (default 50, max 200). Aggregate call sites pass `MAX_SESSIONS_PAGE`, so any lifetime count derived from that list is correct to 200 sessions and silently truncates past that. `GET /notes` has the cursor implementation to copy when this needs fixing properly. The Stats tab no longer reads it — every number there comes from a `/stats/*` aggregate, so it stays correct at any history length.

---

## Stats endpoints

- **Every `/stats/*` window is `[since, until)` — bounded at both ends.** `sessions.date` accepts dates arbitrarily far into the future, so an open-ended top bound lets a workout logged with a mistyped year count as current: a top lift, or a "new PR" sorted first because the feed orders by date descending. `/weekly` and `/mat` derive `until` from `weeks`; the rest take it as a query param and fall back to open-ended when it's absent.
- **Warm-ups are not working sets.** `set_type <> 'warmup'` belongs in every lifting aggregate — `/muscles`, `/top-lifts`, `/prs` and `/exercises/:id/prs` all apply it. The muscle heat map normalises against the max, so counting warm-ups there turned "I ramp up on bench and not on rows" into a colour difference.
- **Never do date arithmetic on a bound parameter.** postgres-js binds a JS number with type OID 0, so `${date}::date + ${days}` reaches Postgres as `date + unknown` — four candidate operators across three type categories, which fails to resolve with `operator is not unique` on *every* call. Compute the other end in TypeScript (`addDaysISO`) and compare date to date. Prefer an explicit cast anywhere else a type could be ambiguous, e.g. `date_trunc('week', s.date::timestamp)`.
- **The mocked route tests cannot catch any of the above.** `stats.*.test.ts` mock `db.execute` and assert on the rendered SQL string, so no query is ever parsed or planned. `pnpm --filter backend test:pg` boots a throwaway Postgres, applies every migration and runs the real handlers against it (`stats.integration.test.ts`, skipped when `STATS_IT_DATABASE_URL` is unset). Add a case there for anything that depends on Postgres actually executing the query.

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
- **An exercise's muscles are `muscle_group` (primary) + `secondary_muscles` (`text[]`)**, and the heat map weights the primary twice what a secondary gets (`frontend/src/lib/muscleSlugMap.ts`). Two vocabularies live in those columns: the seed's Title-Case anatomy (`Lats`, `Quadriceps`) and the pick-list's gym shorthand (`MUSCLE_GROUPS` in `@app/shared`). Reads accept either — `muscleSlugMap` normalizes; **writes accept only `MUSCLE_GROUPS`**.
- **Re-tagging a seeded exercise writes to `exercise_muscle_overrides`, never to the `exercises` row.** Global rows are shared by every user, so editing Pull-ups in place would change it for everyone, and forking a personal copy would give it a new id that the user's existing `session_entries` don't point at. Every read of muscles must resolve the caller's override over the catalogue value — `GET /exercises`, `GET /exercises/:id`, and `GET /stats/muscles` all do. An override replaces the whole tagging rather than merging, so test for it on the NOT NULL `secondary_muscles` column, not with `COALESCE` on the primary alone.

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
