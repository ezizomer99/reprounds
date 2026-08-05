// Inclusive numeric bounds for user-entered fields, shared so the client can
// reject a value before it is sent and the server rejects the same value if it
// arrives anyway. These used to be magic numbers duplicated at each backend
// call site, which let the two sides drift: the app happily sent reps of -5,
// the server 400'd, and the optimistic value stayed on screen looking saved.
//
// Pair with `isNumberInRange` (validators.ts) on the server and
// `parseNumberInRange` (frontend/src/lib/parseNumber.ts) on the client.

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

/** Reps on a strength set. Doubles as seconds for conditioning entries. */
export const REPS_RANGE: NumericRange = { min: 0, max: 10_000 };

/** Rate of perceived exertion. */
export const RPE_RANGE: NumericRange = { min: 0, max: 10 };

/** Reps in reserve. */
export const RIR_RANGE: NumericRange = { min: 0, max: 100 };

/**
 * Weight in kilograms — covers both logged set weight and body-weight entries.
 * 1000 kg is well past any real lift while still catching a fat-fingered
 * "100000" or a lb/kg unit mix-up.
 */
export const WEIGHT_KG_RANGE: NumericRange = { min: 0, max: 1000 };

/** Round number a fight finished in. */
export const FIGHT_ROUND_RANGE: NumericRange = { min: 1, max: 100 };

/** Stripes on a belt promotion. */
export const STRIPES_RANGE: NumericRange = { min: 0, max: 20 };

/**
 * Custom rest-timer duration in seconds, as typed into the custom-duration
 * field. Matches the existing 1-600 UI cap — the field offers no way to mean
 * "off", so 0 is deliberately outside it.
 */
export const REST_SECONDS_RANGE: NumericRange = { min: 1, max: 600 };

/**
 * Rest duration as *stored* on an entry, which additionally allows 0 — the
 * "Off" preset. Validate persisted values against this, never against
 * REST_SECONDS_RANGE, or picking "Off" is rejected.
 */
export const REST_SECONDS_STORED_RANGE: NumericRange = { min: 0, max: 600 };

/** Length of a martial-arts round, in minutes. */
export const ROUND_MINUTES_RANGE: NumericRange = { min: 0, max: 600 };

/**
 * Position of an entry within a session, or an item within a routine. Generous
 * — the point is to reject a non-integer or an int4 overflow, both of which
 * used to reach Postgres and surface as a 500.
 */
export const ORDER_INDEX_RANGE: NumericRange = { min: 0, max: 10_000 };

/** Position of a set within an entry. 1-based, matching the UI. */
export const SET_NUMBER_RANGE: NumericRange = { min: 1, max: 1_000 };

/** Superset grouping key. Arbitrary but bounded; only equality matters. */
export const SUPERSET_GROUP_RANGE: NumericRange = { min: 0, max: 1_000 };

/** Recorded length of a session. Capped at a (long) 24 hours. */
export const DURATION_MINUTES_RANGE: NumericRange = { min: 0, max: 1_440 };

// Free-text caps. Every text column in the schema is an unbounded Postgres
// `text`, so these are a client-side sanity guard (a stuck key or a paste of a
// whole document), not a mirror of a DB constraint.
export const NAME_MAX_LENGTH = 120;
export const NOTES_MAX_LENGTH = 2000;

/**
 * Serialized size cap for the free-form `details` JSONB on a session entry (the
 * rounds payload, technique tags, custom field_config answers). Unbounded jsonb
 * is the one request field with no natural ceiling; a real mat session
 * serializes to a few KB, so this is generous while still refusing a payload
 * that could bloat the row.
 */
export const DETAILS_MAX_BYTES = 64_000;

/**
 * Upper bound on ids accepted by a reorder endpoint. Each id costs one
 * round-trip inside a transaction, so this caps the work one request can queue.
 * Far above any realistic routine or session length.
 */
export const MAX_REORDER_IDS = 500;

/**
 * Highest rep count the Epley estimate is meaningful at.
 *
 * Epley (`w * (1 + reps/30)`) is a linear extrapolation fitted to low-rep work
 * and degrades badly past roughly a dozen reps: it was applied at any rep count,
 * so a 60 kg × 20 back-off set estimated 100 kg and outranked a genuine
 * 100 kg × 3 in Top Lifts and in the exercise's own PR.
 *
 * A set above this gets **no** estimate rather than a clamped one — a clamped
 * number is neither a real estimate nor what was lifted. What that means depends
 * on the surface: on a leaderboard the set simply does not rank; on an
 * exercise's own PR card the estimate reads "—" while the heaviest actual set is
 * still shown. Both the TS calculator and the SQL helper (`backend/src/lib/e1rm.ts`)
 * key off this constant and must agree — `/exercises/:id/prs` picks the winning
 * row in SQL and recomputes the number in TS.
 */
export const E1RM_MAX_REPS = 12;
