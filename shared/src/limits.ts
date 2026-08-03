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

/** Custom rest-timer duration in seconds. Matches the existing 1-600 UI cap. */
export const REST_SECONDS_RANGE: NumericRange = { min: 1, max: 600 };

/** Length of a martial-arts round, in minutes. */
export const ROUND_MINUTES_RANGE: NumericRange = { min: 0, max: 600 };

// Free-text caps. Every text column in the schema is an unbounded Postgres
// `text`, so these are a client-side sanity guard (a stuck key or a paste of a
// whole document), not a mirror of a DB constraint.
export const NAME_MAX_LENGTH = 120;
export const NOTES_MAX_LENGTH = 2000;
