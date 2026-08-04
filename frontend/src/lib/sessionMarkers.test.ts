import type { Session } from '@app/shared';
import { dayMarkerOverflow, dayMarkers, sessionIsMat } from './sessionMarkers';

// The fixture day itself. Passing this as "today" keeps a planned session on it
// upcoming rather than overdue, which is what most of these cases are about.
const TODAY = '2026-08-02';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    userId: 'user-1',
    routineId: null,
    name: null,
    date: '2026-08-02',
    status: 'completed',
    startedAt: null,
    completedAt: null,
    durationMinutes: null,
    notes: null,
    createdAt: '2026-08-02T00:00:00.000Z',
    kinds: ['exercise'],
    ...overrides,
  };
}

describe('sessionIsMat', () => {
  it('is true only when a martial-arts entry is present', () => {
    expect(sessionIsMat(session({ kinds: ['martial_arts'] }))).toBe(true);
    expect(sessionIsMat(session({ kinds: ['exercise'] }))).toBe(false);
    expect(sessionIsMat(session({ kinds: [] }))).toBe(false);
    expect(sessionIsMat(session({ kinds: undefined }))).toBe(false);
  });
});

describe('dayMarkers', () => {
  it('returns nothing for a day with no sessions', () => {
    expect(dayMarkers([], TODAY)).toEqual([]);
  });

  it('maps every status to a marker', () => {
    expect(dayMarkers([session({ status: 'completed' })], TODAY)).toEqual([
      { tone: 'gym', style: 'filled' },
    ]);
    expect(dayMarkers([session({ status: 'in_progress' })], TODAY)).toEqual([
      { tone: 'gym', style: 'core' },
    ]);
    expect(dayMarkers([session({ status: 'planned' })], TODAY)).toEqual([
      { tone: 'gym', style: 'hollow' },
    ]);
    expect(dayMarkers([session({ status: 'skipped' })], TODAY)).toEqual([
      { tone: 'muted', style: 'faded' },
    ]);
  });

  // The bug this guards: a completed session with no entries has an empty
  // `kinds` array and used to render no dot at all, so the day looked untrained.
  it('marks a completed session that has no entries', () => {
    expect(dayMarkers([session({ kinds: [] })], TODAY)).toEqual([{ tone: 'gym', style: 'filled' }]);
    expect(dayMarkers([session({ kinds: undefined })], TODAY)).toEqual([
      { tone: 'gym', style: 'filled' },
    ]);
  });

  it('colours martial-arts sessions with the mat tone', () => {
    expect(dayMarkers([session({ kinds: ['martial_arts'] })], TODAY)).toEqual([
      { tone: 'mat', style: 'filled' },
    ]);
  });

  it('collapses duplicates', () => {
    const markers = dayMarkers(
      [session({ id: 'a' }), session({ id: 'b' }), session({ id: 'c' })],
      TODAY,
    );
    expect(markers).toEqual([{ tone: 'gym', style: 'filled' }]);
  });

  it('keeps one marker per distinct kind and status, most-done first', () => {
    const markers = dayMarkers(
      [
        session({ id: 'a', status: 'planned' }),
        session({ id: 'b', status: 'completed', kinds: ['martial_arts'] }),
        session({ id: 'c', status: 'completed' }),
      ],
      TODAY,
    );
    expect(markers).toEqual([
      { tone: 'gym', style: 'filled' },
      { tone: 'mat', style: 'filled' },
      { tone: 'gym', style: 'hollow' },
    ]);
  });

  it('caps the number of markers so a cell cannot overflow', () => {
    const markers = dayMarkers(
      [
        session({ id: 'a', status: 'completed' }),
        session({ id: 'b', status: 'completed', kinds: ['martial_arts'] }),
        session({ id: 'c', status: 'in_progress' }),
        session({ id: 'd', status: 'in_progress', kinds: ['martial_arts'] }),
        session({ id: 'e', status: 'planned' }),
        session({ id: 'f', status: 'skipped' }),
      ],
      TODAY,
    );
    expect(markers).toHaveLength(4);
  });

  // A planned day that has passed and one still coming up used to draw the same
  // hollow ring, so the grid gave no hint that a day needed attention.
  describe('overdue', () => {
    it('distinguishes a passed planned day from an upcoming one', () => {
      const planned = session({ status: 'planned' });
      expect(dayMarkers([planned], '2026-08-05')).toEqual([{ tone: 'muted', style: 'overdue' }]);
      expect(dayMarkers([planned], '2026-08-01')).toEqual([{ tone: 'gym', style: 'hollow' }]);
    });

    it('treats a planned session dated today as upcoming, not overdue', () => {
      expect(dayMarkers([session({ status: 'planned' })], TODAY)).toEqual([
        { tone: 'gym', style: 'hollow' },
      ]);
    });

    it('applies only to planned sessions', () => {
      expect(dayMarkers([session({ status: 'completed' })], '2026-08-05')).toEqual([
        { tone: 'gym', style: 'filled' },
      ]);
      expect(dayMarkers([session({ status: 'skipped' })], '2026-08-05')).toEqual([
        { tone: 'muted', style: 'faded' },
      ]);
    });

    it('collapses an overdue gym and mat session into one muted marker', () => {
      const markers = dayMarkers(
        [
          session({ id: 'a', status: 'planned' }),
          session({ id: 'b', status: 'planned', kinds: ['martial_arts'] }),
        ],
        '2026-08-05',
      );
      expect(markers).toEqual([{ tone: 'muted', style: 'overdue' }]);
    });
  });
});

describe('dayMarkerOverflow', () => {
  it('is false when every marker fits', () => {
    expect(dayMarkerOverflow([], TODAY)).toBe(false);
    expect(dayMarkerOverflow([session()], TODAY)).toBe(false);
    expect(
      dayMarkerOverflow(
        [
          session({ id: 'a', status: 'completed' }),
          session({ id: 'b', status: 'completed', kinds: ['martial_arts'] }),
          session({ id: 'c', status: 'in_progress' }),
          session({ id: 'd', status: 'in_progress', kinds: ['martial_arts'] }),
        ],
        TODAY,
      ),
    ).toBe(false);
  });

  // The exact day the cap silently dropped a dot: 5 distinct markers, 4 slots.
  it('is true when a fifth distinct marker exists', () => {
    const sessions = [
      session({ id: 'a', status: 'completed' }),
      session({ id: 'b', status: 'completed', kinds: ['martial_arts'] }),
      session({ id: 'c', status: 'in_progress' }),
      session({ id: 'd', status: 'in_progress', kinds: ['martial_arts'] }),
      session({ id: 'e', status: 'skipped' }),
    ];
    expect(dayMarkerOverflow(sessions, TODAY)).toBe(true);
    expect(dayMarkers(sessions, TODAY)).toHaveLength(4);
  });

  it('ignores duplicates when counting', () => {
    const sessions = Array.from({ length: 20 }, (_, i) => session({ id: `s-${i}` }));
    expect(dayMarkerOverflow(sessions, TODAY)).toBe(false);
  });
});
