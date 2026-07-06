# RepRounds — Build Spec

*Reps for the gym, rounds for the mat — one log.*

A mobile app for tracking **gym workouts** (strength + conditioning) and **martial arts** training (BJJ first, other arts later) in one place, with a unified calendar and recurring weekly schedule.

This document was the source of truth for the initial build (phases 0–7 have
all shipped — see [PROGRESS.md](PROGRESS.md) for current status). It remains
the reference for the domain model and architecture decisions; amendments are
marked *[amended]* where the shipped product deliberately went beyond it.

---

## 1. Goals

- Log gym workouts with the speed and feel of Hevy / StrengthLog: fast set entry, "last time" shown inline, set types, RPE/RIR, rest timers.
- Log martial arts sessions as a lightweight journal: discipline, gi/no-gi (where relevant), what was taught/focused on, notes.
- One calendar showing both training types, driven by a recurring weekly schedule with per-instance exceptions (Google Calendar–style editing).
- Built to add new martial arts later with **zero code changes** (data-driven discipline forms).
- Single user to start, but multi-user-ready (every row keyed by `user_id`).
- Google sign-in as the primary method. *[amended: the shipped product also
  supports email/password accounts (PBKDF2-hashed, credential-only partial
  unique index on lower(email)) and device-scoped guest accounts that migrate
  into a real account on sign-in — see CLAUDE.md "Auth rules".]*

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile app | Expo (managed) + React Native + TypeScript | Requires **EAS dev builds** (Google sign-in can't run in Expo Go). |
| Navigation | Expo Router | File-based routing. |
| Server state | TanStack Query (React Query) | Caching, optimistic updates for snappy logging. |
| Secure storage | `expo-secure-store` | Stores our session JWT in Keychain/Keystore — never AsyncStorage. |
| Auth (device) | `@react-native-google-signin/google-signin` | Current Expo-recommended package. **Firebase not required.** |
| API | Cloudflare Workers + Hono | Hono is a lightweight router that runs well on Workers. |
| DB connection | Cloudflare Hyperdrive | Pools/caches the Postgres connection from the Worker. |
| Database | Neon (serverless Postgres) | Real Postgres, serverless. |
| ORM / migrations | Drizzle ORM | Type-safe, Workers/Neon friendly, schema + migrations in code. |
| Repo | pnpm monorepo (optionally Turborepo) | Share types between client and server. |

All of the above are recommendations — reasonable to swap (e.g. a different Worker framework), but the rest of this spec assumes them.

---

## 3. Architecture

```
[Expo RN app] --HTTPS--> [Cloudflare Worker API (Hono)] --Hyperdrive--> [Neon Postgres]
       |                          |
  expo-secure-store         verifies Google ID token,
  (session JWT)             issues + verifies our session JWT
```

- The app never talks to Postgres directly. All data goes through the Worker API.
- The Worker is stateless; auth is a Bearer session JWT on every request.
- Server state is cached client-side with React Query; writes use optimistic updates so logging feels instant.

---

## 4. Data model

Postgres DDL below is the canonical schema (implement via Drizzle). All `id`s are `uuid` default `gen_random_uuid()`. All tables have `created_at timestamptz default now()`.

A row with `user_id = NULL` in `exercises` / `disciplines` is a **global default** (seeded), visible to everyone; a non-null `user_id` is a user's custom item.

```sql
-- Enums
CREATE TYPE activity_type   AS ENUM ('strength', 'conditioning', 'martial_arts');
CREATE TYPE entry_kind      AS ENUM ('exercise', 'martial_arts');
CREATE TYPE discipline_cat  AS ENUM ('grappling', 'striking', 'mixed');
CREATE TYPE session_status  AS ENUM ('planned', 'in_progress', 'completed', 'skipped');
CREATE TYPE set_type        AS ENUM ('warmup', 'normal', 'drop', 'failure', 'amrap');
CREATE TYPE gi_type         AS ENUM ('gi', 'no_gi');

-- Users (no password column — Google identity only)
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub  text UNIQUE NOT NULL,
  email       text NOT NULL,
  name        text,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Gym movement library (strength + conditioning)
CREATE TABLE exercises (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id) ON DELETE CASCADE,  -- NULL = global default
  name                text NOT NULL,
  type                activity_type NOT NULL,  -- 'strength' | 'conditioning'
  default_rest_seconds int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Martial arts disciplines (BJJ, Muay Thai, Judo, ...)
CREATE TABLE disciplines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,  -- NULL = global default
  name         text NOT NULL,
  category     discipline_cat NOT NULL,
  field_config jsonb NOT NULL DEFAULT '[]',  -- drives the dynamic logging form (see §5.3)
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Reusable plans with optional recurrence ("Lift + bag day", "Tuesday BJJ")
CREATE TABLE routines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  day_label    text,
  notes        text,
  rrule        text,        -- RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=TU"; NULL = unscheduled
  start_date   date,
  end_date     date,        -- NULL = open-ended
  time_of_day  time,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON routines(user_id);

CREATE TABLE routine_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id           uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  kind                 entry_kind NOT NULL,
  exercise_id          uuid REFERENCES exercises(id),    -- when kind='exercise'
  discipline_id        uuid REFERENCES disciplines(id),  -- when kind='martial_arts'
  order_index          int NOT NULL DEFAULT 0,
  superset_group       int,
  default_rest_seconds int,
  target               jsonb,  -- PlannedSet[] e.g. [{"sets":3,"reps":5,"weight":100}]
  CHECK ( (kind='exercise' AND exercise_id IS NOT NULL AND discipline_id IS NULL)
       OR (kind='martial_arts' AND discipline_id IS NOT NULL AND exercise_id IS NULL) )
);

-- A concrete dated session (the "instance"). See §5.2 for how these relate to routines.
CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id       uuid REFERENCES routines(id),   -- optional source routine
  date             date NOT NULL,
  status           session_status NOT NULL DEFAULT 'planned',
  started_at       timestamptz,
  completed_at     timestamptz,
  duration_minutes int,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- One activity within a session (a lift, a bag round, a BJJ class)
CREATE TABLE session_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind           entry_kind NOT NULL,
  exercise_id    uuid REFERENCES exercises(id),
  discipline_id  uuid REFERENCES disciplines(id),
  gi             gi_type,            -- promoted for fast filtering (martial_arts only)
  order_index    int NOT NULL DEFAULT 0,
  superset_group int,
  rest_seconds   int,
  details        jsonb,              -- conditioning data + dynamic martial-arts fields
  notes          text,
  CHECK ( (kind='exercise' AND exercise_id IS NOT NULL AND discipline_id IS NULL)
       OR (kind='martial_arts' AND discipline_id IS NOT NULL AND exercise_id IS NULL) )
);

-- Per-set rows for strength entries (the basis for progression/PR/1RM)
CREATE TABLE strength_sets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_entry_id uuid NOT NULL REFERENCES session_entries(id) ON DELETE CASCADE,
  set_number       int NOT NULL,
  set_type         set_type NOT NULL DEFAULT 'normal',
  reps             int,
  weight           numeric,
  rpe              numeric,
  rir              int,
  completed        boolean NOT NULL DEFAULT false
);
```

Indexes worth adding: `sessions(user_id, date)`, `session_entries(session_id)`, `strength_sets(session_entry_id)`, `session_entries(exercise_id)` (for "last time" + history lookups). `routines(user_id)` is already included in the DDL above.

---

## 5. Key subsystems

### 5.1 Auth (Google → our JWT)

1. App calls Google sign-in (`@react-native-google-signin/google-signin`) → receives a Google **ID token**.
2. App `POST /auth/google { idToken }`.
3. Worker verifies the ID token against Google's JWKS: signature, `iss`, `aud` (our web client ID), `exp`. **Never trust the device's claim unverified.**
4. Worker upserts the user by `google_sub`, mints our own signed session JWT (short-ish expiry + refresh strategy), returns it.
5. App stores the session JWT in `expo-secure-store`, sends it as `Authorization: Bearer` on every call.

Setup gotchas to handle: needs a **Web OAuth client ID** (used on both platforms) + an iOS client ID; register **both debug and release SHA-1 fingerprints** in Google Cloud Console or release builds break silently.

### 5.2 Recurring schedule + exceptions

The recurrence fields (`rrule`, `start_date`, `end_date`, `time_of_day`) live directly on the `routines` row — there is no separate schedule table. A routine with `rrule = NULL` is an unscheduled plan; one with an rrule is a recurring series. Use a maintained RRULE library to compute occurrence dates — do not hand-roll calendar math.

- The calendar endpoint returns, for a date range: all real `sessions` rows in range, **plus** virtual occurrences projected from the routine's `rrule` **for dates that don't already have a session row** linked to that routine.
- **Skipping one day** (`POST /routines/:id/skip`): materializes a `sessions` row for that date with status `skipped`, linked via `routine_id`. The projector skips that date on future requests because a row already exists. Other dates keep generating untouched.
- **Three edit modes** (Google Calendar parity):
  - **single** — skip/materialize one occurrence as above.
  - **this & following** — set `end_date` on the current routine, create a new routine (copying name, items, and rrule) starting from that date with the modified values.
  - **all** — edit the routine's `rrule`/schedule fields directly.
- Logging against a planned day flips its session to `completed` (materializing it if it was still virtual).

### 5.3 Dynamic discipline forms

- Each `disciplines.field_config` is an ordered array of field defs:
  ```json
  [
    { "key": "gi", "label": "Gi / No-gi", "type": "enum", "options": ["gi","no_gi"], "column": "gi" },
    { "key": "focus", "label": "Focus", "type": "text" },
    { "key": "rounds", "label": "Rounds", "type": "number" },
    { "key": "sparred", "label": "Sparred", "type": "boolean" }
  ]
  ```
- Supported `type` values (keep this set small and fixed): `enum`, `boolean`, `number`, `text`, `textarea`.
- A renderer maps each `type` → RN input. Values save into `session_entries.details` keyed by `key`.
- Special case: a field with `"column": "gi"` is **also** written to the promoted `session_entries.gi` column for fast filtering. Everything else lives in `details`.
- Adding a new art = inserting a `disciplines` row with its `field_config`. No new code, no migration.

### 5.4 "Last time" + computed stats

- On opening an exercise in the logger, fetch the most recent prior `session_entries` (+ `strength_sets`) for that `exercise_id` and show it inline.
- Estimated 1RM and PRs are **computed** from `strength_sets` (e.g. Epley) — no PR table in v1.

---

## 6. MVP scope

**In v1**
- Google auth + account
- Exercise library (seeded defaults + custom) and discipline library (seeded defaults + custom)
- Dynamic discipline forms (the engine, seeded with BJJ; ready for more arts)
- Templates (gym days and martial-arts days)
- Logging: strength (set types, reps/weight, RPE/RIR, rest timer, "last time", reorder, per-set/exercise notes); conditioning (rounds/duration via `details`); martial arts (dynamic form + gi)
- Calendar with recurring schedule + per-instance exceptions
- Session history
- Computed estimated 1RM + PRs per exercise

**Deferred to v2+** *[amended: everything below except the social feed has
since shipped — supersets, muscle heat map + volume-by-muscle analytics
(Pro), bodyweight log, and the plate calculator]*
- Supersets UI (schema already supports `superset_group`)
- Muscle heat map (requires tagging exercises with muscles — add a `muscle` column/table later)
- Volume-by-muscle analytics, bodyweight/measurements, social feed, plate calculator

---

## 7. API surface (REST, all under `/v1`, all auth'd except `/auth/google`)

```
POST   /auth/google                                -> { sessionToken, user }
GET    /auth/me                                    -> current user

GET    /exercises                                  ?type=&search=
POST   /exercises
PATCH  /exercises/:id
DELETE /exercises/:id
GET    /exercises/:id/history                      -> recent entries + sets ("last time", progression)
GET    /exercises/:id/prs                          -> computed PRs / est. 1RM

GET    /disciplines
POST   /disciplines
PATCH  /disciplines/:id
DELETE /disciplines/:id
GET    /disciplines/:id/history

GET    /routines                                   (with items)
POST   /routines                                   (with optional items)
PATCH  /routines/:id
DELETE /routines/:id
POST   /routines/:id/skip                          skip one occurrence — materializes a skipped session
POST   /routines/:id/items
PATCH  /routines/:id/items/:itemId
DELETE /routines/:id/items/:itemId
PUT    /routines/:id/items/order                   reorder items

GET    /calendar                                   ?from=YYYY-MM-DD&to=YYYY-MM-DD
GET    /sessions                                   ?status=&limit=
POST   /sessions
GET    /sessions/:id                               (with entries + sets)
PATCH  /sessions/:id
DELETE /sessions/:id
POST   /sessions/:id/complete
POST   /sessions/:id/entries
PATCH  /sessions/:id/entries/:entryId
POST   /sessions/:id/entries/:entryId/sets
PATCH  /sessions/:id/entries/:entryId/sets/:setId
DELETE /sessions/:id/entries/:entryId/sets/:setId
PUT    /sessions/:id/entries/order                 reorder entries (entry IDs, first = top)

GET    /stats/muscles                              ?since=YYYY-MM-DD — muscle groups trained (gym)
GET    /stats/top-lifts                            ?since= — top 10 exercises by est. 1RM (gym)
GET    /stats/mat                                  ?since=YYYY-MM-DD&weeks= — weekly rounds/mat-time
                                                   buckets + intensity split + sparring aggregates
                                                   (MatStatsResponse); since = Monday of oldest bucket
GET    /stats/partners                             ?since=YYYY-MM-DD — per-partner sparring breakdown
                                                   (rounds, minutes, subs for/against, last date)
GET    /notes                                      ?limit=&cursor= — all notes (session, entry,
                                                   technique, per-round) grouped per completed
                                                   session, newest first; keyset-paginated
                                                   (NotesTimelineResponse)
```

---

## 8. Project structure (monorepo)

```
/frontend      Expo RN app (Expo Router, React Query, secure-store)
/backend       Worker (Hono) + Hyperdrive; Drizzle schema, migrations, seed; RRULE projection
/shared        API contract types, field_config types, pure calcs (e.g. est. 1RM)
```

Three pnpm workspace packages, each with its own `package.json`, so `shared` is imported as a real dependency (e.g. `@app/shared`) rather than via relative `../../shared` paths.

Boundaries (the point of the layout):

- **`backend` owns the database.** The Drizzle schema, migrations, seed, and recurrence (RRULE) projection all live here — nothing else talks to Postgres, and recurrence dates are computed server-side for the `/calendar` endpoint.
- **`shared` is the contract** both apps depend on: request/response types, the `field_config` field-definition types, and pure calculators that genuinely run on both sides (e.g. estimated 1RM shown live in the logger and also returned by the API).
- **`frontend` depends only on `shared`** — never on `backend` internals or the Drizzle schema. That keeps the client tied to the API contract, so the database can be refactored without touching the app.

---

## 9. Build phases (do in order)

0. ✅ **Scaffold** — monorepo, Drizzle schema + first migration against Neon, Hyperdrive binding, Worker "hello", Expo app boots as an EAS **dev build** on device.
1. ✅ **Auth** — Google sign-in → `/auth/google` verify → session JWT → `/auth/me`; secure-store wiring. *[amended: plus email/password and guest auth]*
2. ✅ **Libraries** — exercises + disciplines CRUD; seed global defaults (common lifts, jump rope, heavy bag, BJJ discipline with its `field_config`).
3. ✅ **Routines** (renamed from Templates) — create/edit routines with mixed gym + martial-arts items; items management, reorder, skip-occurrence.
4. ✅ **Logging** — sessions/entries/sets API; session logger with "last time", rest timer, RPE/RIR, set types, supersets, plate calculator, martial-arts round logger.
5. ✅ **Calendar + recurrence** — `/calendar` endpoint with server-side RRULE projection; skip/materialize; the three edit modes.
6. ✅ **History + stats** — history + PRs endpoints and screens; computed est. 1RM; premium analytics (muscle map, top lifts).
7. ✅ **Subscriptions** *[amended: added post-spec]* — RevenueCat + Pro gating.
8. 🔄 **Differentiation & polish** — tracked on the GitHub project board and in
   [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md).

---

## 10. Decisions to confirm before/while building

- Worker framework: ✅ **Hono** confirmed.
- RRULE storage: ✅ Full RFC 5545 string confirmed.
- Session JWT lifetime + refresh strategy: TBD — HMAC SHA-256 implemented; expiry/refresh strategy not finalized.
- Monorepo tooling: ✅ pnpm workspaces (no Turborepo) confirmed.
- Seed list: TBD — seeding mechanism exists but final list not confirmed as shipped.
```

