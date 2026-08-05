import { sql, type SQL } from 'drizzle-orm';
import { E1RM_MAX_REPS } from '@app/shared';

// Single source for the Epley estimated-1RM formula IN SQL, mirroring the shared
// TS calculator estimatedOneRepMax (reps > cap → NULL, reps === 1 → weight, else
// weight*(1+reps/30)). Three query sites (exercise PRs, exercise progression,
// top-lifts) previously hand-wrote this CASE; they now interpolate this helper so
// the formula can only change in one place. Callers pass the weight/reps SQL
// fragments (drizzle columns or raw `sql` expressions, casting to numeric where
// needed).
//
// The two implementations must stay in step: /exercises/:id/prs picks the winning
// row with this expression and then recomputes the number with the TS calculator,
// so a disagreement shows a figure that does not match the set beside it.
//
// NULL is not "no result" to an ORDER BY — Postgres sorts NULLS FIRST for DESC,
// so every ranking query using this MUST say `DESC NULLS LAST` or it selects
// precisely the sets this cap exists to reject.
export function epleyE1rmSql(weight: SQL, reps: SQL): SQL {
  return sql`CASE
    WHEN ${reps} > ${E1RM_MAX_REPS} THEN NULL
    WHEN ${reps} = 1 THEN ${weight}
    ELSE ${weight} * (1.0 + ${reps} / 30.0)
  END`;
}
