import { and, eq, isNull, or } from 'drizzle-orm';
import type { createDb } from '../db';
import { disciplines, exercises } from '../db/schema';

type Db = ReturnType<typeof createDb>;

// Exercises and disciplines are visible to a user when they are a global seed
// (user_id IS NULL) or owned by that user. These helpers guard against IDOR on
// create/update paths: without them a caller could attach another user's PRIVATE
// exercise/discipline to their own session entry, routine item, fight, or
// promotion, leaking the referenced row's name into their own history.
//
// A null/undefined id means "no reference" and is always allowed — callers that
// require the id present should check that separately (e.g. validateEntryKind).

export async function exerciseVisible(
  db: Db,
  exerciseId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (!exerciseId) return true;
  const [row] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        eq(exercises.id, exerciseId),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    )
    .limit(1);
  return !!row;
}

export async function disciplineVisible(
  db: Db,
  disciplineId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (!disciplineId) return true;
  const [row] = await db
    .select({ id: disciplines.id })
    .from(disciplines)
    .where(
      and(
        eq(disciplines.id, disciplineId),
        or(isNull(disciplines.userId), eq(disciplines.userId, userId)),
      ),
    )
    .limit(1);
  return !!row;
}
