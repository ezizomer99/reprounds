import { Platform } from 'react-native';
import type * as NotificationsModule from 'expo-notifications';

// Guarded load: if the native module isn't linked yet (e.g. before an EAS
// rebuild after adding expo-notifications), importing it can throw at module
// evaluation. Loading it inside try/catch lets the app boot and the
// notification features simply no-op until the native build is in place.
let Notifications: typeof NotificationsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
  // Show a banner + play sound even when foregrounded (rest-timer "ding").
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  Notifications = null;
}

const ANDROID_CHANNEL = 'default';
let permission: boolean | null = null;

/** Request notification permission once (and set up the Android channel). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Notifications || Platform.OS === 'web') return false;
  if (permission !== null) return permission;
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (granted && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: 'RepRounds',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }
    permission = granted;
    return granted;
  } catch {
    permission = false;
    return false;
  }
}

/** Schedule a local notification N seconds from now. Returns its id (or null). */
export async function scheduleInSeconds(
  seconds: number,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<string | null> {
  if (!Notifications || Platform.OS === 'web' || seconds <= 0) return null;
  if (!(await ensureNotificationPermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        channelId: ANDROID_CHANNEL,
      },
    });
  } catch {
    return null;
  }
}

/** Schedule a local notification at a specific date. Returns its id (or null). */
export async function scheduleAtDate(
  date: Date,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<string | null> {
  if (!Notifications || Platform.OS === 'web' || date.getTime() <= Date.now()) return null;
  if (!(await ensureNotificationPermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: ANDROID_CHANNEL,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelScheduled(id: string | null | undefined): Promise<void> {
  if (!Notifications || !id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* no-op */
  }
}

/** Cancel all scheduled notifications carrying `data.kind === kind`. */
export async function cancelScheduledByKind(kind: string): Promise<void> {
  const n = Notifications;
  if (!n || Platform.OS === 'web') return;
  try {
    const all = await n.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((s) => (s.content.data as { kind?: string } | null)?.kind === kind)
        .map((s) => n.cancelScheduledNotificationAsync(s.identifier)),
    );
  } catch {
    /* no-op */
  }
}
