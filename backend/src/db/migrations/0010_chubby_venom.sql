CREATE TYPE "public"."fight_method" AS ENUM('ko', 'tko', 'submission', 'decision', 'points', 'other');--> statement-breakpoint
CREATE TYPE "public"."fight_result" AS ENUM('win', 'loss', 'draw');--> statement-breakpoint
CREATE TABLE "fights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"discipline_id" uuid NOT NULL,
	"date" date NOT NULL,
	"opponent" text,
	"result" "fight_result" NOT NULL,
	"method" "fight_method",
	"round" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fights" ADD CONSTRAINT "fights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fights" ADD CONSTRAINT "fights_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fights_user_id_idx" ON "fights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fights_discipline_id_idx" ON "fights" USING btree ("discipline_id");