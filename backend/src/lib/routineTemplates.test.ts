import { describe, it, expect } from 'vitest';
import { matchExercise, matchDiscipline, type NamedRow } from './routineTemplates';
import { ROUTINE_TEMPLATES } from '@app/shared';

const catalog: NamedRow[] = [
  { id: 'e1', name: 'Barbell Full Squat' },
  { id: 'e2', name: 'Barbell Bench Press' },
  { id: 'e3', name: 'Barbell Bent Over Row' },
  { id: 'e4', name: 'Barbell Deadlift' },
  { id: 'e5', name: 'Bench Press' }, // shorter exact-ish
  { id: 'e6', name: 'Pull Up' },
];

describe('matchExercise', () => {
  it('prefers an exact normalized match over a substring match', () => {
    expect(matchExercise('Bench Press', catalog)).toBe('e5');
  });

  it('falls back to the shortest name containing all words', () => {
    // No exact "Squat" → "Barbell Full Squat" contains "squat"
    expect(matchExercise('Squat', catalog)).toBe('e1');
  });

  it('matches multi-word names via substring word coverage', () => {
    expect(matchExercise('Barbell Row', catalog)).toBe('e3');
  });

  it('is punctuation/case insensitive', () => {
    expect(matchExercise('pull-up', catalog)).toBe('e6');
  });

  it('returns null when nothing matches', () => {
    expect(matchExercise('Zercher Carry', catalog)).toBeNull();
  });
});

describe('matchDiscipline', () => {
  const disciplines: NamedRow[] = [
    { id: 'd1', name: 'BJJ' },
    { id: 'd2', name: 'Muay Thai' },
  ];

  it('matches exactly, case-insensitively', () => {
    expect(matchDiscipline('bjj', disciplines)).toBe('d1');
    expect(matchDiscipline('Muay Thai', disciplines)).toBe('d2');
  });

  it('returns null for an unknown discipline', () => {
    expect(matchDiscipline('Judo', disciplines)).toBeNull();
  });
});

describe('ROUTINE_TEMPLATES integrity', () => {
  it('every template has a unique id and at least one routine', () => {
    const ids = new Set<string>();
    for (const t of ROUTINE_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.routines.length).toBeGreaterThan(0);
      for (const r of t.routines) {
        expect(r.items.length).toBeGreaterThan(0);
      }
    }
  });

  it('mat items reference only known global disciplines', () => {
    const known = new Set(['bjj', 'wrestling', 'boxing', 'muay thai', 'mma']);
    for (const t of ROUTINE_TEMPLATES) {
      for (const r of t.routines) {
        for (const item of r.items) {
          if (item.kind === 'martial_arts') {
            expect(known.has(item.disciplineName.toLowerCase())).toBe(true);
          }
        }
      }
    }
  });
});
