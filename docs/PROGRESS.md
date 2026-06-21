# Glima — Build Progress

*Last updated: 2026-06-21*

---

## Phase status

| # | Phase | Status |
|---|-------|--------|
| 0 | Scaffold | Complete |
| 1 | Auth (Google + guest) | Complete |
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
Deployed to `https://glima-api.oemerdigital.workers.dev`. All routes prefixed `/v1/`.

| Area | Routes |
|------|--------|
| Auth | `POST /auth/guest`, `POST /auth/google` (with guest→user migration), `GET /auth/me` |
| Exercises | `GET/POST /exercises`, `PATCH/DELETE /exercises/:id`, `GET /exercises/:id/history`, `GET /exercises/:id/prs` |
| Disciplines | `GET/POST /disciplines`, `PATCH/DELETE /disciplines/:id`, `GET /disciplines/:id/history` |
| Partners | `GET/POST /partners`, `PATCH/DELETE /partners/:id` |
| Fights | `GET/POST /fights`, `PATCH/DELETE /fights/:id` |
| Promotions | `GET/POST /promotions`, `DELETE /promotions/:id` |
| Weights | `GET/POST /weights`, `DELETE /weights/:id` |
| Routines | `GET/POST /routines`, `PATCH/DELETE /routines/:id`, `POST /routines/:id/skip`, item add/update/delete/reorder |
| Sessions | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `POST /sessions/:id/complete`, entries + sets CRUD |
| Calendar | `GET /calendar?from=&to=` — merges real sessions + server-side RRULE projections |

### Frontend (Expo Router)
Tabs: **Workout** (home with weekly strip + streak), **Exercises**, **Stats**,
**Martial Arts**, **Profile**. Plus: session logger (`/sessions/[id]` — strength
sets with optimistic logging, rest timer, supersets, plate calculator, and a
category-aware martial-arts round logger), routine editor, calendar, history,
per-exercise history (PRs / est. 1RM / volume trend), discipline detail
(session history + fight record + belt progression), body-weight screen,
subscription/paywall, and settings (theme + kg/lbs unit toggle).

### Shared package
- **Enums**: activity/entry/discipline/session/set/gi, plus `FightResult`, `FightMethod`
- **FieldConfig** engine for data-driven discipline forms
- **Rounds model** (`rounds.ts`): category-aware grappling/striking/MMA round sessions + `isRoundsSession`
- **Models**: users, exercises, disciplines, partners, fights, rank promotions, weight logs, routines, sessions, entries, sets, calendar
- **Calculators**: `estimatedOneRepMax` (Epley), `bestSet`, `setVolume`/`totalVolume`

### Database
Migrations `0000`–`0012`. Tables: `users`, `exercises`, `disciplines`,
`partners`, `fights`, `rank_promotions`, `weight_logs`, `routines`,
`routine_items`, `sessions`, `session_entries`, `strength_sets`.
(`schedule_rules` were merged into `routines` in migration `0001`.)

**Seed** (`db:seed`): global exercises + disciplines (BJJ, Boxing, Muay Thai,
MMA, Wrestling) with category-appropriate field templates.

---

## What's missing (Phase 8 remainder)

These require a native dependency and on-device verification (not yet built):

- **Local notifications** for calendar-scheduled sessions (`expo-notifications`).
- **Background-safe rest timer** with sound/vibration on completion.
- **Offline logging queue** — persist pending mutations and sync on reconnect
  (React Query persistence + AsyncStorage).
