import type { Session } from '@app/shared';

/** True when a session contains at least one martial-arts entry. */
export function sessionIsMat(session: Session): boolean {
  return session.kinds?.includes('martial_arts') ?? false;
}

/** Which activity a marker is coloured for. */
export type MarkerTone = 'gym' | 'mat' | 'muted';

/**
 * How a marker is drawn:
 * - `filled` — a logged (completed) session
 * - `core`   — a ring with a solid centre: in progress, not yet finished
 * - `hollow` — a ring: scheduled for later
 * - `faded`  — a muted ring: skipped
 */
export type MarkerStyle = 'filled' | 'core' | 'hollow' | 'faded';

export interface DayMarker {
  tone: MarkerTone;
  style: MarkerStyle;
}

const STYLE_ORDER: MarkerStyle[] = ['filled', 'core', 'hollow', 'faded'];
const TONE_ORDER: MarkerTone[] = ['gym', 'mat', 'muted'];

/** A day cell is small — never draw more than this many dots. */
const MAX_MARKERS = 4;

function markerFor(session: Session): DayMarker {
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
      return { tone, style: 'hollow' };
    case 'skipped':
      return { tone: 'muted', style: 'faded' };
  }
}

/**
 * Markers for one day's sessions — total over every `SessionStatus`, so no
 * session can ever be invisible on the calendar. Duplicates collapse (three
 * completed gym sessions are one dot) and the result is capped, then ordered
 * most-done-first.
 */
export function dayMarkers(sessions: Session[]): DayMarker[] {
  const seen = new Map<string, DayMarker>();
  for (const s of sessions) {
    const m = markerFor(s);
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
