CREATE TYPE "public"."technique_kind" AS ENUM('position', 'submission');--> statement-breakpoint
CREATE TABLE "techniques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" "technique_kind" NOT NULL,
	"category" "discipline_cat" DEFAULT 'grappling' NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "techniques_source_id_unique" UNIQUE("source_id")
);
--> statement-breakpoint
ALTER TABLE "techniques" ADD CONSTRAINT "techniques_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "techniques_global_key_idx" ON "techniques" USING btree ("kind","value") WHERE "techniques"."user_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "techniques_owner_key_idx" ON "techniques" USING btree ("user_id","kind","value") WHERE "techniques"."user_id" IS NOT NULL;