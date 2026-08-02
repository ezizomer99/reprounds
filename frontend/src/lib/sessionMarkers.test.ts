import type { Session } from '@app/shared';
import { dayMarkers, sessionIsMat } from './sessionMarkers';

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
    expect(dayMarkers([])).toEqual([]);
  });

  it('maps every status to a marker', () => {
    expect(dayMarkers([session({ status: 'completed' })])).toEqual([
      { tone: 'gym', style: 'filled' },
    ]);
    expect(dayMarkers([session({ status: 'in_progress' })])).toEqual([
      { tone: 'gym', style: 'core' },
    ]);
    expect(dayMarkers([session({ status: 'planned' })])).toEqual([
      { tone: 'gym', style: 'hollow' },
    ]);
    expect(dayMarkers([session({ status: 'skipped' })])).toEqual([
      { tone: 'muted', style: 'faded' },
    ]);
  });

  // The bug this guards: a completed session with no entries has an empty
  // `kinds` array and used to render no dot at all, so the day looked untrained.
  it('marks a completed session that has no entries', () => {
    expect(dayMarkers([session({ kinds: [] })])).toEqual([{ tone: 'gym', style: 'filled' }]);
    expect(dayMarkers([session({ kinds: undefined })])).toEqual([{ tone: 'gym', style: 'filled' }]);
  });

  it('colours martial-arts sessions with the mat tone', () => {
    expect(dayMarkers([session({ kinds: ['martial_arts'] })])).toEqual([
      { tone: 'mat', style: 'filled' },
    ]);
  });

  it('collapses duplicates', () => {
    const markers = dayMarkers([
      session({ id: 'a' }),
      session({ id: 'b' }),
      session({ id: 'c' }),
    ]);
    expect(markers).toEqual([{ tone: 'gym', style: 'filled' }]);
  });

  it('keeps one marker per distinct kind and status, most-done first', () => {
    const markers = dayMarkers([
      session({ id: 'a', status: 'planned' }),
      session({ id: 'b', status: 'completed', kinds: ['martial_arts'] }),
      session({ id: 'c', status: 'completed' }),
    ]);
    expect(markers).toEqual([
      { tone: 'gym', style: 'filled' },
      { tone: 'mat', style: 'filled' },
      { tone: 'gym', style: 'hollow' },
    ]);
  });

  it('caps the number of markers so a cell cannot overflow', () => {
    const markers = dayMarkers([
      session({ id: 'a', status: 'completed' }),
      session({ id: 'b', status: 'completed', kinds: ['martial_arts'] }),
      session({ id: 'c', status: 'in_progress' }),
      session({ id: 'd', status: 'in_progress', kinds: ['martial_arts'] }),
      session({ id: 'e', status: 'planned' }),
      session({ id: 'f', status: 'skipped' }),
    ]);
    expect(markers).toHaveLength(4);
  });
});
