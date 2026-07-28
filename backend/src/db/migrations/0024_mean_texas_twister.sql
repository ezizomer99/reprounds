ALTER TABLE "routines" ADD COLUMN "order_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill so existing routines keep the newest-first order the list showed
-- before ordering was user-controlled. Numbered per user, starting at 0.
UPDATE "routines" AS r
SET "order_index" = s.rn
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at" DESC) - 1 AS rn
  FROM "routines"
) AS s
WHERE r."id" = s."id";
