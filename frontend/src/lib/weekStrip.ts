import { addDaysISO } from '@app/shared';
import type { Session } from '@app/shared';
import { DAY_LABELS_LONG } from './calendar';
import { DayMarker, dayMarkerOverflow, dayMarkers, sessionIsMat } from './sessionMarkers';
import { weekRangeOf } from './statsHelpers';

export interface WeekDayCell {
  isoDate: string;
  /** 'MON' … 'SUN'. */
  abbrev: string;
  dayNum: number;
  isToday: boolean;
  isFuture: boolean;
  markers: DayMarker[];
  /** More distinct markers than the cell can draw. */
  overflow: boolean;
}

export interface WeekCounts {
  /** Sessions actually logged this week. */
  completed: number;
  /** Sessions scheduled for a day still to come. */
  planned: number;
  /** Completed sessions including at least one lifting entry. */
  gym: number;
  /** Completed sessions including at least one martial-arts entry. */
  mat: number;
}

export interface WeekStrip {
  days: WeekDayCell[];
  counts: WeekCounts;
}

/**
 * The seven days of the week containing `todayISO`, Monday first, with each
 * day's markers and the week's own counts.
 *
 * Two things this fixes by construction:
 *
 * The strip and the sentence above it now come from one pass over one list. The
 * week block used to draw its dots from a range query and count its sessions
 * from a separate 200-row history query filtered to `completed` — so a week with
 * two logged and two scheduled sessions showed four dots above the words "2
 * sessions this week", and there was no way to tell which was wrong.
 *
 * Markers come from `dayMarkers`, the same function the month grid uses, rather
 * than the private three-case version this replaces. That one only knew
 * completed-gym, completed-mat and planned; `in_progress`, `skipped` and overdue
 * all rendered as nothing or as something misleading, on the very card that taps
 * through to the calendar where they render correctly.
 *
 * `sessions` should be every session in the week whatever its status — the
 * `useSessionsInRange` query sends no status filter, so its rows are exactly
 * that. Anything outside the week is ignored, so passing a wider list is safe.
 */
export function buildWeekStrip(todayISO: string, sessions: Session[]): WeekStrip {
  const { from: monday } = weekRangeOf(todayISO);

  const byDay = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = byDay.get(s.date);
    if (list) list.push(s);
    else byDay.set(s.date, [s]);
  }

  const days: WeekDayCell[] = [];
  const counts: WeekCounts = { completed: 0, planned: 0, gym: 0, mat: 0 };

  for (let i = 0; i < 7; i++) {
    const isoDate = addDaysISO(monday, i);
    const daySessions = byDay.get(isoDate) ?? [];

    for (const s of daySessions) {
      if (s.status === 'completed') {
        counts.completed++;
        // Not exclusive: a session that both lifted and rolled counts for each.
        if (sessionIsMat(s)) counts.mat++;
        else counts.gym++;
      } else if (s.status === 'planned') {
        counts.planned++;
      }
    }

    days.push({
      isoDate,
      abbrev: DAY_LABELS_LONG[i].toUpperCase(),
      dayNum: Number(isoDate.slice(8, 10)),
      isToday: isoDate === todayISO,
      isFuture: isoDate > todayISO,
      markers: dayMarkers(daySessions, todayISO),
      overflow: dayMarkerOverflow(daySessions, todayISO),
    });
  }

  return { days, counts };
}

/**
 * The line under the section title: what actually happened this week, and what
 * is still scheduled. Both clauses are dropped when zero rather than reading
 * "0 planned", and an empty week gets a prompt instead of a tally.
 */
export function weekSummary(counts: WeekCounts): string {
  const parts: string[] = [];
  if (counts.completed > 0) parts.push(`${counts.completed} logged`);
  if (counts.planned > 0) parts.push(`${counts.planned} planned`);
  return parts.length > 0 ? parts.join(' · ') : 'Log a session to start your streak';
}
