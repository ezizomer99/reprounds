# RepRounds

A mobile app for tracking gym workouts and martial arts training. Reps for the gym, rounds for the mat — one log.

Full spec: [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md) — that file is the source of truth. Build phases in order; do not skip ahead.

---

## Monorepo layout

```
/frontend   Expo RN app (Expo Router, React Query, expo-secure-store)
/backend    Cloudflare Worker (Hono) + Hyperdrive + Drizzle schema/migrations/seed + RRULE projection
/shared     API contract types, field_config types, pure calculators (e.g. est. 1RM)
```

Package manager: **pnpm workspaces**. Always `pnpm install` from root. Each package has its own `package.json`; `shared` is imported as `@app/shared`.

---

## Hard boundaries

- `frontend` NEVER imports from `backend`. It only imports from `@app/shared`.
- `backend` owns the database exclusively — Drizzle schema, migrations, seed, and RRULE projection all live here.
- `shared` is pure TypeScript only — no platform-specific code, no runtime deps beyond what both sides can use.
- RRULE recurrence is computed **server-side only** (in the `/calendar` endpoint). Never project dates in the app.
- Hyperdrive binding is required in production — never call Neon directly from a Worker.

---

## Auth rules

- Google sign-in only — no passwords, no Firebase.
- The Worker verifies the Google ID token against Google JWKS (signature + `iss` + `aud` + `exp`). Never trust the device's claim.
- Session JWT stored in `expo-secure-store` only — **never** AsyncStorage.
- EAS dev builds required for device testing — Expo Go does not support `@react-native-google-signin`.

---

## Data rules

- Every user-owned DB row is keyed by `user_id`.
- `user_id = NULL` on `exercises` / `disciplines` = global seed data visible to everyone.
- All `id` columns are `uuid DEFAULT gen_random_uuid()`.
- All tables have `created_at timestamptz NOT NULL DEFAULT now()`.

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

```bash
pnpm --filter backend deploy   # runs db:migrate against Neon, THEN wrangler deploy
```

The Worker is deployed manually — there is no CI deploy. `deploy` **always applies pending Drizzle migrations to production before publishing the Worker**, so schema-dependent code never ships ahead of the database. (Skipping this is how a missing `notes` column once broke `GET /sessions/:id` in prod while the session list kept working.)

- The migrate step reads `DATABASE_URL` from the root `.env` via `drizzle.config.ts` — same as `db:migrate`.
- Migrate-before-deploy is correct for **additive** migrations (new column/table). For a **destructive** change (drop/rename a column the live code still reads), deploy the new code first, then migrate — use `pnpm --filter backend deploy:no-migrate` followed by `pnpm --filter backend db:migrate`.

---

## Specialized agents (`.claude/agents/`)

Invoke these for deep domain work:

| Agent | Use for |
|---|---|
| `frontend-rn` | Expo RN screens, navigation, React Query hooks, UI components |
| `backend-worker` | Hono routes, Cloudflare Worker config, Wrangler, Hyperdrive |
| `database` | Drizzle schema, migrations, seed, SQL queries |
| `auth` | Google Sign-In flow, JWT minting/verification, JWKS |
| `calendar-recurrence` | RRULE projection, exception materialization, the three edit modes |
| `shared-types` | API contract types, field_config schema, est. 1RM calculator |
| `security-reviewer` | Pre-commit/pre-push security review: leaked secrets, auth/authz mistakes, IDOR, injection risks, data exposure |

---

## Security

`.githooks/` runs a secret scanner on every `git commit` (staged diff) and `git push` (pushed commits). It blocks on API keys, tokens, private key blocks, `.env` files, and `.claude/settings*.json`. Bypass with `--no-verify` only when the diff is confirmed clean.

For deeper AI-powered review before committing, invoke the `security-reviewer` agent — it checks auth/authz scoping, IDOR, injection risks, and data exposure in addition to secrets.
