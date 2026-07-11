import { sql, type SQL } from 'drizzle-orm';

// Single source for the Epley estimated-1RM formula IN SQL, mirroring the shared
// TS calculator estimatedOneRepMax (reps===1 → weight, else weight*(1+reps/30)).
// Three query sites (exercise PRs, exercise progression, top-lifts) previously
// hand-wrote this CASE; they now interpolate this helper so the formula can only
// change in one place. Callers pass the weight/reps SQL fragments (drizzle
// columns or raw `sql` expressions, casting to numeric where needed).
export function epleyE1rmSql(weight: SQL, reps: SQL): SQL {
  return sql`CASE WHEN ${reps} = 1 THEN ${weight} ELSE ${weight} * (1.0 + ${reps} / 30.0) END`;
}
