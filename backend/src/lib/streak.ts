const WEEK_MS = 7 * 86_400_000;

function utcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoDate(ms: number): string {
  const d = new Date(ms);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The Monday of the week containing `date`, as `YYYY-MM-DD`. */
export function mondayOfISO(date: string): string {
  const ms = utcMs(date);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  return isoDate(ms - ((dow + 6) % 7) * 86_400_000);
}

/**
 * Longest run of consecutive trained weeks ending at `anchorMonday`.
 *
 * Ported from the client's computeWeekStreak so the number doesn't move under
 * existing users — including its grace rule: the current week not yet trained
 * does not break the streak, it just doesn't count toward it. Any earlier gap
 * ends the run.
 *
 * `weekStarts` are Monday-aligned `YYYY-MM-DD` keys; order and duplicates don't
 * matter. Weeks after the anchor are ignored rather than trusted — session dates
 * are accepted arbitrarily far into the future, and a mistyped year should not
 * manufacture a streak.
 *
 * Walking weeks rather than counting rows is the point: the client could only
 * ever see the 200 most recent sessions, so at five sessions a week anything
 * past ~40 weeks was silently truncated.
 */
export function weekStreak(weekStarts: string[], anchorMonday: string): number {
  const active = new Set(weekStarts);
  const anchorMs = utcMs(anchorMonday);
  let streak = 0;
  // 520 weeks — ten years — matching the client's loop bound.
  for (let w = 0; w < 520; w++) {
    if (active.has(isoDate(anchorMs - w * WEEK_MS))) streak++;
    else if (w === 0) continue; // grace for the current week
    else break;
  }
  return streak;
}
