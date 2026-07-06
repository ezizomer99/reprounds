ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill existing users so they never see the first-run onboarding flow.
UPDATE "users" SET "onboarded_at" = "created_at" WHERE "onboarded_at" IS NULL;