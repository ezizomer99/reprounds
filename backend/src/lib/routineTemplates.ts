/**
 * Resolve routine-template item names to concrete global exercise/discipline
 * rows. Templates reference exercises by name (the seed data's source IDs
 * aren't authored into the templates), so matching is name-based and lenient:
 * exact normalized match wins, otherwise the shortest global name that
 * contains every word of the template name.
 */

export interface NamedRow {
  id: string;
  name: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Match an exercise name against global exercises. Returns the row id or null. */
export function matchExercise(templateName: string, globals: NamedRow[]): string | null {
  const target = normalize(templateName);
  if (!target) return null;

  let exact: NamedRow | null = null;
  let bestSubstr: NamedRow | null = null;
  const words = target.split(' ');

  for (const g of globals) {
    const gname = normalize(g.name);
    if (gname === target) {
      if (!exact || g.name.length < exact.name.length) exact = g;
      continue;
    }
    // Every template word must appear in the candidate name.
    if (words.every((w) => gname.includes(w))) {
      if (!bestSubstr || g.name.length < bestSubstr.name.length) bestSubstr = g;
    }
  }

  return (exact ?? bestSubstr)?.id ?? null;
}

/** Match a discipline name exactly (case-insensitive) against global disciplines. */
export function matchDiscipline(templateName: string, globals: NamedRow[]): string | null {
  const target = normalize(templateName);
  for (const g of globals) {
    if (normalize(g.name) === target) return g.id;
  }
  return null;
}
