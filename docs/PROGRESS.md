# RepRounds — Build Progress

*Last updated: 2026-07-02*

---

## Phase status

| # | Phase | Status |
|---|-------|--------|
| 0 | Scaffold | Complete |
| 1 | Auth (Google + email/password + guest) | Complete |
| 2 | Libraries (exercises + disciplines) | Complete |
| 3 | Routines/Templates | Complete |
| 4 | Logging (sessions/entries/sets) | Complete |
| 5 | Calendar + Recurrence (RRULE) | Complete |
| 6 | History + Stats | Complete |
| 7 | Subscriptions (RevenueCat / Pro gating) | Complete |
| 8 | Differentiation & polish | In progress |

The original MVP (Phases 0–6) plus subscriptions all ship. Phase 8 is a
polish + differentiation round tracked on the GitHub project board
(perceived-speed fixes, combat-sports logging, lifter tooling, engagement).

---

## What's live

### Backend
Deployed to `https://reprounds-api.oemerdigital.workers.dev`. All routes prefixed `/v1/`.

| Area | Routes |
|------|--------|
| Auth | `POST /auth/guest`, `POST /auth/google` (with guest→user migration), `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `DELETE /auth/me` |
| Exercises | `GET/POST /exercises`, `PATCH/DELETE /exercises/:id`, `GET /exercises/:id/history`, `GET /exercises/:id/prs` |
| Disciplines | `GET/POST /disciplines`, `PATCH/DELETE /disciplines/:id`, `GET /disciplines/:id/history` |
| Partners | `GET/POST /partners`, `PATCH/DELETE /partners/:id` |
| Fights | `GET/POST /fights`, `PATCH/DELETE /fights/:id` |
| Promotions | `GET/POST /promotions`, `DELETE /promotions/:id` |
| Weights | `GET/POST /weights`, `DELETE /weights/:id` |
| Routines | `GET/POST /routines`, `PATCH/DELETE /routines/:id`, `POST /routines/:id/skip`, item add/update/delete/reorder |
| Sessions | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `POST /sessions/:id/complete`, entries + sets CRUD |
| Calendar | `GET /calendar?from=&to=` — merges real sessions + server-side RRULE projections |
| Stats | `GET /stats/muscles`, `GET /stats/top-lifts` (premium analytics) |

### Frontend (Expo Router)
Tabs: **Workout** (home with weekly strip + streak), **Exercises**, **Stats**,
**Martial Arts**, **Profile**. Plus: session logger (`/sessions/[id]` — strength
sets with optimistic logging, rest timer, supersets, plate calculator, and a
category-aware martial-arts round logger), routine editor, calendar, history,
per-exercise history (PRs / est. 1RM / volume trend), discipline detail
(session history + fight record + belt progression), body-weight screen,
subscription/paywall, and settings (theme + kg/lbs unit toggle + rest timer
default + notification toggle).

Sign-in supports Google, email/password, and guest. Local notifications cover
calendar-session reminders (`src/lib/sessionReminders.ts`) and rest-timer
completion while backgrounded. React Query state persists to AsyncStorage
(`PersistQueryClientProvider` + NetInfo) so logging survives offline restarts.

### Shared package
- **Enums**: activity/entry/discipline/session/set/gi, plus `FightResult`, `FightMethod`
- **FieldConfig** engine for data-driven discipline forms
- **Rounds model** (`rounds.ts`): category-aware grappling/striking/MMA round sessions + `isRoundsSession`
- **Models**: users, exercises, disciplines, partners, fights, rank promotions, weight logs, routines, sessions, entries, sets, calendar
- **Calculators**: `estimatedOneRepMax` (Epley), `bestSet`, `setVolume`/`totalVolume`

### Database
Migrations `0000`–`0015`. Tables: `users`, `exercises`, `disciplines`,
`partners`, `fights`, `rank_promotions`, `weight_logs`, `routines`,
`routine_items`, `sessions`, `session_entries`, `strength_sets`.
(`schedule_rules` were merged into `routines` in migration `0001`; recent
additions: per-set notes in `0013`, cardio/conditioning exercise type in
`0014`, `password_hash` + credential-email unique index in `0015`.)

**Seed** (`db:seed`): global exercises + disciplines (BJJ, Boxing, Muay Thai,
MMA, Wrestling) with category-appropriate field templates.

---

## Google Play launch checklist (as of 2026-07-02)

| § | Item | Status | Notes |
|---|------|--------|-------|
| 1 | GitHub secrets & branch protection | ✅ | All secrets added, including `GOOGLE_PLAY_KEY_BASE64` (set 2026-07-02); `production` env created; `main` branch protection rule in place |
| 2 | Neon production database | ✅ | Prod DB exists (Hyperdrive wired in prev session); `PROD_DATABASE_URL` added to GitHub secrets |
| 3 | Cloudflare prod Worker, Hyperdrive, R2 | ✅ | Done in prev session |
| 4 | Google Cloud OAuth | ✅ | Android client verified (correct SHA-1 + package); consent screen Published + privacy policy URL added; `GOOGLE_CLIENT_ID` Wrangler secret updated to Web client on both dev + prod; `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` fixed to Web client (`mkd1…`) in all EAS profiles — **still need to add Play App Signing SHA-1 to Android OAuth client after §6** |
| 5 | RevenueCat + Play subscriptions | 🔶 | RevenueCat project wired: Android SDK key set in all EAS profiles; customer identify + Play sub-product matching in progress on `feat/revenuecat-identify` — purchase not yet verified end-to-end |
| 6 | Google Play Console — create app + store listing | 🔶 | App created; internal-track submission wired via `preview-mobile.yml` (first automated submit attempted 2026-07-02 — see workflow run history). Store listing / policy forms status: verify in Play Console |
| 7 | Closed testing (14-day gate) | ⬜ | Not started; this is the long pole |

---

## Phase 8 native-dependency items — now built

The three items previously listed as missing all ship:

- **Local notifications** for calendar-scheduled sessions —
  `src/lib/sessionReminders.ts` reschedules reminders for upcoming planned
  occurrences (idempotent, capped at 30).
- **Background-safe rest timer** — the session logger arms a local
  notification for when the rest timer ends, so it fires even if the phone
  locks or the app is backgrounded.
- **Offline logging queue** — React Query persistence via
  `PersistQueryClientProvider` + AsyncStorage + NetInfo, with lazy native-module
  detection so older dev clients fall back to in-memory.

Still open: password reset for email/password accounts (blocked on
transactional email infra — see note in `backend/src/routes/auth.ts`), plus
the remaining Phase 8 board items (perceived-speed fixes, combat-sports
logging, lifter tooling, engagement).
