CREATE TABLE "rank_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"discipline_id" uuid NOT NULL,
	"rank" text NOT NULL,
	"stripes" integer,
	"date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_promotions" ADD CONSTRAINT "rank_promotions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_promotions" ADD CONSTRAINT "rank_promotions_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rank_promotions_user_id_idx" ON "rank_promotions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rank_promotions_discipline_id_idx" ON "rank_promotions" USING btree ("discipline_id");