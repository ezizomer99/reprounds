-- Merge templates + schedule_rules into a single "routines" table (data-preserving).
ALTER TABLE "templates" RENAME TO "routines";--> statement-breakpoint
ALTER TABLE "template_items" RENAME TO "routine_items";--> statement-breakpoint
ALTER TABLE "routine_items" RENAME COLUMN "template_id" TO "routine_id";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "template_id" TO "routine_id";--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "rrule" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "time_of_day" time;--> statement-breakpoint
UPDATE "routines" r SET "rrule" = sr."rrule", "start_date" = sr."start_date", "end_date" = sr."end_date", "time_of_day" = sr."time_of_day" FROM (SELECT DISTINCT ON ("template_id") "template_id", "rrule", "start_date", "end_date", "time_of_day" FROM "schedule_rules" ORDER BY "template_id", "created_at") sr WHERE r."id" = sr."template_id";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "schedule_rule_id";--> statement-breakpoint
DROP TABLE "schedule_rules";--> statement-breakpoint
ALTER TABLE "routines" RENAME CONSTRAINT "templates_user_id_users_id_fk" TO "routines_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "routine_items" RENAME CONSTRAINT "template_items_template_id_templates_id_fk" TO "routine_items_routine_id_routines_id_fk";--> statement-breakpoint
ALTER TABLE "routine_items" RENAME CONSTRAINT "template_items_exercise_id_exercises_id_fk" TO "routine_items_exercise_id_exercises_id_fk";--> statement-breakpoint
ALTER TABLE "routine_items" RENAME CONSTRAINT "template_items_discipline_id_disciplines_id_fk" TO "routine_items_discipline_id_disciplines_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "sessions_template_id_templates_id_fk" TO "sessions_routine_id_routines_id_fk";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routines_user_id_idx" ON "routines" USING btree ("user_id");
