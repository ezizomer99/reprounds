/**
 * The rest countdown used to live purely in the session screen's component
 * state, so backing out to check a routine destroyed it — while the OS
 * "Rest complete" notification stayed armed and fired with no timer behind it.
 *
 * The app actively encourages leaving mid-set (the tab bar renders a persistent
 * "Resume Session" button), so cancelling the notification would break the
 * background rest timer that the absolute-wall-clock design exists to support.
 * Parking the state here instead lets the screen rehydrate the countdown when
 * it remounts.
 *
 * In-memory on purpose: on a process kill the countdown is gone but the OS
 * notification still fires, which is the right degradation. Persisting to
 * storage would need an async read on every mount for a timer measured in
 * seconds.
 */
export interface ActiveRest {
  sessionId: string;
  entryId: string;
  /** Absolute epoch ms the rest period ends. */
  endsAt: number;
  /** Full duration in seconds, for the progress bar. */
  total: number;
  /** Scheduled notification id, so it can be cancelled on skip. */
  notifId: string | null;
}

let activeRest: ActiveRest | null = null;

export function getActiveRest(sessionId: string): ActiveRest | null {
  if (!activeRest || activeRest.sessionId !== sessionId) return null;
  // Already elapsed — the notification has fired; nothing to restore.
  if (activeRest.endsAt <= Date.now()) {
    activeRest = null;
    return null;
  }
  return activeRest;
}

export function setActiveRest(rest: ActiveRest): void {
  activeRest = rest;
}

export function updateActiveRestNotifId(notifId: string | null): void {
  if (activeRest) activeRest.notifId = notifId;
}

export function clearActiveRest(): void {
  activeRest = null;
}

/**
 * Clear the countdown only if it belongs to `sessionId`. Returns true when
 * something was cleared, so the caller knows whether to cancel the scheduled
 * notification too.
 *
 * Deleting a session from another screen used to leave this pointing at a row
 * that no longer exists, and the "Rest complete" notification still fired.
 */
export function clearActiveRestForSession(sessionId: string): boolean {
  if (activeRest?.sessionId !== sessionId) return false;
  activeRest = null;
  return true;
}
