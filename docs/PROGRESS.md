# Glima — Build Progress

*Last updated: 2026-06-14*

---

## Phase status

| # | Phase | Status |
|---|-------|--------|
| 0 | Scaffold | Complete |
| 1 | Auth | Complete |
| 2 | Libraries | Complete |
| 3 | Templates | Complete |
| 4 | Logging | Not started |
| 5 | Calendar + Recurrence | Not started |
| 6 | History + Stats | Not started |

---

## What's live

### Backend
Deployed to `https://glima-api.oemerdigital.workers.dev`. All routes prefixed `/v1/`.

| Method | Path | Notes |
|--------|------|-------|
| POST | /auth/google | Google ID token → session JWT |
| GET | /auth/me | Current user |
| GET | /exercises | `?type=&search=` filters |
| POST | /exercises | |
| PATCH | /exercises/:id | |
| DELETE | /exercises/:id | |
| GET | /disciplines | |
| POST | /disciplines | |
| PATCH | /disciplines/:id | |
| DELETE | /disciplines/:id | |
| GET | /templates | With items + resolved names |
| POST | /templates | Accepts initial items array |
| PATCH | /templates/:id | Metadata only |
| DELETE | /templates/:id | |
| POST | /templates/:id/items | |
| DELETE | /templates/:id/items/:itemId | |
| PUT | /templates/:id/items/order | Reorder by ID array |

### Frontend screens

| Screen | Description |
|--------|-------------|
| `/(auth)/sign-in` | Google Sign-In |
| `/(app)/index` | Home/dashboard with nav to Library and Templates |
| `/(app)/library/exercises` | List with search, type filter, create, delete |
| `/(app)/library/disciplines` | List with category filter, create, delete |
| `/(app)/templates/index` | Template list, long-press to delete |
| `/(app)/templates/[id]` | Editor — create new (`id=new`) or edit existing; add/remove gym + MA items |

### Frontend hooks

| File | Exports |
|------|---------|
| `useAuth.ts` | `useCurrentUser` |
| `useExercises.ts` | `useExercises`, `useCreateExercise`, `useUpdateExercise`, `useDeleteExercise` |
| `useDisciplines.ts` | `useDisciplines`, `useCreateDiscipline`, `useDeleteDiscipline` |
| `useTemplates.ts` | `useTemplates`, `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate`, `useAddTemplateItem`, `useRemoveTemplateItem`, `useReorderTemplateItems` |

### Shared package

- **Enums**: `ActivityType`, `EntryKind`, `DisciplineCat`, `SessionStatus`, `SetType`, `GiType`
- **FieldConfig**: `FieldType`, `FieldDef` (discriminated union), `FieldConfig`
- **Models**: `User`, `Exercise`, `Discipline`, `Template`, `TemplateItem`, `TemplateItemWithDetails`, `TemplateWithItems`, `ScheduleRule`, `Session`, `SessionEntry`, `StrengthSet`, `CalendarItem`
- **Request/response types**: All types through Phase 3 (exercises, disciplines, templates)
- **Calculators**: `estimatedOneRepMax` (Epley formula), `bestSet`

### Database

Single migration `0000_curvy_whizzer.sql` — all 9 tables in place:
`users`, `exercises`, `disciplines`, `templates`, `template_items`, `schedule_rules`, `sessions`, `session_entries`, `strength_sets`

**Seed** (`db:seed`): 7 strength exercises, 5 conditioning exercises, 1 discipline (BJJ with full fieldConfig).

---

## What's missing

### Phase 4 — Logging

**Backend** — new route file `sessions.ts`:

| Method | Path |
|--------|------|
| GET | /sessions/:id (with entries + sets) |
| POST | /sessions |
| PATCH | /sessions/:id |
| DELETE | /sessions/:id |
| POST | /sessions/:id/complete |

**Shared** — new types:
- `CreateSessionRequest`, `UpdateSessionRequest`, `SessionWithEntries`, `SessionListResponse`
- `CreateSessionEntryRequest`, `SessionEntryWithSets`
- `CreateStrengthSetRequest`

**Frontend** — new screens:
- Session logger — start from template or ad-hoc
- Strength entry — per-set logging (set type, reps, weight, RPE/RIR), "last time" inline, rest timer
- Conditioning entry — rounds/duration via `details`
- Martial arts entry — dynamic form driven by `discipline.fieldConfig`

---

### Phase 5 — Calendar + Recurrence

**Backend** — two new route files:

| Method | Path | Notes |
|--------|------|-------|
| GET | /schedule-rules | |
| POST | /schedule-rules | |
| PATCH | /schedule-rules/:id | `?mode=single\|following\|all` |
| DELETE | /schedule-rules/:id | `?mode=single\|following\|all` |
| GET | /calendar | `?from=&to=` — merges real sessions + RRULE projections |

RRULE projection is server-side only (per spec). Needs an RRULE library in the backend package.

**Shared** — new types:
- `CreateScheduleRuleRequest`, `UpdateScheduleRuleRequest`
- `CalendarResponse`

**Frontend** — new screens:
- Calendar screen — week/month view of planned + completed sessions
- Schedule rule create/edit sheet
- "Edit recurring event" modal with three modes: this one / this & following / all

---

### Phase 6 — History + Stats

**Backend** — two new endpoints (can add to `exercises.ts`):

| Method | Path |
|--------|------|
| GET | /exercises/:id/history |
| GET | /exercises/:id/prs |

**Frontend** — new screens:
- Session history list
- Per-exercise history (progression, best sets)
- PR/est. 1RM display (calculator already exists in shared)

---

## Minor gaps (can be done alongside any phase)

- `useUpdateDiscipline` hook missing (backend PATCH endpoint exists)
- No edit UI on exercises screen (PATCH endpoint exists, delete-only UI)
- Template editor has no drag-to-reorder UI (PUT endpoint exists)
- Seed only has BJJ — could add Muay Thai, Judo, etc. (zero code change, just more rows)
