/**
 * Turning a drag-and-drop drop into a reorder request.
 *
 * `react-native-draggable-flatlist` hands `onDragEnd` a snapshot of the list in
 * its new order. That snapshot is not always usable: a drop resolved against
 * stale cell offsets can come back short or with a hole in it, and a row added
 * moments ago still carries a client-side `optimistic-` id the server has never
 * seen — sending one to a reorder endpoint is a guaranteed 400, since the API
 * validates every element as a UUID.
 */

const OPTIMISTIC_PREFIX = 'optimistic-';

/** True while a row exists only in the optimistic cache, with no server id yet. */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/**
 * The id list to send for a reorder, or `null` when the drop should be ignored.
 *
 * Ignored when the snapshot is unusable (a hole, or a different length than the
 * list it came from), when any row is still optimistic, or when nothing
 * actually moved — a tap that registers as a zero-distance drag shouldn't cost
 * a round trip.
 */
export function reorderPayload<T extends { id: string }>(
  dropped: readonly (T | undefined)[],
  current: readonly T[],
): string[] | null {
  if (dropped.length !== current.length) return null;
  if (dropped.some((item) => item === undefined)) return null;

  const order = (dropped as readonly T[]).map((item) => item.id);
  if (order.some(isOptimisticId)) return null;
  if (order.every((id, i) => current[i]?.id === id)) return null;

  return order;
}
