# grill-with-docs

Relentless interview session that stress-tests plans against this project's domain model and documentation.

## How to invoke

Tell Claude: "grill me on [topic]" or "run grill-me-with-docs on [topic]"

## Core approach

Interrogate one question at a time, awaiting feedback before advancing. Prefer exploring the codebase over assumptions. For each question, offer a recommended answer before the user responds.

## Key practices

**Challenge terminology** — flag conflicts between the user's language and definitions in `docs/BUILD_SPEC.md` immediately.

**Sharpen vagueness** — propose precise canonical terms when overloaded language emerges. Example: distinguish "session" as a calendar instance versus an in-progress log.

**Stress with scenarios** — test domain relationships through invented edge-case scenarios that expose boundary ambiguities. Example: "What happens if a user skips a recurring session, then logs it anyway the next day?"

**Surface code contradictions** — when stated behaviour conflicts with the build spec or implementation, raise it directly.

**Capture terminology in real-time** — update `CONTEXT.md` as terms resolve (create it at root if it doesn't exist). Maintain it as a glossary only, stripped of implementation detail.

**Reserve ADRs carefully** — only document architectural decisions meeting all three criteria: hard to reverse, surprising without context, and resulting from genuine trade-offs.

## Glima-specific grilling angles

- **Data model**: probe the `session` vs `schedule_rule` vs virtual projection distinction. When is a session real? What triggers materialization?
- **Edit modes**: "this one" vs "this & following" vs "all" — what exactly changes in the DB for each?
- **field_config**: what happens when a discipline adds a new field and old entries don't have it in `details`?
- **Auth**: what does the app do when the session JWT expires mid-workout?
- **"Last time"**: what counts as "last time" — last completed set for this exercise, ever? Or last completed session containing this exercise?
- **Phase ordering**: why does the spec say templates before logging? Could you log without templates?
- **shared vs backend**: if a calculation runs on both sides, which is authoritative when they disagree?

## File structure awareness

Recognize whether there is a `CONTEXT.md` at the root (single-context repo). Create it if needed; keep it as a glossary only.
