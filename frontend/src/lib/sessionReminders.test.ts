import type { CalendarItem, RoutineWithItems, Session } from '@app/shared';
import { syncSessionReminders } from './sessionReminders';

jest.mock('./notifications', () => ({
  cancelScheduledByKind: jest.fn(),
  scheduleAtDate: jest.fn(),
}));

// Access the mocked functions through require() so Jest's module registry
// returns the same mock instance used by sessionReminders.ts.
const notifMock = require('./notifications') as {
  cancelScheduledByKind: jest.Mock;
  scheduleAtDate: jest.Mock;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function futureIsoDate(daysFromNow = 1): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function pastIsoDate(daysAgo = 2): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function makeVirtualItem(date: string, routineId: string): CalendarItem {
  return { kind: 'virtual', date, routineId };
}

function makeRealItem(): CalendarItem {
  return { kind: 'real', session: {} as unknown as Session };
}

function makeRoutine(id: string, timeOfDay: string | null): RoutineWithItems {
  return {
    id,
    userId: 'user-1',
    name: 'Morning Grind',
    dayLabel: null,
    notes: null,
    rrule: null,
    startDate: null,
    endDate: null,
    timeOfDay,
    createdAt: '2025-01-01T00:00:00Z',
    items: [],
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('syncSessionReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notifMock.cancelScheduledByKind.mockResolvedValue(undefined);
    notifMock.scheduleAtDate.mockResolvedValue('notif-id');
  });

  // ── idempotency ────────────────────────────────────────────────────────────

  it('always calls cancelScheduledByKind exactly once, even with no items', async () => {
    await syncSessionReminders([], []);
    expect(notifMock.cancelScheduledByKind).toHaveBeenCalledTimes(1);
    expect(notifMock.cancelScheduledByKind).toHaveBeenCalledWith('session');
  });

  it('calls cancelScheduledByKind before any scheduleAtDate', async () => {
    const callOrder: string[] = [];
    notifMock.cancelScheduledByKind.mockImplementation(async () => {
      callOrder.push('cancel');
    });
    notifMock.scheduleAtDate.mockImplementation(async () => {
      callOrder.push('schedule');
      return 'id';
    });

    const items: CalendarItem[] = [makeVirtualItem(futureIsoDate(), 'r1')];
    await syncSessionReminders(items, [makeRoutine('r1', '09:00')]);

    expect(callOrder[0]).toBe('cancel');
    expect(callOrder).toContain('schedule');
  });

  it('schedules nothing when called with no items', async () => {
    await syncSessionReminders([], []);
    expect(notifMock.scheduleAtDate).not.toHaveBeenCalled();
  });

  // ── kind filter ────────────────────────────────────────────────────────────

  it('skips real (non-virtual) calendar items', async () => {
    await syncSessionReminders([makeRealItem()], []);
    expect(notifMock.scheduleAtDate).not.toHaveBeenCalled();
  });

  // ── routine / timeOfDay guards ─────────────────────────────────────────────

  it('skips virtual items whose routine has no timeOfDay', async () => {
    const items: CalendarItem[] = [makeVirtualItem(futureIsoDate(), 'r1')];
    await syncSessionReminders(items, [makeRoutine('r1', null)]);
    expect(notifMock.scheduleAtDate).not.toHaveBeenCalled();
  });

  it('skips virtual items with no matching routine in the list', async () => {
    const items: CalendarItem[] = [makeVirtualItem(futureIsoDate(), 'unknown-id')];
    await syncSessionReminders(items, [makeRoutine('r1', '09:00')]);
    expect(notifMock.scheduleAtDate).not.toHaveBeenCalled();
  });

  // ── past-occurrence filter ─────────────────────────────────────────────────

  it('skips past occurrences (date + timeOfDay already elapsed)', async () => {
    const items: CalendarItem[] = [makeVirtualItem(pastIsoDate(), 'r1')];
    await syncSessionReminders(items, [makeRoutine('r1', '09:00')]);
    expect(notifMock.scheduleAtDate).not.toHaveBeenCalled();
  });

  // ── happy path ────────────────────────────────────────────────────────────

  it('schedules future virtual items that have a matching routine with timeOfDay', async () => {
    const items: CalendarItem[] = [makeVirtualItem(futureIsoDate(), 'r1')];
    await syncSessionReminders(items, [makeRoutine('r1', '09:00')]);
    expect(notifMock.scheduleAtDate).toHaveBeenCalledTimes(1);
  });

  // ── MAX_REMINDERS cap ─────────────────────────────────────────────────────

  it('schedules at most 30 reminders regardless of how many valid items exist', async () => {
    const routines = [makeRoutine('r1', '09:00')];
    // 35 future virtual items – only 30 should be scheduled
    const items: CalendarItem[] = Array.from({ length: 35 }, (_, i) =>
      makeVirtualItem(futureIsoDate(i + 1), 'r1'),
    );
    await syncSessionReminders(items, routines);
    expect(notifMock.scheduleAtDate).toHaveBeenCalledTimes(30);
  });

  it('does not stop early when exactly 30 valid items are provided', async () => {
    const routines = [makeRoutine('r1', '09:00')];
    const items: CalendarItem[] = Array.from({ length: 30 }, (_, i) =>
      makeVirtualItem(futureIsoDate(i + 1), 'r1'),
    );
    await syncSessionReminders(items, routines);
    expect(notifMock.scheduleAtDate).toHaveBeenCalledTimes(30);
  });
});
