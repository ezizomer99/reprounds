---
name: grill-me-with-docs
description: >-
  Relentless interview session that stress-tests plans against this project's
  domain model and documentation, one question at a time.
---

# grill-me-with-docs

Relentless interview session that stress-tests plans against this project's domain model and documentation.

## How to invoke

Tell Claude: "grill me on [topic]" or "run grill-me-with-docs on [topic]"

## Core approach

Interrogate one question at a time, awaiting feedback before advancing. Prefer exploring the codebase over assumptions. For each question, offer a recommended answer before the user responds.

## Key practices

**Challenge terminology** — flag conflicts between the user's language and definitions in `docs/BUILD_SPEC.md` immediately.

**Sharpen vagueness** — propose precise canonical terms when overloaded language emerges. Example: distinguish a "routine" (a reusable plan) from a "session" (a concrete dated log started from it, or empty).

**Stress with scenarios** — test domain relationships through invented edge-case scenarios that expose boundary ambiguities. Example: "A user marks a training focus achieved, then works it again next session — does it re-activate, and what happens to `achieved_at`?"

**Surface code contradictions** — when stated behaviour conflicts with the build spec or implementation, raise it directly.

**Capture terminology in real-time** — update `CONTEXT.md` as terms resolve (create it at root if it doesn't exist). Maintain it as a glossary only, stripped of implementation detail.

**Reserve ADRs carefully** — only document architectural decisions meeting all three criteria: hard to reverse, surprising without context, and resulting from genuine trade-offs.

## RepRounds-specific grilling angles

- **Data model**: a `routine` is a reusable plan; a `session` is a concrete dated log (created ad-hoc, optionally from a routine). There is no calendar/recurrence — probe anyone who assumes scheduling.
- **Training Focuses**: active/achieved/archived lifecycle; global (no discipline) vs discipline-tagged focuses; what `session_focuses` ticks mean for `sessionCount`/`lastWorkedDate`; the free-tier 3-active cap.
- **field_config**: what happens when a discipline adds a new field and old entries don't have it in `details`?
- **Auth**: three methods (Google / email+password / guest) — how does guest→account migration move data? What does the app do when the session JWT expires mid-workout?
- **"Last time"**: what counts as "last time" — last completed set for this exercise, ever? Or last completed session containing this exercise?
- **Phase ordering**: why do routines come before logging? Could you log without a routine (empty session)?
- **shared vs backend**: if a calculation runs on both sides, which is authoritative when they disagree?

## File structure awareness

Recognize whether there is a `CONTEXT.md` at the root (single-context repo). Create it if needed; keep it as a glossary only.
