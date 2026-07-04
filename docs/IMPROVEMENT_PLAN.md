# RepRounds — Improvement Plan

*Produced 2026-07-03 from a full-codebase audit: repo-level review plus four
domain audits (backend API, frontend RN, database, security). Findings are
evidence-based with file references; the roadmap at the bottom sequences them.*

**How to use this doc:** each finding has an ID (`S1`, `B1`, `F1`, `D1`, `X1`…).
The [roadmap](#roadmap) groups them into phases sized to be one PR each (or a
small PR series). Strike items out as they land.

---

## 1. Security & correctness (fix before wider release)

### S1 — No rate limiting on credential auth endpoints — **HIGH**
`backend/src/routes/auth.ts:242` (`POST /auth/login`), `:167` (`/auth/register`)

Unlimited attempts, no lockout, no CAPTCHA; PBKDF2 verify costs single-digit
ms, so credential stuffing/brute force is practical. Register is an account
spam farm. **Fix:** Cloudflare rate-limiting binding in `wrangler.toml` + a
thin middleware on the two paths (e.g. 10/min/IP), or Turnstile verification
server-side on those endpoints.

### S2 — Guest-data migration accepts arbitrary UUIDs — **HIGH**
`backend/src/routes/auth.ts:153,228,277` + `migrateGuestData` at `:45–62`

All three sign-in routes accept `guestUserId` in the body and merge that
guest's entire history into the new account with **no proof the caller ever
held the guest session**. Anyone who learns a guest UUID can steal its data.
**Fix:** require the guest's Bearer token at sign-in, verify it, and take the
guest id from the verified token — never from the request body.

### S3 — Calendar `from`/`to` unvalidated — silent blank calendar or 500 — **HIGH**
`backend/src/routes/calendar.ts:101–141`, `projectOccurrences` `:43–98`

Non-date input becomes `Invalid Date` → `RRule.between` silently returns
nothing (blank calendar, no error), and the raw string hits Postgres and
throws an uncaught 500 on the sessions query. **Fix:** regex-guard
`^\d{4}-\d{2}-\d{2}$` on both params, 400 on mismatch.

### S4 — Deleting a logged exercise/discipline/routine → raw FK 500 — **HIGH (UX-facing)**
`backend/src/routes/exercises.ts:186–206`, `disciplines.ts:210–230`,
`routines.ts:275–295`; schema: `session_entries.exercise_id/discipline_id` and
`sessions.routine_id` are `ON DELETE NO ACTION`

Delete routes ownership-check then `db.delete()` blindly; the FK violation
propagates as an unhandled 500. A user deleting an exercise they've ever
logged sees a generic failure. **Fix:** pre-check for references and return
409 with a clear message ("has logged sessions"), or offer archive semantics.

### S5 — No global error handler → inconsistent 500s — **MEDIUM**
All non-auth routes (`sessions.ts`, `exercises.ts`, `disciplines.ts`,
`routines.ts`, `fights.ts`, `weights.ts`, `calendar.ts`) run DB calls without
try/catch; auth routes return `{ error }` but everything else surfaces
platform-shaped 500s. **Fix:** `app.onError` in `backend/src/index.ts`
returning `{ error: 'Internal error' }` + logging; remove per-route catches
later.

### S6 — Mutation WHERE clauses omit parent-chain conditions — **MEDIUM (defense-in-depth)**
`backend/src/routes/sessions.ts:595–599, 710–714, 758–759`

Nested entry/set mutations pre-flight-check ownership, then mutate with
`WHERE id = $id` only (no `AND session_id = …` / `AND session_entry_id = …`).
Safe today; one refactor away from IDOR. **Fix:** make every mutation's WHERE
self-contained with the full parent chain.

### S7 — Deleted user's JWT stays valid for up to 7 days — **MEDIUM**
`backend/src/routes/auth.ts:23`, `lib/jwt.ts:59–83`, `middleware/auth.ts`

No refresh/revocation; after `DELETE /me` the token still authenticates (routes
just return empty data). Also: no password-change endpoint, no per-device
revocation. **Fix now:** authMiddleware checks the user row exists (cheap
indexed lookup). **Fix later (X4):** refresh-token strategy — spec marks it TBD.

### S8 — Dev and prod share one Hyperdrive config ID — **MEDIUM (ops)**
`backend/wrangler.toml:16` and `:39` — same `id`. If intentional, `wrangler
dev` pools against the production Neon DB. **Fix:** separate
`wrangler hyperdrive create` for prod; keep dev on `DATABASE_URL` fallback.

### S9 — Full security audit addendum *(completed 2026-07-03)*

**S9a — IDOR: `POST /sessions` trusts client `routineId` — HIGH (fixed in Phase B)**
`backend/src/routes/sessions.ts:340` — the create-session route linked and
pre-filled from any `routineId` without checking `routines.userId`, exposing a
victim's routine structure (exercises, targets, rest) to anyone holding the
UUID. Fix: ownership check before the transaction, 404 on mismatch.

**S9b — `/calendar` had no range cap — MEDIUM (fixed in Phase B)**
Unbounded RRULE expansion (e.g. a 100-year window × 10 routines ≈ 36k dates)
could exhaust the Worker CPU budget. Fix: 366-day maximum window.

**S9c — Exercise search wildcards unescaped — LOW (fixed in Phase B)**
`%`/`_` in the search string acted as LIKE wildcards (parameterized, so no
injection — just degenerate scans). Fix: escape before interpolating.

**S9d — Offline cache stores health data in plain AsyncStorage — decision needed**
`frontend/app/_layout.tsx:68` — the React Query persister writes sessions,
body-weight history, and fight records to unencrypted AsyncStorage (readable
on rooted devices). The JWT itself is correctly in SecureStore. Options:
encrypted persister (SQLCipher via op-sqlite), encrypt-at-rest wrapper, or
accept the risk for offline UX. **Owner's call.**

**S9e — Known accepted limits (documented, no action available/needed):**
PBKDF2 capped at 100k iterations by workerd (below OWASP 2023 — revisit when
Argon2 WASM is viable); guest identity = deviceId possession (rate-limited,
single-user threat model); dev/prod Hyperdrive sharing (S8, needs account
owner).

**Clean bill:** JWT alg pinned to HS256 (no confusion path) + expiry enforced;
Google JWKS verification checks alg/iss/aud/exp/email_verified with kid-retry;
timing-safe password compare; nested sessions→entries→sets ownership verified
at every level; global seed rows immutable to users; no committed secrets; no
WebView; CORS correctly absent for a native-only API.

---

## 2. Performance & database (cheap now, expensive later)

### D1 — `GET /exercises/:id/prs` loads every set ever, reduces in JS — **HIGH**
`backend/src/routes/exercises.ts:308–364` — no LIMIT, no window; years of
training = thousands of rows per tap. **Fix:** compute max e1RM in SQL
(`DISTINCT ON` pattern already exists in `stats.ts:73–96`);
`COUNT(DISTINCT sessions.id)` for totals.

### D2 — `GET /disciplines/:id/history` unbounded — **HIGH**
`backend/src/routes/disciplines.ts:153–208` — no LIMIT (exercise counterpart
has `.limit(5)`). **Fix:** `.limit(50)` + pagination for the history screen.

### D3 — Missing `sessions(user_id, status)` index — **MEDIUM**
Six hot paths filter on `(user_id, status)` but only `(user_id, date)` is
indexed (`schema.ts:136–138`). **Fix:** add the index (or partial index
`WHERE status = 'completed'`).

### D4 — `GET /stats/top-lifts` has no time bound — **MEDIUM**
`backend/src/routes/stats.ts:67–113` — full-history join scan. **Fix:**
`since` param defaulting to ~2 years, benefits from D3.

### D5 — `GET /exercises` returns the full catalog unpaginated — **MEDIUM**
`backend/src/routes/exercises.ts:59–93` — ~800 seeded rows + custom on every
unfiltered call. **Fix:** default limit ~100 with offset/cursor, mirroring
`sessions.ts:240`.

### D6 — Seeded BJJ `field_config` deviates from spec and can't self-correct — **MEDIUM**
`backend/src/db/seed.ts:87–118` — seeds `[rounds, submissions, notes]`; spec
requires the `gi` field with `"column":"gi"` (the bridge to the promoted
`session_entries.gi` column). Discipline seed inserts missing rows only —
re-seeding never updates existing ones. **Fix:** partial unique index on
`(name) WHERE user_id IS NULL` + upsert `ON CONFLICT … DO UPDATE SET
field_config`.

### D7 — `fights`/`rank_promotions` CASCADE on discipline delete — hidden trap — **MEDIUM**
`schema.ts:183–184, 204–205` — if S4 is ever fixed by switching
`session_entries` to `SET NULL`, discipline deletion silently wipes fight
records and belt history. **Fix:** change both to `restrict` and handle in the
route with clear errors.

### D8 — Low-priority hygiene
- `routine_items` is the only table without `created_at` (`schema.ts:106–122`).
- Migration `0014` is hand-written DML with a hand-edited journal timestamp —
  run `db:generate` and confirm "No changes detected" (no phantom diff).
- Exercise search is leading-wildcard `ilike` (full scan) — fine at ~800 rows;
  `pg_trgm` GIN index when the library grows.
- JWKS cache is module-level mutable state (`lib/googleAuth.ts:17`) —
  contravenes the project's "no global mutable state" rule; move to
  `caches.default` (Workers Cache API).

**Clean bill of health (db):** all four spec indexes exist; kind CHECK
constraints present; migration journal complete and ordered; exercise seed
idempotent; `users → sessions → entries → sets` cascade chain correct;
credential-email partial unique index correct.

---

## 3. Frontend code health

### F1 — 2,149-line session logger god component — **HIGH**
`frontend/app/(app)/sessions/[id].tsx` hosts 11 named sub-components + a
370-line style factory. Natural seams already exist (`PickExerciseModal`,
`SetRow`, `StrengthEntryCard`, `MartialArtsEntryCard`, `CalendarPicker`,
`SessionSettingsSheet`, …). **Fix:** extract to
`src/components/session/*.tsx`; main screen becomes ~200 lines of
composition. `routines/[id].tsx` (1,007 lines) is the same illness, second.

### F2 — Optimistic set rows are interactive before reconciliation — **HIGH (bug)**
`src/hooks/useSession.ts:185` inserts `id: 'optimistic-…'`; `SetRow`
(`sessions/[id].tsx:510,552`) immediately wires `onBlur` saves and
complete-toggle against that id → PATCH to `/sets/optimistic-…` 404s
silently; the later key swap also remounts the row and drops unsaved input.
**Fix:** pass `isNew`/pending flag into `SetRow`; guard mutations until the
real UUID lands.

### F3 — Exercise create form duplicated with diverging fields — **MEDIUM**
`sessions/[id].tsx:259–429` vs `exercises/index.tsx:145–287` — identical
forms, but the session one submits `muscleGroup`+`equipment`, the library one
only `target`; `FREE_CUSTOM_EXERCISE_LIMIT = 3` hardcoded in both. **Fix:**
one `<ExerciseForm>` component; move the limit constant to `@app/shared`.

### F4 — `['exercise', id]` cache never invalidated on update/delete — **MEDIUM**
`src/hooks/useExercises.ts:66–80` invalidates the list only → stale detail
screen after edits. **Fix:** targeted `invalidateQueries(['exercise', id])`
in both mutations.

### F5 — Theme preference stored in expo-secure-store — **LOW**
`src/theme/ThemeContext.tsx:3,31,39` — not a secret; adds Keychain latency at
cold start and muddies the "secure-store is for the JWT" boundary. **Fix:**
AsyncStorage.

### F6 — `fmtDuration`/`parseDuration` duplicated byte-for-byte — **LOW**
`sessions/[id].tsx:87–104` and `routines/[id].tsx:52–69`. **Fix:** move to
`src/units/units.ts`, test there.

---

## 4. Testing & tooling (the multiplier)

### T1 — Route handlers are entirely untested — **HIGH**
Backend tests cover auth/JWT/password only. Highest-risk untested unit:
`projectOccurrences` (`calendar.ts:43–98`) — RRULE projection, dedup keys,
DST/UTC edges — and it's a pure function, trivially unit-testable. Then:
sessions entries/sets CRUD (most complex handlers), routines edit modes.
**Fix order:** calendar projection unit tests → sessions route tests →
routines. (S3's date-validation fix should land with the calendar tests.)

### T2 — Frontend pure logic untested — **HIGH**
Only `config.test.ts` exists. `kgToUnit`/`unitToKg`/`fmtWeight` (every logged
set flows through these), `syncSessionReminders` (cap, filters, past-guard),
`computeWeekStreak` + stats helpers (currently trapped inside screen files —
extract first). **Fix:** extract into `src/`, add Jest suites, coverage gate.

### T3 — No linting anywhere — **HIGH**
No ESLint/Prettier config in the repo; CI runs typecheck+test only. **Fix:**
`eslint` flat config + `@typescript-eslint` + `eslint-plugin-react-hooks`
(the exhaustive-deps rule would likely have caught F4), Prettier, a root
`lint` script, and a CI step. Expect an initial autofix commit.

### T4 — CI gaps — **MEDIUM**
`ci.yml` runs on PRs only (direct pushes to `develop` are unchecked), no lint
step (see T3), no coverage reporting. **Fix:** add `push: [develop]` trigger +
lint step.

### T5 — Dependabot backlog — **MEDIUM**
5 open PRs against `main` (netinfo 12, async-storage 3, hono patch, aws-sdk,
nativewind 4.2) + 6 open vulnerability alerts on the default branch. The hono
patch bump is likely security-relevant. **Fix:** rebase/retarget against
`develop`, merge the safe ones (hono, aws-sdk), test the native-module majors
(netinfo, async-storage) in an EAS build before merging; review the
Dependabot alerts page.

---

## 5. User-facing feature gaps (Hevy/StrengthLog parity)

### U1 — Swap/replace exercise mid-session — **HIGH**
No menu on `StrengthEntryCard` (`sessions/[id].tsx:824–828`). Bench taken,
machine broken → today you add a new exercise and delete sets manually.
**Fix:** contextual sheet on the exercise name (Swap / Move / Remove); swap
reuses `PickExerciseModal` + existing entry PATCH.

### U2 — Per-exercise rest timer control in the logger — **HIGH**
`entry.restSeconds` exists and is respected (`sessions/[id].tsx:765`) but no
UI sets it — users are stuck with the global default. **Fix:** "Rest: 2:00"
chip on the card → preset bottom sheet → entry PATCH.

### U3 — "Last time" shows one set, not the full prior session — **HIGH**
`LastTime` (`sessions/[id].tsx:737–745`) reads `sets[0]` only; data is already
fetched in full. Serious lifters need all prior sets as ghost rows to beat.
**Fix:** render each completed prior set as a faded inline row.

### U4 — Warm-up suggestions + plate calculator placement — **MEDIUM**
"Add warm-up" creates a blank row; the plate calculator is buried 3 taps deep
(`sessions/[id].tsx:711–714, 831–845`). **Fix:** percentage-based warm-up
prefill (50/65/80% of top working set) and a persistent calculator affordance.

### U5 — Zero accessibility labels app-wide — **MEDIUM**
`grep accessibilityLabel` → 0 matches. The set-completion circle — the most
tapped element in the app — announces as "button". **Fix:** label the logger
controls first (set circle with number+state, finish-workout check, rest
timer buttons), then sweep screen-by-screen during F1 decomposition.

### U6 — Password reset flow — **MEDIUM (grows with credential adoption)**
Blocked on transactional email infra (`backend/src/routes/auth.ts` note).
Options: Resend/Postmark free tier + signed one-time reset token endpoint.
Related: no password-change endpoint for logged-in users (S7) — that part
needs no email infra and could ship first.

---

## 6. Docs & process

### X1 — BUILD_SPEC.md contradicts the shipped product — **MEDIUM**
Says "Google sign-in only — no passwords stored anywhere" (§1), marks phases
4–6 incomplete when 0–7 all ship (§9), MVP scope lists shipped features as
deferred (§6: plate calculator, muscle analytics, bodyweight). CLAUDE.md calls
this file "the source of truth" — right now it's a false witness. **Fix:**
amend §1/§6/§9 to match reality, or demote its role in CLAUDE.md to
"original build spec (historical)" and let PROGRESS.md carry current state.

### X2 — JWT expiry/refresh strategy decision — **MEDIUM**
Spec §10 leaves it TBD; S7 documents the practical consequences. Decide:
short-lived access + refresh tokens table vs. current 7-day + existence check.

### X3 — RevenueCat launch checklist — **tracking**
PR #46 (customer identify) in flight; purchase not verified end-to-end;
§5/§6/§7 of `docs/DEPLOYMENT.md` remain the launch gate (closed-testing
14-day clock is the long pole).

---

## Roadmap

Phases are ordered by risk-adjusted value; each bullet ≈ one focused PR.
Suggested agent per item in parentheses.

> **Status 2026-07-03:** Phases A (PR #49), B (PR #50), C (PR #51) and the
> E-slices in PR #52/#53 are merged. Struck-through items are done. Still
> open: 16/18 (F1 decomposition), 21 (U4), 22 (U6), 11 (T5 Dependabot),
> 23–25 (X-items), plus the two owner decisions (S8 Hyperdrive split, S9d
> offline-cache encryption).

**Phase A — Correctness & safety (do first, small diffs)**
~~1. S3 calendar date validation + S5 global `onError` (backend-worker)~~
~~2. S2 guest-merge proof-of-possession (auth) — *breaking client change: app~~
   ~~must send the guest token at sign-in; coordinate frontend+backend in one PR*~~
~~3. S1 rate limiting on login/register (backend-worker)~~
~~4. S7-now: authMiddleware user-existence check (auth)~~
~~5. F2 optimistic-set guard (frontend-rn)~~
~~6. S4+D7: reference pre-checks on exercise/discipline/routine delete, FK~~
   ~~`restrict` on fights/promotions (database + backend-worker)~~

**Phase B — Testing & tooling foundation**
~~7. T1a `projectOccurrences` unit tests (calendar-recurrence) — lands with A1~~
~~8. T3 ESLint+Prettier + T4 CI lint step + push-to-develop trigger~~
~~9. T1b sessions/routines route tests (backend-worker)~~
~~10. T2 extract + test frontend pure logic (frontend-rn)~~
11. T5 Dependabot triage (merge patches, EAS-test native majors)

**Phase C — Performance (before user data grows)**
~~12. D1 PRs-in-SQL + D2 discipline-history LIMIT (database)~~
~~13. D3 `(user_id, status)` index + D4 top-lifts time bound (database)~~
~~14. D5 exercises pagination (backend-worker + frontend-rn)~~
~~15. D6 seed upsert for field_config (database)~~

**Phase D — Refactoring (unlocks faster feature work)**
16. F1 decompose sessions/[id].tsx (frontend-rn; fold U5 labels in per
    component as it's extracted)
~~17. F3 shared ExerciseForm + F4 cache invalidation + F5/F6 cleanups~~
18. F1b decompose routines/[id].tsx

**Phase E — User-facing wins (the fun sprint)**
~~19. U3 full "last time" ghost sets — highest visible payoff (frontend-rn)~~
~~20. U1 swap exercise + U2 rest chip (frontend-rn)~~
21. U4 warm-up suggestions + plate-calc promotion
22. U6a password change endpoint; U6b reset flow once email infra chosen

**Phase F — Docs & decisions**
~~23. X1 BUILD_SPEC amendment~~
24. X2 JWT refresh decision (write it down in CLAUDE.md when made)
25. X3 keep DEPLOYMENT.md checklist current through Play launch

---

*Security addendum (S9) pending — will be merged into §1 when the re-run
completes.*
