CREATE TYPE "public"."focus_status" AS ENUM('active', 'achieved', 'archived');--> statement-breakpoint
CREATE TABLE "session_focuses" (
	"session_id" uuid NOT NULL,
	"focus_id" uuid NOT NULL,
	CONSTRAINT "session_focuses_session_id_focus_id_pk" PRIMARY KEY("session_id","focus_id")
);
--> statement-breakpoint
CREATE TABLE "training_focuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"discipline_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"status" "focus_status" DEFAULT 'active' NOT NULL,
	"achieved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_focuses" ADD CONSTRAINT "session_focuses_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_focuses" ADD CONSTRAINT "session_focuses_focus_id_training_focuses_id_fk" FOREIGN KEY ("focus_id") REFERENCES "public"."training_focuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_focuses" ADD CONSTRAINT "training_focuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_focuses" ADD CONSTRAINT "training_focuses_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_focuses_focus_id_idx" ON "session_focuses" USING btree ("focus_id");--> statement-breakpoint
CREATE INDEX "training_focuses_user_id_status_idx" ON "training_focuses" USING btree ("user_id","status");