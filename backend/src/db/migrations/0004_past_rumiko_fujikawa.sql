ALTER TABLE "exercises" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "body_part" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "equipment" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "muscle_group" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "secondary_muscles" text[];--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "target" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "instruction_steps" jsonb;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "image_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercises_source_id_idx" ON "exercises" USING btree ("source_id") WHERE "exercises"."source_id" is not null;