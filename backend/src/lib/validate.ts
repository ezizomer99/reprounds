import { isNumberInRange, type NumericRange } from '@app/shared';

// Request-shape guards shared by every route handler.
//
// These checks used to be hand-rolled per route, which let them drift: three of
// four stats endpoints regex-checked `since` and the fourth didn't; PATCH and
// complete validated a session date while create didn't; two of three PATCH
// handlers guarded an empty update body. Each gap surfaced the same way — a
// value Postgres refused, returned to the app as a generic 500 instead of a
// 400 naming the field. One module means a fix lands everywhere at once.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A `YYYY-MM-DD` string naming a real calendar day.
 *
 * The shape check alone lets `2026-02-30` and `2026-13-01` through, and those
 * reach the Postgres `date` column as a cast error — the exact 500 this module
 * exists to prevent. Round-tripping through UTC catches them.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * A UUID, in the form every `id` column in the schema uses.
 *
 * Worth checking before the value reaches a query: a non-UUID id or filter
 * param is `invalid input syntax for type uuid`, i.e. a 500 for what is plainly
 * a bad request.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * True when any of these path params is not a UUID.
 *
 * Body ids were checked with `isUuid` from the start; path params were not, so
 * a mistyped or stale URL reached `eq(table.id, 'foo')` and came back as the
 * 500 described above instead of a 404. Handlers guard with this before their
 * first query.
 */
export function notUuid(...values: (string | undefined)[]): boolean {
  return values.some((value) => !isUuid(value));
}

/** A whole number inside an inclusive range. */
export function isIntInRange(value: unknown, range: NumericRange): value is number {
  return Number.isInteger(value) && isNumberInRange(value, range.min, range.max);
}

/**
 * Text within a length cap. `null`/`undefined` pass — callers that require the
 * field present check that separately, as they do for every other optional.
 */
export function isWithinLength(value: unknown, max: number): boolean {
  if (value == null) return true;
  return typeof value === 'string' && value.length <= max;
}

/**
 * A JSON-serializable value whose encoded size fits the cap. Rejects anything
 * that can't be stringified at all (a cycle, a BigInt), which would otherwise
 * throw inside the driver rather than at the edge.
 */
export function isWithinSerializedSize(value: unknown, maxBytes: number): boolean {
  if (value == null) return true;
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return false;
  }
  if (encoded === undefined) return false;
  return new TextEncoder().encode(encoded).length <= maxBytes;
}

/**
 * An array of UUIDs suitable for a reorder endpoint: non-empty, every element a
 * UUID, and no longer than the cap. Returns an error message, or null when the
 * value is acceptable — shaped for `if (err) return c.json({ error: err }, 400)`.
 *
 * `noun` names what the ids refer to ("entry ID", "item ID") so each endpoint
 * keeps the specific message it already returned.
 */
export function validateIdList(
  value: unknown,
  maxIds: number,
  field: string,
  noun = 'ID',
): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return `${field} must be a non-empty array of ${noun}s`;
  }
  if (value.length > maxIds) {
    return `${field} array too large`;
  }
  if (!value.every(isUuid)) {
    return `${field} must contain only valid ${noun}s`;
  }
  return null;
}
