import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localTodayISO } from '../lib/calendar';

/**
 * The device's local `YYYY-MM-DD`, kept current while mounted.
 *
 * Reading `localTodayISO()` straight into a render looks equivalent but is not:
 * it only re-evaluates when something *else* causes a re-render, so a screen left
 * open — or, far more common on mobile, an app resumed the next morning — renders
 * with yesterday's date. On the calendar that is not cosmetic. Every past/future
 * decision compares against this string, so a stale value moves the today
 * highlight onto yesterday and makes `iso < todayISO` read yesterday as today,
 * which offers "Schedule a workout" on a past day and creates a planned session
 * that is immediately overdue.
 *
 * Two triggers, because neither is sufficient alone: a timer armed for the next
 * local midnight (catches a screen held open across it), and every foreground
 * resume (a sleeping phone never fires the timer, RN throttles background timers,
 * and this is also what catches a timezone change or a manual clock change).
 *
 * The setter returns the previous string when the day has not changed, so the
 * identity stays stable and no dependent memo is invalidated.
 */
export function useTodayISO(): string {
  const [today, setToday] = useState(localTodayISO);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const armMidnightTimer = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      // A second past midnight, so a fractionally early fire can't read the
      // previous day and then wait another 24h to correct itself.
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1,
        0,
      );
      timer = setTimeout(sync, Math.max(1_000, nextMidnight.getTime() - now.getTime()));
    };

    const sync = () => {
      setToday((prev) => {
        const next = localTodayISO();
        return next === prev ? prev : next;
      });
      armMidnightTimer();
    };

    armMidnightTimer();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
