import type { Session } from '@app/shared';

/** True when a session contains at least one martial-arts entry. */
export function sessionIsMat(session: Session): boolean {
  return session.kinds?.includes('martial_arts') ?? false;
}

/** Which activity a marker is coloured for. */
export type MarkerTone = 'gym' | 'mat' | 'muted';

/**
 * How a marker is drawn:
 * - `filled`  — a logged (completed) session
 * - `core`    — a ring with a solid centre: in progress, not yet finished
 * - `hollow`  — a ring: scheduled for later
 * - `overdue` — a dashed-looking muted ring: planned, but the day has passed
 * - `faded`   — a muted ring: skipped
 */
export type MarkerStyle = 'filled' | 'core' | 'hollow' | 'overdue' | 'faded';

export interface DayMarker {
  tone: MarkerTone;
  style: MarkerStyle;
}

const STYLE_ORDER: MarkerStyle[] = ['filled', 'core', 'hollow', 'overdue', 'faded'];
const TONE_ORDER: MarkerTone[] = ['gym', 'mat', 'muted'];

/** A day cell is small — never draw more than this many dots. */
export const MAX_MARKERS = 4;

/**
 * True when a planned session's day has already passed. Overdue is not a backend
 * state — the server never sees the device's timezone — so it is derived here,
 * matching `statusLabel` in SessionRow.
 */
function isOverdue(session: Session, todayISO: string): boolean {
  return session.status === 'planned' && session.date < todayISO;
}

function markerFor(session: Session, todayISO: string): DayMarker {
  // Tone defaults to gym rather than requiring a kind: a completed session with
  // no entries has an empty `kinds` array, and it must still show up. A day the
  // user trained is never blank.
  const tone: MarkerTone = sessionIsMat(session) ? 'mat' : 'gym';

  switch (session.status) {
    case 'completed':
      return { tone, style: 'filled' };
    case 'in_progress':
      return { tone, style: 'core' };
    case 'planned':
      // A workout that was scheduled and never happened reads very differently
      // from one still coming up. Both used to draw the same hollow ring, so the
      // grid gave no hint that a day needed attention.
      return isOverdue(session, todayISO)
        ? { tone: 'muted', style: 'overdue' }
        : { tone, style: 'hollow' };
    case 'skipped':
      return { tone: 'muted', style: 'faded' };
  }
}

/**
 * Markers for one day's sessions — total over every `SessionStatus`, so every
 * session maps to a dot. Duplicates collapse (three completed gym sessions are
 * one dot) and the result is ordered most-done-first, then capped at
 * `MAX_MARKERS`: a day cell has no room for more.
 *
 * The cap means a very mixed day can have a marker dropped — there are more
 * reachable style/tone combinations than slots — so callers that need to be
 * honest about that pair this with `dayMarkerOverflow`.
 *
 * `todayISO` decides whether a planned session is overdue; pass the same value
 * the grid highlights as today so a cell can't disagree with itself.
 */
export function dayMarkers(sessions: Session[], todayISO: string): DayMarker[] {
  const seen = new Map<string, DayMarker>();
  for (const s of sessions) {
    const m = markerFor(s, todayISO);
    const key = `${m.style}-${m.tone}`;
    if (!seen.has(key)) seen.set(key, m);
  }

  return [...seen.values()]
    .sort(
      (a, b) =>
        STYLE_ORDER.indexOf(a.style) - STYLE_ORDER.indexOf(b.style) ||
        TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone),
    )
    .slice(0, MAX_MARKERS);
}

/**
 * Whether this day has more distinct markers than `dayMarkers` will return, so
 * the cell can show an overflow hint instead of quietly hiding a session.
 */
export function dayMarkerOverflow(sessions: Session[], todayISO: string): boolean {
  const seen = new Set<string>();
  for (const s of sessions) {
    const m = markerFor(s, todayISO);
    seen.add(`${m.style}-${m.tone}`);
    if (seen.size > MAX_MARKERS) return true;
  }
  return false;
}
