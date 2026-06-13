# phase-review

Audit the current state of the project against the active build phase in `docs/BUILD_SPEC.md` and report what's done, what's missing, and what to do next.

## How to invoke

Tell Claude: "run phase-review" or "where are we in the build?"

## What it checks

1. **Identify the current phase** — read `docs/BUILD_SPEC.md §9` and scan the codebase to determine which phase is in progress (look for phase-shaped gaps: missing routes, missing screens, missing schema tables).

2. **Phase 0 — Scaffold**
   - [ ] pnpm monorepo with `frontend/`, `backend/`, `shared/` packages
   - [ ] `shared` is importable as `@app/shared` from both other packages
   - [ ] Drizzle schema in `backend/src/db/schema.ts` matches the full spec schema (all tables, enums, indexes)
   - [ ] At least one migration applied to Neon successfully
   - [ ] `wrangler.toml` exists with Hyperdrive binding
   - [ ] Hono "hello world" route working (`GET /`)
   - [ ] Expo app boots as an EAS dev build on device

3. **Phase 1 — Auth**
   - [ ] `POST /auth/google` verifies Google ID token via JWKS
   - [ ] User upserted in DB by `google_sub`
   - [ ] Session JWT minted and returned
   - [ ] `GET /auth/me` works with Bearer token
   - [ ] `@react-native-google-signin` configured in Expo app
   - [ ] Session JWT stored in `expo-secure-store` after sign-in
   - [ ] Sign-out clears secure store

4. **Phase 2 — Libraries**
   - [ ] All exercise CRUD endpoints exist (`GET/POST/PATCH/DELETE /exercises`)
   - [ ] All discipline CRUD endpoints exist
   - [ ] Global defaults seeded (exercises + BJJ discipline with field_config)
   - [ ] Exercise library screen in app (list + search + add custom)
   - [ ] Discipline library screen in app

5. **Phase 3 — Templates**
   - [ ] Template CRUD endpoints
   - [ ] Template items (mixed exercise + martial arts)
   - [ ] Create/edit template screen in app

6. **Phase 4 — Logging**
   - [ ] Strength logger: set entry, set types, reps/weight, RPE/RIR
   - [ ] Rest timer
   - [ ] "Last time" inline display
   - [ ] Conditioning logger (rounds/duration via `details`)
   - [ ] Dynamic martial arts form (field_config renderer)
   - [ ] Gi field written to both `session_entries.gi` and `details`

7. **Phase 5 — Calendar + recurrence**
   - [ ] `GET /calendar?from=&to=` returns merged real + virtual items
   - [ ] `POST /schedule-rules` creates a recurring rule
   - [ ] Three edit modes (single/following/all) working
   - [ ] Calendar screen in app shows both types
   - [ ] Tapping a planned session opens the logger and materializes it

8. **Phase 6 — History + stats**
   - [ ] `GET /exercises/:id/history` returns last entry + sets
   - [ ] `GET /exercises/:id/prs` returns computed PRs and est. 1RM (Epley)
   - [ ] Session history screen
   - [ ] Per-exercise PR/1RM view in app

## Output format

Report as:

```
## Phase N — [Name]: [IN PROGRESS / COMPLETE]

✅ Done:
- ...

❌ Missing:
- ...

🔜 Next action:
[one clear sentence on what to do now]
```
