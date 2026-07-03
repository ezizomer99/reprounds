import { describe, it, expect } from 'vitest';
import { projectOccurrences } from './calendar';
import type { routines, sessions } from '../db/schema';

type RoutineRow = typeof routines.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

// Minimal row factories — only the fields projectOccurrences reads matter;
// the rest are filled with schema-shaped defaults.
function routine(over: Partial<RoutineRow>): RoutineRow {
  return {
    id: 'routine-1',
    userId: 'user-1',
    name: 'Tuesday BJJ',
    dayLabel: null,
    notes: null,
    rrule: 'FREQ=WEEKLY;BYDAY=TU',
    startDate: '2026-01-01',
    endDate: null,
    timeOfDay: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as RoutineRow;
}

function session(over: Partial<SessionRow>): SessionRow {
  return {
    id: 'session-1',
    userId: 'user-1',
    routineId: null,
    name: null,
    date: '2026-06-01',
    status: 'completed',
    startedAt: null,
    completedAt: null,
    durationMinutes: null,
    notes: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    ...over,
  } as SessionRow;
}

describe('projectOccurrences', () => {
  it('projects weekly occurrences inside the range', () => {
    // June 2026: Tuesdays fall on the 2nd, 9th, 16th, 23rd, 30th.
    const items = projectOccurrences([routine({})], [], '2026-06-01', '2026-06-30');
    const dates = items.filter((i) => i.kind === 'virtual').map((i) => (i.kind === 'virtual' ? i.date : ''));
    expect(dates).toEqual(['2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30']);
  });

  it('skips dates that already have a materialized session for the routine', () => {
    const real = session({ routineId: 'routine-1', date: '2026-06-09', status: 'skipped' });
    const items = projectOccurrences([routine({})], [real], '2026-06-01', '2026-06-30');
    const virtualDates = items.filter((i) => i.kind === 'virtual').map((i) => (i.kind === 'virtual' ? i.date : ''));
    expect(virtualDates).not.toContain('2026-06-09');
    expect(virtualDates).toHaveLength(4);
    // The real (skipped) session is still returned as a real item.
    expect(items.filter((i) => i.kind === 'real')).toHaveLength(1);
  });

  it('does not dedupe a session from a different routine on the same date', () => {
    const real = session({ routineId: 'other-routine', date: '2026-06-09' });
    const items = projectOccurrences([routine({})], [real], '2026-06-01', '2026-06-30');
    const virtualDates = items.filter((i) => i.kind === 'virtual').map((i) => (i.kind === 'virtual' ? i.date : ''));
    expect(virtualDates).toContain('2026-06-09');
  });

  it('ignores routines without an rrule or without a startDate', () => {
    const unscheduled = routine({ id: 'r-a', rrule: null });
    const noStart = routine({ id: 'r-b', startDate: null });
    const items = projectOccurrences([unscheduled, noStart], [], '2026-06-01', '2026-06-30');
    expect(items).toHaveLength(0);
  });

  it('respects the routine endDate as an inclusive until bound', () => {
    const ended = routine({ endDate: '2026-06-16' });
    const items = projectOccurrences([ended], [], '2026-06-01', '2026-06-30');
    const dates = items.map((i) => (i.kind === 'virtual' ? i.date : ''));
    expect(dates).toEqual(['2026-06-02', '2026-06-09', '2026-06-16']);
  });

  it('does not project before the routine startDate', () => {
    const startsMidMonth = routine({ startDate: '2026-06-15' });
    const items = projectOccurrences([startsMidMonth], [], '2026-06-01', '2026-06-30');
    const dates = items.map((i) => (i.kind === 'virtual' ? i.date : ''));
    expect(dates).toEqual(['2026-06-16', '2026-06-23', '2026-06-30']);
  });

  it('includes range boundary dates (between is inclusive)', () => {
    // 2026-06-02 is a Tuesday — query exactly that single day.
    const items = projectOccurrences([routine({})], [], '2026-06-02', '2026-06-02');
    const dates = items.map((i) => (i.kind === 'virtual' ? i.date : ''));
    expect(dates).toEqual(['2026-06-02']);
  });

  it('merges real sessions and virtual occurrences sorted by date', () => {
    const real = session({ date: '2026-06-05' });
    const items = projectOccurrences([routine({})], [real], '2026-06-01', '2026-06-10');
    const dates = items.map((i) => (i.kind === 'real' ? i.session.date : i.date));
    expect(dates).toEqual(['2026-06-02', '2026-06-05', '2026-06-09']);
  });

  it('handles a monthly rrule (BYMONTHDAY) across a month boundary', () => {
    const monthly = routine({ rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', startDate: '2026-01-01' });
    const items = projectOccurrences([monthly], [], '2026-05-15', '2026-07-15');
    const dates = items.map((i) => (i.kind === 'virtual' ? i.date : ''));
    expect(dates).toEqual(['2026-06-01', '2026-07-01']);
  });
});
