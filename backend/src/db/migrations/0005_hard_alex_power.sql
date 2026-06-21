DROP INDEX IF EXISTS "exercises_source_id_idx";--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_source_id_unique" UNIQUE("source_id");