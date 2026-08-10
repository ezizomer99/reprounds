ALTER TABLE "exercises" ADD COLUMN "metrics" text[];--> statement-breakpoint
ALTER TABLE "strength_sets" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "strength_sets" ADD COLUMN "distance_meters" numeric;--> statement-breakpoint
-- Backfill: conditioning sets stored their duration (in seconds) in `reps`.
-- Move it into the new dedicated column; leave `reps` in place as harmless
-- history (reads prefer `duration_seconds` and fall back to `reps`).
UPDATE "strength_sets" s
SET "duration_seconds" = s."reps"
FROM "session_entries" e
JOIN "exercises" x ON x."id" = e."exercise_id"
WHERE s."session_entry_id" = e."id"
  AND x."type" = 'conditioning'
  AND s."reps" IS NOT NULL
  AND s."duration_seconds" IS NULL;--> statement-breakpoint
-- Backfill: every existing conditioning exercise tracks duration. Running/rowing
-- get ['duration','distance'] on the next seed run; the rest keep this default.
UPDATE "exercises"
SET "metrics" = ARRAY['duration']
WHERE "type" = 'conditioning' AND "metrics" IS NULL;