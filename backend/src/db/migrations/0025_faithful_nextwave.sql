CREATE TABLE "exercise_muscle_overrides" (
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"muscle_group" text,
	"secondary_muscles" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_muscle_overrides_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "exercise_muscle_overrides" ADD CONSTRAINT "exercise_muscle_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscle_overrides" ADD CONSTRAINT "exercise_muscle_overrides_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;