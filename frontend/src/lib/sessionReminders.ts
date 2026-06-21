import type { CalendarItem, RoutineWithItems } from '@app/shared';
import { cancelScheduledByKind, scheduleAtDate } from './notifications';

const REMINDER_KIND = 'session';
const MAX_REMINDERS = 30;

/**
 * Reschedule local reminders for upcoming planned (virtual) calendar
 * occurrences that have a time of day. Cancels previously-scheduled session
 * reminders first so repeated calls stay idempotent.
 */
export async function syncSessionReminders(
  items: CalendarItem[],
  routines: RoutineWithItems[],
): Promise<void> {
  await cancelScheduledByKind(REMINDER_KIND);

  const byId = new Map(routines.map((r) => [r.id, r]));
  const now = Date.now();
  let scheduled = 0;

  for (const item of items) {
    if (scheduled >= MAX_REMINDERS) break;
    if (item.kind !== 'virtual') continue;
    const routine = byId.get(item.routineId);
    if (!routine?.timeOfDay) continue;

    const when = new Date(`${item.date}T${routine.timeOfDay}`);
    if (when.getTime() <= now) continue;

    await scheduleAtDate(when, 'Training today', `${routine.name} is on your schedule.`, {
      kind: REMINDER_KIND,
    });
    scheduled += 1;
  }
}
