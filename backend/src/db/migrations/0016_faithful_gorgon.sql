ALTER TABLE "fights" DROP CONSTRAINT "fights_discipline_id_disciplines_id_fk";
--> statement-breakpoint
ALTER TABLE "rank_promotions" DROP CONSTRAINT "rank_promotions_discipline_id_disciplines_id_fk";
--> statement-breakpoint
ALTER TABLE "fights" ADD CONSTRAINT "fights_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_promotions" ADD CONSTRAINT "rank_promotions_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE restrict ON UPDATE no action;