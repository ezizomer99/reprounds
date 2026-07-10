# RepRounds — Build Progress

*Last updated: 2026-07-10*

---

## Phase status

| # | Phase | Status |
|---|-------|--------|
| 0 | Scaffold | Complete |
| 1 | Auth (Google + email/password + guest) | Complete |
| 2 | Libraries (exercises + disciplines) | Complete |
| 3 | Routines (started on demand) | Complete |
| 4 | Logging (sessions/entries/sets) | Complete |
| 5 | ~~Calendar + Recurrence~~ | **Removed** — routines are on-demand |
| 6 | History + Stats (incl. mat/partner stats, notes) | Complete |
| 7 | Subscriptions (RevenueCat / Pro gating) | Complete |
| 8 | Combat-sports records (partners, fights, promotions, weights) | Complete |
| 9 | Training Focuses | Complete |
| 10 | Differentiation & polish | In progress |

The MVP plus subscriptions, the combat-sports layer, and Training Focuses all
ship. The calendar/recurrence layer was removed — routines are started on demand.
Phase 10 is a polish + differentiation round tracked on the GitHub project board.

---

## What's live

### Backend
Two Cloudflare Workers off the same schema: production `reprounds-api-prod` and
dev `reprounds-api` (EAS dev builds hit the dev Worker). CI deploys **both** on
every backend/shared change (see [DEPLOYMENT.md](DEPLOYMENT.md)). All routes
prefixed `/v1/`.

| Area | Routes |
|------|--------|
| Auth | `POST /auth/guest`, `POST /auth/google` (with guest→user migration), `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `DELETE /auth/me` |
| Exercises | `GET/POST /exercises`, `PATCH/DELETE /exercises/:id`, `GET /exercises/:id/history`, `GET /exercises/:id/prs` |
| Disciplines | `GET/POST /disciplines`, `PATCH/DELETE /disciplines/:id`, `GET /disciplines/:id/history` |
| Partners | `GET/POST /partners`, `PATCH/DELETE /partners/:id` |
| Fights | `GET/POST /fights`, `PATCH/DELETE /fights/:id` |
| Promotions | `GET/POST /promotions`, `DELETE /promotions/:id` |
| Weights | `GET/POST /weights`, `DELETE /weights/:id` |
| Focuses | `GET /focuses?status=`, `POST /focuses`, `PATCH/DELETE /focuses/:id` |
| Routines | `GET/POST /routines`, `PATCH/DELETE /routines/:id`, item add/update/delete/reorder |
| Sessions | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `POST /sessions/:id/complete`, `PUT /sessions/:id/focuses` (tick-off), entries + sets CRUD |
| Stats | `GET /stats/muscles`, `GET /stats/top-lifts`, `GET /stats/mat`, `GET /stats/partners` |
| Notes | `GET /notes` (paginated timeline), `GET /notes/tags` |

### Frontend (Expo Router)
Tabs: **Workout**, **Journal**, **Statistics**, **Martial Arts**, **Profile**.
Plus: session logger (`/sessions/[id]` — strength sets with optimistic logging,
rest timer, supersets, plate calculator, a category-aware martial-arts round
logger, and a Training Focuses tick-off card on mat sessions), New Session picker
(start empty or from a routine), routine editor, **Training Focuses**
(`/focuses`, reached from the Mat tab — CRUD with Active/Achieved/Archived
filters), history, per-exercise history (PRs / est. 1RM / volume trend),
discipline detail (session history + fight record + belt progression), partners,
notes timeline, body-weight screen, subscription/paywall, and settings (theme +
kg/lbs unit toggle + rest timer default + notification toggle).

Sign-in supports Google, email/password, and guest. Local notifications cover
rest-timer completion while backgrounded. React Query state persists to
AsyncStorage (`PersistQueryClientProvider` + NetInfo) so logging survives offline
restarts.

### Shared package
- **Enums**: activity/entry/discipline/session/set/gi, plus `FightResult`, `FightMethod`, `FocusStatus`
- **FieldConfig** engine for data-driven discipline forms
- **Rounds model** (`rounds.ts`): category-aware grappling/striking/MMA round sessions + `isRoundsSession`
- **Models**: users, exercises, disciplines, partners, fights, rank promotions, weight logs, routines, sessions, entries, sets, and training focuses (`TrainingFocus`, `FocusWithStats`, `SetSessionFocusesRequest`; `Session.focusIds`)
- **Calculators**: `estimatedOneRepMax` (Epley), `bestSet`, `setVolume`/`totalVolume`

### Database
Migrations `0000`–`0020`. Tables: `users`, `exercises`, `disciplines`,
`partners`, `fights`, `rank_promotions`, `weight_logs`, `routines`,
`routine_items`, `sessions`, `session_entries`, `strength_sets`,
`training_focuses`, `session_focuses`.
(The old `schedule_rules` table was merged into `routines` and the recurrence
columns later dropped; recent additions: `password_hash` + credential-email
unique index (`0015`), and Training Focuses — `training_focuses` +
`session_focuses` + the `focus_status` enum (`0020`).)

**Seed** (`db:seed`): global exercises + disciplines (BJJ, Boxing, Muay Thai,
MMA, Wrestling) with category-appropriate field templates.

---

## Google Play launch checklist (as of 2026-07-10)

| § | Item | Status | Notes |
|---|------|--------|-------|
| 1 | GitHub secrets & branch protection | ✅ | All secrets added, including `GOOGLE_PLAY_KEY_BASE64`; `production` env created; `main` branch protection rule in place |
| 2 | Neon production database | ✅ | Prod DB exists (Hyperdrive wired); `PROD_DATABASE_URL` in GitHub secrets |
| 3 | Cloudflare prod Worker, Hyperdrive, R2 | ✅ | Done. CI also deploys the dev Worker so dev builds stay in sync |
| 4 | Google Cloud OAuth | ✅ | Android + Web clients configured; consent screen Published + privacy policy URL added; Web client id set in all EAS profiles |
| 5 | RevenueCat + Play subscriptions | 🔶 | RevenueCat wired (Android SDK key in all EAS profiles); purchase verification tracked on `feat/revenuecat-identify` |
| 6 | Google Play Console — app + store listing | ✅ | App created; **automated closed-testing (alpha) submission** via `selfhosted-preview-mobile.yml` (Gradle build → AAB → Play). Verify store-listing/policy forms in Play Console |
| 7 | Closed testing (alpha) | 🔶 | Live — builds auto-submit to the alpha track on each `develop` push; testers enrolled on closed testing |

---

## Native-dependency items — built

- **Background-safe rest timer** — the session logger arms a local
  notification for when the rest timer ends, so it fires even if the phone
  locks or the app is backgrounded.
- **Offline logging queue** — React Query persistence via
  `PersistQueryClientProvider` + AsyncStorage + NetInfo, with lazy native-module
  detection so older dev clients fall back to in-memory.

Still open: password reset for email/password accounts (blocked on
transactional email infra — see note in `backend/src/routes/auth.ts`), plus
the remaining Phase 10 polish/differentiation board items.
