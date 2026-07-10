---
name: api-sync
description: >-
  Verify that the frontend, backend, and shared package agree on the API
  contract — catch type drift before it hits runtime.
---

# api-sync

Verify that the frontend, backend, and shared package are in agreement on the API contract — catch type drift before it hits runtime.

## How to invoke

Tell Claude: "run api-sync" or "check the API contract"

## What it checks

### 1. Shared types vs backend routes

For each endpoint in `docs/BUILD_SPEC.md §7`:
- Does a matching Hono route exist in `backend/`?
- Does the route's response shape match the type declared in `@app/shared`?
- Does the route use the shared type (importing from `@app/shared`) or has it drifted to inline types?

### 2. Shared types vs frontend usage

- Does every React Query hook in `frontend/` import its types from `@app/shared`?
- Are there any inline `interface` / `type` declarations in frontend that duplicate shared types?

### 3. field_config contract

- Does the `FieldDef` type in `shared` cover every `type` value referenced in the BJJ seed data?
- Does the frontend's dynamic form renderer handle every `type` in `FieldDef`?
- Does the backend write the `gi` column when the field has `"column": "gi"`?

### 4. Drizzle schema vs shared types

- Do the column names in `backend/src/db/schema.ts` correspond to the camelCase fields in the shared model types (accounting for Drizzle's snake_case → camelCase mapping)?
- Are nullable columns typed as `T | null` in shared, not just `T`?

### 5. Missing endpoints

List any endpoint in the spec that has:
- No Hono route in `backend/`
- No corresponding query/mutation hook in `frontend/`
- No response type in `shared/`

## Output format

```
### ✅ In sync
- [list what matches]

### ❌ Drift detected
- [file:line] Backend returns `snakeCase` field but shared type expects `camelCase`
- [file:line] Frontend hook types response inline — should import from @app/shared
- [file:line] field_config renderer missing case for 'textarea'

### 🔲 Not yet implemented
- POST /sessions/:id/duplicate — no route, no hook, no type   (illustrative)
```

Fix any drift found before reporting complete. Do not just report — fix.
